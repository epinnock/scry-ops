# 03 – scry-sbcov Plan (v2)

This plan describes the implementation work for `scry-sbcov` to support GitHub issue creation from coverage failures.

**Note:** We are implementing v2 directly (GitHub App + fingerprints), skipping v1.

---

## Overview

`scry-sbcov` is responsible for:
1. **Generating stable story fingerprints** for cross-build correlation
2. **Capturing failure artifacts** (screenshots, console logs) for auto-attachment to issues

---

## Story Fingerprint Design

### Problem

The existing `storyId` (e.g., `"button--primary"`) is derived from Storybook's internal ID generation and may not be stable across:
- Story file renames
- Component renames
- Storybook version upgrades

### Solution: Stable Fingerprint

Generate a fingerprint from inputs that are unlikely to change:

```typescript
// src/utils/fingerprint.ts

import { createHash } from 'crypto';

export interface FingerprintInputs {
  /** Relative path to story file from project root */
  storyFilePath: string;
  /** Story export name (e.g., "Primary", "Loading") */
  storyExportName: string;
  /** Component name (optional, for disambiguation) */
  componentName?: string;
}

/**
 * Generate a stable fingerprint for a story.
 * 
 * The fingerprint is a SHA-256 hash (truncated to 16 chars) of:
 *   storyFilePath + "::" + storyExportName
 */
export function generateStoryFingerprint(inputs: FingerprintInputs): string {
  const { storyFilePath, storyExportName, componentName } = inputs;
  
  // Normalize path separators
  const normalizedPath = storyFilePath.replace(/\\/g, '/');
  
  // Build canonical string
  const canonical = componentName
    ? `${normalizedPath}::${componentName}::${storyExportName}`
    : `${normalizedPath}::${storyExportName}`;
  
  // Hash and truncate
  const hash = createHash('sha256').update(canonical).digest('hex');
  return hash.substring(0, 16);
}
```

### Fingerprint Properties

| Property | Value |
|----------|-------|
| Length | 16 hex characters |
| Collision probability | ~1 in 18 quintillion |
| Stability | Stable unless file path or export name changes |

---

## Implementation Checklist

### Phase 1: Fingerprint Generation

- [ ] Create `src/utils/fingerprint.ts` with `generateStoryFingerprint()` function
- [ ] Add unit tests for fingerprint generation
- [ ] Test edge cases (path separators, unicode, special characters)

### Phase 2: Type Changes

- [ ] Add `fingerprint` field to `StoryExecutionResult` in `src/types/index.ts`
- [ ] Add `fingerprint` field to `StoryFailure` in `src/types/index.ts`

```typescript
export interface StoryExecutionResult {
  storyId: string;
  fingerprint: string;  // NEW
  // ... existing fields
}

export interface StoryFailure {
  storyId: string;
  fingerprint: string;  // NEW
  // ... existing fields
}
```

### Phase 3: Story Executor Integration

- [ ] Modify `src/core/story-executor.ts` to generate fingerprints during execution
- [ ] Pass fingerprint inputs from story metadata

### Phase 4: Report Output

- [ ] Ensure fingerprints are included in the coverage report JSON output
- [ ] Verify fingerprints appear in `execution.stories[]` and `execution.failures[]`

### Phase 5: Artifact Capture (Optional)

The `Artifact` type already exists:

```typescript
export interface Artifact {
  kind: 'screenshot' | 'console-log' | 'dom-snapshot';
  url: string;
  contentType?: string;
}
```

- [ ] Capture screenshot on story failure
- [ ] Capture console logs during story execution
- [ ] Upload artifacts and populate `artifacts` array in `StoryFailure`

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/utils/fingerprint.ts` | **New** |
| `src/utils/__tests__/fingerprint.test.ts` | **New** |
| `src/types/index.ts` | **Modify** – Add `fingerprint` field |
| `src/core/story-executor.ts` | **Modify** – Generate fingerprints |

---

## Acceptance Criteria

1. ✅ Every story in the coverage report has a `fingerprint` field
2. ✅ Fingerprints are stable across builds
3. ✅ Fingerprints are unique per story
4. ✅ Path separators are normalized
5. ✅ Unit tests pass
