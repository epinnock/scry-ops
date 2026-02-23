# Screenshot Metadata ZIP — Architecture Diagrams

This document contains Mermaid diagrams illustrating the current state, gaps, and proposed solutions.

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

    R2 -.->|"❌ No queue message<br/>❌ No metadata ZIP"| BPS
    BPS -.->|"❌ Never triggered"| MILVUS

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

    Current -.->|"❌ Different artifacts<br/>Cannot be the same ZIP"| Expected

    style Current fill:#e6f3ff,stroke:#0066cc
    style Expected fill:#fff3e6,stroke:#cc6600
```

---

## 3. Proposed Flow — Option A (scry-sbcov + scry-node)

```mermaid
flowchart TD
    subgraph Client["Client Side (CI / Local)"]
        SB["Storybook Build"]
        NODE["scry-node CLI"]
        SBCOV["scry-sbcov<br/>(+ screenshot capture)"]
    end

    subgraph Cloud["Cloud Services"]
        UPLOAD["Upload Service"]
        QUEUE["CF Queue<br/>(scry-build-processing)"]
        R2["Cloudflare R2"]
        FS["Firestore"]
        CDN["CDN Service"]
        BPS["Build Processing Service"]
        OPENAI["OpenAI Vision"]
        JINA["Jina AI Embeddings"]
        MILVUS["Milvus Vector DB"]
    end

    SB -->|"storybook-static/"| NODE
    NODE -->|"invoke"| SBCOV
    SBCOV -->|"1. Visit each story<br/>2. Capture screenshots<br/>3. Generate metadata.json<br/>4. Bundle ZIP"| SBCOV
    SBCOV -->|"metadata-screenshots.zip"| NODE

    NODE -->|"POST /upload<br/>storybook.zip"| UPLOAD
    NODE -->|"POST /upload-metadata<br/>metadata-screenshots.zip"| UPLOAD

    UPLOAD -->|"storybook.zip"| R2
    UPLOAD -->|"metadata-screenshots.zip"| R2
    UPLOAD -->|"Build record"| FS
    UPLOAD -->|"Queue message"| QUEUE

    QUEUE -->|"Trigger"| BPS
    BPS -->|"Fetch ZIP"| R2
    BPS -->|"Screenshot inspection"| OPENAI
    BPS -->|"Embeddings"| JINA
    BPS -->|"Insert vectors"| MILVUS
    BPS -->|"Update status"| FS

    R2 -->|"Range reads"| CDN

    style SBCOV fill:#99ff99,stroke:#009900
    style QUEUE fill:#99ff99,stroke:#009900
    style BPS fill:#99ff99,stroke:#009900
    style MILVUS fill:#99ff99,stroke:#009900
```

---

## 4. Proposed Flow — Option B (scry-node with index.json)

```mermaid
flowchart TD
    subgraph Client["Client Side (CI / Local)"]
        SB["Storybook Build"]
        NODE["scry-node CLI"]
        STORYCAP["storycap<br/>(existing)"]
    end

    subgraph Cloud["Cloud Services"]
        UPLOAD["Upload Service"]
        QUEUE["CF Queue"]
        R2["Cloudflare R2"]
        FS["Firestore"]
        BPS["Build Processing Service"]
        MILVUS["Milvus Vector DB"]
    end

    SB -->|"storybook-static/"| NODE
    NODE -->|"1. Read index.json<br/>2. Run storycap<br/>3. Generate metadata.json<br/>4. Bundle ZIP"| NODE
    NODE -->|"storycap"| STORYCAP
    STORYCAP -->|"screenshots"| NODE

    NODE -->|"storybook.zip"| UPLOAD
    NODE -->|"metadata-screenshots.zip"| UPLOAD

    UPLOAD -->|"Store both ZIPs"| R2
    UPLOAD -->|"Queue message"| QUEUE
    UPLOAD -->|"Build record"| FS

    QUEUE --> BPS
    BPS -->|"Process"| MILVUS

    style NODE fill:#99ff99,stroke:#009900
    style QUEUE fill:#99ff99,stroke:#009900
```

---

## 5. Proposed Flow — Option C (GitHub Actions)

```mermaid
flowchart TD
    subgraph GHA["GitHub Actions Workflow"]
        BUILD["npm run build-storybook"]
        DEPLOY["scry deploy<br/>(storybook.zip)"]
        SCREEN["Screenshot Metadata Action<br/>(new)"]
    end

    subgraph Cloud["Cloud Services"]
        UPLOAD["Upload Service"]
        QUEUE["CF Queue"]
        R2["Cloudflare R2"]
        BPS["Build Processing"]
        MILVUS["Milvus"]
    end

    BUILD -->|"storybook-static/"| DEPLOY
    BUILD -->|"storybook-static/"| SCREEN
    DEPLOY -->|"storybook.zip"| UPLOAD
    SCREEN -->|"1. Start local server<br/>2. Playwright screenshots<br/>3. Generate metadata<br/>4. Bundle ZIP"| SCREEN
    SCREEN -->|"metadata-screenshots.zip"| UPLOAD

    UPLOAD --> R2
    UPLOAD --> QUEUE
    QUEUE --> BPS
    BPS --> MILVUS

    DEPLOY -.->|"parallel"| SCREEN

    style SCREEN fill:#99ff99,stroke:#009900
    style QUEUE fill:#99ff99,stroke:#009900
```

---

## 6. R2 Storage Layout — Proposed

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

## 7. Queue Message Flow — Sequence Diagram

```mermaid
sequenceDiagram
    participant CLI as scry-node CLI
    participant US as Upload Service
    participant R2 as Cloudflare R2
    participant FS as Firestore
    participant Q as CF Queue
    participant BPS as Build Processing
    participant AI as OpenAI + Jina
    participant MV as Milvus

    CLI->>US: POST /upload (storybook.zip)
    US->>R2: PUT {project}/{version}/storybook.zip
    US->>FS: Create build record (buildNumber: N)
    US-->>CLI: 201 { buildId, buildNumber }

    CLI->>US: POST /upload-metadata (metadata-screenshots.zip)
    US->>R2: PUT {project}/{version}/builds/N/metadata-screenshots.zip
    US->>Q: Publish { projectId, versionId, buildId, zipKey }
    US-->>CLI: 201 { success }

    Q->>BPS: Deliver message
    BPS->>R2: GET metadata-screenshots.zip
    BPS->>BPS: Extract ZIP (metadata.json + images)
    BPS->>BPS: Parse metadata, match screenshots
    BPS->>FS: Update status: processing

    loop For each batch of 5 stories
        BPS->>AI: OpenAI Vision (screenshots)
        AI-->>BPS: Component descriptions + tags
    end

    loop For each batch of 10
        BPS->>AI: Jina AI (image embeddings)
        AI-->>BPS: Image vectors
        BPS->>AI: Jina AI (text embeddings)
        AI-->>BPS: Text vectors
    end

    BPS->>MV: Insert vectors (batches of 50)
    BPS->>FS: Update status: completed
```

---

## 8. Decision Tree — Which Option to Choose

```mermaid
flowchart TD
    START["Need screenshot<br/>metadata ZIP"] --> Q1{"Need rich metadata?<br/>(filepath, location)"}

    Q1 -->|"Yes"| Q2{"scry-sbcov already<br/>in deploy workflow?"}
    Q1 -->|"No, basic is fine"| OPT_B["Option B<br/>scry-node + index.json"]

    Q2 -->|"Yes"| OPT_A["Option A<br/>scry-sbcov + scry-node"]
    Q2 -->|"No"| Q3{"Want CI integration?"}

    Q3 -->|"Yes"| OPT_C["Option C<br/>GitHub Actions"]
    Q3 -->|"No"| OPT_E["Option E<br/>Hybrid (standalone sbcov)"]

    OPT_B --> IMPL["Implement queue<br/>integration in<br/>upload-service"]
    OPT_A --> IMPL
    OPT_C --> IMPL
    OPT_E --> IMPL

    style OPT_A fill:#99ff99,stroke:#009900
    style OPT_B fill:#ffffcc,stroke:#cccc00
    style OPT_C fill:#e6f3ff,stroke:#0066cc
    style OPT_E fill:#ffe6ff,stroke:#cc00cc
    style IMPL fill:#ff9999,stroke:#cc0000
```

---

## 9. Implementation Phases

```mermaid
gantt
    title Screenshot Metadata ZIP — Implementation Phases
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Phase 1 (Foundation)
    Upload service queue integration        :p1a, 2026-03-01, 5d
    R2 path convention alignment            :p1b, 2026-03-01, 3d
    Upload service metadata ZIP endpoint    :p1c, after p1b, 4d

    section Phase 2 (Generation)
    Option B: scry-node metadata gen        :p2a, after p1c, 5d
    OR Option A: scry-sbcov screenshots     :p2b, after p1c, 7d

    section Phase 3 (Integration)
    End-to-end testing                      :p3a, after p2a, 3d
    GitHub Actions workflow template        :p3b, after p3a, 3d
    Documentation                           :p3c, after p3a, 2d
```
