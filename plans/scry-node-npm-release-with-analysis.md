# Plan: Release scry-node to npm with Build Processing Service Integration

## Context

scry-sbcov v0.3.0 (already published to npm) added screenshot capture and metadata ZIP generation to feed the build processing service's LLM analysis pipeline. scry-node already has the CLI plumbing (`--with-analysis` flag, `uploadMetadataZip()` in apiClient.js), and a pending changeset bumps the sbcov dependency to `^0.3.0`. However, the GitHub Actions workflow templates don't enable `--with-analysis`, so the processing service isn't being used. This plan enables it by default, updates documentation, and releases to npm.

---

## Step 1: Update Generated Workflow Templates

**File: `scry-node/lib/templates.js`**

In both `generateMainWorkflow()` and `generatePRWorkflow()`, add `--with-analysis` flag after `--coverage-execute`.

## Step 2: Update Static Template Files

**Files:**
- `scry-node/templates/workflows/deploy-storybook.yml`
- `scry-node/templates/workflows/deploy-pr-preview.yml`

Add `--with-analysis \` after the `--coverage-execute` line in both files.

## Step 3: Update Changeset to Minor

**File: `scry-node/.changeset/bump-sbcov-030.md`**

Change from `patch` to `minor` (enabling `--with-analysis` by default is a new feature). This bumps version from 0.1.0 → 0.2.0.

## Step 4: Update Documentation

- `docs/COVERAGE.md`: Add `--with-analysis` to CLI flags table + new "Build Processing Service Integration" section
- `README.md`: Update `--with-analysis` description, add `STORYBOOK_DEPLOYER_WITH_ANALYSIS` to env vars reference
- `templates/workflows/README.md`: Add `--with-analysis` mention to both template descriptions

## Step 5: Write Plan to scry-ops

Copy this plan to `scry-ops/plans/` for operational tracking.

## Step 6: Run Tests

```bash
cd scry-node && pnpm test
```

## Step 7: Release Process

1. Commit all changes and push to `main` (or PR → merge)
2. `release.yml` workflow creates a "Version Packages" PR bumping to 0.2.0
3. Merging that PR publishes `@scrymore/scry-deployer@0.2.0` to npm

---

## Files Changed Summary

| File | Change |
|------|--------|
| `lib/templates.js` | Add `--with-analysis` to both workflow generators |
| `templates/workflows/deploy-storybook.yml` | Add `--with-analysis` |
| `templates/workflows/deploy-pr-preview.yml` | Add `--with-analysis` |
| `.changeset/bump-sbcov-030.md` | Upgrade patch → minor, expand description |
| `docs/COVERAGE.md` | Add `--with-analysis` docs + processing service section |
| `README.md` | Update `--with-analysis` description, add to variable tables |
| `templates/workflows/README.md` | Mention `--with-analysis` in template descriptions |

## Verification

1. `pnpm test` passes
2. Manual template check: `node -e "console.log(require('./lib/templates').generateMainWorkflow('t','u','npm','build-storybook'))"` contains `--with-analysis`
3. Post-release: `npm view @scrymore/scry-deployer@0.2.0` confirms publication
