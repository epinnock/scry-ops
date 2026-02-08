# Task 2.5: Quality Gates - husky + lint-staged for scry-storybook-upload-service

## Overview

Add pre-commit hooks to the upload service using husky and lint-staged, ensuring tests and formatting run before every commit.

**Time Estimate:** 30 min
**Target Repo:** `scry-storybook-upload-service`
**Agent Tools Required:** Code-only (read/write files, `pnpm install`, `pnpm test`)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| Q-001 | Pre-commit hook blocks developers due to slow tests | Low | Medium | Low |

**Overall Risk: Very Low** - Straightforward setup copying established pattern.

---

## File-by-file Plan

### 1. Install Dependencies

```bash
cd scry-storybook-upload-service
pnpm add -D husky lint-staged
```

### 2. Update package.json

**File:** `scry-storybook-upload-service/package.json`

Add to `scripts`:
```json
"prepare": "husky"
```

Add `lint-staged` config:
```json
"lint-staged": {
  "src/**/*.{ts,tsx}": ["prettier --write"],
  "e2e/**/*.{ts,tsx}": ["prettier --write"]
}
```

### 3. Initialize Husky

```bash
cd scry-storybook-upload-service
npx husky init
```

### 4. Create Pre-commit Hook

**File:** `scry-storybook-upload-service/.husky/pre-commit` (NEW)

```bash
pnpm vitest run
npx lint-staged
```

### 5. Add Prettier Config (if not present)

Check if prettier config exists. If not, create one consistent with the rest of the monorepo.

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/.husky/pre-commit` | Pattern to copy |
| `scry-storybook-upload-service/package.json` | Target to update |
| `scry-storybook-upload-service/vitest.config.ts` | Test config (tests run in hook) |

---

## Verification

1. `pnpm vitest run` passes
2. Make a small change, `git add`, `git commit` - hook fires
3. Tests run and pass before commit
4. Prettier formats staged files
5. Commit succeeds when all checks pass
