# Task 4.4: Create Analysis Service Scaffold

## Overview

Create the initial scaffold for a new `scry-analysis-service` as a Cloudflare Worker using the Hono framework, following the established patterns from the CDN and upload services. This service will eventually provide component analysis, coverage aggregation, and quality insights.

**Time Estimate:** 60 min
**Target Repo:** `scry-analysis-service` (NEW)
**Agent Tools Required:** Code-only (read/write files, `pnpm init`, run tests)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| AS-001 | Service scaffold doesn't align with future analysis requirements | Medium | Medium | Medium |
| AS-002 | Dependency versions conflict with other services | Low | Low | Low |

**Overall Risk: Low** - This is a scaffold; implementation details come later.

**Mitigation:**
- AS-001: Keep the scaffold minimal. Only health route and basic analysis endpoint stubs. Real logic added incrementally.
- AS-002: Use same versions as upload service for consistency.

---

## File-by-file Plan

### 1. Create Project Directory and Initialize

```bash
mkdir -p /home/boxuser/scry/scry-analysis-service/src/{routes,types,utils}
cd /home/boxuser/scry/scry-analysis-service
```

### 2. package.json

**File:** `scry-analysis-service/package.json` (NEW)

```json
{
  "name": "scry-analysis-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.9.7",
    "@sentry/cloudflare": "^10.33.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250124.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

### 3. TypeScript Config

**File:** `scry-analysis-service/tsconfig.json` (NEW)

Copy from `scry-cdn-service/tsconfig.json`, adjust paths.

### 4. Wrangler Config

**File:** `scry-analysis-service/wrangler.toml` (NEW)

```toml
name = "scry-analysis-service"
main = "src/entry.worker.ts"
compatibility_date = "2024-12-01"

[observability]
enabled = true

[env.production]
name = "scry-analysis-service"

[env.development]
name = "scry-analysis-service-dev"
```

### 5. Types

**File:** `scry-analysis-service/src/types/env.ts` (NEW)

```typescript
export interface Env {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
}
```

### 6. Routes

**File:** `scry-analysis-service/src/routes/health.ts` (NEW)

```typescript
import { Hono } from 'hono';
import type { Env } from '../types/env';

const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'scry-analysis-service' });
});

export { healthRoutes };
```

**File:** `scry-analysis-service/src/routes/analyze.ts` (NEW)

```typescript
import { Hono } from 'hono';
import type { Env } from '../types/env';

const analyzeRoutes = new Hono<{ Bindings: Env }>();

analyzeRoutes.post('/analyze', async (c) => {
  // Stub - will accept project ID and trigger analysis
  return c.json({ message: 'Analysis endpoint - not yet implemented' }, 501);
});

analyzeRoutes.get('/results/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  // Stub - will return analysis results
  return c.json({ message: `Results for ${projectId} - not yet implemented` }, 501);
});

export { analyzeRoutes };
```

### 7. App

**File:** `scry-analysis-service/src/app.ts` (NEW)

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { healthRoutes } from './routes/health';
import { analyzeRoutes } from './routes/analyze';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.route('/', healthRoutes);
app.route('/', analyzeRoutes);

export default app;
```

### 8. Worker Entry with Sentry

**File:** `scry-analysis-service/src/entry.worker.ts` (NEW)

Follow the same Sentry pattern as CDN and upload services.

### 9. Vitest Config

**File:** `scry-analysis-service/vitest.config.ts` (NEW)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

### 10. Initial Tests

**File:** `scry-analysis-service/src/routes/__tests__/health.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest';
import app from '../../app';

describe('Health Route', () => {
  it('should return 200 with status ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
```

### 11. README

**File:** `scry-analysis-service/README.md` (NEW)

Document:
- Service purpose (component analysis, coverage aggregation)
- Setup instructions
- Available endpoints
- Reference to `scry-notebooks/` for Python analysis capabilities

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/` | Hono + Cloudflare Worker structure pattern |
| `scry-storybook-upload-service/` | Full service with Sentry pattern |
| `scry-notebooks/` | Python analysis code for reference |

---

## Verification

1. `pnpm install` succeeds
2. `pnpm test` passes health route test
3. `pnpm dev` starts wrangler dev server
4. `GET /health` returns 200
5. `POST /analyze` returns 501 (not yet implemented)
6. TypeScript compiles with no errors (`pnpm typecheck`)
