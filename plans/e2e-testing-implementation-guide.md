# E2E Testing & UAT Implementation Guide

Complete, implementation-ready guide for adding automated end-to-end testing and user acceptance testing across all Scry platform services.

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Tool Selection](#2-tool-selection)
3. [Staging Environment Setup](#3-staging-environment-setup)
4. [Phase 1: Upload Service — Re-enable E2E](#4-phase-1-upload-service)
5. [Phase 2: CDN Service — Playwright API Tests](#5-phase-2-cdn-service)
6. [Phase 3: scry-node CLI — E2E Against Staging](#6-phase-3-scry-node-cli)
7. [Phase 4: Dashboard — Playwright Browser E2E](#7-phase-4-dashboard)
8. [Phase 5: Cross-Service Pipeline Tests](#8-phase-5-cross-service-pipeline)
9. [Phase 6: Landing Page — Visual Regression](#9-phase-6-landing-page)
10. [Phase 7: scry-nextjs & scry-sbcov](#10-phase-7-remaining-services)
11. [UAT Process](#11-uat-process)
12. [scry-ops Integration](#12-scry-ops-integration)
13. [CI/CD Workflow Changes](#13-cicd-workflow-changes)
14. [Secrets & Credentials](#14-secrets--credentials)
15. [Maintenance & Conventions](#15-maintenance--conventions)

---

## 1. Current State Audit

### Test Coverage by Service

| Service | Framework | Unit Tests | Integration | E2E | Line Coverage |
|---------|-----------|-----------|-------------|-----|---------------|
| upload-service | Vitest 3.2 | 14 files | Mock-based | **Exists but disabled in CI** | 91.42% |
| cdn-service | Vitest 2.1 | 15 files, 217 cases | 4 files, mock-based | None | Not measured |
| dashboard | Vitest 3.2 + Jest 30 | 22 files | 1 file (skipped) | None | Not measured |
| scry-node | Jest 29 | 12 files, 191 cases | 1 file (mocked network) | None | ~50% |
| scry-sbcov | Vitest 1.2 | 11 files | Exists | None | Not measured |
| scry-nextjs | Vitest 3.2 | 17 files | None | None | Not measured |
| landing-page | None | 0 | None | None | N/A |
| scry-link | N/A | N/A | N/A | N/A | N/A |

### The Gap

Every service mocks all external dependencies. No test anywhere validates that the services actually work together. The critical data flow — CLI deploy → upload-service → R2 → cdn-service → dashboard — is entirely untested end-to-end.

### Existing Infrastructure Worth Preserving

**upload-service** already has a complete e2e framework:
- 4 test adapters: `node`, `worker`, `docker`, `production` (`e2e/adapters/`)
- Config system with deployment targets (`e2e/config.ts`)
- Test utilities for data generation, setup, cleanup (`e2e/utils.ts`)
- Test suite with upload, coverage, presigned URL, and error scenarios (`e2e/tests/upload.test.ts`)
- CI jobs `e2e-local`, `preview-deploy`, and `e2e-preview` exist in `ci.yml` but are gated with `if: ${{ false }}`

**dashboard** has Playwright 1.55.0 installed (used as Vitest browser provider for Storybook tests, not for e2e).

---

## 2. Tool Selection

### Primary: Playwright Test

All new e2e tests use **Playwright Test** (`@playwright/test`).

**Rationale:**
- Already a dependency in dashboard (v1.55.0) and scry-nextjs (v1.55.0)
- Covers both browser tests (dashboard) and API-only tests (workers, CLI verification) via `request` fixture
- Trace viewer generates HTML reports with screenshots, network logs, and console output — doubles as UAT evidence
- Video recording for manual review
- `storageState` for auth persistence across tests
- First-class GitHub Actions support (caching, sharding, artifact upload)
- Free, open source, actively maintained

**Exception:** upload-service keeps its existing Vitest + adapter e2e framework (already built and working). No reason to rewrite it.

### Rejected Alternatives

| Tool | Why Not |
|------|---------|
| Cypress | Heavier runtime, paid dashboard for parallelism, no API-only testing mode |
| Selenium | Legacy, slower, worse developer experience |
| Supertest | In-process only — can't test deployed services |
| Checkly/Datadog Synthetics | Paid, premature at current scale |

---

## 3. Staging Environment Setup

### Existing Infrastructure

All staging infrastructure already exists:

| Resource | Identifier | Status |
|----------|-----------|--------|
| Upload-service worker (staging) | `storybook-deployment-service` preview env | Exists in wrangler.toml |
| CDN worker (staging) | `scry-cdn-service-dev.epinnock.workers.dev` | Deployed |
| Dashboard (staging) | Vercel preview deployments | Automatic on PRs |
| Firestore (staging) | `scry-dev-dashboard-stage` | Configured |
| R2 bucket (staging) | `my-storybooks-staging` | Configured |
| KV namespace (staging) | CDN_CACHE preview ID | Configured |

### What Needs Creating

**1. E2E test user in staging Firebase Auth**

Create a service account or test user in the `scry-dev-dashboard-stage` Firebase project:

```bash
# Option A: Use Firebase Admin SDK to create a test user
# Run once from a local script or Firebase console
firebase auth:import --project scry-dev-dashboard-stage <<EOF
{
  "users": [{
    "localId": "e2e-test-user",
    "email": "e2e-test@scrymore.com",
    "displayName": "E2E Test User",
    "providerUserInfo": [{
      "providerId": "github.com",
      "rawId": "e2e-test-github-id"
    }]
  }]
}
EOF
```

Note: Since the dashboard uses GitHub OAuth exclusively (`signInWithPopup` with `GithubAuthProvider`), e2e auth requires one of:
- A dedicated GitHub test account that can complete the OAuth flow
- A Firebase custom token generated server-side for the e2e user (bypasses GitHub OAuth)
- A test-mode flag that enables email/password auth in staging only

**Recommended approach:** Generate a Firebase custom token in the e2e setup step, then exchange it for an ID token and create a session cookie via the `/api/auth/session` endpoint. This avoids needing a GitHub account.

```typescript
// e2e/helpers/auth.ts — Generate auth state without GitHub OAuth
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export async function createTestSession(baseUrl: string): Promise<string> {
  const app = initializeApp({
    credential: cert({
      projectId: process.env.E2E_FIREBASE_PROJECT_ID,
      clientEmail: process.env.E2E_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.E2E_FIREBASE_PRIVATE_KEY,
    }),
  });

  const auth = getAuth(app);

  // Create or get the test user
  let user;
  try {
    user = await auth.getUserByEmail('e2e-test@scrymore.com');
  } catch {
    user = await auth.createUser({
      email: 'e2e-test@scrymore.com',
      displayName: 'E2E Test User',
      uid: 'e2e-test-user',
    });
  }

  // Generate a custom token → exchange for ID token → create session
  const customToken = await auth.createCustomToken(user.uid);

  // Exchange custom token for ID token via Firebase REST API
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.E2E_FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const { idToken } = await res.json();

  // Create session cookie via dashboard API
  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  // Extract __session cookie
  const setCookie = sessionRes.headers.get('set-cookie') || '';
  const match = setCookie.match(/__session=([^;]+)/);
  return match?.[1] || '';
}
```

**2. E2E test API key in staging Firestore**

Create a project and API key in the staging Firestore for upload/CDN tests:

```bash
# Create via dashboard staging UI or Firebase console:
# 1. Log in to staging dashboard
# 2. Create project "e2e-test-project"
# 3. Generate API key
# 4. Store the key as E2E_API_KEY secret in GitHub
```

**3. E2E test project with a known Storybook build**

Seed data: Upload a minimal Storybook ZIP to staging so CDN tests have something to serve.

---

## 4. Phase 1: Upload Service

**Goal:** Re-enable the existing e2e test infrastructure. Zero new code needed for the basic case.

### Step 1: Re-enable `e2e-local` in CI

**File:** `scry-storybook-upload-service/.github/workflows/ci.yml`

Change the `e2e-local` job:

```yaml
# Before:
  e2e-local:
    runs-on: ubuntu-latest
    name: E2E Tests (Local Worker)
    needs: validate
    if: ${{ false }}  # ← Remove this line

# After:
  e2e-local:
    runs-on: ubuntu-latest
    name: E2E Tests (Local Worker)
    needs: validate
```

This job runs `pnpm run e2e:worker` which starts a local wrangler dev server and runs the existing tests against it.

### Step 2: Re-enable preview deploy + e2e-preview

```yaml
# Before:
  preview-deploy:
    ...
    if: ${{ false }}  # ← Remove

  e2e-preview:
    ...
    if: ${{ false }}  # ← Remove
```

Requires `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` secrets to be set on the repo.

### Step 3: Add post-deploy smoke test to `deploy.yml`

Add a new job after `deploy-worker`:

```yaml
  e2e-production-smoke:
    runs-on: ubuntu-latest
    name: Production Smoke Test
    needs: deploy-worker
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile

      - name: Run smoke tests against production
        run: pnpm run e2e:node
        env:
          E2E_PROD_URL: https://storybook-deployment-service.epinnock.workers.dev
          E2E_API_KEY: ${{ secrets.E2E_API_KEY }}
        timeout-minutes: 5

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-production-smoke
          path: artifacts/
          retention-days: 7
```

### Step 4: Add missing test cases

Add to `e2e/tests/upload.test.ts`:

```typescript
it('should return health check', async () => {
  if (!ctx) return;
  const response = await ctx.client('/health', { method: 'GET' });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toHaveProperty('status', 'healthy');
});

it('should reject request with invalid API key', async () => {
  if (!ctx) return;
  const testData = generateTestData('storybook');
  const formData = new FormData();
  formData.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));

  // Override the client to use a bad API key
  const response = await fetch(`${ctx.baseUrl}/upload/${testData.project}/${testData.version}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'invalid-key-12345' },
    body: formData,
  });

  expect(response.status).toBe(401);
});
```

### Step 5: Update `ci-complete` to require e2e

```yaml
  ci-complete:
    needs: [validate, quality, e2e-local]
```

---

## 5. Phase 2: CDN Service

**Goal:** Add Playwright API tests that run against the staging worker after deploy.

### Step 1: Install Playwright

```bash
cd scry-cdn-service
pnpm add -D @playwright/test
npx playwright install chromium
```

### Step 2: Create Playwright config

**File:** `scry-cdn-service/e2e/playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

const STAGING_URL = process.env.E2E_CDN_URL || 'https://scry-cdn-service-dev.epinnock.workers.dev';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: STAGING_URL,
    extraHTTPHeaders: {
      'Accept': '*/*',
    },
  },
  projects: [
    {
      name: 'staging',
      use: { baseURL: STAGING_URL },
    },
    {
      name: 'production',
      use: { baseURL: 'https://scry-cdn-service.epinnock.workers.dev' },
    },
  ],
});
```

### Step 3: Write test files

**File:** `scry-cdn-service/e2e/tests/health.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('CDN Health', () => {
  test('GET /health returns healthy status', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('scry-cdn-service');
    expect(body).toHaveProperty('timestamp');
  });

  test('GET /health/ready confirms storage connectivity', async ({ request }) => {
    const response = await request.get('/health/ready');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.checks.storage).toBe('ok');
  });
});
```

**File:** `scry-cdn-service/e2e/tests/serve-public.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

// These tests require a known Storybook to exist in the staging R2 bucket.
// The project/version is seeded by the cross-service setup or manually.
const TEST_PROJECT = process.env.E2E_TEST_PROJECT || 'e2e-test-project';
const TEST_VERSION = process.env.E2E_TEST_VERSION || 'e2e-latest';

test.describe('Serve Public Storybook', () => {
  test('serves index.html for known project', async ({ request }) => {
    const response = await request.get(`/${TEST_PROJECT}/${TEST_VERSION}/index.html`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/html');
  });

  test('serves iframe.html (nested asset)', async ({ request }) => {
    const response = await request.get(`/${TEST_PROJECT}/${TEST_VERSION}/iframe.html`);
    // May be 200 or 404 depending on fixture; assert no 500
    expect(response.status()).not.toBe(500);
  });

  test('returns 404 for nonexistent project', async ({ request }) => {
    const response = await request.get('/nonexistent-project-xyz/v1/index.html');
    expect(response.status()).toBe(404);
  });

  test('returns correct content-type for JS files', async ({ request }) => {
    // Attempt to fetch a known static asset if present
    const response = await request.get(`/${TEST_PROJECT}/${TEST_VERSION}/sb-preview/runtime.js`);
    if (response.ok()) {
      const ct = response.headers()['content-type'] || '';
      expect(ct).toMatch(/javascript/);
    }
  });
});
```

**File:** `scry-cdn-service/e2e/tests/coverage-report.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const TEST_PROJECT = process.env.E2E_TEST_PROJECT || 'e2e-test-project';
const TEST_VERSION = process.env.E2E_TEST_VERSION || 'e2e-latest';

test.describe('Coverage Report Serving', () => {
  test('serves coverage-report.json when present', async ({ request }) => {
    const response = await request.get(`/${TEST_PROJECT}/${TEST_VERSION}/coverage-report.json`);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('summary');
      expect(response.headers()['content-type']).toContain('application/json');
    } else {
      // If no coverage was uploaded for this build, 404 is acceptable
      expect(response.status()).toBe(404);
    }
  });
});
```

### Step 4: Add CI job to deploy workflow

**File:** `scry-cdn-service/.github/workflows/deploy-cdn-service.yml`

Add after `deploy-production`:

```yaml
  e2e-staging:
    name: E2E Tests (Staging)
    needs: deploy-production
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      - name: Install Playwright
        run: npx playwright install chromium --with-deps

      - name: Wait for deployment propagation
        run: sleep 10

      - name: Run E2E tests
        run: npx playwright test --config e2e/playwright.config.ts --project staging
        env:
          E2E_CDN_URL: https://scry-cdn-service.epinnock.workers.dev
          E2E_TEST_PROJECT: ${{ secrets.E2E_TEST_PROJECT }}
          E2E_TEST_VERSION: ${{ secrets.E2E_TEST_VERSION }}

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: cdn-e2e-report
          path: scry-cdn-service/playwright-report/
          retention-days: 14
```

### Step 5: Add package.json scripts

```json
{
  "scripts": {
    "e2e": "playwright test --config e2e/playwright.config.ts",
    "e2e:staging": "E2E_CDN_URL=https://scry-cdn-service-dev.epinnock.workers.dev playwright test --config e2e/playwright.config.ts"
  }
}
```

---

## 6. Phase 3: scry-node CLI

**Goal:** Run the actual CLI against the staging upload-service, verify the deployed Storybook is accessible.

### Step 1: Create e2e test directory

The test fixture already exists at `scry-node/test-storybook-static/` with a minimal `index.html`.

### Step 2: Write e2e tests

**File:** `scry-node/e2e/deploy-to-staging.test.js`

```javascript
const { spawnSync } = require('child_process');
const path = require('path');
const https = require('https');

const CLI_PATH = path.join(__dirname, '..', 'bin', 'cli.js');
const FIXTURE_DIR = path.join(__dirname, '..', 'test-storybook-static');
const API_URL = process.env.E2E_UPLOAD_URL || 'https://storybook-deployment-service.epinnock.workers.dev';
const API_KEY = process.env.E2E_API_KEY;
const CDN_URL = process.env.E2E_CDN_URL || 'https://scry-cdn-service-dev.epinnock.workers.dev';

const describeE2E = API_KEY ? describe : describe.skip;

describeE2E('e2e: CLI deploy to staging', () => {
  const PROJECT = 'e2e-cli-test';
  const VERSION = `e2e-${Date.now()}`;

  test('deploys a Storybook to staging successfully', () => {
    const res = spawnSync(process.execPath, [
      CLI_PATH,
      '--dir', FIXTURE_DIR,
      '--project', PROJECT,
      '--deploy-version', VERSION,
      '--api-url', API_URL,
      '--api-key', API_KEY,
      '--no-coverage',
    ], {
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: 'test' },
    });

    const output = (res.stdout || '') + (res.stderr || '');
    console.log('CLI output:', output);

    expect(res.status).toBe(0);
    expect(output).not.toContain('Error');
  });

  test('deployed Storybook is accessible via CDN', async () => {
    // Allow propagation time
    await new Promise(r => setTimeout(r, 5000));

    const url = `${CDN_URL}/${PROJECT}/${VERSION}/index.html`;
    const response = await fetch(url);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Test Storybook');
  });
});

describeE2E('e2e: CLI error handling', () => {
  test('exits 1 with invalid API key', () => {
    const res = spawnSync(process.execPath, [
      CLI_PATH,
      '--dir', FIXTURE_DIR,
      '--project', 'e2e-fail-test',
      '--deploy-version', 'v1',
      '--api-url', API_URL,
      '--api-key', 'invalid-key-that-should-fail',
      '--no-coverage',
    ], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(res.status).toBe(1);
  });

  test('exits 1 with nonexistent directory', () => {
    const res = spawnSync(process.execPath, [
      CLI_PATH,
      '--dir', '/tmp/nonexistent-storybook-dir-xyz',
      '--project', 'e2e-fail-test',
      '--deploy-version', 'v1',
      '--api-url', API_URL,
      '--api-key', API_KEY || 'dummy',
      '--no-coverage',
    ], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(res.status).toBe(1);
  });
});

describeE2E('e2e: CLI init workflow scaffolding', () => {
  const fs = require('fs');
  const os = require('os');

  test('creates GitHub Actions workflow file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scry-init-'));

    const res = spawnSync(process.execPath, [
      CLI_PATH,
      'init',
      '--project-id', 'test-project-id',
      '--api-key', 'test-api-key',
      '--skip-gh-setup',
    ], {
      encoding: 'utf8',
      cwd: tmpDir,
      timeout: 30_000,
    });

    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'deploy-storybook.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('test-project-id');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

### Step 3: Add Jest config for e2e

**File:** `scry-node/jest.e2e.config.js`

```javascript
module.exports = {
  testMatch: ['<rootDir>/e2e/**/*.test.js'],
  testTimeout: 120000,
  verbose: true,
};
```

### Step 4: Add package.json scripts

```json
{
  "e2e": "jest --config jest.e2e.config.js",
  "e2e:staging": "E2E_UPLOAD_URL=https://storybook-deployment-service.epinnock.workers.dev jest --config jest.e2e.config.js"
}
```

### Step 5: Add CI job

Add to `scry-node/.github/workflows/release.yml` or create a new `ci.yml`:

```yaml
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: release
    if: steps.changesets.outputs.published == 'true'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - name: Run E2E tests
        run: pnpm run e2e
        env:
          E2E_API_KEY: ${{ secrets.E2E_API_KEY }}
          E2E_UPLOAD_URL: https://storybook-deployment-service.epinnock.workers.dev
          E2E_CDN_URL: https://scry-cdn-service.epinnock.workers.dev
```

---

## 7. Phase 4: Dashboard

**Goal:** Add Playwright browser e2e tests for critical user flows.

### Auth Challenge

The dashboard uses **GitHub OAuth exclusively** (`signInWithPopup` with `GithubAuthProvider`). There is no email/password login. The auth flow is:

1. User clicks "Sign in with GitHub" → Firebase popup
2. Firebase returns ID token
3. Client POSTs ID token to `/api/auth/session`
4. Server creates `__session` httpOnly cookie (5-day expiry)
5. `AuthGuard` component checks `useFirebase()` context on protected routes

For e2e testing, we bypass the GitHub OAuth popup by generating a Firebase custom token server-side.

### Step 1: Install Playwright test runner

```bash
cd scry-developer-dashboard
pnpm add -D @playwright/test
```

(Playwright browser binary is already installed via the Storybook vitest integration.)

### Step 2: Create Playwright config

**File:** `scry-developer-dashboard/e2e/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_DASHBOARD_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Tests share state (project, builds)
  retries: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Auth setup runs first, saves storageState
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './e2e/.auth/user.json',
      },
      dependencies: ['auth-setup'],
    },
  ],
});
```

### Step 3: Auth setup

**File:** `scry-developer-dashboard/e2e/tests/auth.setup.ts`

```typescript
import { test as setup, expect } from '@playwright/test';

const STORAGE_STATE_PATH = './e2e/.auth/user.json';

setup('authenticate via Firebase custom token', async ({ request, context }) => {
  // Step 1: Get custom token from a helper endpoint or generate server-side
  // This requires E2E_FIREBASE_* secrets to be set
  const tokenRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.E2E_FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: process.env.E2E_FIREBASE_CUSTOM_TOKEN,
        returnSecureToken: true,
      }),
    }
  );
  const { idToken } = await tokenRes.json();
  expect(idToken).toBeTruthy();

  // Step 2: Create session via dashboard API
  const baseURL = process.env.E2E_DASHBOARD_URL || 'http://localhost:3000';
  const sessionRes = await request.post(`${baseURL}/api/auth/session`, {
    data: { idToken },
  });
  expect(sessionRes.ok()).toBeTruthy();

  // Step 3: Save storage state (cookies) for other tests
  await context.storageState({ path: STORAGE_STATE_PATH });
});
```

### Step 4: Write test files

**File:** `scry-developer-dashboard/e2e/tests/projects.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Projects', () => {
  test('lists projects on dashboard home', async ({ page }) => {
    await page.goto('/');
    // Wait for auth guard and data loading
    await page.waitForSelector('[data-testid="project-card"], [data-testid="empty-state"]', {
      timeout: 15_000,
    });
    // Page should not show login redirect
    expect(page.url()).not.toContain('/login');
  });

  test('navigates to project detail', async ({ page }) => {
    await page.goto('/');
    const projectCard = page.locator('[data-testid="project-card"]').first();

    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForURL(/\/projects\/.+/);
      expect(page.url()).toMatch(/\/projects\/.+/);
    }
  });
});
```

**File:** `scry-developer-dashboard/e2e/tests/builds.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const TEST_PROJECT_ID = process.env.E2E_TEST_PROJECT_ID;

test.describe('Build History', () => {
  test.skip(!TEST_PROJECT_ID, 'E2E_TEST_PROJECT_ID not set');

  test('shows build list for a project', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');

    // Look for build entries or empty state
    const builds = page.locator('[data-testid="build-entry"]');
    const empty = page.locator('text=No builds');

    await expect(builds.first().or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('coverage page renders without errors', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');

    const buildLink = page.locator('[data-testid="build-entry"] a').first();
    if (await buildLink.isVisible()) {
      await buildLink.click();
      // Should not see any unhandled error
      const errorOverlay = page.locator('#__next-error');
      await expect(errorOverlay).not.toBeVisible();
    }
  });
});
```

**File:** `scry-developer-dashboard/e2e/tests/login.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

// These tests run WITHOUT the authenticated storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/');
    // AuthGuard should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  test('login page shows GitHub sign-in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Sign in with GitHub')).toBeVisible();
  });
});
```

### Step 5: Add to .gitignore

```
# Playwright
e2e/.auth/
playwright-report/
test-results/
```

### Step 6: Add package.json scripts

```json
{
  "e2e": "playwright test --config e2e/playwright.config.ts",
  "e2e:headed": "playwright test --config e2e/playwright.config.ts --headed"
}
```

---

## 8. Phase 5: Cross-Service Pipeline

**Goal:** Validate the full platform data flow in a single test suite that lives in scry-ops.

### Step 1: Create the e2e directory in scry-ops

```bash
cd scry-ops
pnpm init
pnpm add -D @playwright/test typescript @types/node
npx playwright install chromium
```

### Step 2: Playwright config

**File:** `scry-ops/e2e/playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  retries: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
    ['list'],
    ['json', { outputFile: '../e2e-results.json' }],
  ],
  use: {
    trace: 'on',
    video: 'on',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'cross-service',
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
```

### Step 3: Environment helper

**File:** `scry-ops/e2e/helpers/env.ts`

```typescript
export const env = {
  uploadUrl: process.env.E2E_UPLOAD_URL || 'https://storybook-deployment-service.epinnock.workers.dev',
  cdnUrl: process.env.E2E_CDN_URL || 'https://scry-cdn-service-dev.epinnock.workers.dev',
  dashboardUrl: process.env.E2E_DASHBOARD_URL || 'https://dashboard.scrymore.com',
  apiKey: process.env.E2E_API_KEY || '',
  testProject: 'e2e-cross-service',
  testVersion: `e2e-${Date.now()}`,
};
```

### Step 4: The critical test — deploy and serve

**File:** `scry-ops/e2e/tests/deploy-and-serve.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { env } from '../helpers/env';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Cross-Service: Deploy and Serve', () => {
  const project = env.testProject;
  const version = env.testVersion;

  test('Step 1: Upload Storybook ZIP via upload-service', async ({ request }) => {
    // Create a minimal ZIP containing index.html
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'test-storybook.zip');
    const fileBuffer = fs.readFileSync(fixturePath);

    const response = await request.post(
      `${env.uploadUrl}/upload/${project}/${version}`,
      {
        headers: {
          'X-API-Key': env.apiKey,
          'Content-Type': 'application/zip',
        },
        data: fileBuffer,
      }
    );

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.key || body.key).toContain(project);
  });

  test('Step 2: Verify Storybook is served via CDN', async ({ request }) => {
    // Allow time for R2 propagation
    await new Promise(r => setTimeout(r, 5000));

    const response = await request.get(
      `${env.cdnUrl}/${project}/${version}/index.html`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/html');
    const html = await response.text();
    expect(html.length).toBeGreaterThan(0);
  });

  test('Step 3: Upload coverage report', async ({ request }) => {
    const coverageReport = {
      summary: {
        componentCoverage: 0.85,
        propCoverage: 0.72,
        variantCoverage: 0.65,
        passRate: 0.95,
        totalComponents: 10,
        componentsWithStories: 8,
        failingStories: 0,
      },
      qualityGate: { passed: true, checks: [] },
      generatedAt: new Date().toISOString(),
    };

    const response = await request.post(
      `${env.uploadUrl}/upload/${project}/${version}/coverage`,
      {
        headers: {
          'X-API-Key': env.apiKey,
          'Content-Type': 'application/json',
        },
        data: coverageReport,
      }
    );

    expect(response.ok()).toBeTruthy();
  });

  test('Step 4: Verify coverage report is served via CDN', async ({ request }) => {
    await new Promise(r => setTimeout(r, 3000));

    const response = await request.get(
      `${env.cdnUrl}/${project}/${version}/coverage-report.json`
    );

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.summary.componentCoverage).toBe(0.85);
  });
});
```

### Step 5: Create the test fixture

**File:** `scry-ops/e2e/fixtures/create-fixture.sh`

```bash
#!/bin/bash
# Creates a minimal Storybook ZIP for e2e testing
mkdir -p /tmp/e2e-storybook
cat > /tmp/e2e-storybook/index.html << 'HTML'
<!DOCTYPE html>
<html>
<head><title>E2E Test Storybook</title></head>
<body><h1>E2E Test Storybook Deployment</h1><p>Deployed by scry-ops e2e suite.</p></body>
</html>
HTML

cd /tmp/e2e-storybook && zip -r "$(dirname "$0")/test-storybook.zip" . && rm -rf /tmp/e2e-storybook
echo "Created test-storybook.zip"
```

### Step 6: GitHub Actions workflow

**File:** `scry-ops/.github/workflows/e2e-cross-service.yml`

```yaml
name: Cross-Service E2E Tests

on:
  workflow_dispatch:
  schedule:
    - cron: '0 6 * * 1-5'  # Weekdays at 6am UTC

permissions:
  contents: read
  issues: write

jobs:
  e2e:
    runs-on: ubuntu-latest
    name: Cross-Service E2E
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        working-directory: e2e
        run: pnpm install

      - name: Install Playwright
        working-directory: e2e
        run: npx playwright install chromium --with-deps

      - name: Create test fixture
        run: bash e2e/fixtures/create-fixture.sh

      - name: Run cross-service e2e tests
        working-directory: e2e
        run: npx playwright test
        env:
          E2E_UPLOAD_URL: https://storybook-deployment-service.epinnock.workers.dev
          E2E_CDN_URL: https://scry-cdn-service-dev.epinnock.workers.dev
          E2E_DASHBOARD_URL: ${{ secrets.STAGING_DASHBOARD_URL }}
          E2E_API_KEY: ${{ secrets.E2E_API_KEY }}

      - name: Upload traces and report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: cross-service-e2e-traces
          path: |
            e2e/playwright-report/
            e2e/test-results/
          retention-days: 14

      - name: Comment on latest open issue (if failed)
        if: failure()
        run: |
          ISSUE=$(gh issue list --repo epinnock/scry-ops --label "e2e" --state open --limit 1 --json number --jq '.[0].number')
          if [ -n "$ISSUE" ]; then
            gh issue comment "$ISSUE" --repo epinnock/scry-ops \
              --body "Cross-service E2E tests failed. [View traces](https://github.com/epinnock/scry-ops/actions/runs/${{ github.run_id }})"
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 9. Phase 6: Landing Page

**Goal:** Visual regression and smoke tests.

### Step 1: Setup

```bash
cd scry-landing-page
pnpm add -D @playwright/test
npx playwright install chromium
```

### Step 2: Playwright config

**File:** `scry-landing-page/e2e/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.E2E_URL || 'http://localhost:3000',
    screenshot: 'on',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
});
```

### Step 3: Tests

**File:** `scry-landing-page/e2e/tests/smoke.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
    expect(await page.title()).toBeTruthy();
  });

  test('hero section is visible', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('h1').first();
    await expect(hero).toBeVisible();
  });

  test('visual regression — full page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('landing-page.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});
```

---

## 10. Phase 7: Remaining Services

### scry-sbcov

Add a single e2e test that runs the full analysis pipeline against a fixture:

**File:** `scry-sbcov/e2e/full-pipeline.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('e2e: full analysis pipeline', () => {
  const outputPath = path.join(__dirname, 'output', 'report.json');

  it('generates a valid coverage report from a Storybook project', () => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const result = execSync(
      `node bin/scry-sbcov.js --storybook-static ../scry-sample-storybook-app/storybook-static --output ${outputPath}`,
      { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 60_000 }
    );

    expect(fs.existsSync(outputPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('components');
    expect(report.summary).toHaveProperty('totalComponents');
    expect(report.summary.totalComponents).toBeGreaterThan(0);

    // Cleanup
    fs.rmSync(path.dirname(outputPath), { recursive: true });
  });
});
```

### scry-nextjs

Lower priority. Add after Milvus staging environment is stable:

```typescript
// scry-nextjs/e2e/tests/search.spec.ts
import { test, expect } from '@playwright/test';

test('text search returns results', async ({ request }) => {
  const response = await request.post('/api/search', {
    data: { query: 'button', type: 'text' },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(Array.isArray(body.results)).toBe(true);
});
```

---

## 11. UAT Process

### Automated UAT Evidence

Every Playwright test run produces traces that serve as UAT evidence:

1. **Traces** — Step-by-step replay of every action with screenshots, network, and console
2. **Videos** — Full recording of browser interactions
3. **Screenshots** — Captured at each significant step
4. **HTML Report** — Self-contained, shareable report

These are uploaded as GitHub Actions artifacts and retained for 14 days.

### Manual UAT Workflow

For features that need human review:

1. scry-ops issue is created with the `uat` label
2. Claude makes the changes and PRs are created
3. The cross-service e2e suite runs automatically
4. A comment is posted on the scry-ops issue:
   ```
   ### E2E Results
   - Status: PASSED
   - Traces: [View report](link-to-artifacts)
   - Video: [Watch recording](link-to-artifacts)

   **UAT Review Required**: Please review the traces and approve.
   ```
5. A reviewer opens the Playwright HTML report, steps through the traces, and approves or requests changes

### Playwright Trace Viewer

Traces can be viewed at https://trace.playwright.dev by uploading the `.zip` file from the artifacts, or by running locally:

```bash
npx playwright show-trace path/to/trace.zip
```

---

## 12. scry-ops Integration

### Running E2E in the Claude Agent Workflow

Add a validation step to `scry-ops/.github/workflows/claude-agent.yml` between the Claude run and the push-back step:

```yaml
    - name: Run unit tests in modified services
      if: success()
      run: |
        for dir in services/*/; do
          [ ! -d "$dir" ] && continue
          service_name=$(basename "$dir")
          cd "${{ github.workspace }}/$dir"

          if [ -z "$(git status --porcelain)" ]; then
            cd "${{ github.workspace }}"
            continue
          fi

          echo "--- Testing $service_name ---"

          # Install and run unit tests
          if [ -f "package.json" ]; then
            npm install --no-frozen-lockfile 2>/dev/null || true
            npm test 2>&1 || echo "WARNING: Tests failed for $service_name"
          fi

          cd "${{ github.workspace }}"
        done
```

E2e tests against staging are not run in the Claude agent workflow itself (they require deployed services). Instead, they run in each service's CI pipeline when the push-back step creates PRs.

---

## 13. CI/CD Workflow Changes

### Summary of workflow changes per repo

| Repo | File | Change |
|------|------|--------|
| upload-service | `ci.yml` | Remove `if: ${{ false }}` from `e2e-local`, `preview-deploy`, `e2e-preview` |
| upload-service | `deploy.yml` | Add `e2e-production-smoke` job |
| cdn-service | `deploy-cdn-service.yml` | Add `e2e-staging` job |
| scry-node | New `ci.yml` or `release.yml` | Add `e2e` job |
| dashboard | New workflow or existing | Add `e2e` job |
| landing-page | New workflow | Add `e2e-visual` job |
| scry-ops | New `e2e-cross-service.yml` | Full cross-service pipeline |

---

## 14. Secrets & Credentials

### Secrets to add to each repo

**All service repos** (via GitHub org-level or per-repo):

| Secret | Value | Used By |
|--------|-------|---------|
| `E2E_API_KEY` | Staging Firestore API key for `e2e-test-project` | upload-service, scry-node, cross-service |
| `E2E_TEST_PROJECT` | `e2e-test-project` | cdn-service, cross-service |
| `E2E_TEST_VERSION` | `e2e-latest` (or dynamically set) | cdn-service, cross-service |

**scry-ops only:**

| Secret | Value | Used By |
|--------|-------|---------|
| `STAGING_DASHBOARD_URL` | Staging dashboard URL | cross-service e2e |

**dashboard only:**

| Secret | Value | Used By |
|--------|-------|---------|
| `E2E_FIREBASE_API_KEY` | Staging Firebase web API key | auth setup |
| `E2E_FIREBASE_CUSTOM_TOKEN` | Pre-generated custom token (or generate in CI) | auth setup |
| `E2E_FIREBASE_PROJECT_ID` | `scry-dev-dashboard-stage` | auth setup |
| `E2E_FIREBASE_CLIENT_EMAIL` | Staging service account email | auth setup |
| `E2E_FIREBASE_PRIVATE_KEY` | Staging service account private key | auth setup |

---

## 15. Maintenance & Conventions

### Test naming

- Service-level e2e: `e2e/tests/*.spec.ts` (Playwright) or `e2e/tests/*.test.ts` (Vitest)
- Cross-service e2e: `scry-ops/e2e/tests/*.spec.ts`
- Visual regression baselines: `e2e/tests/*.spec.ts-snapshots/`

### Test data isolation

- All e2e tests use the `e2e-test-project` project in staging
- Versions are timestamped (`e2e-{timestamp}`) to avoid collisions
- Cleanup happens in `afterAll` or `globalTeardown`
- Tests should be idempotent — safe to run multiple times

### When to update e2e tests

- New API endpoint → add to upload-service or cdn-service e2e
- New page/route in dashboard → add Playwright browser test
- New CLI command → add to scry-node e2e
- Changed data contract between services → update cross-service tests
- UI redesign → update visual regression baselines with `npx playwright test --update-snapshots`

### Running locally

```bash
# Upload-service (existing framework)
cd scry-storybook-upload-service && pnpm run e2e:worker

# CDN service
cd scry-cdn-service && npx playwright test --config e2e/playwright.config.ts

# Dashboard
cd scry-developer-dashboard && npx playwright test --config e2e/playwright.config.ts --headed

# scry-node
cd scry-node && pnpm run e2e

# Cross-service (from scry-ops)
cd scry-ops/e2e && npx playwright test

# View last test report
npx playwright show-report
```
