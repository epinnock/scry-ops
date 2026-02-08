# Spec: scry-developer-dashboard — Private Projects (Option 1)

## Scope

Implement dashboard support for project visibility and authenticated viewing of private artifacts.

## References

- Existing “private bucket + CDN URL rewrite” plan: [`private-bucket-cdn-url-plan.md`](plans/scry-sbcov-integration/private-bucket-cdn-url-plan.md:1)
- Existing local proxy route: [`app/api/view/[...path]/route.ts`](scry-developer-dashboard/app/api/view/[...path]/route.ts:1)

## Requirements

1. Owners/admins can toggle project `visibility` (`public`/`private`).
2. Dashboard provides **authenticated viewer proxy** for private projects at:
   - `GET /view/<projectId>/<versionId>/<path...>`
3. Viewer proxy must:
   - authenticate via Firebase session cookie
   - authorize via project membership
   - proxy upstream to `SCRY_VIEW_PROXY_TARGET` (the CDN)
   - add internal secret header for private projects
4. For public projects, dashboard continues to show the public CDN URL.

## Data Model Changes

### Firestore: projects

Add:

```ts
visibility: 'public' | 'private' // default: 'public'
```

## UI Changes

### Project Settings

Add a “Visibility” setting:

- Public / Private toggle
- Visible only to `owner` and `admin`
- Copy explaining behavior:
  - Public: anyone with the link can view
  - Private: only signed-in members can view

### Build list / links

When project is:

- **Public**: show `View Storybook` → `https://view.<domain>/{projectId}/{versionId}/`
- **Private**: show `View Storybook` → `https://dashboard.<domain>/view/{projectId}/{versionId}/`

Same logic for `coverage-report.json`.

#### Link table

| Project visibility | Storybook root | Coverage JSON |
|---|---|---|
| `public` | `https://view.<domain>/{projectId}/{versionId}/` | `https://view.<domain>/{projectId}/{versionId}/coverage-report.json` |
| `private` | `https://dashboard.<domain>/view/{projectId}/{versionId}/` | `https://dashboard.<domain>/view/{projectId}/{versionId}/coverage-report.json` |

## Auth: Session Cookie

### Why

Browser navigations for Storybook assets cannot reliably attach `Authorization: Bearer <token>` headers.

Solution: use a Firebase **session cookie** so every `/view/*` request can be authenticated server-side.

### Endpoints

1. `POST /api/auth/session`
   - input: `{ idToken: string }`
   - server: verify ID token, mint session cookie (`createSessionCookie`)
   - response: `Set-Cookie: __session=...; HttpOnly; Secure; SameSite=Lax`

2. `POST /api/auth/logout`
   - clears session cookie

### Client flow

- After Firebase client sign-in, call `POST /api/auth/session` with `await user.getIdToken()`.
- On sign-out, call `POST /api/auth/logout`.

## New Route: `/view/[...path]` (Authenticated Proxy)

### Route handler behavior

`GET /view/<projectId>/<versionId>/<any path>`

1. Extract `projectId`, `versionId`, and `restPath`.
2. Authenticate:
   - read session cookie
   - verify session cookie using Firebase Admin
3. Authorize:
   - lookup project membership for `uid`
   - deny if not member
4. Proxy upstream:
   - upstream base: `SCRY_VIEW_PROXY_TARGET` (e.g. `https://view.<domain>`)
   - upstream URL: `${base}/${projectId}/${versionId}/${restPath}`
   - add header `X-Scry-Internal-Viewer-Secret: ${SCRY_VIEW_INTERNAL_SECRET}`
5. Response:
   - stream upstream response
   - preserve content-type/cache headers when safe
   - set `Cache-Control: private, no-store` for HTML

### Environment variables

- `SCRY_VIEW_PROXY_TARGET` (already exists in local proxy)
- `SCRY_VIEW_INTERNAL_SECRET` (new; shared with CDN)

## API: Toggle Visibility

### Preferred implementation

Extend existing update project endpoint (if present) to allow patching `visibility`.

Rules:

- Only `owner` and `admin` may toggle.
- Validate value is `public|private`.

## Testing

1. Unit tests: visibility update validation and permission checks.
2. Integration tests: `/view/*` returns:
   - 401 when not authenticated
   - 403 when authenticated but not a member
   - 200 and correct content-type when member

## Acceptance Criteria

1. Toggling a project to private immediately changes viewer URLs shown in dashboard.
2. A non-member cannot access `/view/*`.
3. A member can access `/view/*` and Storybook loads completely (HTML + assets).

