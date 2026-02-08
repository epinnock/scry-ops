# Task 2.2: Update R2 Bucket Names from my-storybooks-*

## Overview

Rename R2 bucket references from `my-storybooks-production` / `my-storybooks-staging` to `scry-storybooks-production` / `scry-storybooks-staging` across all configuration files. This is a config-only change - actual R2 bucket creation and data migration is a separate Cloudflare operation.

**Time Estimate:** 45 min
**Target Repos:** `scry-cdn-service`, `scry-storybook-upload-service`
**Agent Tools Required:** Code + Cloudflare access (to document bucket creation steps)
**Dependencies:** Coordinate with Task 2.1 to avoid wrangler.toml edit conflicts

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| B-001 | Deploying config before creating new buckets = total outage | High | Critical | Critical |
| B-002 | Data in old buckets not migrated = lost builds | High | Critical | Critical |
| B-003 | Missed references cause some services to use old bucket | Medium | High | High |

**Mitigation:**
- B-001: **DO NOT DEPLOY** the config changes until new R2 buckets exist. This is a prepare-then-execute migration. Create a migration runbook.
- B-002: Use `rclone` or R2 API to copy all objects from old to new buckets before switching configs.
- B-003: Grep all wrangler.toml, .env, and source files for `my-storybooks` to ensure complete coverage.

**CRITICAL:** The code changes in this task are PREPARATION ONLY. The actual migration must follow the runbook order: (1) create new buckets, (2) copy data, (3) deploy config changes, (4) verify, (5) decommission old buckets.

---

## File-by-file Plan

### 1. Update CDN Service Wrangler Config

**File:** `scry-cdn-service/cloudflare/wrangler.toml`

```diff
# R2 bucket bindings
[[r2_buckets]]
  binding = "UPLOAD_BUCKET"
- bucket_name = "my-storybooks-production"
+ bucket_name = "scry-storybooks-production"
- preview_bucket_name = "my-storybooks-staging"
+ preview_bucket_name = "scry-storybooks-staging"

[env.production]
[[env.production.r2_buckets]]
  binding = "UPLOAD_BUCKET"
- bucket_name = "my-storybooks-production"
+ bucket_name = "scry-storybooks-production"

[env.development]
[[env.development.r2_buckets]]
  binding = "UPLOAD_BUCKET"
- bucket_name = "my-storybooks-staging"
+ bucket_name = "scry-storybooks-staging"
```

Leave `scry-static-sites` bucket name unchanged.

### 2. Update Upload Service Wrangler Config

**File:** `scry-storybook-upload-service/wrangler.toml`

```diff
[[r2_buckets]]
  binding = "STORYBOOK_BUCKET"
- bucket_name = "my-storybooks-production"
+ bucket_name = "scry-storybooks-production"
- preview_bucket_name = "my-storybooks-staging"
+ preview_bucket_name = "scry-storybooks-staging"

[vars]
- R2_BUCKET_NAME = "my-storybooks-production"
+ R2_BUCKET_NAME = "scry-storybooks-production"

[env.staging.vars]
- R2_BUCKET_NAME = "my-storybooks-staging"
+ R2_BUCKET_NAME = "scry-storybooks-staging"

[[env.staging.r2_buckets]]
  binding = "STORYBOOK_BUCKET"
- bucket_name = "my-storybooks-staging"
+ bucket_name = "scry-storybooks-staging"
- preview_bucket_name = "my-storybooks-staging"
+ preview_bucket_name = "scry-storybooks-staging"
```

### 3. Update Environment Files

**Files in `scry-storybook-upload-service/`:**
- `.env.example`
- `.env.prod`
- `.env.stage`
- `.env.local` (if exists)

Replace all `my-storybooks-*` references with `scry-storybooks-*`.

### 4. Update Documentation

Grep all markdown files for `my-storybooks` and update:
- README files in both services
- Architecture docs in `/home/boxuser/scry/plans/`
- Any setup guides

### 5. Create Migration Runbook

**File:** `scry-cdn-service/docs/BUCKET_MIGRATION.md` (NEW)

```markdown
# R2 Bucket Migration Runbook

## Overview
Migrate from `my-storybooks-*` to `scry-storybooks-*` R2 buckets.

## Pre-requisites
- Cloudflare dashboard access with R2 permissions
- wrangler CLI authenticated

## Steps

### 1. Create New Buckets
```bash
wrangler r2 bucket create scry-storybooks-production
wrangler r2 bucket create scry-storybooks-staging
```

### 2. Copy Data
```bash
# Use rclone or wrangler to copy all objects
wrangler r2 object list my-storybooks-production | ...
# Or use rclone with S3-compatible API
```

### 3. Deploy Config Changes
Deploy both services with updated wrangler.toml

### 4. Verify
- Health check both services
- Verify a known build URL serves correctly
- Test upload flow end-to-end

### 5. Decommission Old Buckets (after 1 week soak)
```bash
wrangler r2 bucket delete my-storybooks-production
wrangler r2 bucket delete my-storybooks-staging
```
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/cloudflare/wrangler.toml` | CDN bucket config |
| `scry-storybook-upload-service/wrangler.toml` | Upload bucket config |
| `scry-storybook-upload-service/.env.example` | Env var template |

---

## Verification

1. `grep -r "my-storybooks" /home/boxuser/scry/` returns zero results in config/code files (docs can mention old name in migration context)
2. Both services' tests still pass
3. Migration runbook is complete and actionable
4. `scry-static-sites` bucket name is unchanged
