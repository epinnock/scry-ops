# Implementation Plan: scry-storybook-upload-service

**Service:** scry-storybook-upload-service (`/home/boxuser/scry/scry-storybook-upload-service`)
**Stack:** TypeScript, Hono, Cloudflare Workers, R2, Firestore
**Test command:** `npm test` (Vitest)

---

## Goal

Add a `POST /upload/:project/:version/metadata` endpoint that:
1. Accepts a metadata+screenshots ZIP upload
2. Stores it in R2 at `{project}/{version}/builds/{buildNumber}/metadata-screenshots.zip`
3. Publishes a queue message to trigger `scry-build-processing-service`
4. Updates the build record with `processingStatus: 'queued'`

Also add the Cloudflare Queue producer binding so the service can publish messages.

---

## Prerequisites

- A build record must already exist for the project+version (storybook.zip uploaded first)
- The Cloudflare Queue `scry-build-processing` must be created in the Cloudflare dashboard (for production)
- Queue binding is optional — endpoint works without it (stores ZIP but doesn't enqueue)

---

## Queue Message Format

The message must match what `scry-build-processing-service` expects (`src/types.ts:1-7`):

```typescript
interface QueueMessage {
  projectId: string;   // URL param :project
  versionId: string;   // URL param :version
  buildId: string;     // Firestore document ID of the build
  zipKey: string;      // R2 object key for the metadata ZIP
  timestamp: number;   // Date.now()
}
```

---

## Files to Modify

### 1. `wrangler.toml`

**Add queue producer binding** after the R2 bucket binding (line 28):

```toml
[[queues.producers]]
queue = "scry-build-processing"
binding = "BUILD_PROCESSING_QUEUE"
```

**Add to preview environment** (after line 59):

```toml
[[env.preview.queues.producers]]
queue = "scry-build-processing-preview"
binding = "BUILD_PROCESSING_QUEUE"
```

This creates the `BUILD_PROCESSING_QUEUE` binding available as `c.env.BUILD_PROCESSING_QUEUE` in the worker.

---

### 2. `src/entry.worker.ts`

**Add to `Bindings` type** (line 16-40):

```typescript
// Cloudflare Queue for triggering build processing
BUILD_PROCESSING_QUEUE?: Queue;
```

Marked as optional (`?`) so the service works in environments without the queue configured (dev, testing).

**Pass queue to app context** in the middleware (around line 107, after setting firestore/apiKey):

```typescript
// Make queue available to route handlers
if (c.env.BUILD_PROCESSING_QUEUE) {
  c.set('queue', c.env.BUILD_PROCESSING_QUEUE);
}
```

---

### 3. `src/app.ts`

**Update `AppEnv` type** to include queue:

```typescript
// Add to Variables type:
queue?: Queue;
```

**Add new endpoint** `POST /upload/:project/:version/metadata` after the coverage endpoint (line 374).

Follow the same patterns as existing endpoints (validation, auth middleware, error handling):

```typescript
app.post('/upload/:project/:version/metadata', async (c) => {
  const project = c.req.param('project');
  const version = c.req.param('version');

  // 1. Validate project name (same regex as existing upload)
  if (!/^[a-zA-Z0-9_-]+$/.test(project)) {
    return c.json({ error: 'Invalid project name' }, 400);
  }

  // 2. Read request body
  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // 3. Look up latest build
  const firestore = c.get('firestore');
  if (!firestore) {
    return c.json({ error: 'Firestore not configured' }, 500);
  }

  const build = await firestore.getLatestBuild(project, version);
  if (!build) {
    return c.json({
      error: 'No build found for this project and version. Upload storybook.zip first.',
    }, 400);
  }

  // 4. Store ZIP in R2
  const storage = c.get('storage');
  const zipKey = `${project}/${version}/builds/${build.buildNumber}/metadata-screenshots.zip`;
  await storage.upload(zipKey, new Uint8Array(body), 'application/zip');

  // 5. Publish queue message (if queue is configured)
  const queue = c.get('queue');
  let queued = false;
  if (queue) {
    await queue.send({
      projectId: project,
      versionId: version,
      buildId: build.id,
      zipKey,
      timestamp: Date.now(),
    });
    queued = true;
  }

  // 6. Update build processing status
  await firestore.updateProcessingStatus(project, build.id, 'queued');

  // 7. Return success
  return c.json({
    success: true,
    message: 'Metadata ZIP uploaded' + (queued ? ' and processing queued' : ''),
    queued,
    buildNumber: build.buildNumber,
    zipKey,
  }, 201);
});
```

**Auth middleware:** This endpoint should be protected by the same API key middleware as `/upload` routes. Check how the existing auth middleware is applied (line 34-35 in `app.ts`) and ensure `/upload/:project/:version/metadata` is covered by the same pattern.

---

### 4. `src/services/firestore/firestore.worker.ts`

**Add `getLatestBuild()` method:**

Look up the most recent build for a project+version pair. Firestore REST API approach:

```typescript
async getLatestBuild(
  projectId: string,
  versionId: string
): Promise<{ id: string; buildNumber: number } | null> {
  // Query: projects/{projectId}/builds where versionId == version
  // Order by buildNumber desc, limit 1
  //
  // Firestore REST structured query:
  // POST :runQuery with structuredQuery containing
  //   from: [{ collectionId: 'builds' }]
  //   where: { fieldFilter: { field: 'versionId', op: 'EQUAL', value: { stringValue: versionId } } }
  //   orderBy: [{ field: 'buildNumber', direction: 'DESCENDING' }]
  //   limit: 1
  //
  // Alternative (simpler): List all builds for the project,
  // filter by versionId in code, sort by buildNumber desc, take first.
  // This works if build count per project is reasonable.
}
```

**Note:** Check what query patterns `firestore.worker.ts` already uses. The service may have helper methods for Firestore REST queries. The build-processing service's `firestore.worker.ts` does direct document operations (GET/PATCH) — if structured queries aren't already implemented, the simpler approach (list + filter) may be better.

**Add `updateProcessingStatus()` method:**

```typescript
async updateProcessingStatus(
  projectId: string,
  buildId: string,
  status: string
): Promise<void> {
  // PATCH the build document to set processingStatus
  // Path: projects/{projectId}/builds/{buildId}
  // Fields: { processingStatus: { stringValue: status } }
  // Query: ?updateMask.fieldPaths=processingStatus
  //
  // This pattern is already used in build-processing-service's firestore.worker.ts
}
```

---

### 5. `src/services/firestore/firestore.types.ts`

**Add to the Build type** (or CreateBuildData):

```typescript
processingStatus?: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
```

---

### 6. `src/services/storage/storage.worker.ts` (if needed)

Check if the existing `upload()` method on `R2S3StorageService` supports uploading with a custom key. The current upload flow uses `{project}/{version}/storybook.zip` as the key. The metadata endpoint needs to upload to `{project}/{version}/builds/{buildNumber}/metadata-screenshots.zip`.

If `upload()` takes a key parameter: no changes needed.
If it constructs the key internally: add a method or parameter for custom keys.

---

## R2 Storage Convention

```
{project}/{version}/storybook.zip                                    # Storybook build (CDN)
{project}/{version}/coverage-report.json                             # Coverage data
{project}/{version}/builds/{buildNumber}/metadata-screenshots.zip    # Screenshots + metadata
```

The metadata ZIP goes under `builds/{buildNumber}/` because:
- Each build gets its own metadata ZIP (builds can have different stories)
- The `storybook.zip` stays at version level since it overwrites per version
- This matches the R2 path convention documented in CLAUDE.md

---

## Tests

### New or extended test file: `src/app.metadata.test.ts`

Test cases:
1. **POST metadata ZIP stores at correct R2 key**
   - Upload storybook.zip first (create build)
   - POST metadata ZIP
   - Verify R2 key is `{project}/{version}/builds/{N}/metadata-screenshots.zip`

2. **Returns 400 when no build exists**
   - POST metadata ZIP without prior storybook upload
   - Expect 400 with error message

3. **Returns 400 when body is empty**
   - POST with empty body
   - Expect 400

4. **Queue message has correct format**
   - Mock queue binding
   - Verify `send()` called with `{ projectId, versionId, buildId, zipKey, timestamp }`

5. **Works without queue binding (graceful degradation)**
   - No queue binding configured
   - ZIP still stored in R2
   - Response has `queued: false`

6. **processingStatus set to 'queued'**
   - Verify Firestore build document updated

7. **Auth required**
   - POST without API key → 401

---

## Checklist

- [ ] Add queue producer binding to `wrangler.toml`
- [ ] Add preview queue binding
- [ ] Add `BUILD_PROCESSING_QUEUE` to `Bindings` type
- [ ] Pass queue to app context in middleware
- [ ] Add `queue` to `AppEnv` variables type
- [ ] Implement `POST /upload/:project/:version/metadata` endpoint
- [ ] Implement `getLatestBuild()` in Firestore service
- [ ] Implement `updateProcessingStatus()` in Firestore service
- [ ] Add `processingStatus` to Build type
- [ ] Verify storage service supports custom R2 keys
- [ ] Apply auth middleware to new endpoint
- [ ] Write tests
- [ ] Run `npm test` — all tests pass
