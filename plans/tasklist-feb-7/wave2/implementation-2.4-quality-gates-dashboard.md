# Task 2.4: Quality Gates - husky + lint-staged for scry-developer-dashboard

## Overview

Add pre-commit hooks to the developer dashboard using husky and lint-staged, ensuring tests, linting, and formatting run before every commit.

**Time Estimate:** 30 min
**Target Repo:** `scry-developer-dashboard`
**Agent Tools Required:** Code-only (read/write files, `pnpm install`, `pnpm test`)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| Q-001 | Vitest run time too slow for pre-commit | Medium | Medium | Medium |
| Q-002 | ESLint Next.js rules produce too many warnings | Low | Low | Low |

**Overall Risk: Low**

**Mitigation:**
- Q-001: Consider running only related tests via `vitest related` in lint-staged instead of full suite. Start with full suite and optimize if needed.
- Q-002: Start with `pnpm run lint` (which uses `next lint`), fix any blocking issues.

---

## File-by-file Plan

### 1. Install Dependencies

```bash
cd scry-developer-dashboard
pnpm add -D husky lint-staged
```

### 2. Update package.json

**File:** `scry-developer-dashboard/package.json`

Add to `scripts`:
```json
"prepare": "husky"
```

Add `lint-staged` config:
```json
"lint-staged": {
  "**/*.{ts,tsx}": ["prettier --write"],
  "**/*.{js,jsx}": ["prettier --write"],
  "**/*.{json,md}": ["prettier --write"]
}
```

### 3. Initialize Husky

```bash
cd scry-developer-dashboard
npx husky init
```

### 4. Create Pre-commit Hook

**File:** `scry-developer-dashboard/.husky/pre-commit` (NEW)

```bash
pnpm run lint
npx lint-staged
```

Note: Starting without test run in pre-commit since vitest may be slow. Tests should run in CI instead. If tests are fast enough, add `pnpm vitest run` as the first line.

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/.husky/pre-commit` | Pattern to copy |
| `scry-cdn-service/package.json` | lint-staged config reference |
| `scry-developer-dashboard/package.json` | Target to update |

---

## Verification

1. `pnpm run lint` passes
2. Make a small change, `git add`, `git commit` - hook fires
3. Lint runs and catches issues
4. Prettier formats staged files
5. Commit succeeds when lint passes
