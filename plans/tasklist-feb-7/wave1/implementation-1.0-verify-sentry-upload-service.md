# Task 1.0: Verify Sentry for scry-storybook-upload-service

## Overview

Verify that the existing Sentry integration in scry-storybook-upload-service is correctly configured and functional across local dev, staging, and production environments.

**Time Estimate:** 15 min
**Target Repo:** `scry-storybook-upload-service`
**Agent Tools Required:** Code-only (read files, run `pnpm dev`, run tests)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| V-001 | Sentry DSN not set in production secrets | Low | High | Medium |
| V-002 | Source maps not uploading in CI/CD | Medium | Medium | Medium |
| V-003 | Error filtering suppressing real errors | Low | Medium | Low |

---

## Verification Steps

### 1. Review Sentry Configuration

**File:** `scry-storybook-upload-service/src/entry.worker.ts`

Verify:
- `Sentry.withSentry()` wrapper is applied to the export default
- DSN is read from `env.SENTRY_DSN` (not hardcoded)
- `tracesSampleRate` is 0.1 for production, 1.0 for dev
- `sendDefaultPii` is `false`
- `beforeSend` filters test environment events
- `ignoreErrors` includes `AbortError` and `Network request failed`

### 2. Check Wrangler Secrets Configuration

**File:** `scry-storybook-upload-service/wrangler.toml`

Verify:
- `SENTRY_DSN` is listed as a var or documented as a secret
- `SENTRY_ENVIRONMENT` is configured per environment
- `SENTRY_RELEASE` is set (ideally to git SHA)

### 3. Verify CI/CD Source Map Upload

**File:** `scry-storybook-upload-service/.github/workflows/deploy.yml`

Verify:
- `getsentry/action-release@v3` is used in deploy job
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are referenced from GitHub secrets
- Source maps are uploaded from `./dist`
- Environment is set correctly
- Release version format is consistent (`storybook-upload-service@${{ github.sha }}`)

### 4. Check Documentation

**File:** `scry-storybook-upload-service/docs/SENTRY_SETUP.md`

Verify:
- Setup steps are accurate and complete
- Secret names match what's in wrangler.toml and CI/CD
- Local dev setup (`.dev.vars`) is documented

### 5. Test Error Capture Locally

```bash
cd scry-storybook-upload-service
pnpm dev
# Trigger a test error via an invalid API call
# Check local console for Sentry capture log
```

---

## Expected Output

A brief report documenting:
- Configuration status (correct / needs fix)
- Any gaps found
- Recommended fixes if any

---

## Verification

- All config files reviewed
- Source map upload confirmed in CI workflow
- No hardcoded secrets found
- Documentation is accurate
