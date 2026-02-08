# Task 3.3: Local E2E Tests for scry-developer-dashboard

## Overview

Create end-to-end test infrastructure for the Next.js developer dashboard using Playwright (already a devDependency). Tests should cover login flow, project listing, project detail navigation, and build views.

**Time Estimate:** 60 min
**Target Repo:** `scry-developer-dashboard`
**Agent Tools Required:** Code-only (read/write files, `pnpm install`, run tests)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| DE-001 | Firebase Auth mocking is complex for e2e | High | High | High |
| DE-002 | Tests depend on Firestore data that may not exist locally | High | Medium | High |
| DE-003 | Next.js dev server startup time slows test execution | Medium | Low | Low |

**Mitigation:**
- DE-001: Use Firebase Auth Emulator for local e2e. Configure Playwright to use emulator. Alternatively, mock auth at the network layer.
- DE-002: Use Firebase Emulator Suite with seed data. Create a `e2e/fixtures/` directory with JSON seed data.
- DE-003: Use `webServer` config in Playwright to start Next.js before tests.

---

## File-by-file Plan

### 1. Create Playwright Config

**File:** `scry-developer-dashboard/playwright.config.ts` (NEW)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### 2. Create Test Fixtures

**File:** `scry-developer-dashboard/e2e/fixtures/auth.ts` (NEW)

```typescript
import { Page } from '@playwright/test';

/**
 * Mock Firebase authentication for e2e tests.
 * Uses Firebase Auth Emulator when FIREBASE_AUTH_EMULATOR_HOST is set.
 */
export async function loginAsTestUser(page: Page) {
  // If using Firebase Emulator, create a test user and sign in
  // Otherwise, set auth cookies/localStorage directly
  await page.goto('/login');
  // Implementation depends on how auth is handled
}

export async function logout(page: Page) {
  await page.goto('/');
  // Click sign out button
}
```

### 3. Create E2E Tests

**File:** `scry-developer-dashboard/e2e/navigation.test.ts` (NEW)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page should render', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Sign in')).toBeVisible();
  });
});
```

**File:** `scry-developer-dashboard/e2e/projects.test.ts` (NEW)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Projects', () => {
  // These tests require authentication - use test fixtures
  test.skip('should list projects after login', async ({ page }) => {
    // TODO: Implement after auth fixture is working
    await page.goto('/projects');
    await expect(page.locator('[data-testid="project-list"]')).toBeVisible();
  });

  test.skip('should navigate to project detail', async ({ page }) => {
    await page.goto('/projects');
    // Click first project
    // Verify detail page loads with tabs
  });
});
```

### 4. Update package.json Scripts

**File:** `scry-developer-dashboard/package.json`

```json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:headed": "playwright test --headed",
  "test:e2e:ui": "playwright test --ui"
}
```

### 5. Create Environment File

**File:** `scry-developer-dashboard/.env.e2e.local` (NEW)

```
# Firebase Emulator settings for e2e
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:8080
```

### 6. Add to .gitignore

**File:** `scry-developer-dashboard/.gitignore`

Add:
```
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-storybook-upload-service/vitest.e2e.config.ts` | E2E pattern reference |
| `scry-developer-dashboard/app/login/page.tsx` | Login page to test |
| `scry-developer-dashboard/app/projects/page.tsx` | Projects page to test |
| `scry-developer-dashboard/app/projects/[id]/page.tsx` | Project detail to test |
| `scry-developer-dashboard/lib/auth-guard.tsx` | Auth protection logic |

---

## Verification

1. `pnpm test:e2e` runs and at least the navigation tests pass
2. Playwright config properly starts Next.js dev server
3. Unauthenticated redirect test passes
4. Login page rendering test passes
5. Test results are generated in `playwright-report/`
6. `.gitignore` updated for test artifacts
