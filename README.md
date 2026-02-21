# scry-ops

Orchestrator repo for the Scry platform. This repo doesn't contain application code — it coordinates work across all Scry service repos using GitHub Issues, Labels, and an AI-powered GitHub Actions workflow.

## How It Works

1. **Create an issue** in this repo with the `codex` label (default) or `claude` label, plus one or more service labels (e.g., `upload-service`, `cdn-service`)
2. The **GitHub Actions workflow** triggers, checks out the labeled service repos into `services/`, and runs the selected AI agent with access to all of them
3. The agent reads the issue, makes changes across the checked-out services, and reports what it did
4. A **push-back step** commits changes to branches in each service repo and opens PRs
5. If multiple services were modified, each PR cross-references its siblings and the orchestrator issue gets a summary comment

```
┌──────────────────────────────────────────────────────────┐
│  scry-ops issue (labels: codex, cdn-service, upload-service)   │
└──────────────┬───────────────────────────────────────────┘
               │ triggers
               ▼
┌──────────────────────────────────────────────────────────┐
│  GitHub Actions Workflow                                 │
│                                                          │
│  1. Auto-add dependency labels (repo-map.yml)            │
│  2. Checkout labeled repos → services/                   │
│  3. Run selected agent (Codex default, Claude opt-in)    │
│  4. Push changes → create PRs (with cross-references)    │
│  5. Comment on issue with all PR links                   │
└──────────────┬───────────────────────────────────────────┘
               │ creates
               ▼
┌─────────────────────┐  ┌─────────────────────┐
│ PR in upload-service │  │ PR in cdn-service    │
│ (refs sibling PR)    │  │ (refs sibling PR)    │
└─────────────────────┘  └─────────────────────┘
```

## Repo Structure

```
scry-ops/
├── .github/
│   ├── workflows/
│   │   └── claude-agent.yml    # Main orchestrator workflow (Codex + Claude)
│   │   └── sync-service-metadata.yml # Auto-sync labels + project service options
│   └── ISSUE_TEMPLATE/
│       └── cross-service-feature.yml
├── plans/                      # Implementation plans and specs
├── backlog.csv                 # Project backlog tracker
├── CLAUDE.md                   # Runtime instructions for agent execution
├── repo-map.yml                # Service registry and dependency graph
└── README.md
```

## Service Labels

Each label maps to a service repo. Adding a label to an issue tells the workflow to check out that repo.

| Label | Repository | Description |
|-------|-----------|-------------|
| `scry-ops` | epinnock/scry-ops | Orchestrator workflows, plans, and scripts |
| `upload-service` | epinnock/scry-storybook-upload-service | Backend API for Storybook uploads |
| `build-processing` | epinnock/scry-build-processing-service | Async build processing pipeline (LOR, embeddings, vector DB) |
| `cdn-service` | epinnock/scry-cdn-service | CDN for serving deployed Storybooks |
| `dashboard` | epinnock/scry-developer-dashboard | Web dashboard for project management |
| `scry-node` | epinnock/scry-node | CLI tool for deploying Storybooks |
| `sbcov` | epinnock/scry-sbcov | Storybook coverage analysis tool |
| `search-api` | epinnock/scry-nextjs | Multimodal search API |
| `landing-page` | epinnock/scry-landing-page | Marketing landing page |
| `scry-link` | epinnock/scry-link | Figma plugin |

## Agent Labels

- `codex` — Runs Codex (default model: Codex 5.3)
- `claude` — Runs Claude Code
- If both are present, `claude` takes precedence
- `@codex` / `@claude` in an issue comment can also select the agent

## Dependency Auto-Labeling

When you label an issue with a downstream service, the workflow automatically adds its upstream service dependencies from `repo-map.yml` (`depends_on`). This ensures the selected agent always has the context of shared contracts.

- `scry-node` → auto-adds `upload-service`
- `build-processing` → auto-adds `upload-service`
- `cdn-service` → auto-adds `upload-service`
- `dashboard` → auto-adds `upload-service`

These dependencies come from `repo-map.yml` and are resolved dynamically by `scripts/list-service-dependencies.sh`.

## Cross-Service Features

For changes that span multiple services, use the **Cross-Service Feature** issue template. It provides structured fields for:

- Which services are affected
- Shared interface changes (API contracts, Firestore schemas, R2 paths)
- Expected per-service changes

The agent follows a specific workflow for multi-service edits (defined in `CLAUDE.md`):
1. Survey all checked-out services before editing
2. Identify shared interfaces first
3. Modify upstream services before downstream consumers
4. Verify contract compatibility across services
5. Test each service independently

When multiple services are modified, the push-back step creates PRs with a **Related PRs** section so reviewers can see the full scope of the change.

## Creating an Issue

### Single-service change
1. Create an issue with labels `codex` (default) or `claude`, plus the service label (e.g., `landing-page`)
2. Describe what needs to change
3. The workflow checks out that repo, runs the selected agent, and creates a PR

### Cross-service change
1. Use the "Cross-Service Feature" issue template
2. Check the affected services and describe shared interface changes
3. Dependency labels are auto-added
4. The selected agent gets all relevant repos, makes coordinated changes, and PRs are created with cross-references

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `CROSS_REPO_PAT` | GitHub PAT with repo access to all service repos |
| `OPENAI_API_KEY` | API key for the Codex GitHub Action |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for the Claude Code GitHub Action |

## Plans and Backlog

- `plans/` — Implementation plans, specs, and risk assessments for past and upcoming features
- `backlog.csv` — Project task tracker with status, dates, and notes

## Adding A Service

To onboard a new service in the same way as existing ones:

1. Add the service to `repo-map.yml` with `repo`, `label`, and `description`.
2. Push the change to this repo.
3. `sync-service-metadata.yml` runs automatically and:
   - creates the repo label in `epinnock/scry-ops` if missing
   - adds the label as an option in the GitHub Project `Service` field if missing
4. New issues can use that label and `claude-agent.yml` will dynamically check out that repo.

You can also run the sync manually with:
- `bash scripts/sync-service-metadata.sh`
- `bash scripts/sync-service-metadata.sh --service <label>`

## Automation Workflows and Scripts

### Service Metadata Sync Workflow

**File**: `.github/workflows/sync-service-metadata.yml`

Automatically syncs service labels and GitHub Project field options from `repo-map.yml` to ensure consistency between the repo map and GitHub's UI.

**Triggers**:
- Automatically on push when `repo-map.yml` or sync scripts are modified
- Manually via `workflow_dispatch` in the Actions tab

**What it does**:
1. Reads service definitions from `repo-map.yml`
2. Creates missing labels in the `epinnock/scry-ops` repository
3. Adds missing service options to the GitHub Project "Service" field

**Required secrets**: `CROSS_REPO_PAT` (GitHub PAT with repo and project access)

### Service Metadata Sync Script

**File**: `scripts/sync-service-metadata.sh`

The underlying script that powers the sync workflow. Can be run locally or in CI.

**Usage**:
```bash
# Sync all services
bash scripts/sync-service-metadata.sh

# Sync a specific service only
bash scripts/sync-service-metadata.sh --service upload-service

# Sync labels only (skip project field)
bash scripts/sync-service-metadata.sh --labels-only

# Sync project field only (skip labels)
bash scripts/sync-service-metadata.sh --project-only

# Dry run (preview changes without applying)
bash scripts/sync-service-metadata.sh --dry-run
```

**Authentication**: Uses `GH_TOKEN`, `CROSS_REPO_PAT`, or `GITHUB_TOKEN` environment variables, or falls back to `gh` CLI auth session.

**Environment variables**:
- `OPS_REPO` — target repo for labels (default: `epinnock/scry-ops`)
- `PROJECT_OWNER` — GitHub user/org owning the project (default: `epinnock`)
- `PROJECT_NUMBER` — project number (default: `1`)
- `LABEL_COLOR` — hex color for new labels (default: `0E8A16`)

### List Services Script

**File**: `scripts/list-services.sh`

Parses `repo-map.yml` and outputs service metadata in tab-separated format.

**Usage**:
```bash
# List all services
bash scripts/list-services.sh

# Use a custom repo-map file
bash scripts/list-services.sh /path/to/repo-map.yml
```

**Output format**: `service_key <TAB> repo <TAB> label <TAB> description`

**Example**:
```
scry-ops    epinnock/scry-ops    scry-ops    Orchestrator workflows, plans, and automation scripts
upload-service    epinnock/scry-storybook-upload-service    upload-service    Backend API for Storybook uploads
```

This script is used by other automation scripts to parse the service registry.

### List Service Dependencies Script

**File**: `scripts/list-service-dependencies.sh`

Parses `repo-map.yml` and outputs service dependencies based on the `depends_on` field.

**Usage**:
```bash
# List all service dependencies
bash scripts/list-service-dependencies.sh

# Use a custom repo-map file
bash scripts/list-service-dependencies.sh /path/to/repo-map.yml
```

**Output format**: `service_label <TAB> dependency_label`

**Example**:
```
cdn-service    upload-service
dashboard    upload-service
scry-node    upload-service
```

Dependencies can be specified as either service keys (e.g., `upload-service`) or labels. The script resolves them to labels for consistency.

This script is used by the `claude-agent.yml` workflow to automatically add dependency labels to issues.

### Local Repo Sync Script

**File**: `scripts/pull-all-repos.sh`

Clone or pull all Scry service repos locally in one command. Useful for local development across multiple services.

**Usage**:
```bash
# Default: clone/pull all repos to parent directory of scry-ops
bash scripts/pull-all-repos.sh

# Dry run to preview actions
bash scripts/pull-all-repos.sh --dry-run

# Use a custom workspace directory
bash scripts/pull-all-repos.sh --base-dir /path/to/workspace

# Pull/clone a specific branch in all repos
bash scripts/pull-all-repos.sh --branch feature-branch

# Allow pulling repos with uncommitted changes
bash scripts/pull-all-repos.sh --allow-dirty
```

**Options**:
- `--base-dir <path>` — directory where repos are cloned (default: parent of scry-ops)
- `--branch <name>` — checkout/pull a specific branch in existing repos
- `--skip-dirty` — skip repos with uncommitted changes (default)
- `--allow-dirty` — attempt pull even with local changes
- `--dry-run` — preview actions without making changes

**Behavior**:
- Clones missing repos
- Pulls existing repos (fast-forward only)
- Skips dirty repos by default to avoid conflicts
- Prints a summary: pulled, cloned, skipped_dirty, failed

**Example output**:
```
[pull-all-repos] Summary: pulled=8, cloned=1, skipped_dirty=0, failed=0
```
