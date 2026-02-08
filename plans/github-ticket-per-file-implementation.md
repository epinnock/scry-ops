# GitHub Ticket Generation – Per‑File Implementation Plans (v1 + v2)

This document enumerates **every file that will change**, grouped by **project**, with **v1 vs v2 responsibilities**. This is meant to be implementation‑ready and PR‑scopable.

---

# Project: scry-developer-dashboard

## v1 Files (Required)

### `components/coverage/CoverageDashboard.tsx`
**v1 changes**
- Add expandable component rows
- Render per‑story rows under each component
- Add checkbox per story
- Track selected story IDs in local state
- Emit selected story metadata to issue modal

**v2 changes**
- Display linked GitHub issue status per story
- Add auto‑resolution indicators when story passes

---

### `components/coverage/ComponentRow.tsx` (new or extracted)
**v1 changes**
- Handle expand / collapse
- Render child `FailedStoryRow`

**v2 changes**
- Visual diff between builds
- Group failures by root cause

---

### `components/coverage/FailedStoryRow.tsx` (new)
**v1 changes**
- Checkbox + pass/fail state
- Display error snippet

**v2 changes**
- Inline screenshot preview
- Link to historical failures

---

### `components/coverage/GitHubIssueModal.tsx` (new)
**v1 changes**
- Render selected stories summary
- Editable title + body
- Fetch labels / milestones / collaborators
- Embed attachment URLs

**v2 changes**
- Issue template selection
- Bulk issue preview
- Auto‑close toggle

---

### `components/coverage/AttachmentUploader.tsx` (new)
**v1 changes**
- Drag & drop + file picker
- Client‑side validation
- Upload progress + removal

**v2 changes**
- Auto‑attach artifacts
- Inline image preview carousel

---

### `components/project-detail/ProjectSettings.tsx`
**v1 changes**
- Add repository configuration section
- Validate GitHub repo access

**v2 changes**
- Default labels / assignees
- Issue template editor

---

### `lib/services/github.service.ts` (new)
**v1 changes**
- Create issue
- Fetch labels, milestones, collaborators
- Upload assets to GitHub CDN

**v2 changes**
- Close / reopen issues
- Search issues by fingerprint

---

### `app/api/github/issues/route.ts` (new)
**v1 changes**
- Create issue endpoint
- Inject attachment markdown

**v2 changes**
- Bulk issue creation
- Auto‑close handling

---

### `app/api/github/repos/[owner]/[repo]/uploads/route.ts` (new)
**v1 changes**
- Proxy file uploads to GitHub CDN
- Return hosted asset URLs

**v2 changes**
- Attach existing artifacts by URL

---

### `lib/auth-helpers.ts`
**v1 changes**
- Add `repo` GitHub OAuth scope
- Detect missing scopes

**v2 changes**
- Permission health checks

---

# Project: scry-node

## v1 Files (Minor)

### `coverage generation pipeline`
**v1 changes**
- Guarantee presence of:
  - commit SHA
  - branch
  - build URL

**v2 changes**
- Emit stable story fingerprints

---

# Project: scry-sbcov

## v1
❌ No changes

## v2 Files (Optional)

### `storybook coverage analyzer`
**v2 changes**
- Capture screenshots on failure
- Persist console logs
- Output artifact URLs in coverage JSON

---

# Project: scry-cdn-service

## v1 / v2
❌ No changes

---

# Project: scry-cli

## v1 / v2
❌ No changes

---

# Executive Snapshot

## v1 Touches
- ✅ Dashboard UI
- ✅ GitHub API integration
- ✅ Manual uploads

## v2 Touches
- 🔜 Automation
- 🔜 Artifacts
- 🔜 Lifecycle management

This document is designed to be **PR‑checklist friendly** and maps 1‑to‑1 with actual files.

