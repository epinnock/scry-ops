# Screenshot Metadata ZIP — Discovery Plan

**Issue:** #27
**Date:** 2026-02-23
**Status:** Discovery complete, pending decision

---

## Summary

The `scry-build-processing-service` expects a ZIP containing `metadata.json` + story screenshots to power the search indexing pipeline (OpenAI Vision inspection → Jina embeddings → Milvus vectors). However, **no service currently generates or uploads this ZIP**.

The Storybook build ZIP uploaded by `scry-node` is a compiled static site (HTML/JS/CSS) — a fundamentally different artifact from what build-processing needs.

---

## Documents

| File | Description |
|------|-------------|
| [00-current-state.md](./00-current-state.md) | Detailed analysis of how each service currently handles ZIPs, metadata, and screenshots |
| [01-gap-analysis.md](./01-gap-analysis.md) | Five specific gaps identified between current state and required pipeline |
| [02-options.md](./02-options.md) | Five implementation options with pros/cons, complexity, and comparison matrix |
| [03-architecture-diagrams.md](./03-architecture-diagrams.md) | Mermaid diagrams: current state, proposed flows, R2 layout, sequence diagrams, decision tree |

---

## Key Findings

1. **Two different ZIPs needed**: The Storybook build ZIP (for CDN) and the metadata-screenshots ZIP (for search indexing) are separate artifacts
2. **Queue integration missing**: Upload service has no code to publish queue messages to trigger build-processing
3. **R2 path mismatch**: Upload service uses `{project}/{version}/storybook.zip`; documentation says `{project}/{version}/builds/{buildNumber}/storybook.zip`
4. **scry-sbcov has the richest metadata**: It's the only tool that knows filepath, componentName, location from AST parsing
5. **Existing story-capture unification plan**: The `plans/story-capture-feature/` documents already plan to merge storycap + scry-sbcov into a unified `captureStory()` primitive

---

## Recommended Path

| Phase | Approach | Description |
|-------|----------|-------------|
| **Short-term** | Option B | scry-node generates basic metadata from `index.json` + existing storycap screenshots |
| **Medium-term** | Option A | scry-sbcov generates full metadata + screenshots via unified capture service |
| **Long-term** | Option C | Publish a reusable GitHub Action wrapping the scry-sbcov approach |

**Regardless of option chosen**, the upload-service needs:
- Queue producer binding and publish code
- Metadata ZIP upload endpoint (or extension of existing upload)
- R2 path convention decision

---

## Next Steps

1. Decide which generation option to pursue first (A, B, C, or E)
2. Implement queue integration in upload-service
3. Align R2 path conventions across services
4. Implement chosen generation approach
5. End-to-end test the full pipeline
