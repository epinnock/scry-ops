# Screenshot Metadata ZIP — Current State Analysis

This document maps the current state of how screenshot/metadata ZIPs flow through the Scry platform, identifying where they are generated, stored, and consumed.

---

## Overview

The Scry platform has a **search indexing pipeline** that requires per-story screenshots paired with metadata. This pipeline lives in `scry-build-processing-service`. However, the generation of these screenshots and metadata happens **outside** the current automated deploy flow — creating a gap between what the build-processing service expects and what the upload pipeline currently provides.

---

## Service-by-Service Current State

### scry-node (CLI Deployer)

**What it does today:**
- Runs `scry deploy` to upload a pre-built Storybook to the upload service
- Uses `storycap` (shelled out via `execSync`) to capture screenshots of stories
- Screenshots are saved locally to `__screenshots__/` directory
- Uploads the **Storybook build ZIP** (compiled static HTML/JS/CSS) to the upload service
- Optionally uploads a coverage report JSON

**What it does NOT do:**
- Does not generate a `metadata.json` file pairing stories to screenshots
- Does not create a ZIP combining screenshots + metadata
- Does not upload screenshots to the upload service or R2
- Screenshots captured by storycap are used locally only (or discarded)

**Relevant files:**
- `scry-node/lib/screencap.js` — storycap invocation
- `scry-node/bin/cli.js` — CLI commands (deploy, analyze)

---

### scry-storybook-upload-service

**What it does today:**
- Receives Storybook build ZIPs via `POST /upload/:project/:version`
- Stores ZIP in R2 at: `{project}/{version}/storybook.zip`
- Optionally receives coverage report JSON (multipart or separate endpoint)
- Stores coverage at: `{project}/{version}/coverage-report.json`
- Creates Firestore build records with auto-incrementing buildNumber
- Provides presigned URLs for direct R2 uploads

**What it does NOT do:**
- Does not receive or store screenshot ZIPs
- Does not generate metadata.json or screenshots
- Does not publish queue messages to trigger build-processing-service
  - **This is a known gap** — the architecture diagram shows queue integration but the code has no queue publisher implementation

**R2 storage pattern (current):**
```
{project}/{version}/storybook.zip
{project}/{version}/coverage-report.json  (optional)
```

**Key observation:** The upload service has **no awareness** of the build-processing pipeline. There is no queue binding in `wrangler.toml` and no message publishing code.

---

### scry-build-processing-service

**What it expects:**
- A Cloudflare Queue message containing:
  ```json
  {
    "projectId": "my-project",
    "versionId": "v1.0.0",
    "buildId": "abc123",
    "zipKey": "my-project/v1.0.0/builds/5/storybook.zip",
    "timestamp": 1700000000000
  }
  ```
- The `zipKey` points to a ZIP in R2 with this structure:
  ```
  screenshots.zip (or storybook.zip)
  ├── metadata.json
  └── images/
      ├── Button-Primary.png
      ├── Button-Secondary.png
      └── Card-Default.png
  ```

**metadata.json format expected:**
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

**Processing pipeline:**
1. Extract ZIP from R2 → parse metadata.json + collect screenshot images
2. Match each story's `screenshotPath` to actual image bytes in ZIP
3. Send screenshots to OpenAI Vision API (gpt-5-mini) for LLM inspection
4. Generate searchable text from inspection results
5. Generate image + text embeddings via Jina AI
6. Insert vectors into Milvus for search indexing
7. Update Firestore with processing status

**Key observation:** This service is fully implemented and tested, but has **no upstream producer** sending it queue messages or creating the expected ZIP format.

---

### scry-cdn-service

**What it does today:**
- Serves files from Storybook ZIPs stored in R2
- Uses partial ZIP extraction (range requests) for efficient serving
- Caches central directory metadata in KV (24hr TTL)
- Handles coverage-report.json as a special case

**Relevance to this feature:**
- If screenshots are stored as a separate ZIP in R2, the CDN could potentially serve them
- Currently only reads from `{project}/{version}/storybook.zip` path pattern
- No special handling for screenshot or metadata files

---

### scry-sbcov (Coverage Tool)

**What it does today:**
- Analyzes Storybook stories for coverage metrics
- Uses Playwright to execute stories and verify rendering
- Can capture screenshots on failure (verification screenshots)
- Generates coverage reports (JSON)

**Relevant capabilities:**
- Has a working Playwright browser session for visiting Storybook stories
- Already navigates to each story's iframe URL
- Can capture screenshots (currently only on verification failure)
- Knows story metadata: filepath, componentName, testName, storyTitle

**Key observation:** scry-sbcov is the most natural place to generate the metadata.json + screenshots ZIP, since it already visits every story with a browser session.

---

## R2 Storage Path Discrepancy

There is a mismatch between the storage patterns used by different services:

| Service | R2 Path Pattern |
|---------|----------------|
| Upload Service (writes) | `{project}/{version}/storybook.zip` |
| Build Processing (reads) | `{project}/{version}/builds/{buildNumber}/storybook.zip` |
| CDN Service (reads) | `{project}/{version}/storybook.zip` |
| CLAUDE.md (documented) | `{project}/{version}/builds/{buildNumber}/storybook.zip` |

The build-processing service's `zipKey` comes from the queue message, so it can point anywhere. But the documented convention in CLAUDE.md includes `builds/{buildNumber}/` which the upload service does not currently use.

---

## Data Flow Diagram (Current)

```
scry-node (CLI)
  ├── Captures screenshots locally (storycap) → __screenshots__/ [NOT UPLOADED]
  ├── Uploads Storybook ZIP → upload-service → R2 (storybook.zip)
  └── Optionally uploads coverage JSON → upload-service → R2 (coverage-report.json)

scry-sbcov (Coverage)
  └── Generates coverage report JSON [uploaded separately or via scry-node]

scry-build-processing-service
  └── Expects queue message + metadata ZIP in R2 [NO PRODUCER EXISTS]

scry-cdn-service
  └── Reads storybook.zip from R2 and serves files [WORKING]
```

---

## Summary of Gaps

| Gap | Description | Impact |
|-----|-------------|--------|
| **No metadata.json generation** | No service currently generates the `metadata.json` file that pairs stories to screenshot paths | Build-processing pipeline cannot run |
| **No screenshot ZIP upload** | Screenshots captured by scry-node/storycap are local-only, never uploaded | Build-processing pipeline has no input |
| **No queue integration** | Upload service doesn't publish queue messages after upload | Build-processing pipeline never triggered |
| **R2 path mismatch** | Upload service and build-processing service use different R2 path conventions | Would cause lookup failures even if queue existed |
| **Separate tools** | Screenshots (storycap/scry-node) and metadata (scry-sbcov) are generated by different tools in different browser sessions | Inefficient; story-capture unification plan addresses this |
