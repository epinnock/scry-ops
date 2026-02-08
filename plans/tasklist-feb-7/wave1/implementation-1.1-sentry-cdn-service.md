# Task 1.1: Add Sentry to scry-cdn-service

## Overview

Add `@sentry/cloudflare` error tracking to the CDN service (scry-cdn-service), following the exact pattern established in scry-storybook-upload-service. This provides production error monitoring, tracing, and source map support.

**Time Estimate:** 45 min
**Target Repo:** `scry-cdn-service`
**Agent Tools Required:** Code-only (read/write files, `pnpm install`, `pnpm test`)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| S-001 | Sentry wrapper breaks existing request handling | Low | High | Medium |
| S-002 | Increased cold start latency from Sentry SDK | Medium | Low | Low |
| S-003 | Sentry SDK version incompatibility with Cloudflare runtime | Low | High | Medium |

**Mitigation:**
- S-001: Run full test suite after wrapping. Sentry.withSentry is non-invasive.
- S-002: Set `tracesSampleRate` to 0.1 in production to minimize overhead.
- S-003: Use same `@sentry/cloudflare` version as upload-service (`^10.33.0`).

---

## File-by-file Plan

### 1. Install dependency

```bash
cd scry-cdn-service
pnpm add @sentry/cloudflare@^10.33.0
```

### 2. Update Environment Types

**File:** `scry-cdn-service/src/types/env.ts`

Add Sentry-related environment bindings:

```typescript
// Add to existing Env interface
SENTRY_DSN?: string;
SENTRY_ENVIRONMENT?: string;
SENTRY_RELEASE?: string;
```

### 3. Wrap Worker Entry with Sentry

**File:** `scry-cdn-service/cloudflare/worker.ts`

Current state (simple export):
```typescript
import app from '../src/app';
export default { fetch: app.fetch };
```

Updated with Sentry wrapper (copy pattern from `scry-storybook-upload-service/src/entry.worker.ts` lines 159-196):

```typescript
import * as Sentry from '@sentry/cloudflare';
import app from '../src/app';

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'production',
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    debug: env.NODE_ENV !== 'production',
    sendDefaultPii: false,
    ignoreErrors: ['AbortError', 'Network request failed'],
    initialScope: {
      tags: {
        service: 'scry-cdn-service',
        runtime: 'cloudflare-workers',
      },
    },
    beforeSend(event, hint) {
      if (env.NODE_ENV === 'test') return null;
      return event;
    },
  }),
  {
    fetch: app.fetch,
  } as ExportedHandler
);
```

### 4. Update Wrangler Config

**File:** `scry-cdn-service/cloudflare/wrangler.toml`

Add comments documenting required secrets:
```toml
# Sentry secrets (set via `wrangler secret put`):
# - SENTRY_DSN
# - SENTRY_ENVIRONMENT
# - SENTRY_RELEASE
```

### 5. Create Sentry Setup Documentation

**File:** `scry-cdn-service/docs/SENTRY_SETUP.md`

Mirror the structure from `scry-storybook-upload-service/docs/SENTRY_SETUP.md`:
- Prerequisites (Sentry project for Cloudflare Workers)
- Local development setup (`.dev.vars`)
- Production deployment (`wrangler secret put`)
- GitHub Actions secrets for source maps
- Testing the integration

### 6. Update Tests

Verify existing tests still pass with the Sentry wrapper. The wrapper should be transparent to tests since Sentry is a no-op without a DSN.

```bash
pnpm test
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-storybook-upload-service/src/entry.worker.ts` | Pattern to copy |
| `scry-storybook-upload-service/docs/SENTRY_SETUP.md` | Documentation pattern |
| `scry-cdn-service/cloudflare/worker.ts` | Target entry point |
| `scry-cdn-service/src/types/env.ts` | Target type definitions |
| `scry-cdn-service/cloudflare/wrangler.toml` | Target wrangler config |

---

## Verification

1. `pnpm test` passes with no regressions
2. `pnpm dev` starts without errors
3. Sentry wrapper is applied correctly (review code)
4. Documentation is complete and accurate
5. No hardcoded DSN values
