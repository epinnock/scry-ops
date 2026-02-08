# Spec: scry-cdn-service — Private Projects (Option 1)

## Scope

Add enforcement so private project artifacts cannot be served publicly from the CDN.

## Requirements

1. Determine whether a project is `public` or `private` using Firestore as the source of truth.
2. For public projects: behavior remains unchanged.
3. For private projects:
   - Require `X-Scry-Internal-Viewer-Secret` header matching `SCRY_VIEW_INTERNAL_SECRET`.
   - If missing/invalid: return **404** (preferred) to avoid leaking existence.
4. Cache project visibility lookups.

## Data Source: Firestore

CDN needs read access to `projects/{projectId}.visibility`.

### Implementation options

Preferred:

- Use Firestore REST API with a service account (pattern similar to the upload service’s worker Firestore access).
- Cache results in KV (`CDN_CACHE`) for a short TTL (e.g. 60s–300s).

## Request Flow

1. Parse incoming URL to extract `projectId` (already available via path resolver / UUID parser).
2. Fetch project visibility (cached).
3. If visibility is `public`:
   - serve as normal (existing zip/static logic)
4. If visibility is `private`:
   - check internal secret header
   - if valid: serve
   - else: return 404

## Configuration

### New env vars

- `SCRY_VIEW_INTERNAL_SECRET` — shared secret for dashboard→CDN proxy
- Firestore access (names may be aligned to existing services):
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - `FIRESTORE_SERVICE_ACCOUNT_ID` (optional)

## Caching Strategy

KV cache key:

- `project-visibility:{projectId}` → `{ visibility: 'public' | 'private', updatedAt: <ts> }`

TTL:

- 60 seconds initially (fast propagation for toggles)
- can be increased later if needed

## Error Semantics

- Private + missing secret: 404
- Project not found: 404
- Firestore outage:
  - default-deny for `private` (return 404)
  - for unknown visibility, prefer deny (safer)

## Logging

Log for private denials:

- projectId
- request path
- reason (missing/invalid secret)

Do not log the secret value.

## Acceptance Criteria

1. For a private project, direct `GET https://view.<domain>/{projectId}/{versionId}/` returns 404.
2. For a private project, the dashboard proxy request with correct secret succeeds.
3. For a public project, behavior is unchanged.

