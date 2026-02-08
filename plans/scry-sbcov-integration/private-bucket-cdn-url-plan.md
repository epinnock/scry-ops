# Private bucket + CDN-only access (storybook + coverage) — Detailed Implementation Plan

## Objective
1) Make the R2 bucket **private** (no direct public reads via `r2.dev`).
2) Ensure all user-facing reads of artifacts (storybook + `coverage-report.json`) go through **`scry-cdn-service`**.
3) Ensure both the CLI and dashboard can be pointed at **any CDN base URL** per environment (local/staging/prod).
4) Preserve backwards compatibility for existing builds whose stored `coverage.reportUrl` points at `r2.dev`.

---

## Ground truth (current behavior)

### CLI view link behavior (already CDN-based)
The CLI constructs both Storybook and coverage URLs from `SCRY_VIEW_URL` (default `https://view.scrymore.com`) in [`buildDeployResult()`](scry-node/bin/cli.js:435):
- Storybook: `${SCRY_VIEW_URL}/{project}/{version}/` ([`scry-node/bin/cli.js`](scry-node/bin/cli.js:440))
- Coverage: `${SCRY_VIEW_URL}/{project}/{version}/coverage-report.json` ([`scry-node/bin/cli.js`](scry-node/bin/cli.js:442))

### Dashboard fetch behavior (currently uses stored URL)
The dashboard:
1) Fetches coverage metadata (including `coverage.reportUrl`) from its API at [`GET /api/projects/:id/builds/:buildId/coverage`](scry-developer-dashboard/app/api/projects/[id]/builds/[buildId]/coverage/route.ts:15).
2) Fetches the full JSON with a direct browser request to `coverage.reportUrl` at [`useCoverageReport()`](scry-developer-dashboard/lib/hooks/useCoverageReport.ts:108).

### CDN service support (already implemented)
`scry-cdn-service` already serves `coverage-report.json` from R2 (not from the zip) in [`zip-static.ts`](scry-cdn-service/src/routes/zip-static.ts:60).

---

## Design decisions

### Decision A — Dashboard will use a configurable CDN base URL
Introduce a single env var in the dashboard:
- `NEXT_PUBLIC_SCRY_VIEW_URL`

It must be `NEXT_PUBLIC_` because it is used in client-side code.

### Decision B — Dashboard should compute or rewrite coverage URLs for backwards compatibility
When `NEXT_PUBLIC_SCRY_VIEW_URL` is set, the dashboard should fetch coverage JSON from the CDN base regardless of what is stored in Firestore.

Backwards compatibility approach:
- If `coverage.reportUrl` exists (old builds): parse it and extract `pathname` (e.g. `/project/version/coverage-report.json`), then prepend the CDN base.
- If `coverage.reportUrl` is missing/unexpected: compute path from `projectId` + `versionId`.

This ensures that once the bucket becomes private, older stored `r2.dev` URLs will still work through the CDN.

### Decision C — Skip changing upload-service stored URLs (for now)
We will not change upload-service URL generation in this iteration. The dashboard will handle the URL selection/rewrite.

---

## Implementation steps

### 1) Dashboard: centralize the view base URL

#### 1.1 Add a small helper to read the view base
Create a helper module (example location):
- `scry-developer-dashboard/lib/view-url.ts`

Responsibilities:
- Read `process.env.NEXT_PUBLIC_SCRY_VIEW_URL`.
- Normalize it (strip trailing `/`).
- Export `getViewBaseUrl()`.

#### 1.2 Replace hardcoded `view.scrymore.com` in build list UI
Update [`ProjectBuilds.tsx`](scry-developer-dashboard/components/project-detail/ProjectBuilds.tsx:95):
- replace `https://view.scrymore.com/${projectId}/${versionId}/` with `${viewBase}/${projectId}/${versionId}/`.
- if env var is missing, default to `https://view.scrymore.com`.

Acceptance:
- Clicking “View” always goes to the configured CDN host in all environments.

---

### 2) Dashboard: coverage report fetch uses CDN base (with fallback)

#### 2.1 Add a URL builder for coverage JSON
Add helper function (in `lib/view-url.ts` or in hook file) to build coverage URL:
- Input: `viewBase`, `projectId`, `versionId`, and optionally `storedReportUrl`
- Output: final URL string

Algorithm:
1) If `viewBase` is set AND `storedReportUrl` is a valid URL:
   - `pathname = new URL(storedReportUrl).pathname`
   - return `${viewBase}${pathname}`
2) Else if `viewBase` is set:
   - return `${viewBase}/${projectId}/${versionId}/coverage-report.json`
3) Else:
   - return `storedReportUrl` (existing behavior)

This supports:
- old builds that stored `r2.dev` reportUrl
- new builds (computed)
- environments without the env var (fallback)

#### 2.2 Update the hook to use the builder
Update [`useCoverageReport()`](scry-developer-dashboard/lib/hooks/useCoverageReport.ts:85):
- It already receives `projectId` and retrieves `versionId` from metadata response.
- Replace `fetch(metadata.reportUrl)` with `fetch(resolvedReportUrl)`.

Acceptance:
- In local dev you can set `NEXT_PUBLIC_SCRY_VIEW_URL=http://localhost:<cdn-port>` and coverage fetch will target the local CDN.
- In staging/prod you set `NEXT_PUBLIC_SCRY_VIEW_URL=https://view.<env-domain>` and coverage fetch goes there.

#### 2.3 Add/adjust dashboard tests
Update or add tests around `useCoverageReport` to verify:
- rewrite behavior when `storedReportUrl` is `https://pub-...r2.dev/project/version/coverage-report.json`
- computed behavior when `storedReportUrl` is missing
- fallback behavior when env var is missing

Suggested file:
- [`scry-developer-dashboard/lib/hooks/__tests__/useCoverageReport.test.ts`](scry-developer-dashboard/lib/hooks/__tests__/useCoverageReport.test.ts:1)

---

### 3) CDN service validation checklist (no code changes required)

#### 3.1 Confirm coverage endpoint serves JSON with CORS
Validate `GET https://<cdn-host>/{project}/{version}/coverage-report.json`:
- status 200
- `Content-Type: application/json`
- has `Access-Control-Allow-Origin` for the dashboard origin

Coverage serving code path: [`zip-static.ts`](scry-cdn-service/src/routes/zip-static.ts:60)
CORS middleware: [`cors.ts`](scry-cdn-service/src/middleware/cors.ts:1)

#### 3.2 Confirm storybook routing works for the same base host
Validate storybook view URL:
- `https://<cdn-host>/{project}/{version}/`

---

### 4) Rollout plan (order matters)

1) **Deploy CDN service** (if not already) and validate it can read from R2 bucket.
2) **Deploy dashboard changes** (env override + URL rewrite).
3) Set `NEXT_PUBLIC_SCRY_VIEW_URL` in each dashboard environment:
   - local dev: `http://localhost:<cdn-port>`
   - staging: `https://view.staging.<domain>`
   - prod: `https://view.<domain>`
4) Validate:
   - Storybook links open correctly
   - Coverage page fetches JSON from CDN host
   - Older builds still work because of rewrite logic
5) **Disable R2 public access** (make bucket private).
6) Re-validate coverage + storybook again.

---

## Environment variable matrix

### CLI (already supported)
- `SCRY_VIEW_URL` → used to construct view/coverage links

### Dashboard (new)
- `NEXT_PUBLIC_SCRY_VIEW_URL` → used to construct storybook and coverage URLs

---

## Out of scope (explicitly skipped)
- Changing upload service storage URL generation away from `r2.dev`.
- Rewriting existing Firestore documents.

---

## Success criteria
- Bucket is private; `r2.dev` URLs no longer needed.
- Dashboard and CLI both point at the configured CDN host.
- Coverage page loads reliably in local + staging + prod.
- No migration of existing Firestore coverage URLs required.
