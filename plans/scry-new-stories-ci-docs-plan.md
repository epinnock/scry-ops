# CI / Docs plan — New Stories accuracy

## Goal
Ensure the PR base merge‑base is available so `newStories` is accurate in CI.

## File-by-file plan

### 1) Coverage docs (choose the canonical doc)
- Update whichever doc is used for coverage setup (example):
  - [`scry-node/docs/COVERAGE.md`](scry-node/docs/COVERAGE.md:1)
- Add requirement:
  - `actions/checkout@v4` should use `fetch-depth: 0`.
  - PR builds should pass base SHA to `--base` when available.

### 2) GitHub Actions sample (if present)
- If there is a workflow or example, add:
  - `fetch-depth: 0`
  - `BASE_SHA: ${{ github.event.pull_request.base.sha }}` for PRs.

### 3) README / Integration guide (optional)
- Mention that shallow clones break merge-base and will force “new stories” to be inaccurate.

## Acceptance criteria
- CI docs explicitly require full history for merge-base.
- Example workflows show PR base SHA usage.
