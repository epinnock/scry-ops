# 01 – Local E2E Testing Guide: Build Processing Pipeline

Manual walkthrough for testing the full upload → processing → search pipeline locally.

---

## Prerequisites

### Accounts & Credentials

You need active credentials for these services:

| Service | What you need | Where to get it |
|---------|--------------|-----------------|
| Cloudflare R2 | Account ID, S3 access key pair | Cloudflare Dashboard → R2 → Manage R2 API Tokens |
| Firebase | Service account JSON (project ID, client email, private key) | Firebase Console → Project Settings → Service Accounts |
| OpenAI | API key with GPT-4 Vision access | platform.openai.com/api-keys |
| Jina AI | API key | jina.ai/embeddings |
| Zilliz Cloud | Cluster endpoint + API token | cloud.zilliz.com |

### Tools

```bash
node --version   # v20+
npm --version    # v10+
wrangler --version  # v4+

# Install wrangler globally if missing
npm install -g wrangler
```

### Clone the repos

```bash
cd ~/scry
# If not already cloned:
git clone git@github.com:epinnock/scry-storybook-upload-service.git
git clone git@github.com:epinnock/scry-build-processing-service.git
git clone git@github.com:epinnock/scry-nextjs.git
```

---

## Step 1: Configure Environment Files

### Upload Service

```bash
cd ~/scry/scry-storybook-upload-service
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:
```
R2_ACCOUNT_ID=<your-cloudflare-account-id>
R2_S3_ACCESS_KEY_ID=<your-r2-s3-access-key>
R2_S3_SECRET_ACCESS_KEY=<your-r2-s3-secret>
R2_BUCKET_NAME=my-storybooks-staging
FIREBASE_PROJECT_ID=<your-firebase-project>
FIREBASE_CLIENT_EMAIL=<service-account@project.iam.gserviceaccount.com>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
```

### Build Processing Service

```bash
cd ~/scry/scry-build-processing-service
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:
```
OPENAI_API_KEY=sk-...
JINA_API_KEY=jina_...
MILVUS_ADDRESS=<your-cluster>.api.gcp-us-west1.zillizcloud.com
MILVUS_TOKEN=<your-zilliz-api-token>
FIREBASE_PROJECT_ID=<your-firebase-project>
FIREBASE_CLIENT_EMAIL=<service-account@project.iam.gserviceaccount.com>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SENTRY_DSN=
```

### Search API (optional, for verifying search results)

```bash
cd ~/scry/scry-nextjs
```

Create `.env.local`:
```
JINA_API_KEY=jina_...
MILVUS_ADDRESS=<same-cluster-as-above>
MILVUS_TOKEN=<same-token-as-above>
MILVUS_COLLECTION=<your-collection-name>
MILVUS_ENABLE_DENSE=true
MILVUS_ENABLE_SPARSE=false
MILVUS_ENABLE_IMAGE=true
MILVUS_RANKER=weighted
MILVUS_NORMALIZE_WEIGHTS=true
```

---

## Step 2: Install Dependencies

```bash
cd ~/scry/scry-storybook-upload-service && npm install
cd ~/scry/scry-build-processing-service && npm install
cd ~/scry/scry-nextjs && npm install   # optional
```

---

## Step 3: Prepare a Test Storybook ZIP

You need a Storybook ZIP that contains `metadata.json` and screenshot images. The ZIP structure should be:

```
storybook.zip
├── metadata.json
└── images/
    ├── button--primary.png
    ├── button--secondary.png
    └── card--default.png
```

The `metadata.json` format expected by `metadata-parser.ts`:

```json
[
  {
    "filepath": "./src/components/Button.stories.tsx",
    "componentName": "Button",
    "testName": "Primary",
    "storyTitle": "Components/Button",
    "screenshotPath": "images/button--primary.png"
  },
  {
    "filepath": "./src/components/Button.stories.tsx",
    "componentName": "Button",
    "testName": "Secondary",
    "storyTitle": "Components/Button",
    "screenshotPath": "images/button--secondary.png"
  }
]
```

If you have an existing Storybook project, generate this with `scry deploy` (dry run) or manually create a small test ZIP.

### Quick test ZIP creation

```bash
mkdir -p /tmp/test-storybook/images

# Create a minimal metadata.json
cat > /tmp/test-storybook/metadata.json << 'EOF'
[
  {
    "filepath": "./src/components/Button.stories.tsx",
    "componentName": "Button",
    "testName": "Primary",
    "storyTitle": "Components/Button",
    "screenshotPath": "images/button--primary.png"
  }
]
EOF

# Create a placeholder screenshot (1x1 red PNG works for testing)
# Or copy a real screenshot into /tmp/test-storybook/images/button--primary.png

cd /tmp/test-storybook
zip -r /tmp/storybook.zip metadata.json images/
```

---

## Step 4: Upload the Test ZIP to R2

Upload directly to R2 staging using wrangler or the S3 API. The key must follow the convention: `{projectId}/{version}/storybook.zip`

### Option A: Using wrangler (simplest)

```bash
wrangler r2 object put \
  my-storybooks-staging/test-project/1.0.0/storybook.zip \
  --file /tmp/storybook.zip
```

### Option B: Using the upload service API

If you have a valid API key for a project in Firestore, you can upload through the service itself:

```bash
# Terminal 1: Start upload service
cd ~/scry/scry-storybook-upload-service
wrangler dev

# Terminal 2: Upload
curl -X POST http://localhost:8787/upload/test-project/1.0.0 \
  -H "X-API-Key: scry_proj_<your-api-key>" \
  -F "file=@/tmp/storybook.zip"
```

This method also creates the Firestore build record and (if the queue binding is configured) enqueues the processing message automatically. However, the Cloudflare Queue binding won't work in local dev, so you'll still need to trigger processing manually in Step 6.

---

## Step 5: Create a Firestore Build Record (if you used Option A)

If you uploaded directly to R2 (Option A), you need a build record in Firestore for the processing service to update status. Create one manually via the Firebase Console or Firebase Admin SDK:

**Collection:** `projects/{projectId}/builds/{buildId}`

```json
{
  "buildNumber": 1,
  "version": "1.0.0",
  "status": "uploaded",
  "zipKey": "test-project/1.0.0/storybook.zip",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

Note the document ID — you'll use it as `buildId` in Step 6.

---

## Step 6: Start the Build Processing Service and Trigger

### Terminal setup

Open 2 terminals (3 if you want to verify search):

```
Terminal 1: Build Processing Service (port 8788)
Terminal 2: curl commands
Terminal 3: Search API (port 3000) — optional
```

### Terminal 1: Start the processing service

```bash
cd ~/scry/scry-build-processing-service
wrangler dev
```

You should see:
```
⎔ Starting local server...
Ready on http://0.0.0.0:8788
```

### Terminal 2: Trigger processing

```bash
curl -X POST http://localhost:8788/process \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project",
    "versionId": "1.0.0",
    "buildId": "<firestore-build-doc-id>",
    "zipKey": "test-project/1.0.0/storybook.zip",
    "timestamp": 1700000000000
  }'
```

### What to watch for

In Terminal 1 (wrangler dev logs), you should see the pipeline steps:

```
[ZIP] Downloading: test-project/1.0.0/storybook.zip
[ZIP] Extracted: 1 files from metadata, 1 screenshots
[METADATA] Parsed 1 stories, 1 with screenshots
[LLM] Inspecting batch 1/1 (1 stories)...
[LLM] Batch 1 complete: 1 results
[EMBED] Generating image embeddings batch 1/1...
[EMBED] Generating text embeddings batch 1/1...
[MILVUS] Batch 1 inserted: 1 records
[FIRESTORE] Updated build status: completed (1/1 stories)
```

### Expected response

```json
{
  "projectId": "test-project",
  "buildId": "test-build-id",
  "totalStories": 1,
  "processedStories": 1,
  "failedStories": 0,
  "status": "completed"
}
```

---

## Step 7: Verify Results

### 7a. Check Firestore build status

In the Firebase Console, navigate to:
```
projects/{projectId}/builds/{buildId}
```

Verify these fields were added:
- `processingStatus`: `"completed"`
- `processingStartedAt`: ISO timestamp
- `processingCompletedAt`: ISO timestamp
- `processedStoryCount`: 1
- `totalStoryCount`: 1

### 7b. Check Milvus / Zilliz Cloud

In the Zilliz Cloud console, query the collection:

```
Filter: project_id == "test-project"
```

Or via the REST API:

```bash
curl -X POST "https://<your-cluster>/v2/vectordb/entities/query" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionName": "<your-collection>",
    "filter": "project_id == \"test-project\"",
    "outputFields": ["primary_key", "component_name", "searchable_text", "project_id"],
    "limit": 10
  }'
```

Verify:
- Record exists with `component_name` = `"Button"` (or whatever your test story had)
- `searchable_text` contains the LOR (description + tags + search queries)
- `text_embedding` is a 2048-dim vector (first 1024 are non-zero, last 1024 are zeros)
- `image_embedding` is a 2048-dim vector

### 7c. Verify search works (optional)

```bash
# Terminal 3: Start search API
cd ~/scry/scry-nextjs
npm run dev
```

Then search for the component:

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "text": "button primary",
    "weights": { "dense": 1.0, "image": 0.0 },
    "limit": 5
  }'
```

The response should include your test component in the results.

---

## Troubleshooting

### "ZIP not found" error

```
[ZIP] Error: Object not found: test-project/1.0.0/storybook.zip
```

The R2 object key doesn't match. Verify:
```bash
wrangler r2 object list my-storybooks-staging --prefix "test-project/"
```

### "metadata.json not found in ZIP"

Your ZIP doesn't have `metadata.json` at the root level. Check:
```bash
unzip -l /tmp/storybook.zip
```

The file should be at the root (`metadata.json`), not nested (`some-folder/metadata.json`).

### OpenAI API errors

```
[LLM] Inspection failed: 429 Too Many Requests
```

Rate limited. Wait 60 seconds and retry. For testing, reduce the number of stories in your test ZIP.

```
[LLM] Inspection failed: 400 Bad Request
```

Usually means the base64 image is invalid or too large. OpenAI Vision accepts PNG/JPEG up to 20MB per image.

### Jina embedding errors

```
[EMBED] Error: 401 Unauthorized
```

Check `JINA_API_KEY` in `.dev.vars`. The key should start with `jina_`.

### Milvus insert errors

```
[MILVUS] Insert error 400: collection not found
```

Check that `MILVUS_COLLECTION` in `wrangler.toml` matches an existing collection in your Zilliz Cloud cluster. The default is `scry-upload-api-key`.

```
[MILVUS] Insert error 400: dimension mismatch
```

The collection expects 2048-dim vectors. If the collection was created with a different dimension, you'll need to recreate it or use a different collection.

### Firestore update errors

```
[FIRESTORE] Failed to update status: 403 Forbidden
```

The service account doesn't have write access. Verify `FIREBASE_CLIENT_EMAIL` has the `Cloud Datastore User` role in Google Cloud IAM.

### Queue not working in local dev

Cloudflare Queues do not work with `wrangler dev`. This is expected. Use the `POST /process` HTTP endpoint instead. The queue path is only active in deployed workers.

---

## Cleanup

After testing, remove test data:

### Remove test vectors from Milvus

```bash
curl -X POST "https://<your-cluster>/v2/vectordb/entities/delete" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionName": "<your-collection>",
    "filter": "project_id == \"test-project\""
  }'
```

### Remove test ZIP from R2

```bash
wrangler r2 object delete my-storybooks-staging/test-project/1.0.0/storybook.zip
```

### Remove test build from Firestore

Delete the build document via Firebase Console:
```
projects/test-project/builds/{buildId}
```

---

## Cost Estimate

Each run through the pipeline with real APIs costs:

| API | Cost per story (approx) | Notes |
|-----|------------------------|-------|
| OpenAI GPT-4 Vision | ~$0.01–0.03 | Depends on image size, batched 5/call |
| Jina Embeddings | ~$0.001 | 2 calls per story (image + text) |
| Zilliz Cloud | Free tier covers testing | 1 insert per story |

A test run with 1–5 stories costs under $0.20.
