# Backlog Items 58/59 Implementation Plan

## Scope

Backlog item 58 (`scry-ops/backlog.csv:58`):
- `add scry-ops to the list of repos we can edit`

Backlog item 59 (`scry-ops/backlog.csv:59`):
- `add a scripts to pull all the repos locally`

Goal:
- Let the AI workflow safely edit and PR `scry-ops` itself when a `scry-ops` label is applied.
- Add a local bootstrap/sync script that pulls (or clones) all Scry repos in one command.

## Implementation Order

1. Implement item 58 first.
2. Implement item 59 second.

Reason:
- Item 58 defines/normalizes the canonical repo list and label behavior.
- Item 59 can reuse that canonical mapping to avoid duplicate repo lists.

## Item 58 Plan: Add `scry-ops` as Editable Repo

### 1) Extend label + repo mapping

Files:
- `scry-ops/repo-map.yml`
- `scry-ops/README.md`
- `scry-ops/CLAUDE.md`
- `scry-ops/.github/ISSUE_TEMPLATE/cross-service-feature.yml`

Changes:
- Add a `scry-ops` service entry in `repo-map.yml` with repo `epinnock/scry-ops`.
- Add `scry-ops` to documented service label lists in README/template/instructions.
- Keep wording explicit that `scry-ops` is orchestration/infrastructure code (workflows, plans, scripts).

Acceptance:
- A new issue can be labeled `scry-ops` from templates/docs without ambiguity.

### 2) Update workflow triggers and project sync mapping

Files:
- `scry-ops/.github/workflows/claude-agent.yml`
- `scry-ops/.github/workflows/project-sync.yml`

Changes:
- Include `scry-ops` in the workflow `if` label gate.
- Include `scry-ops` in `project-sync` service label mapping loop.

Acceptance:
- `scry-ops` labeled issues trigger agent execution.
- Project “Service” field can be set to `scry-ops` (assuming project field option exists).

### 3) Add safe push/PR support for edits in the orchestrator repo

Primary file:
- `scry-ops/.github/workflows/claude-agent.yml`

Changes:
- Add a pre-pass that detects workspace-root changes intended for `scry-ops`.
- Exclude `services/` from root diff/commit logic to avoid accidental nested repo capture.
- Reuse existing branch naming convention: `codex|claude/scry-ops-issue-<N>`.
- Push a PR to `epinnock/scry-ops` when root changes are present.
- Merge this PR into existing sibling PR summary/comment logic so cross-repo issue comments stay consistent.

Guardrails:
- Do not create a PR if only `services/` changed.
- Do not fail entire workflow when there are no `scry-ops` changes.

Acceptance:
- A `scry-ops` issue that modifies workflow/docs/scripts creates an automated PR in `epinnock/scry-ops`.
- Existing multi-repo PR behavior remains unchanged for service repos.

### 4) Manual one-time project board update

Manual task outside git:
- Add `scry-ops` option to the GitHub Project “Service” single-select field.

Acceptance:
- `project-sync.yml` can set Service=`scry-ops` without “option not found”.

## Item 59 Plan: Add Script to Pull All Repos Locally

### 1) Create sync script

Primary file:
- `scry-ops/scripts/pull-all-repos.sh` (new)

Script behavior:
- Read repo definitions from `scry-ops/repo-map.yml`.
- Include `epinnock/scry-ops` explicitly if not part of parsed service entries.
- For each repo:
  - If local dir exists and clean: `git pull --ff-only`.
  - If local dir has uncommitted changes: skip with warning (default behavior).
  - If missing locally: clone into target base directory.

CLI options (minimum set):
- `--base-dir <path>` (default: parent of current `scry-ops` dir)
- `--branch <name>` (optional override for clone/pull checkout)
- `--skip-dirty` (default true behavior, explicit flag for clarity)
- `--dry-run`

Output:
- Per-repo status line: `pulled`, `cloned`, `skipped-dirty`, `failed`.
- Final summary counts by status.

### 2) Document usage

Files:
- `scry-ops/README.md`
- Optional: `scry-ops/scripts/README.md` (if script docs become too long)

Docs content:
- Prereqs: `git`, auth for private repos.
- Example usage:
  - `bash scripts/pull-all-repos.sh`
  - `bash scripts/pull-all-repos.sh --base-dir /path/to/workspace --dry-run`
- Expected directory layout after clone/pull.

### 3) Verification

Local verification checklist:
- Run `bash scry-ops/scripts/pull-all-repos.sh --dry-run`.
- Run on workspace with at least one dirty repo to validate skip logic.
- Run on workspace with one missing repo to validate clone path.
- Re-run after clone to validate idempotent pull behavior.

## Risks and Mitigations

Risk:
- Root repo push step accidentally includes `services/` paths.
Mitigation:
- Explicit path filtering in root diff/add operations.

Risk:
- Project sync cannot set Service field for `scry-ops`.
Mitigation:
- Add project field option before enabling/using new label.

Risk:
- Pull script changes local branches unexpectedly.
Mitigation:
- Default to current branch; require explicit `--branch` override.

Risk:
- Dirty repos block updates.
Mitigation:
- Default skip with clear warnings; keep behavior non-destructive.

## Deliverables

Code/config:
- Updated service-label/repo mappings for `scry-ops`.
- Workflow support for creating PRs from root `scry-ops` changes.
- New `scripts/pull-all-repos.sh`.
- README updates.

Operational:
- GitHub Project “Service” option updated to include `scry-ops`.
