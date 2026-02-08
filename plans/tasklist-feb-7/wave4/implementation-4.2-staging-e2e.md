# Task 4.2: Staging E2E Tests

## Overview

Extend the local e2e tests (from Tasks 3.2 and 3.3) to target staging environments. Create staging adapters and configure GitHub Actions for on-demand staging validation.

**Time Estimate:** 45 min
**Target Repos:** `scry-cdn-service`, `scry-storybook-upload-service`, `scry-developer-dashboard`
**Agent Tools Required:** Code-only + staging environment access for testing
**Dependencies:** Tasks 3.2 (CDN e2e) and 3.3 (dashboard e2e) must be complete

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| SE-001 | Staging environment is down or misconfigured | Medium | Medium | Medium |
| SE-002 | Staging data differs from expectations | Medium | Low | Low |
| SE-003 | Staging auth tokens expire during test runs | Low | Medium | Low |

**Overall Risk: Low** - Staging is designed for testing.

**Mitigation:**
- SE-001: Add health check as first test; skip remaining tests if unhealthy.
- SE-002: Use flexible assertions (check response codes, not exact data).
- SE-003: Use service tokens with longer TTL for staging.

---

## File-by-file Plan

### 1. CDN Service Staging Adapter

**File:** `scry-cdn-service/e2e/config.ts` (already created in Task 3.2)

The staging configuration is already included in the config from Task 3.2. Verify staging URLs are correct:
- Base URL: `https://scry-cdn-service-dev.scrymore.workers.dev`

### 2. Upload Service Staging Adapter

**File:** `scry-storybook-upload-service/e2e/config.ts` (update)

Ensure staging adapter exists with correct URLs:
- Base URL from `.env.stage` or wrangler staging config

### 3. Dashboard Staging Config

**File:** `scry-developer-dashboard/e2e/config.ts` (NEW or update)

```typescript
export const stagingConfig = {
  baseUrl: process.env.E2E_STAGING_DASHBOARD_URL || 'https://scry-dev-dashboard-stage.vercel.app',
  // Auth: Use Firebase staging project
};
```

### 4. Create GitHub Actions Workflow

**File:** `.github/workflows/e2e-staging.yml` (NEW)

```yaml
name: E2E Staging Tests
on:
  workflow_dispatch:
    inputs:
      service:
        description: 'Service to test'
        required: true
        type: choice
        options:
          - all
          - cdn-service
          - upload-service
          - dashboard

jobs:
  e2e-cdn:
    if: inputs.service == 'all' || inputs.service == 'cdn-service'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd scry-cdn-service && pnpm install
      - run: cd scry-cdn-service && E2E_TARGET=staging pnpm test:e2e

  e2e-upload:
    if: inputs.service == 'all' || inputs.service == 'upload-service'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd scry-storybook-upload-service && pnpm install
      - run: cd scry-storybook-upload-service && pnpm test:e2e:prod  # staging target

  e2e-dashboard:
    if: inputs.service == 'all' || inputs.service == 'dashboard'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd scry-developer-dashboard && pnpm install
      - run: npx playwright install --with-deps
      - run: cd scry-developer-dashboard && E2E_TARGET=staging pnpm test:e2e
```

### 5. Create Staging Environment Files

Create `.env.e2e.staging` example files for each service with staging URLs and credentials placeholders.

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/e2e/config.ts` | Config with staging support (Task 3.2) |
| `scry-storybook-upload-service/e2e/` | Existing e2e pattern |
| `scry-cdn-service/.github/workflows/deploy-cdn-service.yml` | CI pattern reference |

---

## Verification

1. `E2E_TARGET=staging pnpm test:e2e` works for CDN service
2. `E2E_TARGET=staging pnpm test:e2e` works for upload service
3. `E2E_TARGET=staging pnpm test:e2e` works for dashboard
4. GitHub Actions workflow can be triggered manually
5. Tests pass against staging environments
