# Local + Staging Deployment Guide for E2E Testing (Scry Storybook Coverage)

This guide is the **single place** to run end-to-end tests for the Storybook Coverage integration:

- Upload Service (uploads `storybook.zip` + `coverage-report.json` + writes Firestore build metadata)
- CDN Service (serves `storybook.zip` content and `coverage-report.json` with CORS)
- Developer Dashboard (reads Firestore build + fetches coverage JSON from CDN)
- scry-deployer CLI (generates coverage + uploads via Upload Service)

## 0. Environments & Resource Mapping

The goal is:
- **Local E2E**: run services on localhost, but point them at **staging cloud resources** to keep local testing realistic.
- **Staging E2E**: deploy to Cloudflare/Vercel staging targets and run the same validation against public staging URLs.

### Recommended environment strategy

Use separate Firebase projects and R2 buckets (staging vs production), as described in [`STAGING_PRODUCTION_SETUP.md`](STAGING_PRODUCTION_SETUP.md:13).

**Firebase** ([`STAGING_PRODUCTION_SETUP.md`](STAGING_PRODUCTION_SETUP.md:11)):
- `scry-staging` (used for local + staging testing)
- `scry-production` (production only)

**R2 buckets** (current repo configuration):
- Upload/build artifacts bucket (Storybooks + coverage)
  - Production: `my-storybooks-production`
  - Staging: `my-storybooks-staging`
  - Used by Upload Service ([`wrangler.toml`](scry-storybook-upload-service/wrangler.toml:22)) and CDN Service ([`wrangler.toml`](scry-cdn-service/cloudflare/wrangler.toml:21))
- Static sites bucket (legacy/static hosting)
  - Production: `scry-static-sites`
  - Staging: `scry-static-sites-preview`
  - Used by CDN Service ([`wrangler.toml`](scry-cdn-service/cloudflare/wrangler.toml:15))

### Port plan (avoid conflicts)

- Dashboard: `http://localhost:3000`
- Upload Service (Node): `http://localhost:3001` (matches e2e default config in [`defaultConfig`](scry-storybook-upload-service/e2e/config.ts:22))
- CDN Service (Worker dev): `http://localhost:8788`

---

## 1. One-time prerequisites (local machine)

### 1.1 Install required tools

- Node.js >= 20 (CDN requires Node 20+ per [`engines`](scry-cdn-service/package.json:55))
- pnpm (recommended for dashboard)
- Cloudflare Wrangler CLI (comes via `wrangler` dependency for CDN, but also usable globally)
- Firebase CLI (dashboard uses `firebase-tools` in dev deps per [`package.json`](scry-developer-dashboard/package.json:96))

### 1.2 Create staging Firebase project + service accounts

Follow [`Option A: Separate Firebase Projects`](STAGING_PRODUCTION_SETUP.md:13).

You will need:
- **Staging Firebase project id**: `scry-staging`
- A **service account** for server-side access (Upload Service Node runtime uses Firebase Admin SDK)

> Note: keep service account JSON files out of git. The repo has `.kilocodeignore` for serviceAccount files.

### 1.3 Create staging R2 bucket + enable public access

Upload Service expects public access for download URLs (see R2 public URL notes in [`README`](scry-storybook-upload-service/README.md:196)).

Create:
- `my-storybooks-staging`

Enable public access for the bucket so that Storybooks and coverage JSON can be fetched publicly.

### 1.4 Prepare a staging API key for E2E

Upload endpoints require `X-API-Key` (see endpoint docs in [`POST /upload/:project/:version`](scry-storybook-upload-service/README.md:508)).

Create a dedicated E2E project id and key, e.g.:
- `projectId = e2e-test-project`
- Key format described in [`Key Format`](scry-storybook-upload-service/README.md:77)

---

## 2. Local deployment + local E2E

### 2.1 Start Upload Service locally (Node)

Use Node runtime for fastest iteration.

**Files to review:**
- Scripts: [`package.json`](scry-storybook-upload-service/package.json:7)

**Steps:**
1. Install deps and build:
   - `npm install`
   - `npm run build`
2. Create a local `.env` (not committed) for Node runtime:
   - Use the structure referenced in [`For Node.js (Local Development)`](scry-storybook-upload-service/README.md:220)
   - Ensure `PORT=3001`
   - Point to **staging** bucket `my-storybooks-staging`
   - Configure Firestore via `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON)
3. Run:
   - `npm run start:node` (uses [`start:node`](scry-storybook-upload-service/package.json:13))

**Smoke test:**
- `curl http://localhost:3001/health` (or root if health route differs)

### 2.2 Start CDN Service locally (Cloudflare Worker dev)

CDN supports serving `coverage-report.json` directly from R2 (not from inside ZIP), implemented in [`zipStaticRoutes.get()`](scry-cdn-service/src/routes/zip-static.ts:28).

**Files to review:**
- Scripts: [`package.json`](scry-cdn-service/package.json:6)
- Path parsing: [`parsePathForUUID()`](scry-cdn-service/src/utils/subdomain.ts:82)

**Start local worker with non-conflicting port:**
- Use `wrangler dev` and specify port 8788.
- Prefer **remote bindings** so it uses real R2 buckets.

Recommended command pattern:
- `cd scry-cdn-service && npm run dev:cloudflare:local -- --port 8788 --remote`

If you prefer to follow the baked script:
- [`dev:cloudflare`](scry-cdn-service/package.json:7) runs `wrangler dev --remote` from the cloudflare directory.

**Smoke tests:**
- `curl http://localhost:8788/health`

### 2.3 Start Developer Dashboard locally

**Files to review:**
- Setup steps in [`README`](scry-developer-dashboard/README.md:23)
- Firebase env template: [`.env.local.example`](scry-developer-dashboard/.env.local.example:1)

**Steps:**
1. `cd scry-developer-dashboard && pnpm install`
2. Create `.env.local` based on [`.env.local.example`](scry-developer-dashboard/.env.local.example:1)
3. Add these additional env vars (from the staging/production setup guide):
   - `NEXT_PUBLIC_UPLOAD_SERVICE_URL=http://localhost:3001`
   - `NEXT_PUBLIC_CDN_URL=http://localhost:8788`
   - `NEXT_PUBLIC_ENVIRONMENT=staging`

> The expected shape of these env vars is described in [`STAGING_PRODUCTION_SETUP.md`](STAGING_PRODUCTION_SETUP.md:55).

4. Run: `pnpm dev` (see [`dev`](scry-developer-dashboard/package.json:7))

### 2.4 Run local E2E flow (CLI-driven)

This is the closest to real production behavior because it exercises:
- scry-deployer packaging
- optional coverage analysis
- upload service APIs
- CDN serving
- dashboard consumption

#### Step A: Generate a Storybook build

In a Storybook-enabled project (could be the dashboard itself):
- Run `pnpm run build-storybook` (dashboard has it in [`package.json`](scry-developer-dashboard/package.json:11))

You should get a `storybook-static/` directory.

#### Step B: Deploy with scry-deployer (local API)

`scry-deployer` supports manual deployment (see [`Manual Deployment (Testing)`](scry-node/README.md:60)).

Point it at your **local** upload service:

- `STORYBOOK_DEPLOYER_API_URL=http://localhost:3001`
- `STORYBOOK_DEPLOYER_PROJECT=e2e-test-project`
- `STORYBOOK_DEPLOYER_VERSION=pr-999` (or any version string)
- `STORYBOOK_DEPLOYER_API_KEY=<your e2e API key>`

Then run:
- `npx @scrymore/scry-deployer --dir ./storybook-static`

Coverage behavior is documented in [`docs/COVERAGE.md`](scry-node/docs/COVERAGE.md:1).

#### Step C: Validate artifacts exist

Upload Service stores:
- `storybook.zip` at `{project}/{version}/storybook.zip`
- `coverage-report.json` at `{project}/{version}/coverage-report.json` (see [`storage layout`](scry-cdn-service/docs/COVERAGE_REPORTS.md:5) and upload docs in [`README`](scry-storybook-upload-service/README.md:521))

#### Step D: Validate CDN serving

**Coverage JSON (local CDN):**
- `curl http://localhost:8788/e2e-test-project/pr-999/coverage-report.json`

**Storybook file (local CDN):**
- `curl -I http://localhost:8788/e2e-test-project/pr-999/index.html`

**CORS preflight simulation:**
- Use the commands in [`Verification Commands`](scry-cdn-service/docs/COVERAGE_REPORTS.md:66), but point at localhost.

#### Step E: Validate dashboard UI

Open:
- `http://localhost:3000`

E2E acceptance checks:
1. Build card shows coverage summary (badge/progress).
2. Coverage detail page loads.
3. Coverage page fetches the report URL and renders.

Dashboard coverage feature overview: [`coverage-feature.md`](scry-developer-dashboard/docs/coverage-feature.md:1).

---

## 3. Promote to staging + staging E2E

### 3.1 Staging deployment targets (how this repo maps today)

- Upload Service staging: Cloudflare Worker **preview** env ([`env.preview`](scry-storybook-upload-service/wrangler.toml:52))
- CDN Service staging: Cloudflare Worker **development** env ([`env.development`](scry-cdn-service/cloudflare/wrangler.toml:56))
- Dashboard staging: Vercel preview environment for `stage` branch (recommended in [`Branch Strategy`](STAGING_PRODUCTION_SETUP.md:325))

### 3.2 Deploy Upload Service to staging

From `scry-storybook-upload-service/`:
- Deploy preview env:
  - `wrangler deploy --env preview`

Confirm it’s live:
- `curl https://<preview-worker-url>/health`

### 3.3 Deploy CDN Service to staging

From `scry-cdn-service/`:
- Deploy dev/staging env:
  - `npm run deploy:cloudflare:dev` (see [`deploy:cloudflare:dev`](scry-cdn-service/package.json:14))

Confirm it’s live:
- `curl https://<staging-view-domain>/health`

### 3.4 Deploy Dashboard to staging

Recommended approach:
- Merge to `stage` branch
- Vercel preview deploys automatically (per branch mapping described in [`Vercel Branch Configuration`](STAGING_PRODUCTION_SETUP.md:342))

Staging dashboard must have environment variables set:
- Firebase staging project values
- `NEXT_PUBLIC_UPLOAD_SERVICE_URL=https://<staging-upload-worker-url>`
- `NEXT_PUBLIC_CDN_URL=https://<staging-cdn-url>`

### 3.5 Run staging E2E validation

#### Upload Service E2E suite against staging

The Upload Service e2e runner supports a “production” target that can point at any URL via `E2E_PROD_URL` (see [`defaultConfig.production`](scry-storybook-upload-service/e2e/config.ts:44)).

Run:
- `cd scry-storybook-upload-service`
- `E2E_PROD_URL=https://<staging-upload-worker-url> npm run test:e2e:prod` (see [`test:e2e:prod`](scry-storybook-upload-service/package.json:21))

#### CDN E2E checks (curl-based)

1. Upload an artifact (via scry-deployer or direct upload).
2. Validate:
   - `GET https://<staging-cdn-domain>/{project}/{version}/coverage-report.json`
   - CORS preflight from dashboard origin (pattern from [`Verification Commands`](scry-cdn-service/docs/COVERAGE_REPORTS.md:66))

#### Full-system staging E2E (manual acceptance)

1. Use `scry-deployer` to upload a Storybook build with coverage to staging Upload Service.
2. Confirm CDN serves both:
   - `index.html`
   - `coverage-report.json`
3. Confirm staging dashboard:
   - Shows coverage badge on build card
   - Loads coverage detail page

---

## 4. Roll-forward and rollback guidance

### Roll-forward

Prefer promoting by merging:
- `develop` -> `stage` (staging)
- `stage` -> `main` (production)

This matches the workflow described in [`Recommended Branch Setup`](STAGING_PRODUCTION_SETUP.md:325).

### Rollback

- Upload Service / CDN Service: use Cloudflare Workers rollback tooling (`wrangler deployments list` + `wrangler rollback`) as described in [`Rollback`](scry-cdn-service/DEPLOYMENT.md:323).
- Dashboard: revert Vercel deployment / redeploy prior commit.
- CLI: immediate mitigation is `--no-coverage` (see [`--no-coverage`](scry-node/docs/COVERAGE.md:26)).

---

## 5. E2E checklist (copy/paste)

### Local

- [ ] Upload Service Node running on `:3001`
- [ ] CDN worker running on `:8788`
- [ ] Dashboard running on `:3000`
- [ ] `scry-deployer` upload succeeds to local Upload Service
- [ ] `GET /{project}/{version}/index.html` succeeds via local CDN
- [ ] `GET /{project}/{version}/coverage-report.json` succeeds via local CDN
- [ ] Browser fetch of coverage JSON does not hit CORS errors
- [ ] Dashboard renders coverage badge and coverage page

### Staging

- [ ] Upload Service deployed to Worker preview env
- [ ] CDN deployed to development env
- [ ] Dashboard deployed to Vercel staging/preview
- [ ] Upload Service e2e suite passes against `E2E_PROD_URL=<staging-upload-url>`
- [ ] CDN serves storybook + coverage JSON
- [ ] Dashboard renders coverage end-to-end
