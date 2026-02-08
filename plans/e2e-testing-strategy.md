# E2E Testing & UAT Strategy for Scry Platform

## Current State

| Service | Test Framework | Unit Tests | Integration | E2E | Coverage |
|---------|---------------|-----------|-------------|-----|----------|
| upload-service | Vitest 3.2 | 14 files, 91% lines | Mock-based | **Infrastructure exists but disabled in CI** | 91% |
| cdn-service | Vitest 2.1 | 15 files, 217 cases | 4 mock-based integration files | None | Not measured in CI |
| dashboard | Vitest 3.2 + Jest 30 | 22 files | 1 file (skipped, needs emulator) | None (Playwright installed but unused for e2e) | Not measured in CI |
| scry-node | Jest 29 | 12 files, 191 cases | 1 file (subprocess, mocked network) | None | 50% threshold |
| scry-sbcov | Vitest 1.2 | 11 files | Integration tests exist | None | Not measured |
| scry-nextjs | Vitest 3.2 | 17 files | None | None | Not measured |
| landing-page | None | None | None | None | N/A |

**Key gap:** Every service mocks its external dependencies in tests. No test anywhere validates that services actually work together. The upload-service has a full e2e adapter system (node, worker, docker, production targets) but it's disabled in CI.

## Tool Choice: Playwright

**Recommendation: Playwright Test** as the unified e2e and UAT framework across all services.

**Why Playwright:**
- Already installed in dashboard and scry-nextjs (v1.55.0)
- Built-in API testing (`request` fixture) — works for Workers and REST APIs, not just browsers
- Trace viewer for UAT review (HTML report with screenshots, network, console)
- Video recording for UAT evidence
- Multi-browser support (Chromium, Firefox, WebKit)
- First-class GitHub Actions support with caching and sharding
- Handles auth state persistence (storageState) — critical for Firebase flows
- Free, open source, maintained by Microsoft, extremely well-tested
- Native support for testing against different environments (staging, production) via projects

**What we don't need:**
- Cypress — heavier, paid dashboard for parallelism, Playwright covers same ground
- Selenium — legacy, slower, less developer-friendly
- Supertest — already have it in upload-service but it only works in-process, not against deployed services
- Paid products (Checkly, Datadog Synthetics) — premature for current scale; revisit when monitoring live prod

## Architecture

```
scry-ops/
├── e2e/                          # Cross-service e2e tests (lives in orchestrator)
│   ├── playwright.config.ts
│   ├── tests/
│   │   ├── deploy-and-serve.spec.ts    # CLI → upload → CDN full flow
│   │   ├── dashboard-builds.spec.ts    # Upload → Dashboard shows build
│   │   └── coverage-pipeline.spec.ts   # Coverage report flow
│   ├── fixtures/
│   │   ├── test-storybook/             # Minimal Storybook static build
│   │   └── auth.setup.ts              # Firebase auth state
│   └── helpers/
│       ├── staging-env.ts             # Staging URLs and credentials
│       └── cleanup.ts                # Test data teardown

Each service also gets its own Playwright e2e suite for service-level testing:

scry-storybook-upload-service/
├── e2e/                          # Already exists, needs re-enabling
│   ├── tests/upload.test.ts      # Already written
│   └── adapters/                 # node, worker, docker, production

scry-cdn-service/
├── e2e/
│   ├── playwright.config.ts
│   └── tests/
│       ├── serve-storybook.spec.ts
│       ├── private-project-auth.spec.ts
│       └── health.spec.ts

scry-developer-dashboard/
├── e2e/
│   ├── playwright.config.ts
│   └── tests/
│       ├── login.spec.ts
│       ├── project-crud.spec.ts
│       ├── build-history.spec.ts
│       ├── coverage-view.spec.ts
│       └── api-key-management.spec.ts

scry-node/
├── e2e/
│   └── tests/
│       ├── deploy-to-staging.test.js   # Real deploy against staging
│       └── init-workflow.test.js       # Scaffold + verify
```

## Per-Service Plans

---

### 1. upload-service — Re-enable existing e2e

**Current state:** Has a complete e2e framework with 4 adapters (node, worker, docker, production). Tests exist in `e2e/tests/upload.test.ts`. Both CI jobs (`e2e-local` and `e2e-preview`) are disabled.

**Work needed:**
1. Re-enable `e2e-local` job in `ci.yml` — runs against local wrangler dev server
2. Re-enable `preview-deploy` + `e2e-preview` jobs — deploys PR preview worker, runs e2e against it
3. Add a `e2e-staging` job to `deploy.yml` — after production deploy, runs e2e against the live endpoint as a smoke test
4. Add coverage upload endpoint tests to the e2e suite (currently only tests `/upload` and `/presigned-url`)

**Tests to add:**
- `POST /upload/:project/:version/coverage` — coverage-only upload
- `GET /upload/:project/:version` — metadata retrieval
- `GET /health` — health check after deploy
- Error scenarios against real worker (invalid API key, oversized file, malformed version)

**Estimated effort:** Small — infrastructure exists, just needs re-enabling and a few new test cases.

---

### 2. cdn-service — Add Playwright API tests against deployed worker

**Current state:** 15 test files with 217 cases, all mock-based. No tests against a real deployed worker. Has health check endpoint.

**Work needed:**
1. Add `e2e/` directory with Playwright config targeting staging worker URL
2. Write API tests using `request` fixture (no browser needed)
3. **Prerequisite:** Tests need a known-good Storybook ZIP in the staging R2 bucket. Use a setup fixture that uploads via the upload-service staging API first.
4. Add `e2e` job to the deploy workflow that runs after staging/production deploy

**Tests to write:**
```
e2e/tests/
├── health.spec.ts
│   - GET /health returns 200
│   - GET /health/ready returns 200 (R2 reachable)
│
├── serve-public.spec.ts
│   - Serve index.html from a known project/version
│   - Serve nested asset path (iframe.html, static/*)
│   - Correct content-type headers (html, js, css, svg)
│   - 404 for nonexistent project
│   - 404 for nonexistent file within valid project
│   - SPA fallback serves index.html for deep paths
│
├── serve-private.spec.ts
│   - 401 for private project without session cookie
│   - 403 for private project with wrong user session
│   - 200 for private project with valid member session
│
├── coverage-report.spec.ts
│   - Serve coverage-report.json from R2
│   - 404 when no coverage report exists
│
└── cache-behavior.spec.ts
    - Second request for same file is faster (KV cache hit)
    - Correct cache-control headers
```

**Estimated effort:** Medium — need to set up Playwright, write the seed fixture, write ~15-20 test cases.

---

### 3. dashboard — Playwright browser e2e tests

**Current state:** Playwright v1.55.0 already installed (used for Storybook browser tests). No e2e test suite. One integration test skipped because it needs Firebase emulator.

**Work needed:**
1. Add `e2e/` directory with Playwright config
2. Use `storageState` for Firebase auth persistence (login once in setup, reuse across tests)
3. Target staging Vercel deployment (preview URL for PRs, staging URL for main)
4. Set up test user credentials as GitHub secrets

**Tests to write:**
```
e2e/tests/
├── auth.setup.ts                    # Global setup: login via Firebase, save storageState
│
├── login.spec.ts
│   - Redirects to /login when unauthenticated
│   - Login via GitHub OAuth (or test user if available)
│   - Redirects to dashboard after login
│   - Logout clears session
│
├── projects.spec.ts
│   - List projects on dashboard home
│   - Create new project
│   - View project detail page
│   - Delete project
│   - Toggle project visibility (public/private)
│
├── builds.spec.ts
│   - View build history for a project
│   - Click into build detail
│   - View coverage report page
│   - Coverage chart renders without errors
│
├── api-keys.spec.ts
│   - Create new API key (shown once)
│   - List API keys
│   - Revoke API key
│
├── team.spec.ts
│   - Invite member by email
│   - View pending invitations
│   - Revoke invitation
│
└── setup-wizard.spec.ts
    - Complete setup wizard flow for new project
    - Verify generated CLI command includes correct project ID
```

**Auth strategy:** Create a dedicated test user (`e2e-test@scrymore.com`) in Firebase staging project. Use Playwright's `storageState` to persist the session cookie across tests. The `auth.setup.ts` file logs in once and saves cookies to a JSON file that all other tests load.

**Estimated effort:** Large — most tests to write, auth setup, but Playwright is already installed.

---

### 4. scry-node — CLI e2e against staging

**Current state:** Jest with 191 tests, all mocking axios. Has `integration-cli.test.js` that spawns the CLI but mocks the API.

**Work needed:**
1. Add `e2e/` directory with tests that run the CLI against the staging upload-service
2. Use a staging API key (stored as env var / GitHub secret)
3. Include a minimal test Storybook static build as a fixture
4. Verify the full deploy flow: CLI → presigned URL → S3 upload → Firestore build record

**Tests to write:**
```
e2e/tests/
├── deploy-to-staging.test.js
│   - `scry deploy --dir ./fixtures/test-storybook --api-key $KEY --api-url $STAGING_URL --project e2e-test --deploy-version e2e-$(date)`
│   - Verify exit code 0
│   - Verify stdout contains deploy URL
│   - Verify the deployed storybook is accessible via CDN staging URL
│
├── coverage-report.test.js
│   - `scry coverage --dir ./fixtures/test-storybook --output ./report.json`
│   - Verify report.json is created and valid
│   - `scry deploy` with coverage and verify coverage-report.json is accessible
│
├── init-workflow.test.js
│   - `scry init --project-id test --api-key test --skip-gh-setup`
│   - Verify .github/workflows/deploy-storybook.yml is created
│   - Verify workflow file contains correct project ID
│
└── error-handling.test.js
    - Deploy with invalid API key → exit code 1, clear error message
    - Deploy with nonexistent directory → exit code 1
    - Deploy to unreachable server → exit code 1, timeout message
```

**Estimated effort:** Medium — straightforward subprocess testing, needs staging credentials.

---

### 5. scry-sbcov — Integration tests against real Storybook

**Current state:** 11 test files including integration tests. Uses ts-morph for AST analysis and simple-git for git context.

**Work needed:**
1. Add an e2e test that runs `scry-sbcov` against a real Storybook project (use the sample storybook app at `/home/boxuser/scry/scry-sample-storybook-app` or a fixture)
2. Verify the full analysis pipeline: detect components → parse stories → calculate coverage → generate report

**Tests to write:**
```
e2e/tests/
├── full-analysis.test.ts
│   - Run against fixture Storybook project
│   - Verify JSON report structure
│   - Verify component detection accuracy
│   - Verify coverage percentages are sane
│
└── execute-mode.test.ts     (if Playwright available)
    - Run with --execute flag
    - Verify stories are actually rendered
    - Verify execution results in report
```

**Estimated effort:** Small — straightforward CLI testing, fixture already exists.

---

### 6. scry-nextjs — API e2e tests

**Current state:** 17 test files, all mocking Jina/Milvus/R2 APIs. No tests against real vector DB.

**Work needed:**
1. Add Playwright API tests for `/api/search` against staging deployment
2. Requires seeded data in staging Milvus collection

**Tests to write:**
```
e2e/tests/
├── search-text.spec.ts
│   - Text search returns results
│   - Empty query returns empty
│   - Results include component metadata
│
├── search-image.spec.ts
│   - Image search with base64 input returns results
│
└── health.spec.ts
    - API responds to requests
    - Returns appropriate error for malformed input
```

**Estimated effort:** Medium — needs Milvus staging setup and seed data. Lower priority than core services.

---

### 7. landing-page — Visual regression only

**Current state:** No tests. Marketing page built with v0.app.

**Work needed:**
1. Add Playwright visual regression tests (screenshot comparison)
2. Simple smoke test: page loads, key sections render, no console errors

**Tests to write:**
```
e2e/tests/
├── smoke.spec.ts
│   - Page loads with 200 status
│   - Hero section is visible
│   - No console errors
│
└── visual.spec.ts
    - Full-page screenshot comparison (toHaveScreenshot)
    - Mobile viewport screenshot
    - Dark mode screenshot
```

**Estimated effort:** Small — straightforward Playwright visual testing.

---

## Cross-Service E2E (in scry-ops)

This is the most important suite — it validates the entire platform data flow end-to-end.

**Lives in:** `scry-ops/e2e/`

**Environment:** Staging (all services deployed to staging/preview)

**The critical flow:**
```
1. CLI deploys a test Storybook          → upload-service staging
2. Upload-service stores ZIP in R2       → R2 staging bucket
3. Upload-service writes build record    → Firestore staging
4. CDN serves the deployed Storybook     → cdn-service staging
5. Dashboard shows the build in history  → dashboard staging
6. Coverage report is accessible         → cdn-service staging
```

**Tests:**
```
scry-ops/e2e/tests/

deploy-and-serve.spec.ts
  - Deploy test Storybook via CLI
  - Verify upload-service returns success with build URL
  - Fetch index.html from CDN staging URL
  - Verify HTML content is the test Storybook
  - Verify nested assets (iframe.html, static/js/*) are servable

dashboard-builds.spec.ts
  - Login to dashboard staging
  - Navigate to the test project
  - Verify the new build appears in build history
  - Verify build metadata (version, timestamp) is correct
  - Click the "View" link and verify it opens the CDN URL

coverage-pipeline.spec.ts
  - Deploy with coverage report attached
  - Verify coverage-report.json is accessible via CDN
  - Verify dashboard coverage page renders the report
  - Verify coverage percentages match what was uploaded

cleanup.spec.ts (teardown)
  - Delete test builds created during the run
  - Clean up test project if created
```

**Setup/teardown:**
- `global-setup.ts`: Create a test project in staging Firestore, generate an API key
- `global-teardown.ts`: Delete the test project and all associated data

---

## Integration with scry-ops Workflow

### How Claude Validates Its Own Changes

Add a new step to `claude-agent.yml` after the Claude run and before the push-back:

```yaml
- name: Run service-level e2e tests
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

      # Run e2e if the service has them
      if [ -f "playwright.config.ts" ] || [ -f "e2e/playwright.config.ts" ]; then
        echo "Running e2e tests for $service_name"
        npm install
        npx playwright install chromium --with-deps
        npx playwright test || echo "E2E FAILED for $service_name"
      fi

      cd "${{ github.workspace }}"
    done
```

### PR-Level Validation

Each service's CI workflow should run its own e2e suite on PRs created by the scry-ops push-back step. The PRs already run CI — we just need the e2e tests to be part of that CI.

### Staging Smoke Tests

After merging a PR to main and deploying, each service's deploy workflow should run its e2e suite against the staging/production endpoint as a post-deploy validation.

---

## UAT Strategy

**Approach:** Playwright trace files as UAT evidence.

1. **On every cross-service e2e run**, generate Playwright traces (screenshots + network + console at each step)
2. **Upload traces as GitHub Actions artifacts** — reviewable by anyone with repo access
3. **On the scry-ops issue**, comment with a link to the artifacts: "UAT traces available: [link to Actions run]"
4. **For manual UAT**, add a `uat/` directory in scry-ops with Playwright scripts that walk through user flows with `page.pause()` breakpoints for manual verification

**Playwright config for UAT:**
```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'on',           // Always capture traces
    video: 'on',           // Record video of each test
    screenshot: 'on',      // Screenshot on every action
  },
  reporter: [
    ['html', { open: 'never' }],  // HTML report uploaded as artifact
  ],
});
```

**GitHub Actions artifact upload:**
```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: e2e-traces
    path: |
      scry-ops/e2e/test-results/
      scry-ops/e2e/playwright-report/
    retention-days: 14
```

---

## Rollout Order

Priority is based on: blast radius of bugs × frequency of changes × current test gap.

| Phase | What | Why First |
|-------|------|-----------|
| **Phase 1** | Re-enable upload-service e2e (already built) | Zero effort, immediate value. This is the core data ingestion service. |
| **Phase 2** | CDN-service Playwright API tests | CDN is the public-facing service — if it breaks, users see it. API-only tests are fast to write. |
| **Phase 3** | scry-node CLI e2e against staging | CLI is the user entry point. Real deploy tests catch integration regressions. |
| **Phase 4** | Dashboard Playwright browser e2e | Largest surface area but auth setup takes work. Start with project CRUD and build history. |
| **Phase 5** | Cross-service pipeline tests (scry-ops/e2e/) | The crown jewel — validates the full platform. Depends on phases 1-3 being stable. |
| **Phase 6** | Landing page visual regression | Low risk service, but easy to add and prevents visual regressions. |
| **Phase 7** | scry-nextjs and scry-sbcov e2e | Lower priority — fewer changes, more isolated services. |

---

## Staging Environment Requirements

For e2e tests to run reliably, we need dedicated staging:

| Resource | Current | Needed |
|----------|---------|--------|
| Upload-service worker | `storybook-deployment-service` (preview env exists) | Enable preview deploys in CI |
| CDN worker | `scry-cdn-service-dev` (exists) | Keep as staging target |
| Dashboard | Vercel preview deploys (exists) | Use PR preview URLs |
| Firestore | `scry-dev-dashboard-stage` (exists) | Add e2e test user + test project |
| R2 bucket | `my-storybooks-staging` (exists) | Already configured |
| Test API key | Does not exist | Create `e2e-test` API key in staging Firestore |
| Test user | Does not exist | Create `e2e-test@scrymore.com` in staging Firebase Auth |

All staging infrastructure exists — we just need test credentials.

---

## GitHub Secrets to Add

| Secret | Used By | Purpose |
|--------|---------|---------|
| `E2E_API_KEY` | upload-service e2e, scry-node e2e, cross-service e2e | Staging API key for test uploads |
| `E2E_FIREBASE_EMAIL` | dashboard e2e | Test user email |
| `E2E_FIREBASE_PASSWORD` | dashboard e2e | Test user password |
| `STAGING_UPLOAD_URL` | scry-node e2e, cross-service e2e | Upload-service staging URL |
| `STAGING_CDN_URL` | cdn-service e2e, cross-service e2e | CDN staging URL |
| `STAGING_DASHBOARD_URL` | dashboard e2e, cross-service e2e | Dashboard staging URL |
