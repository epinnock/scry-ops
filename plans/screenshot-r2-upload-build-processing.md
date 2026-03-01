# Plan: Upload Extracted Screenshots to R2 During Build Processing

## Context

The build processing pipeline extracts screenshots from Storybook ZIPs, generates embeddings, and inserts them into Milvus. However, the individual screenshot images are discarded after processing. The `scry-nextjs` frontend expects a `screenshotR2Url` field in `json_content` to display component screenshots, but it's never set. This means search results have no images.

**Fix**: Upload each extracted screenshot to the existing `scry-component-snapshot-bucket` R2 bucket and store the R2 URL in `json_content.screenshotR2Url`.

## Compatibility with scry-nextjs

**No changes needed in scry-nextjs.** The existing flow already handles our planned URL format:

1. `extractImageUrl()` reads `json_content.screenshotR2Url` from Milvus search results
2. `StorageImage` component detects R2 URL via `isR2Url()` (checks for `r2.cloudflarestorage.com` hostname)
3. `extractStorageKey()` extracts the key from the URL (e.g. `my-project/abc123/Card-Default.png`)
4. Constructs proxy URL: `/api/image/my-project/abc123/Card-Default.png`
5. Image proxy route (`/api/image/[...path]`) fetches from CDN worker with auth token
6. CDN worker reads from `scry-component-snapshot-bucket` using the key

**URL format we'll store**: `https://scry-component-snapshot-bucket.f54b9c10de9d140756dbf449aa124f1e.r2.cloudflarestorage.com/{projectId}/{buildId}/{filename}`

This is a valid R2 URL that scry-nextjs already knows how to parse — unlike the old buggy format that had a nested URL in the key.

## Changes

### 1. Add R2 bucket binding — `wrangler.toml`

Add a second `[[r2_buckets]]` block for the screenshot bucket:

```toml
[[r2_buckets]]
binding = "SCREENSHOT_BUCKET"
bucket_name = "scry-component-snapshot-bucket"
preview_bucket_name = "scry-component-snapshot-bucket"
```

### 2. Update types — `src/types.ts`

- Add `SCREENSHOT_BUCKET: R2Bucket` to `Env` interface
- Add `screenshotR2Url?: string` to `ProcessedStory` interface

### 3. Create screenshot uploader — `src/pipeline/screenshot-uploader.ts` (new file)

- Export `uploadScreenshots(bucket, stories, projectId, buildId)` → `ScreenshotUploadResult[]`
- R2 key format: `{projectId}/{buildId}/{filename}`
- CDN URL: `https://r2-cdn-worker.epinnock.workers.dev/{key}`
- Per-screenshot error handling: failures return `null` URL, don't throw (story still gets inserted without an image)

### 4. Integrate into pipeline — `src/pipeline/index.ts`

- Import `uploadScreenshots`
- Call it after metadata parsing, before LLM inspection (R2 puts are fast)
- Wire `uploadResults[i].url` into the `ProcessedStory` assembly loop as `screenshotR2Url`

### 5. Add to Milvus payload — `src/pipeline/vector-inserter.ts`

- Add `screenshotR2Url: story.screenshotR2Url` to `json_content` in `transformStoryData()`
- When undefined, `JSON.stringify` omits it — graceful degradation

### 6. Tests

- **New**: `src/pipeline/__tests__/screenshot-uploader.test.ts` — upload success, partial failure, empty array
- **Update**: `src/pipeline/__tests__/vector-inserter.test.ts` — add `screenshotR2Url` to test helper, assert it appears in `json_content`

## Files Modified

| File | Action |
|------|--------|
| `wrangler.toml` | Add `SCREENSHOT_BUCKET` binding |
| `src/types.ts` | Add to `Env` + `ProcessedStory` |
| `src/pipeline/screenshot-uploader.ts` | New file |
| `src/pipeline/index.ts` | Import + call uploader + wire URL |
| `src/pipeline/vector-inserter.ts` | Add `screenshotR2Url` to `json_content` |
| `src/pipeline/__tests__/screenshot-uploader.test.ts` | New test file |
| `src/pipeline/__tests__/vector-inserter.test.ts` | Update test helper + assertions |

## Verification

1. Run `pnpm test` — all tests pass
2. Run `pnpm run dev`, re-seed with `bash scripts/seed-local-r2.sh`, hit the `/process` endpoint
3. Confirm logs show `[SCREENSHOTS] Uploaded: ...` for each screenshot
4. Confirm Milvus insert succeeds with `screenshotR2Url` present in `json_content`
