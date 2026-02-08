# Task 3.4: CI Coverage Thresholds for All Projects

## Overview

Add standardized coverage thresholds to vitest/jest configs and update GitHub Actions workflows to enforce them. scry-node already has coverage thresholds in jest.config.js; extend the pattern to CDN service, upload service, sbcov, and dashboard.

**Time Estimate:** 45 min
**Target Repos:** `scry-cdn-service`, `scry-storybook-upload-service`, `scry-sbcov`, `scry-developer-dashboard`
**Agent Tools Required:** Code + GitHub access (for workflow updates)
**Dependencies:** Tasks 2.3, 2.4, 2.5 (quality gates should be in place first)

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| CT-001 | Setting thresholds too high blocks all commits | Medium | High | High |
| CT-002 | Current coverage is below proposed thresholds | Medium | Medium | Medium |
| CT-003 | Coverage measurement differs between local and CI | Low | Low | Low |

**Mitigation:**
- CT-001: Run coverage locally first to determine current levels. Set thresholds 5-10% below current levels initially.
- CT-002: Run `pnpm test -- --coverage` in each project first to establish baselines.
- CT-003: Use same Node version and test runner config in CI.

---

## File-by-file Plan

### Step 0: Establish Baselines

Before setting thresholds, run coverage in each project to determine current levels:

```bash
# In each project:
pnpm vitest run --coverage  # or npm test -- --coverage for jest
```

Record the current coverage percentages for lines, branches, functions, statements.

### 1. scry-cdn-service

**File:** `scry-cdn-service/vitest.config.ts`

Add coverage configuration:
```typescript
export default defineConfig({
  test: {
    // ... existing config
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 50,      // Adjust based on baseline
        branches: 40,
        functions: 50,
        statements: 50,
      },
      exclude: ['node_modules/', 'dist/', 'e2e/', '**/*.test.ts'],
    },
  },
});
```

**File:** `scry-cdn-service/package.json`
Add script: `"test:coverage": "vitest run --coverage"`

**File:** `.github/workflows/deploy-cdn-service.yml`
Add coverage step after test step in the test job.

### 2. scry-storybook-upload-service

**File:** `scry-storybook-upload-service/vitest.config.ts`

Upload service already has thresholds (statements: 70, branches: 60, functions: 70, lines: 70). Verify these are enforced in CI.

**File:** `.github/workflows/deploy.yml` or `.github/workflows/ci.yml`
Ensure coverage reporting is part of the CI pipeline.

### 3. scry-sbcov

**File:** `scry-sbcov/vitest.config.ts`

Add coverage thresholds:
```typescript
coverage: {
  provider: 'v8',
  thresholds: {
    lines: 50,
    branches: 40,
    functions: 50,
    statements: 50,
  },
}
```

### 4. scry-developer-dashboard

**File:** `scry-developer-dashboard/vitest.unit.config.mjs` (or equivalent)

Add coverage thresholds. May need to install `@vitest/coverage-v8`:
```bash
pnpm add -D @vitest/coverage-v8
```

### 5. Standardize Coverage Reporting in CI

For each project's GitHub Actions workflow, ensure a coverage step exists:

```yaml
- name: Run tests with coverage
  run: pnpm test:coverage

- name: Upload coverage report
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/
    retention-days: 7
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-node/jest.config.js` | Existing threshold pattern (L25-35) |
| `scry-storybook-upload-service/vitest.config.ts` | Existing vitest threshold pattern |
| `.github/workflows/deploy-cdn-service.yml` | CI workflow to update |
| `.github/workflows/deploy.yml` (upload-service) | CI workflow reference |

---

## Verification

1. `pnpm test:coverage` works in all 4 projects
2. Coverage reports are generated
3. Builds fail if coverage drops below thresholds
4. GitHub Actions workflows include coverage step
5. Thresholds are set at or slightly below current baselines
