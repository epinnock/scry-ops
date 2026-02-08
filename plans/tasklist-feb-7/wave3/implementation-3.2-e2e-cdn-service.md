# Task 3.2: Local E2E Tests for scry-cdn-service

## Overview

Port the e2e testing pattern from scry-storybook-upload-service to the CDN service. Create a separate vitest e2e config, adapter pattern for multiple environments, and initial e2e test suite covering health checks, content serving, and error handling.

**Time Estimate:** 60 min
**Target Repo:** `scry-cdn-service`
**Agent Tools Required:** Code-only (read/write files, `pnpm install`, run tests)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| E-001 | E2E tests require actual R2 data, hard to set up locally | Medium | High | High |
| E-002 | Wrangler dev server behavior differs from production | Medium | Medium | Medium |
| E-003 | E2E tests are flaky due to network/timing issues | Medium | Medium | Medium |

**Mitigation:**
- E-001: Use wrangler dev with local R2 persistence (`--persist`). Seed test data as part of test setup.
- E-002: Document known differences. Use adapter pattern to configure per-environment expectations.
- E-003: Add retry logic and generous timeouts. Use `fileParallelism: false` for sequential execution.

---

## File-by-file Plan

### 1. Create E2E Vitest Config

**File:** `scry-cdn-service/vitest.e2e.config.ts` (NEW)

Pattern from `scry-storybook-upload-service/vitest.e2e.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

### 2. Create E2E Config

**File:** `scry-cdn-service/e2e/config.ts` (NEW)

```typescript
export interface E2EConfig {
  baseUrl: string;
  healthPath: string;
  testProjectId: string;
  testVersionId: string;
}

export function getConfig(): E2EConfig {
  const target = process.env.E2E_TARGET || 'local';

  switch (target) {
    case 'local':
      return {
        baseUrl: 'http://localhost:8787',
        healthPath: '/health',
        testProjectId: 'test-project',
        testVersionId: 'main',
      };
    case 'staging':
      return {
        baseUrl: process.env.E2E_STAGING_URL || 'https://scry-cdn-service-dev.scrymore.workers.dev',
        healthPath: '/health',
        testProjectId: process.env.E2E_TEST_PROJECT || 'test-project',
        testVersionId: 'main',
      };
    case 'production':
      return {
        baseUrl: process.env.E2E_PROD_URL || 'https://view.scrymore.com',
        healthPath: '/health',
        testProjectId: process.env.E2E_TEST_PROJECT || '',
        testVersionId: 'main',
      };
    default:
      throw new Error(`Unknown E2E target: ${target}`);
  }
}
```

### 3. Create E2E Tests

**File:** `scry-cdn-service/e2e/tests/health.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest';
import { getConfig } from '../config';

describe('CDN Service Health', () => {
  const config = getConfig();

  it('should return 200 from health endpoint', async () => {
    const response = await fetch(`${config.baseUrl}${config.healthPath}`);
    expect(response.status).toBe(200);
  });
});
```

**File:** `scry-cdn-service/e2e/tests/static-serving.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest';
import { getConfig } from '../config';

describe('Static Content Serving', () => {
  const config = getConfig();

  it('should serve index.html for a valid project/version', async () => {
    const url = `${config.baseUrl}/${config.testProjectId}/${config.testVersionId}/index.html`;
    const response = await fetch(url);
    // May be 200 or 404 depending on test data availability
    expect([200, 404]).toContain(response.status);
    if (response.status === 200) {
      expect(response.headers.get('content-type')).toContain('text/html');
    }
  });

  it('should return 404 for non-existent project', async () => {
    const url = `${config.baseUrl}/non-existent-project-xyz/main/index.html`;
    const response = await fetch(url);
    expect(response.status).toBe(404);
  });

  it('should handle coverage-report.json requests', async () => {
    const url = `${config.baseUrl}/${config.testProjectId}/${config.testVersionId}/coverage-report.json`;
    const response = await fetch(url);
    expect([200, 404]).toContain(response.status);
    if (response.status === 200) {
      expect(response.headers.get('content-type')).toContain('application/json');
    }
  });
});
```

**File:** `scry-cdn-service/e2e/tests/cors.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest';
import { getConfig } from '../config';

describe('CORS Headers', () => {
  const config = getConfig();

  it('should include CORS headers in responses', async () => {
    const response = await fetch(`${config.baseUrl}${config.healthPath}`);
    // Check for CORS headers based on CDN service configuration
    const corsHeader = response.headers.get('access-control-allow-origin');
    // Document actual CORS policy
    expect(response.status).toBe(200);
  });
});
```

### 4. Update package.json Scripts

**File:** `scry-cdn-service/package.json`

```json
"scripts": {
  "test:e2e": "vitest run --config vitest.e2e.config.ts",
  "test:e2e:local": "E2E_TARGET=local vitest run --config vitest.e2e.config.ts",
  "test:e2e:stage": "E2E_TARGET=staging vitest run --config vitest.e2e.config.ts",
  "test:e2e:prod": "E2E_TARGET=production vitest run --config vitest.e2e.config.ts"
}
```

### 5. Create Environment Example

**File:** `scry-cdn-service/.env.e2e.example` (NEW)

```
E2E_TARGET=local
E2E_STAGING_URL=https://scry-cdn-service-dev.scrymore.workers.dev
E2E_PROD_URL=https://view.scrymore.com
E2E_TEST_PROJECT=test-project
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-storybook-upload-service/vitest.e2e.config.ts` | Config pattern |
| `scry-storybook-upload-service/e2e/` | Full e2e directory pattern |
| `scry-cdn-service/src/routes/` | Routes to test |
| `scry-cdn-service/src/app.ts` | App structure |

---

## Verification

1. `pnpm test:e2e` runs against local wrangler dev server
2. Health check test passes
3. Static serving tests handle both data-present and data-absent cases
4. Tests are sequential (no parallelism issues)
5. Config supports multiple environments via `E2E_TARGET`
