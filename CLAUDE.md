# Scry Platform Architecture

You are working on the Scry platform — a Storybook deployment and management system.
All service repos are checked out under `./services/` when their label is applied to the issue.

## Services

### scry-ops (label: `scry-ops`)
- **Purpose**: Orchestrator repo for cross-service automation
- **Contains**: GitHub workflows, issue templates, repo mappings, plans, scripts
- **Notes**: Edits here affect agent routing, project-sync behavior, and automation safety

### scry-storybook-upload-service (label: `upload-service`)
- **Purpose**: Backend API for receiving and storing Storybook uploads
- **Stack**: TypeScript, Hono framework, Cloudflare Workers
- **Storage**: Cloudflare R2 (S3-compatible), Firestore for metadata
- **Key endpoints**: `POST /upload`, `POST /presigned-url`, `POST /api/projects/:id/builds`
- **Test**: `cd services/scry-storybook-upload-service && npm install && npm test`

### scry-cdn-service (label: `cdn-service`)
- **Purpose**: CDN for serving deployed Storybooks from R2 storage
- **Stack**: TypeScript, Hono framework, Cloudflare Workers
- **Features**: Partial ZIP extraction, KV caching (24hr TTL), SPA fallback
- **URL pattern**: `/{project}/{version}/{buildNumber}/path/to/file`
- **Test**: `cd services/scry-cdn-service && npm install && npm test`

### scry-developer-dashboard (label: `dashboard`)
- **Purpose**: Web dashboard for project management and analytics
- **Stack**: Next.js 15, TypeScript, Tailwind CSS, Firebase (Auth + Firestore)
- **Features**: Project CRUD, GitHub import, build history, coverage display, API key management
- **Deployed to**: Vercel
- **Test**: `cd services/scry-developer-dashboard && npm install && npm test`

### scry-node (label: `scry-node`)
- **Purpose**: CLI tool for deploying Storybooks
- **Stack**: Node.js, CommonJS, Yargs
- **Commands**: `scry init`, `scry deploy`, `scry login`
- **Published as**: `@scrymore/scry-deployer` on npm
- **Test**: `cd services/scry-node && npm install && npm test`

### scry-sbcov (label: `sbcov`)
- **Purpose**: Storybook coverage analysis tool
- **Stack**: Node.js CLI
- **Features**: Detect components without stories, analyze scenario coverage, generate JSON reports
- **Published as**: `@scrymore/scry-sbcov` on npm
- **Test**: `cd services/scry-sbcov && npm install && npm test`

### scry-nextjs (label: `search-api`)
- **Purpose**: Multimodal search API for components
- **Stack**: Next.js 15, Milvus vector DB, Jina AI embeddings
- **Features**: Text search, image search, hybrid search
- **Test**: `cd services/scry-nextjs && npm install && npm test`

### scry-landing-page (label: `landing-page`)
- **Purpose**: Marketing landing page at scrymore.com
- **Stack**: TypeScript

### scry-link (label: `scry-link`)
- **Purpose**: Figma plugin linking components to Storybook stories
- **Stack**: TypeScript

## Key Interfaces

### Storage Pattern
All services share this R2 storage convention:
```
{project}/{version}/builds/{buildNumber}/storybook.zip
```
- Upload service **writes** to this path
- CDN service **reads** from this path

### Authentication
- Firebase API keys: `scry_proj_{projectId}_{randomString}`
- Keys are SHA-256 hashed and stored in Firestore
- All services validate against the same Firestore project

### Data Flow
```
CLI (scry-node) → Upload Service → R2 (storage) + Firestore (metadata)
                                        ↓
CDN Service ← reads from R2 + Firestore
                                        ↓
Dashboard ← reads build history from Firestore
```

### Environments
- **Production**: `view.scrymore.com` (CDN), `dashboard.scrymore.com` (Dashboard)
- **Staging**: `scry-cdn-service-dev.scrymore.workers.dev`
- **Firebase**: `scry-production` (prod), `scry-staging` (staging)

## Rules
- All services use TypeScript
- Worker services use the Hono framework
- Always run tests before finalizing changes
- Respect each service's own CLAUDE.md if present
- When making cross-service changes, ensure API contracts remain compatible

## Cross-Service Features

When multiple services are checked out, follow this workflow:

1. **Survey first**: Read the relevant files in ALL checked-out services before editing anything
2. **Identify shared interfaces**: Look for shared API contracts, Firestore collections, R2 path patterns, and type definitions that span services
3. **Order of changes**: Modify upstream/shared services first (upload-service, then cdn-service, then dashboard)
4. **Contract compatibility**: When changing an API endpoint or data shape, verify both the producer and consumer sides
5. **Test each service**: Run `npm install && npm test` in each modified service directory
6. **Describe all changes**: In your final summary, list what changed in each service and how they relate

### Service Dependency Order
When making coordinated changes, prefer this order:
1. scry-storybook-upload-service (data producer)
2. scry-cdn-service (data consumer)
3. scry-developer-dashboard (UI consumer)
4. scry-node (CLI client)
5. scry-sbcov (analysis tool)
6. scry-nextjs (search API)

## CRITICAL: Git Workflow
- **DO NOT** run `git commit` or `git push` inside `services/` directories
- **DO NOT** push directly to any service repo
- Only edit files — a post-step will handle committing and creating PRs in the correct repos
- You may run `git status` or `git diff` to verify your changes
- After making all edits, just confirm what you changed — do not attempt to commit or push
