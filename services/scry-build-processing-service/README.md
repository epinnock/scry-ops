# scry-build-processing-service

Async build processing pipeline for the Scry platform. Receives Cloudflare Queue messages after a Storybook build is uploaded, then processes the build for search indexing.

## Overview

**Stack**: TypeScript, Hono, Cloudflare Workers, Cloudflare Queues

**Pipeline**:
```
Queue message (from upload-service)
  → ZIP extraction from R2
  → LLM story inspection (OpenAI)
  → Searchable text generation
  → Embeddings (Jina AI)
  → Vector insertion (Milvus / Zilliz Cloud)
```

**Trigger**: A Cloudflare Queue message is sent by `scry-storybook-upload-service` after a successful build upload.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- A [Cloudflare account](https://dash.cloudflare.com/) with Workers and Queues enabled
- Access to the following external services (see [Environment Variables](#environment-variables)):
  - OpenAI API key
  - Jina AI API key
  - Milvus / Zilliz Cloud cluster
  - Cloudflare R2 bucket

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/epinnock/scry-build-processing-service.git
   cd scry-build-processing-service
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure local secrets**

   Copy the example dev vars file:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Fill in the values in `.dev.vars` (see [Environment Variables](#environment-variables) below). This file is gitignored and only used by Wrangler during local development.

4. **Start the local dev server**

   ```bash
   npm run dev
   # or
   wrangler dev
   ```

   The worker runs at `http://localhost:8787` by default.

### Simulating a Queue Message Locally

Cloudflare Queues are not available in the local Wrangler dev environment. To test queue processing locally, you can send an HTTP request that simulates the queue payload directly to the worker's internal queue handler, or use the Wrangler `--test-scheduled` flag if the handler is exposed via a test route.

Alternatively, use the staging environment (see [Deployment](#deployment)) to test end-to-end with real queue messages.

## Environment Variables

The following secrets are required. For local development, set them in `.dev.vars`. For deployed workers, set them via `wrangler secret put` or the Cloudflare dashboard.

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for LLM story inspection |
| `JINA_API_KEY` | Jina AI API key for generating embeddings |
| `MILVUS_URI` | Zilliz Cloud / Milvus cluster URI |
| `MILVUS_TOKEN` | Authentication token for Milvus |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket containing uploaded Storybook ZIPs |
| `R2_ENDPOINT` | R2 S3-compatible endpoint URL |
| `FIRESTORE_PROJECT_ID` | Google Cloud / Firebase project ID (`scry-production` or `scry-staging`) |
| `FIRESTORE_CLIENT_EMAIL` | Service account email for Firestore access |
| `FIRESTORE_PRIVATE_KEY` | Service account private key for Firestore access |

> **Note**: Sensitive secrets should never be committed to the repository.

## Testing

Run the full test suite:

```bash
npm test
```

Tests use [Vitest](https://vitest.dev/) with Cloudflare Workers test utilities. The test suite covers queue message handling, ZIP extraction, and the processing pipeline.

To run tests in watch mode:

```bash
npm run test:watch
```

To check test coverage:

```bash
npm run test:coverage
```

## Deployment

### Prerequisites

- Wrangler CLI authenticated: `wrangler login`
- Cloudflare account with Workers, Queues, and R2 enabled
- All secrets configured (see [Environment Variables](#environment-variables))

### Deploy to Staging

```bash
wrangler deploy --env staging
```

### Deploy to Production

```bash
wrangler deploy --env production
```

### Configure Secrets for a Deployed Worker

Use `wrangler secret put` for each secret:

```bash
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put JINA_API_KEY --env production
wrangler secret put MILVUS_URI --env production
wrangler secret put MILVUS_TOKEN --env production
# ... repeat for all secrets
```

### Queue Binding

The worker is bound to a Cloudflare Queue as a consumer. The queue is configured in `wrangler.toml`. The `scry-storybook-upload-service` is the producer — it sends a message to the queue after each successful build upload.

Ensure the queue exists in your Cloudflare account before deploying:

```bash
wrangler queues create scry-build-processing-queue
```

### View Logs

Stream live logs from the deployed worker:

```bash
wrangler tail --env production
```

## Data Flow

```
scry-storybook-upload-service
  └─ writes: {project}/{version}/builds/{buildNumber}/storybook.zip → R2
  └─ sends:  Queue message with project/version/build metadata

scry-build-processing-service (this service)
  └─ receives Queue message
  └─ fetches storybook.zip from R2
  └─ extracts and inspects stories (OpenAI)
  └─ generates searchable text
  └─ generates embeddings (Jina AI)
  └─ inserts vectors into Milvus
```

## Related Services

| Service | Role |
|---|---|
| [scry-storybook-upload-service](https://github.com/epinnock/scry-storybook-upload-service) | Sends queue messages that trigger this service |
| [scry-nextjs](https://github.com/epinnock/scry-nextjs) | Search API that queries the Milvus vectors this service produces |
| [scry-cdn-service](https://github.com/epinnock/scry-cdn-service) | Serves the Storybook files stored in R2 |
