# Screenshot Metadata ZIP — Architecture Diagrams

This document contains Mermaid diagrams illustrating the current state, the selected implementation (Option A), and implementation details.

---

## 1. Current State — Data Flow

```mermaid
flowchart TD
    subgraph Client["Client Side (CI / Local)"]
        SB["Storybook Build<br/>(npm run build-storybook)"]
        NODE["scry-node CLI<br/>(scry deploy)"]
        SBCOV["scry-sbcov<br/>(scry-sbcov analyze)"]
        STORYCAP["storycap<br/>(screenshots)"]
    end

    subgraph Cloud["Cloud Services"]
        UPLOAD["Upload Service<br/>(Hono + CF Workers)"]
        R2["Cloudflare R2<br/>(Object Storage)"]
        FS["Firestore<br/>(Metadata DB)"]
        CDN["CDN Service<br/>(Hono + CF Workers)"]
        BPS["Build Processing Service<br/>(CF Workers + Queue)"]
        MILVUS["Milvus<br/>(Vector DB)"]
    end

    SB -->|"storybook-static/"| NODE
    NODE -->|"storycap"| STORYCAP
    STORYCAP -->|"__screenshots__/<br/>(LOCAL ONLY)"| STORYCAP
    NODE -->|"POST /upload<br/>storybook.zip"| UPLOAD
    NODE -.->|"coverage.json<br/>(optional)"| UPLOAD
    SBCOV -->|"coverage-report.json<br/>(separate run)"| NODE

    UPLOAD -->|"PUT storybook.zip"| R2
    UPLOAD -->|"Create build doc"| FS
    UPLOAD -.->|"PUT coverage-report.json"| R2

    R2 -->|"Range reads"| CDN
    CDN -->|"Serve files"| USER["End User Browser"]

    R2 -.->|"No queue message<br/>No metadata ZIP"| BPS
    BPS -.->|"Never triggered"| MILVUS

    style STORYCAP fill:#ff9999,stroke:#cc0000
    style BPS fill:#ff9999,stroke:#cc0000
    style MILVUS fill:#ff9999,stroke:#cc0000
```

**Legend:** Red nodes indicate broken/disconnected parts of the pipeline.

---

## 2. Current State — ZIP Contents Comparison

```mermaid
graph LR
    subgraph Current["What Upload Service Receives"]
        SZ["storybook.zip"]
        SZ --> HTML["index.html"]
        SZ --> JS["main.js / iframe.js"]
        SZ --> CSS["main.css"]
        SZ --> ASSETS["static/media/*"]
        SZ --> IDX["index.json<br/>(story manifest)"]
    end

    subgraph Expected["What Build Processing Expects"]
        MZ["metadata-screenshots.zip"]
        MZ --> META["metadata.json"]
        MZ --> IMG["images/"]
        IMG --> PNG1["Button-Primary.png"]
        IMG --> PNG2["Card-Default.png"]
        IMG --> PNG3["..."]
    end

    Current -.->|"Different artifacts<br/>Cannot be the same ZIP"| Expected

    style Current fill:#e6f3ff,stroke:#0066cc
    style Expected fill:#fff3e6,stroke:#cc6600
```

---

## 3. Implemented Flow — Option A (scry-sbcov + scry-node)

```mermaid
flowchart TD
    subgraph Client["Client Side (CI / Local)"]
        SB["Storybook Build<br/>(npm run build-storybook)"]
        NODE["scry-node CLI<br/>(scry deploy --with-analysis)"]
        SBCOV["scry-sbcov<br/>(--screenshots --output-zip)"]
    end

    subgraph Cloud["Cloud Services"]
        UPLOAD["Upload Service<br/>(Hono + CF Workers)"]
        QUEUE["CF Queue<br/>(scry-build-processing)"]
        R2["Cloudflare R2"]
        FS["Firestore"]
        CDN["CDN Service"]
        BPS["Build Processing Service"]
        OPENAI["OpenAI Vision<br/>(gpt-5-mini)"]
        JINA["Jina AI<br/>(jina-embeddings-v4)"]
        MILVUS["Milvus Vector DB"]
    end

    SB -->|"storybook-static/"| NODE
    NODE -->|"execSync"| SBCOV
    SBCOV -->|"1. Parse story files (AST)<br/>2. Launch Playwright<br/>3. Visit each story iframe<br/>4. Validate rendering<br/>5. Screenshot passing stories<br/>6. Generate metadata.json<br/>7. Bundle ZIP"| SBCOV
    SBCOV -->|"metadata-screenshots.zip<br/>+ coverage-report.json"| NODE

    NODE -->|"POST /upload/:project/:version<br/>(storybook.zip)"| UPLOAD
    NODE -->|"POST /upload/:project/:version/coverage<br/>(coverage JSON)"| UPLOAD
    NODE -->|"POST /upload/:project/:version/metadata<br/>(metadata-screenshots.zip)"| UPLOAD

    UPLOAD -->|"PUT {proj}/{ver}/storybook.zip"| R2
    UPLOAD -->|"PUT {proj}/{ver}/builds/{N}/metadata-screenshots.zip"| R2
    UPLOAD -->|"Create build record<br/>+ processingStatus: queued"| FS
    UPLOAD -->|"send(QueueMessage)"| QUEUE

    QUEUE -->|"Deliver batch"| BPS
    BPS -->|"GET metadata-screenshots.zip"| R2
    BPS -->|"Screenshot inspection<br/>(batches of 5)"| OPENAI
    BPS -->|"Image + text embeddings<br/>(batches of 10)"| JINA
    BPS -->|"Insert vectors<br/>(batches of 50)"| MILVUS
    BPS -->|"Update processingStatus"| FS

    R2 -->|"Range reads"| CDN
    CDN -->|"Serve Storybook"| USER["End User Browser"]

    style SBCOV fill:#99ff99,stroke:#009900
    style QUEUE fill:#99ff99,stroke:#009900
    style BPS fill:#99ff99,stroke:#009900
    style MILVUS fill:#99ff99,stroke:#009900
```

---

## 4. Story Execution & Screenshot Sequence

```mermaid
sequenceDiagram
    participant SBCOV as scry-sbcov
    participant PW as Playwright Browser
    participant SB as Storybook iframe
    participant FS as File System

    SBCOV->>SBCOV: Parse story files via AST (ts-morph)
    SBCOV->>SBCOV: Extract: filepath, componentName, title, location, componentPath
    SBCOV->>PW: chromium.launch({ headless: true })
    PW-->>SBCOV: browser context

    loop For each story
        SBCOV->>PW: page = context.newPage()
        SBCOV->>SB: page.goto('/iframe.html?id={storyId}&viewMode=story')
        SB-->>PW: Page loaded

        SBCOV->>SB: waitForSelector('#storybook-root')
        SBCOV->>SB: waitForTimeout(100ms) — React hydration

        alt All validation checks pass
            Note over SBCOV,SB: Existing checks (no new code):
            SBCOV->>SB: Check [data-story-error] — none
            SBCOV->>SB: Check .sb-errordisplay — none/hidden
            SBCOV->>SB: Check pageError — none
            SBCOV->>SB: Check critical console errors — none
            SBCOV->>SB: Check play function — passed/none
            Note over SBCOV: Story is healthy
            SBCOV->>PW: page.screenshot({ path: '{storyId}.png' })
            PW->>FS: Save screenshot PNG
            SBCOV->>SBCOV: status=passed, screenshotPath set
        else Any check fails (existing error handling)
            Note over SBCOV: Story is broken
            SBCOV->>SBCOV: status=failed, NO screenshot for metadata ZIP
        end

        SBCOV->>PW: page.close()
    end

    PW->>PW: browser.close()

    SBCOV->>SBCOV: Filter: only passed stories with screenshotPath
    SBCOV->>SBCOV: Build metadata.json array
    SBCOV->>SBCOV: Resolve componentFilePath from imports
    SBCOV->>FS: Write ZIP (archiver): metadata.json + images/*.png
```

---

## 5. Upload & Queue Sequence

```mermaid
sequenceDiagram
    participant CLI as scry-node CLI
    participant US as Upload Service
    participant R2 as Cloudflare R2
    participant FS as Firestore
    participant Q as CF Queue (scry-build-processing)
    participant BPS as Build Processing Service
    participant AI as OpenAI + Jina
    participant MV as Milvus

    Note over CLI: Step 1: Upload Storybook build
    CLI->>US: POST /upload/{project}/{version} (storybook.zip)
    US->>R2: PUT {project}/{version}/storybook.zip
    US->>FS: Create build record (buildNumber: N, status: active)
    US-->>CLI: 201 { buildId, buildNumber: N }

    Note over CLI: Step 2: Upload Coverage (optional, 5s delay)
    CLI->>US: POST /upload/{project}/{version}/coverage (JSON)
    US->>R2: PUT {project}/{version}/coverage-report.json
    US->>FS: Update build with coverage summary
    US-->>CLI: 200 { success }

    Note over CLI: Step 3: Upload Metadata ZIP
    CLI->>US: POST /upload/{project}/{version}/metadata (ZIP)
    US->>FS: getLatestBuild(project, version) → { buildId, buildNumber: N }
    US->>R2: PUT {project}/{version}/builds/N/metadata-screenshots.zip
    US->>FS: Update build: processingStatus = 'queued'
    US->>Q: send({ projectId, versionId, buildId, zipKey, timestamp })
    US-->>CLI: 201 { success, queued: true, buildNumber: N }

    Note over Q,BPS: Async processing (triggered by queue)
    Q->>BPS: Deliver message batch
    BPS->>FS: Update: processingStatus = 'processing'
    BPS->>R2: GET {project}/{version}/builds/N/metadata-screenshots.zip
    BPS->>BPS: extractZip() → metadata.json + screenshot images
    BPS->>BPS: parseMetadata() → StoryItem[] (matched by path)

    loop For each batch of 5 stories
        BPS->>AI: OpenAI Vision (gpt-5-mini) — screenshot inspection
        AI-->>BPS: Descriptions, tags, search queries
    end

    BPS->>BPS: Generate searchable text from inspection results

    loop For each batch of 10
        BPS->>AI: Jina AI (jina-embeddings-v4) — image embeddings
        AI-->>BPS: Image vectors (padded to 2048 dims)
        BPS->>AI: Jina AI (jina-embeddings-v4) — text embeddings
        AI-->>BPS: Text vectors (padded to 2048 dims)
    end

    BPS->>MV: Insert vectors (batches of 50)
    BPS->>FS: Update: processingStatus = 'completed', processedStoryCount: X
```

---

## 6. R2 Storage Layout

```mermaid
graph TD
    subgraph R2["Cloudflare R2 Bucket"]
        subgraph Project["my-project/"]
            subgraph Version["v1.0.0/"]
                SZ["storybook.zip<br/>(Storybook build — served by CDN)"]
                CR["coverage-report.json<br/>(Coverage data — optional)"]
                subgraph Builds["builds/"]
                    subgraph B1["1/"]
                        MZ1["metadata-screenshots.zip<br/>(Screenshots + metadata)"]
                    end
                    subgraph B2["2/"]
                        MZ2["metadata-screenshots.zip"]
                    end
                end
            end
        end
    end

    style SZ fill:#e6f3ff,stroke:#0066cc
    style CR fill:#e6ffe6,stroke:#009900
    style MZ1 fill:#fff3e6,stroke:#cc6600
    style MZ2 fill:#fff3e6,stroke:#cc6600
```

---

## 7. metadata.json Schema

```mermaid
classDiagram
    class MetadataEntry {
        +string filepath
        +string componentFilePath
        +string componentName
        +string testName
        +string storyTitle
        +string screenshotPath
        +Location location
    }
    class Location {
        +number startLine
        +number endLine
    }
    MetadataEntry --> Location : optional

    note for MetadataEntry "filepath: story file (Button.stories.tsx)\ncomponentFilePath: component (Button.tsx)\nscreenshotPath: relative to ZIP root"
```

---

## 8. Deploy Flow Comparison

```mermaid
flowchart LR
    subgraph Before["Before (Current)"]
        direction TB
        B1["1. resolveCoverage()"] --> B2["2. captureScreenshots()<br/>(storycap/Puppeteer)"]
        B2 --> B3["3. analyzeStorybook()<br/>(regex parsing)"]
        B3 --> B4["4. createMasterZip()<br/>(static + images + metadata)"]
        B4 --> B5["5. uploadBuild()<br/>(single ZIP)"]
    end

    subgraph After["After (Option A)"]
        direction TB
        A1["1. resolveCoverage()<br/>(scry-sbcov: coverage +<br/>screenshots + metadata ZIP)"] --> A2["2. zipDirectory()<br/>(storybook static only)"]
        A2 --> A3["3. uploadBuild()<br/>(storybook.zip +<br/>coverage +<br/>metadata ZIP)"]
    end

    Before -.->|"Replaced by"| After

    style Before fill:#fff3e6,stroke:#cc6600
    style After fill:#e6ffe6,stroke:#009900
```

---

## 9. Implementation Phases

```mermaid
gantt
    title Screenshot Metadata ZIP — Option A Implementation
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Phase 1a (scry-sbcov)
    Story parser: location tracking          :p1a1, 2026-02-26, 1d
    Story executor: screenshot capture       :p1a2, 2026-02-26, 1d
    ZIP generator module                     :p1a3, after p1a2, 2d
    CLI flags + config                       :p1a4, after p1a3, 1d
    Tests                                    :p1a5, after p1a4, 1d

    section Phase 1b (upload-service) — parallel
    Queue binding (wrangler.toml)            :p1b1, 2026-02-26, 1d
    Metadata endpoint                        :p1b2, after p1b1, 2d
    Firestore methods                        :p1b3, after p1b1, 2d
    Tests                                    :p1b4, after p1b3, 1d

    section Phase 2 (scry-node)
    coverage.js: screenshot flags            :p2a, after p1a5, 1d
    apiClient.js: uploadMetadataZip          :p2b, after p1b4, 1d
    cli.js: replace storycap flow            :p2c, after p2b, 2d
    Tests                                    :p2d, after p2c, 1d

    section Phase 3 (Verification)
    End-to-end integration test              :p3a, after p2d, 2d
```
