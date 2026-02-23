# Screenshot Metadata ZIP — Options Analysis

This document presents the possible approaches for generating and delivering the metadata-screenshots ZIP to the build-processing pipeline.

---

## Option A: Generate in scry-sbcov, Upload via scry-node

### Description
Extend scry-sbcov to produce a `metadata-screenshots.zip` as part of its analysis run. scry-node would invoke scry-sbcov during `scry deploy` and upload the resulting ZIP alongside the Storybook build.

### How it works
1. **scry-sbcov** adds a `--capture-screenshots` flag (or `--output-zip`)
2. During story execution, captures a screenshot of each story
3. Generates `metadata.json` with full story metadata (filepath, componentName, testName, storyTitle, screenshotPath, location)
4. Bundles into `metadata-screenshots.zip`
5. **scry-node** runs scry-sbcov as part of `scry deploy`
6. Uploads the ZIP to upload-service (new endpoint or presigned URL)
7. Upload-service stores in R2 and publishes queue message

### Changes required
| Service | Changes |
|---------|---------|
| scry-sbcov | Add screenshot capture during execution, ZIP bundling, new CLI flag |
| scry-node | Add scry-sbcov invocation during deploy, upload metadata ZIP |
| upload-service | New endpoint or field for metadata ZIP, queue publisher |
| build-processing | None — already handles this format |
| cdn-service | None |

### Pros
- scry-sbcov already has all the metadata (filepath, componentName, location, etc.)
- scry-sbcov already uses Playwright and visits every story
- Single browser session for verification + screenshots (efficient)
- Aligns with the planned "unified story capture" feature
- metadata.json has the richest data possible

### Cons
- Requires Playwright/browser at deploy time (CI needs browser installed)
- Adds time to deploy (screenshot capture for all stories)
- scry-sbcov is a dev dependency, adds weight to deploy step
- Couples deploy to coverage analysis tool

### Complexity: Medium

---

## Option B: Generate in scry-node Using Storybook index.json

### Description
scry-node captures screenshots (current storycap behavior) and generates a metadata.json from Storybook's built-in `index.json`, without needing scry-sbcov.

### How it works
1. **scry-node** fetches `{storybookUrl}/index.json` (or `stories.json`)
2. Extracts story metadata: id, title, name, importPath
3. Captures screenshots for each story (already does this via storycap)
4. Generates `metadata.json` mapping story IDs to screenshot paths
5. Bundles into `metadata-screenshots.zip`
6. Uploads alongside the Storybook build

### metadata.json (limited fields)
```json
[
  {
    "filepath": "",
    "componentName": "Button",
    "testName": "Primary",
    "storyTitle": "Example/Button",
    "screenshotPath": "images/example-button--primary.png"
  }
]
```

### Changes required
| Service | Changes |
|---------|---------|
| scry-node | Generate metadata.json from index.json, bundle ZIP, upload |
| upload-service | New endpoint or field for metadata ZIP, queue publisher |
| build-processing | None |
| cdn-service | None |
| scry-sbcov | None |

### Pros
- Self-contained in scry-node (no scry-sbcov dependency)
- Already captures screenshots via storycap
- Simpler deployment dependency chain
- Storybook's index.json is always available for built Storybooks

### Cons
- Missing key metadata: `filepath`, `location` (not in index.json)
- `componentName` must be inferred from title (less accurate)
- Relies on storycap (planned for replacement per story-capture plan)
- Two browser processes if also running scry-sbcov for coverage

### Complexity: Low

---

## Option C: Dedicated GitHub Actions Step

### Description
Add a GitHub Actions step (or reusable workflow) that runs after the Storybook build, captures screenshots, generates metadata, bundles the ZIP, and uploads it — independent of scry-node.

### How it works
1. **GitHub Action** (new or reusable workflow) runs after Storybook build
2. Starts a local Storybook server from the build output
3. Uses Playwright/Puppeteer to capture screenshots of each story
4. Generates metadata.json using Storybook's index.json + optional scry-sbcov data
5. Bundles into metadata-screenshots.zip
6. Uploads to upload-service via API call (or presigned URL direct to R2)
7. Upload-service publishes queue message

### GitHub Actions workflow snippet
```yaml
- name: Build Storybook
  run: npm run build-storybook

- name: Deploy Storybook
  run: npx scry deploy --storybook-dir ./storybook-static

- name: Generate Search Metadata
  uses: scrymore/screenshot-metadata-action@v1
  with:
    storybook-dir: ./storybook-static
    output: ./metadata-screenshots.zip
    upload-url: ${{ secrets.SCRY_UPLOAD_URL }}
    api-key: ${{ secrets.SCRY_API_KEY }}
```

### Changes required
| Service | Changes |
|---------|---------|
| scry-ops | New GitHub Action or reusable workflow |
| upload-service | Accept metadata ZIP upload, queue publisher |
| build-processing | None |
| scry-node | None (or minimal — pass through build info) |
| scry-sbcov | Optional — could be invoked for richer metadata |

### Pros
- Decoupled from CLI tool — works with any CI system
- Can run in parallel with deploy (non-blocking)
- Reusable across different client setups
- Can use scry-sbcov for rich metadata or index.json for basic metadata
- Screenshots generated in CI have consistent environment (no local machine variance)

### Cons
- Additional CI step adds build time
- Requires browser installation in CI (Playwright setup action)
- New infrastructure to maintain (GitHub Action)
- Users must update their CI config
- More moving parts than integrated approach

### Complexity: Medium-High

---

## Option D: Server-Side Screenshot Generation (Build-Processing Service)

### Description
Instead of generating screenshots client-side, modify the build-processing service to open the deployed Storybook, capture screenshots itself, and then process them.

### How it works
1. Upload service receives Storybook ZIP and deploys it (already happens via CDN)
2. Queue message is sent with the Storybook URL (not a screenshots ZIP)
3. Build-processing service:
   a. Fetches story list from deployed Storybook's index.json
   b. Uses a headless browser service to capture screenshots
   c. Generates metadata.json
   d. Processes screenshots through the existing pipeline (LLM, embeddings, vectors)

### Changes required
| Service | Changes |
|---------|---------|
| build-processing | Major rewrite — add browser/screenshot generation, change from ZIP input to URL input |
| upload-service | Queue publisher (simpler message — just Storybook URL) |
| scry-node | None |
| scry-sbcov | None |

### Pros
- Zero changes to client-side tools (scry-node, GitHub Actions)
- Centralized — all processing in one place
- Guaranteed consistency (same browser for all users)
- Simplest client integration

### Cons
- **Cloudflare Workers cannot run headless browsers** — would need a separate browser service (e.g., Browserless, Puppeteer on a VM, or Cloudflare Browser Rendering)
- Significant architectural change to build-processing service
- Higher operational cost (browser infrastructure)
- Higher latency (must wait for Storybook to be available via CDN)
- Missing metadata that only source analysis can provide (filepath, location)
- Single point of failure for screenshot generation

### Complexity: High

---

## Option E: Hybrid — scry-sbcov Generates ZIP, Uploaded Independently

### Description
scry-sbcov generates the metadata-screenshots.zip as a standalone command, and the ZIP is uploaded separately from the Storybook deploy — either by the user, by scry-node, or by CI.

### How it works
1. User runs `npx scry-sbcov analyze --screenshots --output-zip ./metadata-screenshots.zip`
2. scry-sbcov captures screenshots + generates full metadata
3. User/CI uploads the ZIP:
   - Via scry-node: `npx scry upload-metadata ./metadata-screenshots.zip`
   - Via direct API: `curl -X POST upload-service/upload-metadata`
   - Via presigned URL

### Changes required
| Service | Changes |
|---------|---------|
| scry-sbcov | Screenshot capture + ZIP bundling (same as Option A) |
| scry-node | Optional: `upload-metadata` command |
| upload-service | Metadata ZIP endpoint, queue publisher |
| build-processing | None |

### Pros
- Decoupled: generate and upload are separate steps
- Works with or without scry-node
- Full metadata from scry-sbcov
- User controls when screenshots are generated vs. deployed

### Cons
- Two-step process (generate then upload) vs. integrated deploy
- User must manage the ZIP file
- Risk of stale screenshots if not regenerated before deploy
- More complex user workflow

### Complexity: Medium

---

## Comparison Matrix

| Criteria | A: sbcov+node | B: node only | C: GH Actions | D: Server-side | E: Hybrid |
|----------|:---:|:---:|:---:|:---:|:---:|
| Metadata richness | Full | Partial | Configurable | Partial | Full |
| Client complexity | Medium | Low | Medium | None | Medium |
| Server changes | Small | Small | Small | Large | Small |
| Browser dependency at deploy | Yes | Yes (existing) | Yes (CI) | No | Yes (separate) |
| Aligns with story-capture plan | Yes | No | Partially | No | Yes |
| Works without scry-sbcov | No | Yes | Yes/No | Yes | No |
| CI integration effort | Low | Low | Medium | None | Medium |
| Operational cost | Low | Low | Low | High | Low |

---

## Recommendation

### Short-term: Option B (scry-node with index.json)
- Fastest to implement
- Leverages existing storycap screenshot capture
- Gets the pipeline working with basic metadata
- No new tool dependencies

### Medium-term: Option A (scry-sbcov + scry-node)
- Aligns with the planned "unified story capture" service
- Provides full metadata (filepath, location, componentName)
- Single browser session for screenshots + verification
- Replaces storycap dependency (already planned)

### Long-term: Option C (GitHub Actions) as an additional distribution channel
- Publish a reusable GitHub Action that wraps Option A
- Provides a standard CI integration path
- Can run in parallel with deploy for non-blocking indexing

### Not recommended: Option D (server-side)
- Cloudflare Workers' browser limitations make this impractical without significant infrastructure changes
- Higher operational cost and complexity
- Loses source-level metadata

---

## Decision Points

Before implementing, these decisions need to be made:

1. **Which option to start with?** (Recommend: B for quick win, then A)
2. **Should metadata ZIP upload be part of `POST /upload` or a separate endpoint?**
3. **Should queue integration be implemented in upload-service or as a separate trigger?**
4. **What R2 path convention to use for the metadata ZIP?**
5. **Should screenshot generation be opt-in or default during deploy?**
