# scry-developer-dashboard implementation plan — New Stories display

## Goal
Consume `newStories` from the scry-sbcov report schema and display it directly in the dashboard without computing diffs.

## File-by-file plan

### 1) [`scry-developer-dashboard/types/coverage.ts`](scry-developer-dashboard/types/coverage.ts:138)
- Extend `NewCodeAnalysis`:
  - Add `newStories?: number` (optional for backward compatibility).

### 2) [`scry-developer-dashboard/lib/utils/coverage-validation.ts`](scry-developer-dashboard/lib/utils/coverage-validation.ts:187)
- Update `isNewCodeAnalysis()` type guard to accept `newStories` when present.

### 3) [`scry-developer-dashboard/lib/utils/coverage-normalize.ts`](scry-developer-dashboard/lib/utils/coverage-normalize.ts:184)
- Map `raw.newCode.newStories` into `newCodeAnalysis.newStories` during normalization.

### 4) [`scry-developer-dashboard/components/coverage/CoverageDashboard.tsx`](scry-developer-dashboard/components/coverage/CoverageDashboard.tsx:43)
- Display `newStories` directly:
  - If `newStories` is present: render numeric value.
  - If missing: render `—` instead of `0`.

### 5) [`scry-developer-dashboard/components/coverage/CoverageDashboard.test.tsx`](scry-developer-dashboard/components/coverage/CoverageDashboard.test.tsx:86)
- Add tests:
  - Renders numeric `newStories` when present.
  - Shows placeholder (`—`) when missing.

## Acceptance criteria
- Dashboard displays `newStories` from report without additional diffing logic.
- Old reports without `newStories` remain compatible.
