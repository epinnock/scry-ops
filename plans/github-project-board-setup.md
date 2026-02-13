# GitHub Project Board Setup Guide

## Overview

Set up a GitHub Projects v2 board as a Jira-like kanban for the Scry platform. All issues and PRs across all service repos appear on one board, and the scry-ops Claude agent workflow automatically moves tickets through the columns.

## Ticket Lifecycle

```
Create issue on scry-ops          ──→  Backlog
  │
  ├─ Add 'claude' label            ──→  Todo (auto via project-sync workflow)
  │
  ├─ Claude agent starts            ──→  In Progress (auto via claude-agent workflow)
  │
  ├─ Claude creates PRs             ──→  In Review (auto via claude-agent workflow)
  │
  ├─ PRs merged                     ──→  Done (auto via built-in GitHub automation)
  │
  └─ Issue closed                   ──→  Done (auto via built-in GitHub automation)
```

## Step 1: Create the Project

1. Go to https://github.com/users/epinnock/projects
2. Click **New project**
3. Choose **Board** template
4. Name it **Scry Platform**
5. Note the project number from the URL (e.g., `https://github.com/users/epinnock/projects/1` → number is `1`)
6. Update `PROJECT_NUMBER` in these workflow files:
   - `.github/workflows/claude-agent.yml` (line: `PROJECT_NUMBER: "1"`)
   - `.github/workflows/project-sync.yml` (line: `PROJECT_NUMBER: "1"`)

## Step 2: Configure Columns (Status)

The board comes with default columns. Rename/add to get:

| Column | Description |
|--------|-------------|
| **Backlog** | Ideas and future work — not yet planned |
| **Todo** | Planned, ready to start — has labels, clear scope |
| **In Progress** | Claude is working on it, or manual work underway |
| **In Review** | PRs created, awaiting review and merge |
| **Done** | Merged and deployed |

To edit: Click the **...** on any column header → Rename, or click **+ New column**.

## Step 3: Add Custom Fields

Go to project **Settings** (gear icon) → **Custom fields** → **New field**:

### Service (Single select)

Options — use the exact same names as the repo labels:
- `scry-ops`
- `upload-service`
- `cdn-service`
- `dashboard`
- `scry-node`
- `sbcov`
- `search-api`
- `landing-page`
- `scry-link`
- `infrastructure`

Note: options matching `repo-map.yml` service labels are auto-synced by
`.github/workflows/sync-service-metadata.yml` (best effort). Keep this list aligned.

### Type (Single select)

Options:
- `feature`
- `bug`
- `chore`
- `e2e`
- `release`

### Priority (Single select)

Options:
- `P0-critical`
- `P1-high`
- `P2-medium`
- `P3-low`

### Sprint (Iteration)

- Duration: 2 weeks
- Start date: Choose your first sprint start

This field is optional — skip if you prefer a continuous flow over time-boxed sprints.

## Step 4: Link All Repos

Go to project **Settings** → **Manage access** → **Link a repository**:

- `epinnock/scry-ops`
- `epinnock/scry-storybook-upload-service`
- `epinnock/scry-cdn-service`
- `epinnock/scry-developer-dashboard`
- `epinnock/scry-node`
- `epinnock/scry-sbcov`
- `epinnock/scry-nextjs`
- `epinnock/scry-landing-page`
- `epinnock/scry-link`

This allows issues and PRs from any of these repos to appear on the board.

## Step 5: Enable Built-in Automations

Go to project **Settings** → **Workflows**:

| Workflow | Enable | Configuration |
|----------|--------|---------------|
| Item added to project | Yes | Set status → **Backlog** |
| Item reopened | Yes | Set status → **Todo** |
| Pull request merged | Yes | Set status → **Done** |
| Item closed | Yes | Set status → **Done** |
| Code changes requested | Optional | Set status → **In Progress** (goes back from review) |

## Step 6: Create Saved Views

### View 1: Board (default)

- Layout: **Board**
- Group by: Status (default)
- Columns: Backlog, Todo, In Progress, In Review, Done

### View 2: By Service

- Layout: **Table**
- Group by: **Service**
- Sort by: **Priority** (ascending)
- Show fields: Title, Status, Service, Type, Priority

### View 3: Claude Queue

- Layout: **Table**
- Filter: `label:claude status:Todo,In Progress`
- Sort by: Created date (oldest first)
- Show fields: Title, Status, Service

### View 4: Sprint Board

- Layout: **Board**
- Filter: `sprint:@current`
- Group by: Status

## Step 7: Update PAT Scope

Your `CROSS_REPO_PAT` needs the `project` scope for the workflows to move tickets.

1. Go to https://github.com/settings/tokens
2. Find the PAT used for `CROSS_REPO_PAT`
3. Add the `project` scope (or `read:project` + `write:project` for fine-grained tokens)
4. Save

## Step 8: Migrate Backlog

Use the migration script at `scripts/migrate-backlog.sh` to convert existing `backlog.csv` items into GitHub issues on the project board.

## Workflow Automations Summary

### What's automated (already wired in)

| Event | What happens | Workflow |
|-------|-------------|----------|
| Issue created on scry-ops | Added to project as **Backlog**, Service field set from labels | `project-sync.yml` |
| Issue gets `claude` label | Claude agent starts, moves to **In Progress** | `claude-agent.yml` |
| Claude creates PRs | Moves to **In Review**, PRs linked | `claude-agent.yml` |
| PRs merged | Moves to **Done** | GitHub built-in automation |
| Issue closed | Moves to **Done** | GitHub built-in automation |

### What's manual

| Action | Where |
|--------|-------|
| Set Priority | On the board — drag or edit field |
| Set Type | On the board — edit field |
| Assign to Sprint | On the board — edit iteration field |
| Move from Backlog → Todo | Drag the card on the board |
| Close issue after all PRs merged | Can be automated (see below) |

### Optional: Auto-close issue when all PRs merge

Add this workflow to auto-close the scry-ops issue when all related PRs are merged:

```yaml
# .github/workflows/auto-close-issue.yml
name: Auto-close issue when PRs merge

on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number to check'
        required: true

# This is triggered manually or can be called from service repo workflows
# after a PR from claude/scry-ops-issue-N merges
```

For now, manually closing the issue after reviewing all PRs is fine. The board will automatically move it to Done.
