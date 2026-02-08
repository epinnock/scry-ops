# Task 1.2: Fix /latest Route in CDN Service

## Overview

The `/latest` URL pattern is recognized by `isVersionSegment()` but doesn't serve content because no actual file exists at `{projectId}/latest/storybook.zip` in R2. The `/main` route works because files are uploaded with the literal version identifier `main`. Need to resolve `latest` as an alias to the most recent build version.

**Time Estimate:** 30 min
**Target Repo:** `scry-cdn-service`
**Agent Tools Required:** Code-only (read/write files, run tests)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| L-001 | Metadata lookup adds latency to every /latest request | Medium | Medium | Medium |
| L-002 | No builds exist for project, /latest returns confusing error | Medium | Low | Low |
| L-003 | Race condition if new build uploaded while /latest is resolving | Low | Low | Low |

**Mitigation:**
- L-001: Cache the latest version resolution in KV (CDN_CACHE) with short TTL (60s). Subsequent requests are fast.
- L-002: Return clear 404 with message "No builds found for this project"
- L-003: Eventual consistency is acceptable; the next request will pick up the new build.

---

## File-by-file Plan

### 1. Investigate Current Path Resolution

**File:** `scry-cdn-service/src/utils/subdomain.ts`

The `isVersionSegment()` function (L55-69) already recognizes `latest` as valid. The `parsePathForUUID()` function constructs a zip key from it. The problem is downstream - no object exists at that key.

### 2. Add Version Resolution Utility

**File:** `scry-cdn-service/src/utils/version-resolver.ts` (NEW)

Create a utility that resolves `latest` to the actual most recent version:

```typescript
interface VersionResolution {
  resolvedVersion: string;
  buildNumber?: number;
}

export async function resolveVersion(
  projectId: string,
  version: string,
  env: Env
): Promise<VersionResolution | null> {
  if (version !== 'latest') {
    return { resolvedVersion: version };
  }

  // Strategy: List R2 objects under the project prefix, find latest
  // OR: Query a metadata store (Firestore/KV) for the latest version
  // Choose based on what data is available in the CDN service bindings
}
```

**Decision point for the agent:** The CDN service has access to:
- R2 buckets (`UPLOAD_BUCKET`, `STATIC_SITES`)
- KV namespace (`CDN_CACHE`)

The agent should decide between:
1. **R2 listing** - `bucket.list({ prefix: projectId + '/' })` and parse the most recent version
2. **KV cache** - Store latest version info when uploads happen (requires upload-service to write to KV)

Option 1 is self-contained and recommended for initial implementation.

### 3. Integrate Into Zip-Static Route

**File:** `scry-cdn-service/src/routes/zip-static.ts`

After path parsing but before R2 lookup, check if version is `latest` and resolve it:

```typescript
// After parsePathForUUID()
if (resolution.version === 'latest') {
  const resolved = await resolveVersion(resolution.projectId, 'latest', c.env);
  if (!resolved) {
    return c.json({ error: 'No builds found for this project' }, 404);
  }
  // Reconstruct resolution with resolved version
  resolution.version = resolved.resolvedVersion;
  // Reconstruct zipKey with new version
}
```

### 4. Add Caching

Use the existing `CDN_CACHE` KV namespace to cache the resolution:

```typescript
const cacheKey = `latest:${projectId}`;
const cached = await env.CDN_CACHE.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... resolve from R2
await env.CDN_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 });
```

### 5. Add Unit Tests

**File:** `scry-cdn-service/src/utils/__tests__/version-resolver.test.ts` (NEW)

```typescript
describe('resolveVersion', () => {
  it('returns version as-is for non-latest versions', async () => { ... });
  it('resolves latest to most recent version from R2', async () => { ... });
  it('returns null when no builds exist', async () => { ... });
  it('uses cached value when available', async () => { ... });
});
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/src/utils/subdomain.ts` | Version segment detection (L55-69) |
| `scry-cdn-service/src/routes/zip-static.ts` | Primary serving logic to modify |
| `scry-cdn-service/src/app.ts` | Middleware chain / route registration |
| `scry-cdn-service/cloudflare/wrangler.toml` | KV and R2 bindings reference |

---

## Verification

1. `pnpm test` passes with new and existing tests
2. `/main` route continues to work unchanged
3. `/latest` resolves to the most recent version
4. `/latest` returns 404 with clear message when no builds exist
5. Cached resolution returns within expected TTL
