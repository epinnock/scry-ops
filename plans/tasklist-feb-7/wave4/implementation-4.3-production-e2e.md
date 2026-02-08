# Task 4.3: Production E2E Tests

## Overview

Extend e2e tests to target production environments. Production tests must be READ-ONLY (no writes, uploads, or mutations). Expand post-deployment validation in GitHub Actions.

**Time Estimate:** 45 min
**Target Repos:** `scry-cdn-service`, `scry-storybook-upload-service`, `scry-developer-dashboard`
**Agent Tools Required:** Code-only + production URLs for verification
**Dependencies:** Task 4.2 (staging e2e) should be complete as a template

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| PE-001 | Write tests accidentally run against production | Low | Critical | High |
| PE-002 | Rate limiting blocks test execution | Medium | Medium | Medium |
| PE-003 | Production data changes break test assertions | Medium | Low | Low |

**CRITICAL Mitigation:**
- PE-001: Production adapters must explicitly skip write tests. Add `test.skip()` guard for any test with write operations. Add `PRODUCTION_SAFETY_CHECK=true` env var that must be set.
- PE-002: Add delays between requests. Use conservative test count.
- PE-003: Only assert on response codes and headers, not data content.

---

## File-by-file Plan

### 1. CDN Service Production Config

**File:** `scry-cdn-service/e2e/config.ts` (update)

Add production config (already scaffolded in Task 3.2):
```typescript
case 'production':
  return {
    baseUrl: 'https://view.scrymore.com',
    healthPath: '/health',
    testProjectId: process.env.E2E_PROD_PROJECT || '',
    testVersionId: 'main',
    readOnly: true,  // Flag for tests to check
  };
```

### 2. Create Production-Safe Test Guards

**File:** `scry-cdn-service/e2e/utils/safety.ts` (NEW)

```typescript
export function isProductionTarget(): boolean {
  return process.env.E2E_TARGET === 'production';
}

export function skipInProduction(testFn: Function) {
  if (isProductionTarget()) {
    return test.skip;
  }
  return testFn;
}
```

### 3. Update Existing E2E Tests

Add production safety guards to any tests that write data:
```typescript
test.skipIf(isProductionTarget())('should upload a build', async () => {
  // ... write test
});
```

### 4. Expand Post-Deployment Validation in CI

**File:** `.github/workflows/deploy-cdn-service.yml`

The CDN deploy workflow already has a basic health check (L84-86). Expand it:

```yaml
- name: Post-deployment validation
  if: success()
  run: |
    cd scry-cdn-service
    E2E_TARGET=production pnpm test:e2e
```

### 5. Add Production E2E to Upload Service Deploy

**File:** `.github/workflows/deploy.yml` (upload service)

Add post-deployment e2e step after the deploy job.

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/e2e/config.ts` | Config to extend |
| `.github/workflows/deploy-cdn-service.yml` | CDN deploy workflow (L84-86 health check) |
| `scry-storybook-upload-service/package.json` | Already has `test:e2e:prod` script (L23) |

---

## Verification

1. `E2E_TARGET=production pnpm test:e2e` runs only read-only tests
2. No write/mutation tests execute against production
3. Health check passes for all services
4. Post-deployment validation is added to CI workflows
5. Production safety guards are in place
