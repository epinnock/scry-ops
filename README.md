# scry-ops

Orchestrator repo for the Scry platform. This repo doesn't contain application code — it coordinates work across all Scry service repos using GitHub Issues, Labels, and a Claude-powered GitHub Actions workflow.

## How It Works

1. **Create an issue** in this repo with the `claude` label and one or more service labels (e.g., `upload-service`, `cdn-service`)
2. The **GitHub Actions workflow** triggers, checks out the labeled service repos into `services/`, and runs Claude with access to all of them
3. Claude reads the issue, makes changes across the checked-out services, and reports what it did
4. A **push-back step** commits changes to branches in each service repo and opens PRs
5. If multiple services were modified, each PR cross-references its siblings and the orchestrator issue gets a summary comment

```
┌──────────────────────────────────────────────────────────┐
│  scry-ops issue (labels: claude, cdn-service, upload-service)  │
└──────────────┬───────────────────────────────────────────┘
               │ triggers
               ▼
┌──────────────────────────────────────────────────────────┐
│  GitHub Actions Workflow                                 │
│                                                          │
│  1. Auto-add dependency labels (repo-map.yml)            │
│  2. Checkout labeled repos → services/                   │
│  3. Run Claude with --add-dir for each service           │
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
│   │   └── claude-agent.yml    # Main orchestrator workflow
│   └── ISSUE_TEMPLATE/
│       └── cross-service-feature.yml
├── plans/                      # Implementation plans and specs
├── backlog.csv                 # Project backlog tracker
├── CLAUDE.md                   # Instructions Claude reads at runtime
├── repo-map.yml                # Service registry and dependency graph
└── README.md
```

## Service Labels

Each label maps to a service repo. Adding a label to an issue tells the workflow to check out that repo.

| Label | Repository | Description |
|-------|-----------|-------------|
| `upload-service` | epinnock/scry-storybook-upload-service | Backend API for Storybook uploads |
| `cdn-service` | epinnock/scry-remote-viewer | CDN for serving deployed Storybooks |
| `dashboard` | epinnock/scry-developer-dashboard | Web dashboard for project management |
| `scry-node` | epinnock/scry-node | CLI tool for deploying Storybooks |
| `sbcov` | epinnock/scry-sbcov | Storybook coverage analysis tool |
| `search-api` | epinnock/scry-nextjs | Multimodal search API |
| `landing-page` | epinnock/scry-landing-page | Marketing landing page |
| `scry-link` | epinnock/scry-link | Figma plugin |

## Dependency Auto-Labeling

When you label an issue with a downstream service, the workflow automatically adds its upstream dependencies. This ensures Claude always has the context of shared contracts.

- `scry-node` → auto-adds `upload-service`
- `cdn-service` → auto-adds `upload-service`
- `dashboard` → auto-adds `upload-service`

These dependencies come from `repo-map.yml`.

## Cross-Service Features

For changes that span multiple services, use the **Cross-Service Feature** issue template. It provides structured fields for:

- Which services are affected
- Shared interface changes (API contracts, Firestore schemas, R2 paths)
- Expected per-service changes

Claude follows a specific workflow for multi-service edits (defined in `CLAUDE.md`):
1. Survey all checked-out services before editing
2. Identify shared interfaces first
3. Modify upstream services before downstream consumers
4. Verify contract compatibility across services
5. Test each service independently

When multiple services are modified, the push-back step creates PRs with a **Related PRs** section so reviewers can see the full scope of the change.

## Creating an Issue

### Single-service change
1. Create an issue with labels `claude` + the service label (e.g., `landing-page`)
2. Describe what needs to change
3. The workflow checks out that repo, Claude makes the change, and a PR is created

### Cross-service change
1. Use the "Cross-Service Feature" issue template
2. Check the affected services and describe shared interface changes
3. Dependency labels are auto-added
4. Claude gets all relevant repos, makes coordinated changes, and PRs are created with cross-references

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `CROSS_REPO_PAT` | GitHub PAT with repo access to all service repos |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for the Claude Code GitHub Action |

## Plans and Backlog

- `plans/` — Implementation plans, specs, and risk assessments for past and upcoming features
- `backlog.csv` — Project task tracker with status, dates, and notes
