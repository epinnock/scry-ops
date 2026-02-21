# 00 – Feature Overview: Async Build Processing Pipeline

## Goal

Automatically process uploaded Storybook builds for multimodal search indexing. When a build is uploaded via the upload service, a queue message triggers the processing pipeline — extracting stories from the ZIP, inspecting screenshots with an LLM, generating embeddings, and inserting vectors into the search database.

**This replaces** the manual local scripts in `scry-nextjs/scripts/` (`inspect-component.cjs`, `analyze-storybook.cjs`, `generate-embeddings.cjs`) with an automated, production-grade Cloudflare Worker.

---

## Key Features

1. **Queue-Driven Processing** – Cloudflare Queues decouple upload from processing; automatic retries and dead-letter queue
2. **LLM Component Inspection** – OpenAI Vision API analyzes each screenshot for description, tags, and search queries
3. **Dual-Modal Embeddings** – Jina AI generates both text and image embeddings (1024-dim each, padded to 2048)
4. **Vector Search Indexing** – Processed stories are inserted into Zilliz Cloud (Milvus) for the search API
5. **Status Tracking** – Firestore build records updated with processing lifecycle (`queued` → `processing` → `completed`)
6. **Partial Success Handling** – Individual story failures don't block the entire build; status marked `partial`

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Upload Service                                                             │
│  POST /api/projects/:id/builds                                              │
│    ├── writes ZIP ──────────────────────────────────► R2 Bucket              │
│    ├── creates build record ────────────────────────► Firestore              │
│    └── enqueues message ──┐                                                 │
└───────────────────────────┼─────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────┐
│  Cloudflare Queue                     │
│  scry-build-processing                │
│  (max_retries: 3)                     │
│    └── on failure ──► DLQ             │
└───────────────┬───────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Build Processing Service (Queue Consumer)                                │
│                                                                           │
│  1. ZIP Extractor ──── downloads from R2 ──► fflate unzip                 │
│  2. Metadata Parser ── metadata.json + screenshots ──► StoryItem[]        │
│  3. LLM Inspector ──── batches of 5 ──────────────────► OpenAI Vision API │
│  4. Searchable Text ── description + tags + queries ──► LOR string        │
│  5. Embedding Gen ──── batches of 10 ─────────────────► Jina AI API       │
│  6. Vector Inserter ── batches of 50 ─────────────────► Zilliz Cloud      │
│  7. Status Update ──── processing result ─────────────► Firestore         │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Processing Pipeline

```
Upload Service
  │
  │  send({ projectId, versionId, buildId, zipKey, timestamp })
  ▼
Cloudflare Queue ──► Build Processing Worker
  │
  │  1. Update Firestore: processingStatus = "processing"
  │
  │  2. Download ZIP from R2 (env.STORYBOOK_BUCKET.get(zipKey))
  │     └── fflate unzipSync() → metadata.json + screenshot PNGs
  │
  │  3. Parse metadata.json, match stories to screenshot bytes
  │     └── produces StoryItem[] (storyId, componentName, screenshotBytes)
  │
  │  4. LLM Inspection (batches of 5, max 2 concurrent, 2s delay)
  │     ├── POST https://api.openai.com/v1/chat/completions
  │     ├── Batch prompt with base64 screenshots
  │     └── Parse XML response → { description, tags, searchQueries }
  │
  │  5. Create searchable text (LOR) for each story
  │     └── description + tags + searchQueries + static terms
  │
  │  6. Generate embeddings (batches of 10, max 2 concurrent, 1s delay)
  │     ├── POST https://api.jina.ai/v1/embeddings (image: base64)
  │     ├── POST https://api.jina.ai/v1/embeddings (text: LOR string)
  │     └── Both return 1024-dim vectors
  │
  │  7. Pad vectors 1024 → 2048 dimensions
  │
  │  8. Insert into Milvus (batches of 50)
  │     └── POST https://{cluster}/v2/vectordb/entities/insert
  │
  │  9. Update Firestore: processingStatus = "completed" | "partial" | "failed"
  │
  ▼
message.ack() (success) or message.retry() (failure, up to 3x)
```

---

## Queue Message Schema

```typescript
interface QueueMessage {
  projectId: string;    // Scry project ID
  versionId: string;    // Semantic version or branch name
  buildId: string;      // Firestore build document ID
  zipKey: string;       // R2 object key: {project}/{version}/builds/{buildNumber}/storybook.zip
  timestamp: number;    // Enqueue time (Date.now())
}
```

### Queue Configuration

| Property | Value | Rationale |
|----------|-------|-----------|
| `max_batch_size` | 1 | Each build is processed independently |
| `max_retries` | 3 | Tolerate transient API failures |
| `dead_letter_queue` | `scry-build-processing-dlq` | Capture permanently failed builds |
| `max_batch_timeout` | 30s | Wait for queue batch fill |
| `max_concurrency` | 5 | Parallel build processing |
| `retry_delay` | 60s | Back off before retry |

---

## Firestore Build Status Extension

Processing adds these fields to existing Build documents in Firestore:

```typescript
interface ProcessingStatusUpdate {
  processingStatus: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  processingStartedAt?: string;     // ISO timestamp
  processingCompletedAt?: string;   // ISO timestamp
  processedStoryCount?: number;
  totalStoryCount?: number;
  processingError?: string;
}
```

**Status transitions:**
```
Upload completes → queued → processing → completed
                                       → partial (some stories failed)
                                       → failed (unrecoverable error)
```

---

## Milvus Vector Schema

Field names must match what `scry-nextjs` queries against in `search-utils.ts`:

| Field | Type | Description |
|-------|------|-------------|
| `primary_key` | INT64 | `Date.now() + batchIndex` |
| `text_embedding` | FLOAT_VECTOR(2048) | Padded text embedding (1024 + 1024 zeros) |
| `image_embedding` | FLOAT_VECTOR(2048) | Padded image embedding (1024 + 1024 zeros) |
| `searchable_text` | VARCHAR(65535) | Searchable text / LOR (Lexical Object Representation) |
| `component_name` | VARCHAR | Component display name |
| `project_id` | VARCHAR | Scry project ID |
| `timestamp` | INT64 | Processing timestamp |
| `json_content` | JSON | Full inspection result + story metadata |

**Field name note:** The original `vectorutils.cjs` schema definition uses `text_dense`, `image_dense`, and `text`, but `transformStoryData()` actually inserts with `text_embedding`, `image_embedding`, and `searchable_text` — and those are the names that `scry-nextjs/search-utils.ts` queries against. The processing service must use the query-side names.

---

## Subproject Responsibilities

| Subproject | Responsibility |
|------------|----------------|
| `scry-build-processing-service` | **New service** — queue consumer, full processing pipeline |
| `scry-storybook-upload-service` | Queue producer — enqueue message after successful build creation |
| `scry-ops` | Service registry — add to repo-map.yml, CLAUDE.md, issue templates |
| `scry-developer-dashboard` | No changes (reads existing Firestore build records) |
| `scry-cdn-service` | No changes |
| `scry-node` | No changes |
| `scry-nextjs` | No changes (scripts being replaced remain for local use) |

---

## Per-Service Changes

### scry-build-processing-service (new)

New Cloudflare Worker with queue consumer. Full directory structure:

```
scry-build-processing-service/
├── .github/workflows/deploy.yml
├── package.json
├── tsconfig.json
├── wrangler.toml
├── vitest.config.ts
└── src/
    ├── entry.worker.ts           # Dual handler: fetch (health) + queue (processing)
    ├── types.ts                  # QueueMessage, StoryItem, ProcessingResult, Env
    ├── pipeline/
    │   ├── index.ts              # Orchestrator: processBuild(env, message)
    │   ├── zip-extractor.ts      # R2 download + fflate extraction
    │   ├── metadata-parser.ts    # Parse metadata.json, match screenshots
    │   ├── llm-inspector.ts      # OpenAI Vision batch inspection
    │   ├── searchable-text.ts    # LOR generation from inspection results
    │   ├── embedding-generator.ts # Jina API: image + text embeddings
    │   ├── vector-inserter.ts    # Zilliz Cloud REST API insertion
    │   └── prompt.ts             # Component inspector prompt constant
    ├── services/firestore/
    │   ├── firestore.service.ts  # Interface
    │   ├── firestore.types.ts    # Build types with processing fields
    │   └── firestore.worker.ts   # REST API + JWT auth implementation
    └── utils/
        ├── base64.ts             # Uint8Array → base64 for Workers
        ├── batch-processor.ts    # Generic concurrent batch utility
        ├── vector-utils.ts       # padVector(vec, 2048)
        └── xml-parser.ts         # XML → JSON for LLM responses
```

**Dependencies:** `hono`, `fflate`, `@sentry/cloudflare`, `zod`
**No heavyweight SDKs** — all external API calls via raw `fetch()`.

### scry-storybook-upload-service (modified)

| File | Change |
|------|--------|
| `wrangler.toml` | Add `[[queues.producers]]` binding for `BUILD_PROCESSING_QUEUE` |
| `src/entry.worker.ts` | Add `BUILD_PROCESSING_QUEUE?: Queue` to Bindings, inject via middleware |
| `src/app.ts` | Add `processingQueue?: Queue` to AppEnv; enqueue message after `createBuild()` |

Queue enqueue is fire-and-forget with try/catch — upload success is never blocked by queue failures.

### scry-ops (modified)

| File | Change |
|------|--------|
| `repo-map.yml` | Add `scry-build-processing-service` entry + `milvus` and `cloudflare-queues` infrastructure |
| `CLAUDE.md` | Add service section, update data flow diagram, update dependency order |
| `.github/ISSUE_TEMPLATE/cross-service-feature.yml` | Add `build-processing` checkbox |
| `README.md` | Add service to label table and dependency auto-labeling docs |

---

## Concurrency & Batching

| Phase | Batch Size | Max Concurrent | Delay Between | Rationale |
|-------|-----------|---------------|---------------|-----------|
| LLM Inspection | 5 images/call | 2 batches | 2s | OpenAI rate limits |
| Image Embeddings | 10 images/call | 2 batches | 1s | Jina API limits |
| Text Embeddings | 10 texts/call | 2 batches | 1s | Jina API limits |
| Milvus Insert | 50 records/call | 1 | — | Single batch is sufficient |

**Estimated wall time for 50 stories:** ~2–3 minutes (well within 15-minute Queue limit).

---

## Error Handling

| Failure | Strategy |
|---------|----------|
| ZIP not found / corrupt | Throw → queue retries (up to 3x) |
| metadata.json missing | Log, set build status `failed`, ack message (no retry) |
| OpenAI batch failure | Retry batch 2x in-handler, then skip failed stories |
| Jina batch failure | Retry with exponential backoff, then skip |
| Milvus insert failure | Retry 1x, then throw → queue retry |
| Partial success | Insert successful stories, mark build as `partial` |

---

## Secrets (via `wrangler secret put`)

| Secret | Purpose |
|--------|---------|
| `OPENAI_API_KEY` | OpenAI Vision API for component inspection |
| `JINA_API_KEY` | Jina AI for text and image embeddings |
| `MILVUS_ADDRESS` | Zilliz Cloud cluster endpoint |
| `MILVUS_TOKEN` | Zilliz Cloud API token |
| `FIREBASE_PROJECT_ID` | Firestore project |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account RSA private key |
| `SENTRY_DSN` | Error tracking |

---

## Reference: Ported Logic

| Source (CJS scripts) | Target (TS modules) | What was ported |
|---|---|---|
| `scry-nextjs/scripts/inspect-component.cjs` | `pipeline/llm-inspector.ts` | `parseXmlToJson()`, `parseBatchResponse()`, `createBatchPrompt()`, batch inspection |
| `scry-nextjs/scripts/analyze-storybook.cjs` | `pipeline/searchable-text.ts` | `createSearchableText()` |
| `scry-nextjs/scripts/generate-embeddings.cjs` | `pipeline/embedding-generator.ts` | Jina API call format, batching |
| `scry-nextjs/scripts/vectorutils.cjs` | `pipeline/vector-inserter.ts` | `padVector()`, `transformStoryData()`, schema |
| `scry-nextjs/prompts/componentinspector.prompt` | `pipeline/prompt.ts` | Prompt text as constant |
| `scry-storybook-upload-service/src/services/firestore/` | `services/firestore/` | JWT auth, Firestore REST API pattern |

---

## Data Flow in Context

```
CLI (scry-node) → Upload Service → R2 (storage) + Firestore (metadata)
                                        ↓ (Queue message)
                  Build Processing Service → OpenAI + Jina → Milvus (vector DB)
                                        ↓
CDN Service ← reads from R2 + Firestore
                                        ↓
Dashboard ← reads build history from Firestore
Search API ← queries Milvus for component search
```

---

## Implementation Phases

1. **Service Registration** – Add to `repo-map.yml`, `CLAUDE.md`, issue templates, README
2. **Scaffold** – `package.json`, `tsconfig.json`, `wrangler.toml`, `vitest.config.ts`, deploy workflow
3. **Utilities** – `base64.ts`, `vector-utils.ts`, `xml-parser.ts`, `batch-processor.ts`
4. **External API Clients** – OpenAI fetch wrapper, Jina fetch wrapper, Milvus REST client, Firestore REST client
5. **Pipeline Modules** – ZIP extractor → metadata parser → LLM inspector → searchable text → embedding generator → vector inserter
6. **Orchestrator + Entry** – `pipeline/index.ts`, `entry.worker.ts`
7. **Tests** – Unit tests for each module with mocked external APIs
8. **Upload Service Integration** – Queue producer binding + enqueue after build creation
9. **Infrastructure** – Create queues (`wrangler queues create`), set secrets (`wrangler secret put`)

---

## Pull Requests

| Repo | PR | Branch |
|------|-----|--------|
| `epinnock/scry-build-processing-service` | [#1](https://github.com/epinnock/scry-build-processing-service/pull/1) | `feat/initial-build-processing-service` |
| `epinnock/scry-storybook-upload-service` | [#16](https://github.com/epinnock/scry-storybook-upload-service/pull/16) | `feat/build-processing-queue-producer` |
| `epinnock/scry-ops` | [#16](https://github.com/epinnock/scry-ops/pull/16) | `feat/register-build-processing-service` |

---

## Known Issues / Follow-ups

### 1. Milvus field name mismatch in `vector-inserter.ts` (must fix before deploy)

`scry-build-processing-service/src/pipeline/vector-inserter.ts` currently inserts with the wrong field names from the `vectorutils.cjs` schema definition side, not the query side that `scry-nextjs` uses.

| Field | Current (wrong) | Required (matches scry-nextjs queries) |
|-------|-----------------|----------------------------------------|
| Text vector | `text_dense` | `text_embedding` |
| Image vector | `image_dense` | `image_embedding` |
| Searchable text | `text` | `searchable_text` |

**Root cause:** `vectorutils.cjs` has an internal inconsistency — `setupCollection()` defines `text_dense`/`image_dense`/`text` but `transformStoryData()` inserts with `text_embedding`/`image_embedding`/`searchable_text`. The processing service was ported from the schema definition rather than the actual insert/query path.

**Fix:** Update `transformStoryData()` in `vector-inserter.ts` and its corresponding test file.

### 2. Missing `full_text_sparse` field

`scry-nextjs/search-utils.ts` queries a `full_text_sparse` field for BM25 sparse text search, but this field is not defined in `vectorutils.cjs` `setupCollection()` and is not populated by the processing service. Sparse search will return no results until this is addressed. This is a pre-existing gap in `scry-nextjs`, not introduced by the processing service.

---

## Verification

1. **Unit tests** – 44 tests across 10 test files covering each pipeline module and utility
2. **Local dev** – `wrangler dev` with `.dev.vars` for secrets; manually trigger via HTTP endpoint or queue message
3. **Integration test** – Upload a Storybook ZIP via the upload service, verify:
   - Queue message received by processing service
   - Firestore build status transitions: `queued` → `processing` → `completed`
   - Milvus collection contains new entries with correct embeddings
   - Search API returns the newly processed components
4. **Error scenarios** – Upload a ZIP without `metadata.json`, verify graceful failure and `failed` status
