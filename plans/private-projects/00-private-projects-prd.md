# Private Projects (Option 1) — Executive Overview / PRD

## Summary

Today, Storybook and coverage artifacts can be viewed by anyone who has (or guesses) the viewer URL (e.g. `https://view.<domain>/{projectId}/{versionId}/`).

This PRD defines **Option 1: Authenticated access only**:

- Projects can be set to **public** or **private**.
- **Public** projects behave as they do today.
- **Private** projects require a user to be authenticated and authorized (project member) to view any artifacts.
- Private artifacts are served through the dashboard as an authenticated proxy; the CDN refuses direct public access for private projects.

The intent is to be **straightforward to implement**, **easy to maintain**, and **secure**.

## Background / Current State

### Viewer is effectively public
The CDN service (`scry-cdn-service`) serves:

- Storybook assets (from ZIP in R2)
- `coverage-report.json` (standalone object in R2)

with no authentication gate.

### Dashboard and CLI already assume “CDN-only” reads
There is an existing plan to make the R2 bucket private and route reads through the CDN:
- [`private-bucket-cdn-url-plan.md`](plans/scry-sbcov-integration/private-bucket-cdn-url-plan.md:1)

This PRD adds an **authorization gate** on top of that.

## Goals

1. **Private projects are not viewable by URL alone.**
2. **Public projects remain publicly viewable** (unless toggled private).
3. **Project owners/admins can toggle visibility** in the dashboard.
4. **Authorization is enforced at the edge/CDN**, not just in UI.
5. Implementation remains easy to reason about:
   - membership-based access
   - minimal token/link complexity

## Non-Goals

- Public share links for private projects (that is “Option 2”).
- Fine-grained path-level permissions (storybook vs coverage).
- Organization-wide / SSO enforcement beyond Firebase auth.

## Users / Personas

1. **Project Owner/Admin**
   - can toggle project public/private
   - can manage members
2. **Project Member**
   - can view private artifacts
3. **Unauthenticated / Not a member**
   - should not be able to view private artifacts (even with URL)

## Requirements

### Functional

1. Projects have a `visibility` field: `'public' | 'private'` (default `'public'`).
2. Dashboard UI shows a visibility toggle (admin/owner only).
3. Private artifacts require:
   - valid authentication (Firebase)
   - authorization (project membership)
4. CDN returns **404** (preferred) or **403** for private artifacts without valid internal authorization.
5. Dashboard provides an authenticated viewer/proxy path for private projects.
6. CLI links for private projects should point to the dashboard viewer (not the public CDN URL).

### Security

1. No “bearer token in URL query string” for storybook navigation.
2. Private access is not solely enforced client-side.
3. CDN must be able to decide if a project is private (source of truth: Firestore) and enforce gating.
4. Requests for private artifacts must be auditable via logs (at least request metadata + projectId).

### Maintainability

1. One canonical visibility field.
2. One primary enforcement point for private access:
   - dashboard does membership checks
   - CDN enforces “only dashboard may fetch private artifacts” using an internal secret
3. Cache visibility lookups at CDN to minimize Firestore reads.

## Proposed Architecture

### High-level approach

For **public** projects:

- Browser can request artifacts directly from CDN as today:
  - `GET https://view.<domain>/{projectId}/{versionId}/...`

For **private** projects:

- Browser loads artifacts from the **dashboard origin**, via a new authenticated proxy route:
  - `GET https://dashboard.<domain>/view/{projectId}/{versionId}/...`

The dashboard route:

1. Authenticates the user via a Firebase **session cookie**.
2. Authorizes access by checking Firestore project membership.
3. Proxies the request to the CDN, adding an **internal header**:
   - `X-Scry-Internal-Viewer-Secret: <secret>`

The CDN:

1. Determines whether `{projectId}` is public or private (via Firestore).
2. If public: serve normally.
3. If private: only serve when the internal secret header matches.

This prevents direct public access to private artifacts even if the URL is known.

### Why this design

- Avoids “token in URL” problems (tokens leak via logs/referrers/history).
- Keeps storybook asset loading simple: everything is same-origin to the dashboard for private projects.
- Keeps the CDN simple to use for public projects.
- Limits trust: only the dashboard backend can fetch private artifacts from the CDN.

## Data Model

### Firestore

`projects/{projectId}`

```ts
type ProjectVisibility = 'public' | 'private';

type ProjectDoc = {
  // ...existing fields
  visibility: ProjectVisibility; // default: 'public'
  memberIds: string[];          // already present in this codebase
};
```

Membership is the authorization mechanism (existing member model).

## API / Routes

### Dashboard

1. `PATCH /api/projects/:id` (already exists) updates `visibility` (admin/owner only).
2. `POST /api/auth/session` creates a Firebase session cookie from an ID token.
3. `POST /api/auth/logout` clears the session cookie.
4. `GET /view/[...path]` is an authenticated proxy for private viewer content.

## Link Structure (Public vs Private)

Yes—**links are different** for public vs private projects under Option 1.

### Public projects (unchanged)

Artifacts are served directly from the CDN host.

| Resource | URL Pattern |
|----------|-------------|
| Storybook root | `https://view.<domain>/{projectId}/{versionId}/` |
| Storybook asset | `https://view.<domain>/{projectId}/{versionId}/assets/<file>` |
| Coverage JSON | `https://view.<domain>/{projectId}/{versionId}/coverage-report.json` |

### Private projects (new)

Artifacts are served from the **dashboard** via an authenticated proxy path.

| Resource | URL Pattern |
|----------|-------------|
| Storybook root | `https://dashboard.<domain>/view/{projectId}/{versionId}/` |
| Storybook asset | `https://dashboard.<domain>/view/{projectId}/{versionId}/assets/<file>` |
| Coverage JSON | `https://dashboard.<domain>/view/{projectId}/{versionId}/coverage-report.json` |

### Why two link shapes?

- Storybook navigation loads many assets where browsers don't attach `Authorization` headers.
- Using a **same-origin** dashboard proxy for private projects ensures every asset request is authenticated via a session cookie.
- The CDN remains the public host for public projects.

### CDN

1. All existing routes remain.
2. New gate:
   - If `project.visibility === 'private'` then require `X-Scry-Internal-Viewer-Secret`.

## Rollout Plan

1. Add Firestore schema field (`visibility`) and dashboard UI toggle.
2. Add dashboard session cookie flow.
3. Add dashboard `/view/*` authenticated proxy.
4. Add CDN visibility lookup + internal-secret gating.
5. Update CLI output for private projects to point at dashboard `/view/*`.
6. Turn on enforcement in production:
   - start with “log-only” mode in CDN for a short period (optional)
   - then enforce.

## Risks / Mitigations

1. **Firebase session cookie implementation complexity**
   - Mitigation: use Firebase Admin `createSessionCookie()` pattern; keep TTL short (e.g. 5 days).
2. **CDN Firestore access (service account + caching)**
   - Mitigation: copy minimal approach from upload service’s Firestore REST pattern; cache results in KV.
3. **Storybook routing and asset paths**
   - Mitigation: proxy every request via `/view/*` so Storybook relative paths work.

## Success Criteria

1. Private project artifact URLs on the CDN return 404/403 when accessed directly.
2. Authenticated project members can view Storybook and coverage through the dashboard.
3. Public projects remain accessible via CDN URLs.
4. Visibility toggle takes effect immediately.

