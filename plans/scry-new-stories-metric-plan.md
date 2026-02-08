# New Stories metric definition plan

## Goal
Define a single, precise metric for “New Stories” used across scry‑sbcov, scry‑node, and the dashboard.

## Definition
**New Stories** = story IDs present at `HEAD` **but not present at the merge‑base** of the PR base ref.

### Why merge‑base
- Handles PRs correctly (parent of PR), not “previous build”.
- Stable across rebases and branch updates.

## File-by-file plan

### 1) [`scry-sbcov/src/types/index.ts`](scry-sbcov/src/types/index.ts:177)
- Document the definition in the `NewCodeAnalysis` docstring.

### 2) [`scry-sbcov/src/analyzers/git-analyzer.ts`](scry-sbcov/src/analyzers/git-analyzer.ts:13)
- Confirm merge‑base logic is used and referenced in docs (already uses `git merge-base`).

### 3) [`scry-node/lib/coverage.js`](scry-node/lib/coverage.js:29)
- Ensure `--base` is fed with PR base SHA.

### 4) [`scry-developer-dashboard/types/coverage.ts`](scry-developer-dashboard/types/coverage.ts:138)
- Document that `newStories` reflects merge‑base comparison.

## Acceptance criteria
- Same definition used in all services and docs.
- No conflicting interpretations (e.g., “new story files only”).
