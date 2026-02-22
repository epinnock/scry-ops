# 02 – E2E Test Automation: Build Processing Pipeline

## Goal

Automate the manual E2E testing steps from `01-local-e2e-testing-guide.md` into scripts that can be run by humans, AI agents, and GitHub Actions. The scripts live in a dedicated `scry-e2e/` repo that houses all cross-service E2E scenarios for the Scry platform.

---

## Approach

**Hybrid bash + Node.js helpers** — bash for orchestration (matching scry-ops conventions), standalone `.mjs` helpers for Firestore JWT auth and Milvus REST API (no npm install required, Node.js built-in modules only).

**Dedicated repo** at `scry-e2e/` — each scenario gets its own script under `scenarios/`. Shared helpers (Firestore auth, Milvus client) live in `helpers/` and are reused across all scenarios.

---

## Repo Structure

```
scry-e2e/
├── README.md                              # Overview, how to add scenarios
├── .env.example                           # Template for all required env vars
├── helpers/
│   ├── common.sh                          # Shared bash: log(), assert(), result writing
│   ├── firestore-helper.mjs               # Firestore JWT auth + CRUD (Node.js, no deps)
│   └── milvus-helper.mjs                  # Milvus query/delete (Node.js, no deps)
├── scenarios/
│   └── build-processing/
│       └── run.sh                         # Build processing pipeline E2E
├── run-all.sh                             # Run all scenarios (or a filtered subset)
└── .github/
    └── workflows/
        └── e2e.yml                        # CI workflow
```

---

## Shared Helpers

### helpers/common.sh (~60 lines)

Sourced by all scenario scripts. Follows conventions from `scry-ops/scripts/pull-all-repos.sh`:

```bash
#!/usr/bin/env bash
# Sourced, not executed directly

E2E_PREFIX="${E2E_PREFIX:-e2e}"

log()  { printf '[%s] %s\n' "${E2E_PREFIX}" "$*"; }
warn() { printf '[%s] WARN: %s\n' "${E2E_PREFIX}" "$*" >&2; }
die()  { printf '[%s] FATAL: %s\n' "${E2E_PREFIX}" "$*" >&2; exit 1; }

# Assertions — increment global PASS/FAIL counters
assert_eq()        { ... }  # assert_eq "actual" "expected" "label"
assert_not_empty() { ... }  # assert_not_empty "$value" "label"
assert_contains()  { ... }  # assert_contains "$haystack" "$needle" "label"

# JSON result writing
write_step_result() { ... } # write_step_result "step_name" "pass" '{"key":"val"}'
write_summary()     { ... } # write_summary — finalizes result.json with overall pass/fail

# Common flag parsing
parse_common_flags() { ... } # sets DRY_RUN, SKIP_CLEANUP, TIMEOUT, HELP
```

### helpers/firestore-helper.mjs (~100 lines)

Standalone Node.js helper. No npm install — uses only `crypto` and `Buffer` from Node.js built-ins.

**Commands:**

```bash
# Get access token (JWT exchange)
node helpers/firestore-helper.mjs get-token
# → {"accessToken":"ya29.c.abc..."}

# Create/update document
node helpers/firestore-helper.mjs create-doc \
  "projects/e2e-test/builds/build-1" \
  '{"buildNumber":{"integerValue":"1"},"status":{"stringValue":"uploaded"}}' \
  "ya29.c.abc..."

# Read document
node helpers/firestore-helper.mjs read-doc \
  "projects/e2e-test/builds/build-1" \
  "ya29.c.abc..."
# → {"processingStatus":"completed","processedStoryCount":"1",...}

# Delete document
node helpers/firestore-helper.mjs delete-doc \
  "projects/e2e-test/builds/build-1" \
  "ya29.c.abc..."
```

**Implementation** — ported from `scry-build-processing-service/src/services/firestore/firestore.worker.ts`:

1. Parse PEM private key from `FIREBASE_PRIVATE_KEY` env var (handles `\\n` → `\n` conversion)
2. Build JWT: `{"alg":"RS256","typ":"JWT"}` header, `{iss, sub, aud, iat, exp, scope}` payload
3. Sign with `crypto.sign('sha256', unsignedToken, privateKey)` — native RSA-SHA256
4. Base64url encode header, payload, and signature
5. Exchange JWT assertion at `POST https://oauth2.googleapis.com/token`
6. Use access token as `Authorization: Bearer` for Firestore REST API calls

**Firestore REST API base URL:**
```
https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents
```

**Env vars:** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

### helpers/milvus-helper.mjs (~50 lines)

Standalone Node.js helper for Milvus/Zilliz Cloud REST API.

**Commands:**

```bash
# Query entities
node helpers/milvus-helper.mjs query \
  "scry-upload-api-key" \
  'project_id == "e2e-bps-123"' \
  "component_name,project_id"
# → {"data":[{"component_name":"E2EButton","project_id":"e2e-bps-123"}]}

# Delete entities
node helpers/milvus-helper.mjs delete \
  "scry-upload-api-key" \
  'project_id == "e2e-bps-123"'
```

**REST API endpoints:**
- Query: `POST https://{MILVUS_ADDRESS}/v2/vectordb/entities/query`
- Delete: `POST https://{MILVUS_ADDRESS}/v2/vectordb/entities/delete`
- Auth: `Authorization: Bearer {MILVUS_TOKEN}`

**Env vars:** `MILVUS_ADDRESS`, `MILVUS_TOKEN`

---

## Build Processing Scenario

### scenarios/build-processing/run.sh (~250 lines)

Sources `helpers/common.sh` for shared functions.

**CLI Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--service-url <url>` | `http://localhost:8788` | Processing service endpoint |
| `--r2-bucket <name>` | `my-storybooks-staging` | R2 bucket for test ZIP |
| `--milvus-collection <name>` | `$MILVUS_COLLECTION` or `scry-upload-api-key` | Milvus collection |
| `--skip-cleanup` | false | Keep test data for debugging |
| `--skip-search` | false | Skip search API verification |
| `--search-url <url>` | `http://localhost:3000` | Search API endpoint |
| `--timeout <seconds>` | `300` | Max wait for processing |
| `--dry-run` | false | Print commands without executing |
| `-h, --help` | | Usage info |

**Required env vars** (validated at startup with `die()` if missing):

| Variable | Used For |
|----------|----------|
| `FIREBASE_PROJECT_ID` | Firestore REST API base URL |
| `FIREBASE_CLIENT_EMAIL` | JWT `iss` and `sub` claims |
| `FIREBASE_PRIVATE_KEY` | JWT RSA-SHA256 signing |
| `MILVUS_ADDRESS` | Vector DB queries and cleanup |
| `MILVUS_TOKEN` | Vector DB auth |
| `CLOUDFLARE_ACCOUNT_ID` | Required by wrangler for R2 operations |

### Pipeline Steps

#### Step 1: Generate test identifiers

```bash
TIMESTAMP="$(date +%s)"
TEST_PROJECT_ID="e2e-bps-${TIMESTAMP}"
TEST_VERSION_ID="e2e-v${TIMESTAMP}"
TEST_BUILD_ID="e2e-build-${TIMESTAMP}"
TEST_ZIP_KEY="${TEST_PROJECT_ID}/${TEST_VERSION_ID}/storybook.zip"
```

Timestamp-based IDs ensure isolation between concurrent runs.

#### Step 2: Create test Storybook ZIP

Generate a minimal valid `metadata.json` and a 1x1 pixel red PNG (68 bytes via hex escape sequences):

```bash
TMP_DIR="$(mktemp -d)"
mkdir -p "${TMP_DIR}/screenshots"

# 1x1 red PNG (valid, 68 bytes)
printf '\x89\x50\x4e\x47...' > "${TMP_DIR}/screenshots/e2e-button--primary.png"

# metadata.json matching metadata-parser.ts expectations
cat > "${TMP_DIR}/metadata.json" << 'METADATA'
[{
  "filepath": "./src/components/E2EButton.stories.tsx",
  "componentName": "E2EButton",
  "testName": "Primary",
  "storyTitle": "E2E/Button",
  "screenshotPath": "screenshots/e2e-button--primary.png"
}]
METADATA

cd "${TMP_DIR}" && zip -r "${TMP_DIR}/storybook.zip" metadata.json screenshots/
```

#### Step 3: Upload ZIP to R2

```bash
wrangler r2 object put "${R2_BUCKET}/${TEST_ZIP_KEY}" --file "${TMP_DIR}/storybook.zip"
```

#### Step 4: Create Firestore build record

```bash
ACCESS_TOKEN=$(node "${HELPERS_DIR}/firestore-helper.mjs" get-token | jq -r '.accessToken')

node "${HELPERS_DIR}/firestore-helper.mjs" create-doc \
  "projects/${TEST_PROJECT_ID}/builds/${TEST_BUILD_ID}" \
  "{
    \"buildNumber\":{\"integerValue\":\"1\"},
    \"version\":{\"stringValue\":\"${TEST_VERSION_ID}\"},
    \"status\":{\"stringValue\":\"uploaded\"},
    \"zipKey\":{\"stringValue\":\"${TEST_ZIP_KEY}\"},
    \"processingStatus\":{\"stringValue\":\"queued\"},
    \"createdAt\":{\"timestampValue\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}
  }" \
  "${ACCESS_TOKEN}"
```

#### Step 5: Trigger processing

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVICE_URL}/process" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"${TEST_PROJECT_ID}\",
    \"versionId\": \"${TEST_VERSION_ID}\",
    \"buildId\": \"${TEST_BUILD_ID}\",
    \"zipKey\": \"${TEST_ZIP_KEY}\",
    \"timestamp\": ${TIMESTAMP}000
  }")

HTTP_CODE=$(echo "${RESPONSE}" | tail -1)
BODY=$(echo "${RESPONSE}" | sed '$d')

assert_eq "${HTTP_CODE}" "200" "processing HTTP status"
```

The `/process` endpoint is synchronous — it awaits the full pipeline and returns:
```json
{
  "projectId": "e2e-bps-1740225600",
  "buildId": "e2e-build-1740225600",
  "totalStories": 1,
  "processedStories": 1,
  "failedStories": 0,
  "status": "completed"
}
```

For a 1-story test, this takes 30–90 seconds.

#### Step 6: Poll Firestore (verification)

Belt-and-suspenders check that Firestore was updated correctly:

```bash
ELAPSED=0
while [[ ${ELAPSED} -lt ${TIMEOUT} ]]; do
  STATUS=$(node "${HELPERS_DIR}/firestore-helper.mjs" read-doc \
    "projects/${TEST_PROJECT_ID}/builds/${TEST_BUILD_ID}" \
    "${ACCESS_TOKEN}" | jq -r '.processingStatus // "unknown"')

  if [[ "${STATUS}" == "completed" || "${STATUS}" == "partial" || "${STATUS}" == "failed" ]]; then
    break
  fi
  sleep 15
  ELAPSED=$((ELAPSED + 15))
done

assert_eq "${STATUS}" "completed" "firestore processingStatus"
```

Assertions:
- `processingStatus` is `completed`
- `processedStoryCount` is `1`
- `totalStoryCount` is `1`
- `processingStartedAt` exists
- `processingCompletedAt` exists

#### Step 7: Verify Milvus insertion

```bash
MILVUS_RESULT=$(node "${HELPERS_DIR}/milvus-helper.mjs" query \
  "${MILVUS_COLLECTION}" \
  "project_id == \"${TEST_PROJECT_ID}\"" \
  "component_name,project_id")

RECORD_COUNT=$(echo "${MILVUS_RESULT}" | jq '.data | length')
COMPONENT=$(echo "${MILVUS_RESULT}" | jq -r '.data[0].component_name // "none"')

assert_eq "${RECORD_COUNT}" "1" "milvus record count"
assert_eq "${COMPONENT}" "E2EButton" "milvus component_name"
```

**Note on field names:** This scenario should run only after the Milvus field-name fix in `vector-inserter.ts` (`text_embedding`, `image_embedding`, `searchable_text`) is applied. Treat that fix as a precondition for stable E2E results.

#### Step 8: Optional search verification

If `--skip-search` is not set and the search URL is reachable:

```bash
SEARCH_RESULT=$(curl -s -X POST "${SEARCH_URL}/api/search" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"E2EButton\",\"project_id\":\"${TEST_PROJECT_ID}\",\"limit\":5}")

SEARCH_COUNT=$(echo "${SEARCH_RESULT}" | jq '.results | length')
log "Search returned ${SEARCH_COUNT} results"
```

This step is non-blocking — logs the result but does not fail the overall test. The search API may not be running, or prerequisites (including the Milvus field-name fix) may not be in place.

#### Step 9: Cleanup

Runs in a `trap` handler so it executes even on script failure (skipped with `--skip-cleanup`):

```bash
cleanup() {
  if [[ "${SKIP_CLEANUP}" == true ]]; then
    log "Skipping cleanup (--skip-cleanup)"
    return
  fi

  # R2
  wrangler r2 object delete "${R2_BUCKET}/${TEST_ZIP_KEY}" 2>/dev/null || true

  # Firestore
  node "${HELPERS_DIR}/firestore-helper.mjs" delete-doc \
    "projects/${TEST_PROJECT_ID}/builds/${TEST_BUILD_ID}" \
    "${ACCESS_TOKEN}" 2>/dev/null || true

  # Milvus
  node "${HELPERS_DIR}/milvus-helper.mjs" delete \
    "${MILVUS_COLLECTION}" \
    "project_id == \"${TEST_PROJECT_ID}\"" 2>/dev/null || true

  # Temp files
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT
```

#### Step 10: Summary + JSON output

```
[e2e-build-processing] ────────────────────────
[e2e-build-processing] Summary:
[e2e-build-processing]   zip_creation      = pass
[e2e-build-processing]   r2_upload         = pass
[e2e-build-processing]   firestore_create  = pass
[e2e-build-processing]   processing        = pass (completed, 1/1 stories)
[e2e-build-processing]   firestore_verify  = pass
[e2e-build-processing]   milvus_verify     = pass (1 record)
[e2e-build-processing]   search_verify     = skipped
[e2e-build-processing]   cleanup           = pass
[e2e-build-processing]   duration          = 47s
[e2e-build-processing]   result            = PASS
[e2e-build-processing] ────────────────────────
```

Writes `scenarios/build-processing/result.json`:

```json
{
  "scenario": "build-processing",
  "timestamp": "2026-02-22T12:00:00Z",
  "duration_seconds": 47,
  "result": "pass",
  "steps": {
    "zip_creation": {"status": "pass"},
    "r2_upload": {"status": "pass"},
    "firestore_create": {"status": "pass"},
    "processing_trigger": {"status": "pass", "processingStatus": "completed"},
    "firestore_verify": {"status": "pass"},
    "milvus_verify": {"status": "pass", "recordCount": 1},
    "search_verify": {"status": "skipped"},
    "cleanup": {"status": "pass"}
  },
  "testData": {
    "projectId": "e2e-bps-1740225600",
    "buildId": "e2e-build-1740225600",
    "zipKey": "e2e-bps-1740225600/e2e-v1740225600/storybook.zip"
  }
}
```

Exit code 0 = all assertions passed, 1 = any failure.

---

## Scenario Runner

### run-all.sh (~50 lines)

```bash
# Run all scenarios
bash run-all.sh

# Run specific scenario
bash run-all.sh --scenario build-processing

# Pass flags through to all scenarios
bash run-all.sh --dry-run --skip-cleanup
```

Iterates over `scenarios/*/run.sh`, runs each, collects exit codes, prints overall summary:

```
[e2e] ────────────────────────
[e2e] Results:
[e2e]   build-processing  PASS  (47s)
[e2e]   upload-and-serve  PASS  (12s)    # future scenario
[e2e] ────────────────────────
[e2e] Overall: 2/2 passed
```

---

## GitHub Actions Workflow

### .github/workflows/e2e.yml

```yaml
name: E2E Tests

on:
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Scenario to run (blank = all)'
        required: false
        default: ''
      service_url:
        description: 'Processing service URL (blank = start local wrangler dev)'
        required: false
        default: ''

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install wrangler
        run: npm install -g wrangler

      - name: Determine service URL
        id: url
        run: |
          if [ -n "${{ inputs.service_url }}" ]; then
            echo "url=${{ inputs.service_url }}" >> "$GITHUB_OUTPUT"
          else
            echo "url=http://localhost:8788" >> "$GITHUB_OUTPUT"
          fi

      - name: Start local processing service (if no URL provided)
        if: inputs.service_url == ''
        run: |
          # Clone and start the processing service
          git clone https://x-access-token:${{ secrets.CROSS_REPO_PAT }}@github.com/epinnock/scry-build-processing-service.git /tmp/bps
          cd /tmp/bps && npm install

          # Create .dev.vars
          cat > .dev.vars << EOF
          OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
          JINA_API_KEY=${{ secrets.JINA_API_KEY }}
          MILVUS_ADDRESS=${{ secrets.MILVUS_ADDRESS }}
          MILVUS_TOKEN=${{ secrets.MILVUS_TOKEN }}
          FIREBASE_PROJECT_ID=${{ secrets.FIREBASE_PROJECT_ID }}
          FIREBASE_CLIENT_EMAIL=${{ secrets.FIREBASE_CLIENT_EMAIL }}
          FIREBASE_PRIVATE_KEY=${{ secrets.FIREBASE_PRIVATE_KEY }}
          EOF

          npx wrangler dev --port 8788 &
          # Wait for ready
          READY=false
          for i in $(seq 1 30); do
            if curl -sf http://localhost:8788/ > /dev/null; then
              READY=true
              break
            fi
            sleep 2
          done
          if [ "${READY}" != "true" ]; then
            echo "Processing service failed to start on http://localhost:8788" >&2
            exit 1
          fi

      - name: Run E2E
        run: |
          ARGS="--service-url ${{ steps.url.outputs.url }}"
          if [ -n "${{ inputs.scenario }}" ]; then
            ARGS="${ARGS} --scenario ${{ inputs.scenario }}"
          fi
          bash run-all.sh ${ARGS}
        env:
          FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          FIREBASE_CLIENT_EMAIL: ${{ secrets.FIREBASE_CLIENT_EMAIL }}
          FIREBASE_PRIVATE_KEY: ${{ secrets.FIREBASE_PRIVATE_KEY }}
          MILVUS_ADDRESS: ${{ secrets.MILVUS_ADDRESS }}
          MILVUS_TOKEN: ${{ secrets.MILVUS_TOKEN }}
          MILVUS_COLLECTION: ${{ secrets.MILVUS_COLLECTION }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: scenarios/*/result.json
          retention-days: 7
```

**Secrets required:**

| Secret | Purpose |
|--------|---------|
| `CROSS_REPO_PAT` | Clone processing service repo (for local mode) |
| `OPENAI_API_KEY` | Processing service needs it (local mode only) |
| `JINA_API_KEY` | Processing service needs it (local mode only) |
| `MILVUS_ADDRESS` | Milvus cluster endpoint |
| `MILVUS_TOKEN` | Milvus auth |
| `MILVUS_COLLECTION` | Target collection |
| `FIREBASE_PROJECT_ID` | Firestore project (staging) |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account RSA key |
| `CLOUDFLARE_ACCOUNT_ID` | For wrangler R2 operations |
| `CLOUDFLARE_API_TOKEN` | For wrangler R2 operations |

---

## Adding New Scenarios

To add a new E2E scenario (e.g., `upload-and-serve`, `search-reindexing`):

1. Create directory: `scenarios/<name>/`
2. Create `scenarios/<name>/run.sh`:
   ```bash
   #!/usr/bin/env bash
   set -u -o pipefail
   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
   E2E_PREFIX="e2e-<name>"
   source "${REPO_ROOT}/helpers/common.sh"

   # Scenario-specific flags and steps...
   ```
3. Use shared helpers as needed (`firestore-helper.mjs`, `milvus-helper.mjs`)
4. Write `scenarios/<name>/result.json` using `write_summary()`
5. `run-all.sh` automatically discovers and runs it

---

## .env.example

```bash
# Firebase service account
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Milvus / Zilliz Cloud
MILVUS_ADDRESS=your-cluster.api.gcp-us-west1.zillizcloud.com
MILVUS_TOKEN=your-api-token
MILVUS_COLLECTION=scry-upload-api-key

# Cloudflare (for R2 operations via wrangler)
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token

# Service URLs (for remote/staging testing)
# BUILD_PROCESSING_URL=https://scry-build-processing-service.workers.dev
# SEARCH_API_URL=https://search.scrymore.com
```

---

## Critical Reference Files

| File | What to reuse |
|------|---------------|
| `scry-ops/scripts/pull-all-repos.sh` | Bash conventions: arg parsing, log(), summary, exit codes |
| `scry-ops/scripts/sync-service-metadata.sh` | Flag parsing pattern, dry-run pattern |
| `scry-build-processing-service/src/services/firestore/firestore.worker.ts` | JWT creation, Firestore REST API auth |
| `scry-build-processing-service/src/pipeline/metadata-parser.ts` | Expected metadata.json schema |
| `scry-build-processing-service/src/pipeline/vector-inserter.ts` | Milvus field names (see Known Issues in 00-overview.md) |
| `scry-build-processing-service/src/entry.worker.ts` | POST /process request/response contract |
| `scry-build-processing-service/src/types.ts` | ProcessingResult type |

---

## Implementation Order

1. `helpers/common.sh` — shared bash functions
2. `helpers/firestore-helper.mjs` — Firestore JWT auth + CRUD
3. `helpers/milvus-helper.mjs` — Milvus query/delete
4. `scenarios/build-processing/run.sh` — first scenario
5. `run-all.sh` — scenario runner
6. `.env.example` — env var template
7. `README.md` — usage docs
8. `.github/workflows/e2e.yml` — CI workflow

---

## Cost Estimate

Each run of the build processing scenario with real APIs:

| API | Cost per run (1 story) | Notes |
|-----|----------------------|-------|
| OpenAI GPT-4 Vision | ~$0.01–0.03 | 1 image, 1 API call |
| Jina Embeddings | ~$0.001 | 2 calls (image + text) |
| Zilliz Cloud | Free tier | 1 insert + 1 query + 1 delete |
| R2 | Free tier | 1 PUT + 1 DELETE |
| Firestore | Free tier | 3 operations |
| **Total** | **~$0.03** | |

---

## Verification

1. **Dry run**: `bash scenarios/build-processing/run.sh --dry-run` — prints all commands without executing
2. **Local smoke test**: Start `wrangler dev` in build-processing-service, run `bash scenarios/build-processing/run.sh`
3. **Run all**: `bash run-all.sh` — discovers and runs all scenarios
4. **CI**: Trigger `e2e.yml` via `workflow_dispatch`, check artifacts for `result.json`
5. **Cleanup check**: Run with `--skip-cleanup`, verify test data in Firestore/Milvus/R2, then re-run to clean
6. **Agent consumption**: Parse `result.json` programmatically — `result` field is `"pass"` or `"fail"`
