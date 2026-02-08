# scry-sbcov implementation plan — New Stories metric

## Goal
Add first-class `newStories` (and optional `newStoryFiles` / `newStoryIds`) to the scry-sbcov report, computed against the git merge-base of the PR base ref.

## File-by-file plan

### 1) [`scry-sbcov/src/types/index.ts`](scry-sbcov/src/types/index.ts:177)
- Extend `NewCodeAnalysis`:
  - Add `newStories: number` (required when `enabled = true`).
  - Optional: `newStoryFiles?: number`.
  - Optional: `newStoryIds?: string[]` for debug visibility (can be feature-flagged).
- Keep schema version at `1.0.0` (non-breaking extension).

### 2) Add new helper: [`scry-sbcov/src/analyzers/story-diff.ts`](scry-sbcov/src/analyzers/story-diff.ts:1)
- Responsibilities:
  - Read baseline versions of story files using `git show <baseCommitSha>:<relativePath>`.
  - Parse baseline content using the existing story parser logic (extract meta + stories).
  - Return `Set<string>` of baseline story IDs and a count of new story files.
- Inputs:
  - `projectPath`, `baseCommitSha`, `storyFiles` (HEAD), `gitAnalysis`.
- Outputs:
  - `{ baselineStoryIds: Set<string>, newStoryFileCount: number }`.

### 3) [`scry-sbcov/src/parsers/story-parser.ts`](scry-sbcov/src/parsers/story-parser.ts:30)
- Expose a reusable function to parse story **code string** (not just file path), e.g.:
  - `parseStoryCode(code: string, filePath: string, projectPath: string)`.
- This avoids duplicating parsing logic when reading baseline file content via `git show`.

### 4) [`scry-sbcov/src/core/report-generator.ts`](scry-sbcov/src/core/report-generator.ts:34)
- Import the new helper.
- When `gitAnalysis.enabled === true`, compute:
  - `headStoryIds` from `storyFiles` (HEAD).
  - `baselineStoryIds` from `story-diff` helper.
  - `newStories = count(headStoryIds - baselineStoryIds)`.
- Insert into `buildNewCodeAnalysis()` output:
  - `newStories` (+ optional fields).

### 5) Tests (new)
- Add a fixture repo or mocked git output in `scry-sbcov/tests`.
- Test cases:
  1. **New story in existing file** → `newStories = 1`.
  2. **New story file added** → `newStories` increments; `newStoryFiles` increments.
  3. **No change** → `newStories = 0`.
- Ensure tests run without requiring real git history (mock `simple-git` + `git show`).

## Acceptance criteria
- Report includes `newCode.newStories` when `newCode.enabled === true`.
- Values are stable for PRs and consistent with merge-base.
- No regression in existing metrics.
