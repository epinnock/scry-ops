# Unified Story Capture Service – Implementation Overview

This document outlines the implementation of a unified `captureStory()` primitive that enables single-browser-session capture of multiple outputs (verification, screenshots, Figma layers, DOM snapshots).

---

## Problem Statement

Currently, three separate browser automation approaches exist:

| Tool | Package | Browser | Purpose |
|------|---------|---------|---------|
| story-executor.ts | scry-sbcov | Playwright | Verification only |
| storycap | scry-node | Puppeteer | Screenshots only |
| html-to-figma | html2fig | Puppeteer | Figma layers (unused) |

This results in multiple browser launches for related tasks and prevents efficient batch processing.

---

## Solution

Extract a reusable `captureStory()` function from scry-sbcov that:
1. Navigates to a story once
2. Captures all requested outputs in a single session
3. Supports browser session reuse for batch operations

```
BEFORE                              AFTER
───────                             ─────
scry-sbcov → [Browser 1] → Verify   scry-sbcov ─┐
scry-node  → [Browser 2] → Screenshots          ├→ [Browser] → All outputs
html2fig   → [Browser 3] → Figma    scry-node  ─┘
```

---

## Services in Scope

| Service | Role | Changes |
|---------|------|---------|
| scry-sbcov | Primary | New capture API, refactor story-executor |
| scry-node | Consumer | Replace storycap with captureStory |
| html2fig | Source | Bundle browser code into scry-sbcov |

---

## API Surface

```typescript
// Standalone capture (creates/destroys browser)
const result = await captureStory(storybookUrl, storyId, {
  verify: true,
  screenshot: 'always',
  figmaLayers: true,         // or { converter: 'code-to-design', apiKey: '...' }
  domSnapshot: true,
});

// Batch capture (reuses browser session)
const session = await createBrowserSession();
const results = await session.captureMany(url, storyIds, options);
await session.close();
```

---

## Figma Converter Options

Two converters are supported:

| Feature | html-to-figma | code.to.design |
|---------|---------------|----------------|
| Type | Local (bundled) | Cloud API |
| Cost | Free | Paid (API key) |
| Fidelity | Good | Higher |
| Offline | Yes | No |
| Speed | Fast | Slower (network) |

**Default**: `html-to-figma` (local, no dependencies)

**Usage**:
```typescript
// Local converter (default)
captureStory(url, id, { figmaLayers: true });

// Cloud converter (higher fidelity)
captureStory(url, id, {
  figmaLayers: { converter: 'code-to-design', apiKey: '...' }
});
```

---

## Implementation Plans (Per Service)

- [scry-sbcov implementation](story-capture-scry-sbcov-plan.md) – Core capture service
- [scry-node migration](story-capture-scry-node-plan.md) – Replace storycap
- [Figma converters](story-capture-figma-converters-plan.md) – html-to-figma + code.to.design

---

## Acceptance Criteria

1. `captureStory()` returns all requested outputs in a single browser session
2. `executeStories()` continues to work identically (backward compatible)
3. scry-node can capture screenshots without storycap dependency
4. Figma layer extraction works with either converter
5. Batch operations reuse browser session efficiently

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking executeStories() | Comprehensive backward compatibility tests |
| html-to-figma bundle size | Tree-shake, minify (~50KB gzipped) |
| code.to.design API changes | Version-pin SDK, graceful fallback |
| Browser memory in batch | Configurable concurrency, page isolation |
