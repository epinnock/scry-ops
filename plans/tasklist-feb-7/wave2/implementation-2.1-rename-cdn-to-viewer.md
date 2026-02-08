# Task 2.1: Rename scry-cdn-service to scry-viewer-service

## Overview

Rename the CDN service from `scry-cdn-service` to `scry-viewer-service` across all configuration files, CI/CD workflows, and documentation. This aligns the service name with its actual purpose (viewing Storybook deployments). Do NOT rename the directory itself - that's a separate git operation for the human.

**Time Estimate:** 60 min
**Target Repo:** `scry-cdn-service` (primary), cross-repo references throughout `/home/boxuser/scry/`
**Agent Tools Required:** Code + GitHub access (for workflow file rename)
**Dependencies:** Tasks 1.1 (Sentry) and 1.2 (/latest fix) should be merged first to avoid conflicts

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| R-001 | Cloudflare Worker name change causes downtime | High | High | Critical |
| R-002 | GitHub Actions workflow rename breaks CI/CD | Medium | High | High |
| R-003 | Cross-repo references missed, causing broken links | Medium | Medium | Medium |
| R-004 | Custom domains stop working after Worker rename | Medium | High | High |

**Mitigation:**
- R-001: The old Worker name (`scry-cdn-service`) will continue to exist on Cloudflare until manually deleted. The new name creates a NEW worker. Need to migrate routes/custom domains. **Document this as a manual step.**
- R-002: Test workflow file rename on a branch first. GitHub Actions picks up the new filename automatically.
- R-003: Use `grep -r "scry-cdn-service"` across entire monorepo to find all references.
- R-004: Custom domain routing is configured in Cloudflare dashboard, not wrangler.toml. Document the domain migration step.

**IMPORTANT:** This is a config-only code change. The actual Cloudflare Worker migration (routes, custom domains) must be done manually in the Cloudflare dashboard after deployment. Document these manual steps clearly.

---

## File-by-file Plan

### 1. Update Wrangler Configuration

**File:** `scry-cdn-service/cloudflare/wrangler.toml`

```diff
- name = "scry-cdn-service"
+ name = "scry-viewer-service"

[env.production]
- name = "scry-cdn-service"
+ name = "scry-viewer-service"

[env.development]
- name = "scry-cdn-service-dev"
+ name = "scry-viewer-service-dev"
```

### 2. Update Package Name

**File:** `scry-cdn-service/package.json`

```diff
- "name": "scry-cdn-service",
+ "name": "scry-viewer-service",
```

### 3. Rename GitHub Actions Workflow

**File:** `scry-cdn-service/.github/workflows/deploy-cdn-service.yml` -> `deploy-viewer-service.yml`

Update all internal references:
- Workflow `name:` field
- Environment URLs (worker subdomain)
- Health check URLs
- Job names and descriptions
- Any comments referencing the old name

### 4. Update Sentry Service Tag (if Task 1.1 is complete)

**File:** `scry-cdn-service/cloudflare/worker.ts`

```diff
  initialScope: {
    tags: {
-     service: 'scry-cdn-service',
+     service: 'scry-viewer-service',
      runtime: 'cloudflare-workers',
    },
  },
```

### 5. Update Documentation

Update all markdown files in `scry-cdn-service/`:
- `README.md`
- `docs/SENTRY_SETUP.md` (if exists)
- Any other docs referencing the old name

### 6. Update Cross-Repo References

Grep the entire monorepo for `scry-cdn-service` and update:
- `scry-architecture-design.md`
- `backlog.csv`
- Plans folder documents
- Other service configs that reference the CDN service URL
- `.github/workflows/deploy-cdn-service.yml` at the root level (if exists)

### 7. Create Migration Checklist

**File:** `scry-cdn-service/docs/RENAME_MIGRATION.md` (NEW)

Document manual steps needed after code deployment:
1. Deploy the new Worker name to Cloudflare
2. Migrate custom domain routes (`view.scrymore.com`) to new Worker name
3. Verify health check passes on new Worker URL
4. Delete old Worker name from Cloudflare dashboard
5. Update any external references (DNS, documentation, etc.)

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/cloudflare/wrangler.toml` | Primary config to rename |
| `scry-cdn-service/package.json` | Package name |
| `.github/workflows/deploy-cdn-service.yml` | CI/CD workflow |
| Root-level markdown files | Cross-references |

---

## Verification

1. `pnpm test` passes
2. `grep -r "scry-cdn-service" /home/boxuser/scry/` returns zero results (except git history)
3. `wrangler.toml` uses new name in all environments
4. GitHub Actions workflow file is renamed and references are updated
5. Migration checklist document is created
