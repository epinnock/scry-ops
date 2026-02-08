# Task 3.5: Consolidate GitHub App Integration Plan

## Overview

Detailed GitHub App integration plans already exist across multiple files in `plans/github-ticketing-feature/`. This task consolidates them into a single actionable implementation checklist, identifies gaps, and produces a ready-to-execute plan.

**Time Estimate:** 60 min
**Target Repo:** N/A (read-only research + write plan document)
**Agent Tools Required:** Code-only (read files, write plan document)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| GP-001 | Existing plans have conflicting or outdated information | Medium | Medium | Medium |
| GP-002 | GitHub App permissions scope is too broad | Low | High | Medium |
| GP-003 | Plan misses critical integration points | Low | High | Medium |

**Overall Risk: Low** - This is a planning/consolidation task, not implementation.

---

## Task Steps

### 1. Read All Existing Planning Documents

Read in order:
1. `plans/github-ticketing-feature/00-overview.md` - Feature overview
2. `plans/github-ticketing-feature/01-scry-developer-dashboard.md` - Dashboard changes
3. `plans/github-ticketing-feature/02-scry-node.md` - CLI changes
4. `plans/github-ticketing-feature/03-scry-sbcov.md` - Coverage analyzer changes
5. `plans/github-ticketing-feature/04-github-app-and-v2.md` - GitHub App architecture
6. `plans/github-ticketing-feature/05-v2-implementation-plan.md` - V2 implementation details
7. `plans/github-ticketing-feature/06-gaps-and-fixes.md` - Known gaps

### 2. Read Per-Project Plans

1. `scry-developer-dashboard/plans/github-ticketing-feature.md`
2. `scry-node/plans/github-ticketing-feature.md`
3. `scry-sbcov/plans/github-ticketing-feature.md`

### 3. Cross-Reference with Figma Plans

Read relevant Figma integration docs for ticket-from-Figma flow:
- `figma-plugin-docs/` relevant files
- `futureplans/figma/figma-scry-integration-plan.md`

### 4. Produce Consolidated Checklist

**Output File:** `plans/tasklist-feb-7/github-app-consolidated-plan.md` (NEW)

The checklist should include:

#### A. GitHub App Setup
- App name, description
- Required permissions (issues: read/write, pull_requests: read, etc.)
- Webhook URL configuration
- OAuth scopes
- Installation flow

#### B. Environment Variables per Service
- Dashboard: GitHub App ID, private key, webhook secret
- CLI: installation token endpoint URL
- sbcov: fingerprint generation config

#### C. Firestore Schema Changes
- New collections/documents needed
- Index requirements
- Security rules updates

#### D. API Routes to Implement
- POST `/api/github/issues` - Create issue
- GET `/api/github/issues` - List issues for project
- POST `/api/github/webhooks` - Handle webhooks
- GET `/api/github/installations` - List installations

#### E. Frontend Components
- Issue creation modal
- Issue list view
- Installation management page
- Issue lifecycle status indicators

#### F. Testing Strategy
- Unit tests for GitHub App JWT minting
- Integration tests for webhook handling
- E2E test for issue creation flow
- Mock GitHub API for CI

#### G. Deployment Order
- Which service deploys first
- Migration steps
- Rollback plan

---

## Reference Files

| File | Purpose |
|------|---------|
| `plans/github-ticketing-feature/` | All 7 planning documents |
| `scry-developer-dashboard/plans/` | Dashboard-specific plan |
| `scry-node/plans/` | CLI-specific plan |
| `scry-sbcov/plans/` | Coverage-specific plan |
| `figma-plugin-docs/` | Figma integration reference |

---

## Verification

1. Consolidated plan covers all services mentioned in original docs
2. No conflicting information between sources
3. Gaps document (06-gaps-and-fixes.md) items are addressed
4. Implementation checklist is ordered by dependency
5. Each checklist item is actionable (not vague)
