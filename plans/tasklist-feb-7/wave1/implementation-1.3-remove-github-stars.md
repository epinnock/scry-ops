# Task 1.3: Remove GitHub Stars from Landing Page

## Overview

Remove all GitHub star references from the Scry landing page. Currently there's a "Star on GitHub" button in the nav and a "2.4k GitHub stars" social proof item.

**Time Estimate:** 15 min
**Target Repo:** `scry-landing-page`
**Agent Tools Required:** Code-only (read/write files, `pnpm dev` for visual verify)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| G-001 | Removing nav item breaks layout spacing | Low | Low | Low |
| G-002 | Unused imports left behind cause lint errors | Low | Low | Low |

**Overall Risk: Very Low** - Simple UI removal in a single file.

---

## File-by-file Plan

### 1. Edit Landing Page

**File:** `scry-landing-page/app/page.tsx`

**Change 1:** Remove "Star on GitHub" button in navigation (approximately L67-77):
```tsx
// REMOVE this block:
<a href="https://github.com/epinnock/scry-node">
  <Github className="w-4 h-4" />
  <span className="text-sm">Star on GitHub</span>
</a>
```

**Change 2:** Remove "2.4k GitHub stars" social proof text (approximately L171-174):
```tsx
// REMOVE this block:
<div>
  <Star className="..." />
  <span>2.4k GitHub stars</span>
</div>
```

**Change 3:** Clean up imports (L7):
- Remove `Star` from lucide-react imports (will be unused)
- Keep `Github` only if still used elsewhere in the file

---

## Verification

1. `pnpm dev` starts without errors
2. Landing page renders correctly without gaps
3. No unused import warnings
4. Nav bar spacing looks natural without the star button
