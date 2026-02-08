# Task 5.1: Deploy figma-scry as Private Repo

## Overview

Set up deployment for the html2fig/figma-scry project as a private GitHub repository. The goal is to keep the Figma integration source code private since it's a key differentiator (alpha feature).

**Time Estimate:** 45 min
**Target Repo:** `html2fig` (deployment to private GitHub repo)
**Agent Tools Required:** GitHub access (create private repo, configure Actions), npm access (if publishing)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| FD-001 | Private repo limits CI/CD options (GitHub Actions minutes) | Low | Medium | Low |
| FD-002 | Private npm package requires auth token management | Medium | Medium | Medium |
| FD-003 | Dependencies from other Scry services can't access private repo | Medium | High | High |

**Mitigation:**
- FD-001: GitHub Free includes 2000 CI minutes/month for private repos. Sufficient for this project.
- FD-002: Use GitHub Packages instead of npm registry for private packages. Tokens managed via GitHub Actions secrets.
- FD-003: Use GitHub Packages with `@scrymore` scope. Other services authenticate via `GITHUB_TOKEN` or `NPM_TOKEN` secret.

---

## Implementation Steps

### 1. Review Current Project Structure

**File:** `html2fig/` directory

Identify:
- Which sub-packages to deploy (html2figma, html-to-figma, or both)
- Build output format (library vs plugin vs service)
- Current dependencies and build scripts
- What needs to stay private vs what can be public

### 2. Create Private GitHub Repository

Options:
- **Option A:** Create `scrymore/figma-scry` as a private repo, copy relevant code
- **Option B:** Create `scrymore/html2fig` as a private repo mirroring current structure

Recommended: Option A - create a focused private repo with only the Figma plugin code.

### 3. Set Up GitHub Actions Workflow

**File:** `.github/workflows/deploy.yml` (in new repo)

```yaml
name: Build and Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm test

  publish:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://npm.pkg.github.com'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4. Configure Package for GitHub Packages

**File:** `package.json` (in new repo)

```json
{
  "name": "@scrymore/figma-scry",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/scrymore/figma-scry.git"
  }
}
```

### 5. Document Access

**File:** `README.md` (in new repo)

Document:
- How to install from GitHub Packages
- Required auth tokens for consumers
- Build and development instructions
- Deployment process

---

## Reference Files

| File | Purpose |
|------|---------|
| `html2fig/` | Source code to deploy |
| `html2fig/STORYBOOK_TO_FIGMA_SPEC.md` | Feature specification |
| `futureplans/figma/figma-scry-integration-plan.md` | Integration plan |

---

## Verification

1. Private repo created and code pushed
2. GitHub Actions build passes
3. Package published to GitHub Packages
4. Other services can install `@scrymore/figma-scry` with proper auth
5. No source code is publicly accessible
