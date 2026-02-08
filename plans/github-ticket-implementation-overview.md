# GitHub Ticket Generation – Implementation Overview (v1 + v2)

This document consolidates **detailed implementation plans per service** for **v1** and **v2**, followed by a short **executive summary**.

---

## Services in Scope

| Service | v1 | v2 |
|------|----|----|
| scry-developer-dashboard | ✅ Required | ✅ Extended |
| scry-node | ✅ Minor | ✅ Extended |
| scry-sbcov | ❌ Not required | ✅ Optional |
| scry-cdn-service | ❌ | ❌ |
| scry-cli | ❌ | ❌ |

---

# v1 – Detailed Implementation Plans

## 1. scry-developer-dashboard (Primary)

### v1 Goals
- Allow users to select failed stories
- Create GitHub issues with metadata
- Support labels, assignees, milestones
- Support manual file attachments

### v1 Changes

#### Coverage UI
- Update [`CoverageDashboard.tsx`](scry-developer-dashboard/components/coverage/CoverageDashboard.tsx)
  - Expand component rows
  - Render per-story rows
  - Add selection checkboxes
  - Track selected stories in state

#### GitHub Issue Modal
- New `GitHubIssueModal.tsx`
- Responsibilities:
  - Title + body editing
  - Render selected stories
  - Fetch repo labels, milestones, collaborators
  - Embed attachment URLs

#### Attachments
- New `AttachmentUploader.tsx`
- Client-side validation (type, size, count)
- Upload to GitHub CDN via API route
- Inject markdown links into issue body

#### API Routes (Next.js)
- `/api/github/issues`
  - Create issue
- `/api/github/repos/:owner/:repo/labels`
- `/api/github/repos/:owner/:repo/milestones`
- `/api/github/repos/:owner/:repo/collaborators`
- `/api/github/repos/:owner/:repo/uploads`
  - Upload attachments

#### Auth
- Extend GitHub OAuth scope to include `repo`
- Re-auth flow if scope missing

---

## 2. scry-node (Minor)

### v1 Goals
- Ensure coverage metadata completeness

### v1 Changes
- Ensure coverage payload always includes:
  - commit SHA
  - branch name
  - build / CI URL (if available)

No new APIs or storage required.

---

# v2 – Detailed Implementation Plans

## 1. scry-developer-dashboard (Extended)

### v2 Enhancements
- Bulk issue creation
- Issue templates per project
- Auto-link issues back to coverage UI
- Auto-close issues when stories pass

### v2 Changes
- Project settings:
  - Issue template editor
  - Default labels / assignees
- Coverage dashboard:
  - Issue status indicators
  - Links to existing GitHub issues

---

## 2. scry-node (Extended)

### v2 Enhancements
- Persist historical story failure IDs
- Correlate failures across builds

### v2 Changes
- Extend coverage schema with stable story fingerprints
- Emit events when failures are resolved

---

## 3. scry-sbcov (Optional v2)

### v2 Enhancements
- Capture failure artifacts
  - Screenshots
  - Console logs
  - DOM snapshots

### v2 Changes
- Upload artifacts alongside coverage
- Reference artifact URLs in coverage JSON
- Enable auto-attachment to GitHub issues

---

# Executive Summary (Easy-to-Digest)

### What Ships in v1
- ✅ Select failed stories in coverage
- ✅ Create GitHub issues from UI
- ✅ Attach files manually
- ✅ Use real repo labels, assignees, milestones

### What Does *Not* Ship in v1
- ❌ Auto screenshots or logs
- ❌ Auto issue closing
- ❌ Cross-build failure tracking

### Why This Is Low Risk
- No new infrastructure
- No database schema changes in v1
- All GitHub interactions scoped to dashboard

### Why This Scales Well
- v1 lays clean foundation
- v2 features layer on without rewrites
- Clear ownership per service

---

## Recommended Review Order
1. v1 dashboard changes (core value)
2. v1 upload + GitHub API routes
3. v2 optional automation paths

This document is intended to be the **single source of truth** for implementation sequencing.

