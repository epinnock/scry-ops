# Screenshot Metadata ZIP — Plan

**Issue:** #27
**Date:** 2026-02-23 (discovery), 2026-02-25 (implementation plan)
**Status:** Option A selected, implementation plans written

---

## Summary

The `scry-build-processing-service` expects a ZIP containing `metadata.json` + story screenshots to power the search indexing pipeline (OpenAI Vision inspection → Jina embeddings → Milvus vectors). However, **no service currently generates or uploads this ZIP**.

**Decision:** Implement **Option A** — scry-sbcov generates the metadata+screenshots ZIP (leveraging its existing Playwright browser session and AST-based metadata), scry-node orchestrates the flow and uploads artifacts, and the upload-service stores the ZIP and enqueues processing.

---

## Documents

### Discovery (completed)

| File | Description |
|------|-------------|
| [00-current-state.md](./00-current-state.md) | Detailed analysis of how each service currently handles ZIPs, metadata, and screenshots |
| [01-gap-analysis.md](./01-gap-analysis.md) | Five specific gaps identified between current state and required pipeline |
| [02-options.md](./02-options.md) | Five implementation options with pros/cons, complexity, and comparison matrix |
| [03-architecture-diagrams.md](./03-architecture-diagrams.md) | Mermaid diagrams: current state, proposed flows, R2 layout, sequence diagrams |

### Implementation (Option A)

| File | Description |
|------|-------------|
| [04-implementation-plan.md](./04-implementation-plan.md) | Master implementation plan: architecture, design decisions, diagrams, verification |
| [05-impl-scry-sbcov.md](./05-impl-scry-sbcov.md) | scry-sbcov: screenshot capture, ZIP generation, location tracking, componentFilePath |
| [06-impl-upload-service.md](./06-impl-upload-service.md) | upload-service: queue binding, metadata endpoint, Firestore methods |
| [07-impl-scry-node.md](./07-impl-scry-node.md) | scry-node: replace storycap flow, upload metadata ZIP |

---

## Key Findings

1. **Two different ZIPs needed**: The Storybook build ZIP (for CDN) and the metadata-screenshots ZIP (for search indexing) are separate artifacts
2. **Queue integration missing**: Upload service has no code to publish queue messages to trigger build-processing
3. **scry-sbcov has the richest metadata**: It's the only tool that knows filepath, componentName, location from AST parsing
4. **scry-node already generates partial metadata**: The `--with-analysis` flag already creates metadata.json + bundles screenshots, but the format doesn't match build-processing and there's no queue trigger
5. **Build-processing is fully implemented**: 44 tests pass, pipeline works end-to-end — it just has no upstream producer

---

## Design Decisions

1. **Option A over Option B**: scry-sbcov has richer metadata (AST-based), already visits every story via Playwright, and storycap is planned for deprecation
2. **Replace storycap flow**: When `--with-analysis` is used, scry-sbcov replaces storycap + analyzeStorybook() — single browser session instead of two
3. **Only screenshot passing stories**: Broken stories are excluded from the metadata ZIP to prevent polluting the search index
4. **Require existing build**: Metadata upload fails if storybook.zip hasn't been uploaded first
5. **New metadata fields**: `location` (AST line numbers) and `componentFilePath` (resolved component file) added for richer data
6. **Queue binding optional**: Upload-service works with or without the queue configured

---

## Implementation Order

| Phase | Service | Can parallelize? |
|-------|---------|-----------------|
| 1a | scry-sbcov: screenshot capture + ZIP generation | Yes (with 1b) |
| 1b | upload-service: queue binding + metadata endpoint | Yes (with 1a) |
| 2 | scry-node: wire up scry-sbcov + upload metadata | After 1a + 1b |
| 3 | End-to-end verification | After all |

**build-processing-service requires no code changes** — verified compatible with all produced formats.
