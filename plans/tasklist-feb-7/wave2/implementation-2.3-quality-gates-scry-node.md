# Task 2.3: Quality Gates - husky + lint-staged for scry-node

## Overview

Add pre-commit hooks to scry-node CLI project using husky and lint-staged, copying the pattern established in scry-cdn-service. This ensures tests pass and code is formatted before every commit.

**Time Estimate:** 30 min
**Target Repo:** `scry-node`
**Agent Tools Required:** Code-only (read/write files, `npm install`, `npm test`)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| Q-001 | Pre-commit hook blocks developers due to flaky tests | Low | Medium | Medium |
| Q-002 | Husky not triggering in CI environments | Low | Low | Low |
| Q-003 | lint-staged modifies files unexpectedly | Low | Low | Low |

**Overall Risk: Low** - Well-established pattern, copying from working implementation.

**Mitigation:**
- Q-001: Developers can use `--no-verify` in emergencies. Tests should be fast and reliable.
- Q-002: CI typically doesn't run git hooks; this is intentional.
- Q-003: Only apply `prettier --write` which is idempotent.

---

## File-by-file Plan

### 1. Install Dependencies

```bash
cd scry-node
npm install --save-dev husky lint-staged prettier
```

### 2. Update package.json

**File:** `scry-node/package.json`

Add to `scripts`:
```json
"prepare": "husky"
```

Add `lint-staged` config:
```json
"lint-staged": {
  "lib/**/*.js": ["prettier --write"],
  "bin/**/*.js": ["prettier --write"]
}
```

### 3. Initialize Husky

```bash
cd scry-node
npx husky init
```

### 4. Create Pre-commit Hook

**File:** `scry-node/.husky/pre-commit` (NEW)

```bash
npm test
npx lint-staged
```

Pattern copied from `scry-cdn-service/.husky/pre-commit`.

### 5. Add Prettier Config (if not present)

**File:** `scry-node/.prettierrc` (NEW, if needed)

```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Check if a prettier config already exists in `package.json` or a dotfile first.

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-cdn-service/.husky/pre-commit` | Pattern to copy |
| `scry-cdn-service/package.json` | lint-staged config reference (L64-68) |
| `scry-node/package.json` | Target to update |
| `scry-node/jest.config.js` | Existing test config (tests must pass in hook) |

---

## Verification

1. `npm test` passes
2. Make a small whitespace change, `git add`, `git commit` - hook should fire
3. Tests run before commit
4. Prettier formats staged files
5. Commit succeeds if tests pass and lint is clean
