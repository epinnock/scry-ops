# Screenshot Metadata ZIP — Gap Analysis

This document details the specific gaps between what exists today and what is needed for the build-processing pipeline to function end-to-end.

---

## Gap 1: No Metadata ZIP Generation

### What's needed
A ZIP file containing:
```
metadata-screenshots.zip
├── metadata.json          # Array of story objects with screenshot references
└── images/
    ├── Button-Primary.png
    ├── Card-Default.png
    └── ...
```

### metadata.json schema (required by build-processing-service)
```json
[
  {
    "filepath": "stories/Button.stories.ts",
    "componentName": "Button",
    "testName": "Primary",
    "storyTitle": "Example/Button",
    "screenshotPath": "images/Button-Primary.png",
    "location": { "startLine": 10, "endLine": 20 }
  }
]
```

### Where it could be generated
| Source | Knows stories? | Has browser? | Knows file paths? |
|--------|---------------|-------------|-------------------|
| scry-node (storycap) | Partial — fetches story list | Yes (Puppeteer) | No — only story IDs |
| scry-sbcov | Yes — full story analysis | Yes (Playwright) | Yes — parses .stories.ts files |
| GitHub Actions step | Depends on tool used | Can install browsers | Depends on tool used |

### Current state
- **scry-node**: Captures screenshots via storycap but discards metadata mapping. Only knows storyId, not filepath/componentName.
- **scry-sbcov**: Has all the metadata (filepath, componentName, testName, storyTitle, location) from its story file parser. Can capture screenshots via Playwright. Does not currently bundle them into a ZIP.

---

## Gap 2: No Queue Integration Between Upload and Build-Processing

### What's needed
After a Storybook upload completes, the upload service should publish a message to a Cloudflare Queue that triggers the build-processing pipeline.

### Queue message format (build-processing-service expects)
```typescript
interface QueueMessage {
  projectId: string;
  versionId: string;
  buildId: string;
  zipKey: string;       // R2 path to the metadata+screenshots ZIP
  timestamp: number;
}
```

### Current state
- **upload-service**: No queue binding in `wrangler.toml`, no queue publishing code
- **build-processing-service**: Queue consumer is fully implemented with:
  - Queue name: `scry-build-processing`
  - Dead letter queue: `scry-build-processing-dlq`
  - Max batch size: 1
  - Max retries: 3
  - Max concurrency: 5

### What's missing in upload-service
1. Queue producer binding in `wrangler.toml`:
   ```toml
   [[queues.producers]]
   queue = "scry-build-processing"
   binding = "BUILD_PROCESSING_QUEUE"
   ```
2. Code to publish message after successful upload
3. The `zipKey` in the message needs to reference the metadata ZIP, not the storybook ZIP

---

## Gap 3: R2 Storage Path Convention Mismatch

### What's needed
A consistent R2 path convention used by all services.

### Current inconsistency
| Source | Pattern |
|--------|---------|
| CLAUDE.md documentation | `{project}/{version}/builds/{buildNumber}/storybook.zip` |
| Upload service (actual code) | `{project}/{version}/storybook.zip` |
| CDN service (actual code) | `{project}/{version}/storybook.zip` |
| Build-processing (queue message) | `zipKey` field — whatever is sent |

### Options
1. **Keep current path** (`{project}/{version}/storybook.zip`) — simpler, matches upload + CDN
2. **Add buildNumber** (`{project}/{version}/builds/{buildNumber}/storybook.zip`) — matches CLAUDE.md docs, supports build history
3. **Separate path for metadata ZIP** — e.g., `{project}/{version}/builds/{buildNumber}/metadata-screenshots.zip`

### Recommendation
Use the `builds/{buildNumber}/` prefix for the metadata-screenshots ZIP since it's per-build (not per-version), while keeping `storybook.zip` at the version level since Storybook builds overwrite per version.

```
{project}/{version}/storybook.zip                                    # Storybook build (served by CDN)
{project}/{version}/builds/{buildNumber}/metadata-screenshots.zip    # Screenshots + metadata (processed by build-processing)
{project}/{version}/coverage-report.json                             # Coverage data
```

---

## Gap 4: Two Separate Screenshot Artifacts

### What's needed
The metadata-screenshots ZIP for build-processing is **different** from the Storybook build ZIP:

| Artifact | Content | Consumer | Purpose |
|----------|---------|----------|---------|
| `storybook.zip` | Compiled Storybook (HTML/JS/CSS) | CDN service | Serve the Storybook UI |
| `metadata-screenshots.zip` | Screenshots + metadata.json | Build-processing service | Search indexing pipeline |

### Current state
- Only `storybook.zip` is generated and uploaded
- `metadata-screenshots.zip` does not exist anywhere in the pipeline
- These are fundamentally different artifacts that cannot be combined:
  - Storybook ZIP: pre-built static site, no screenshots
  - Metadata ZIP: raw screenshots + story metadata, no HTML/JS/CSS

### Implication
The deploy flow needs to produce **two artifacts**, not one. This affects:
- scry-node CLI (or GitHub Actions) — must generate both
- Upload service — must accept and store both
- Queue message — must reference the metadata ZIP specifically

---

## Gap 5: Story Metadata Not Available at Deploy Time

### What's needed
The `metadata.json` requires these fields per story:
- `filepath` — e.g., `stories/Button.stories.ts`
- `componentName` — e.g., `Button`
- `testName` — e.g., `Primary`
- `storyTitle` — e.g., `Example/Button`
- `screenshotPath` — e.g., `images/Button-Primary.png`
- `location` (optional) — `{ startLine, endLine }`

### What each tool currently knows

| Field | scry-node (storycap) | scry-sbcov | Storybook index.json |
|-------|---------------------|-----------|---------------------|
| filepath | No | Yes (AST parser) | No |
| componentName | No | Yes (from meta) | Partial (title) |
| testName | No | Yes (from exports) | Yes (name) |
| storyTitle | Partial (from ID) | Yes | Yes (title) |
| screenshotPath | Yes (output path) | Can generate | No |
| location | No | Yes (AST) | No |

### Implication
- scry-sbcov is the only tool that has **all** the required metadata fields
- scry-node would need to either:
  1. Depend on scry-sbcov to generate metadata
  2. Parse story files itself (duplicating scry-sbcov logic)
  3. Use only what's available from Storybook's `index.json` (missing filepath, location)

---

## Priority Order

| Priority | Gap | Reason |
|----------|-----|--------|
| **P0** | Metadata ZIP generation | Without this, build-processing has no input |
| **P0** | Queue integration | Without this, build-processing is never triggered |
| **P1** | R2 path convention | Needs alignment before implementing |
| **P1** | Two-artifact deploy flow | Core architectural decision |
| **P2** | Story metadata availability | Determines which tool generates the ZIP |
