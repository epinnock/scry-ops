# Task 3.1: Add 3 Latest Builds to Recent Activity on Project Overview

## Overview

The ProjectOverview component already has a "Recent Activity" card with static items (project created, last updated, team members). Enhance it to show the 3 most recent builds with version, status, timestamp, and links. The `useBuilds` hook is already imported and used.

**Time Estimate:** 45 min
**Target Repo:** `scry-developer-dashboard`
**Agent Tools Required:** Code-only (read/write files, run tests)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| RB-001 | Builds data takes too long to load, slows overview | Low | Medium | Low |
| RB-002 | Build data shape doesn't include needed fields | Low | Medium | Medium |
| RB-003 | Empty state (no builds) looks odd in activity feed | Medium | Low | Low |

**Overall Risk: Low** - Using existing hook and data, purely UI changes.

**Mitigation:**
- RB-001: Data is already fetched by `useBuilds()` hook which is already called on this page.
- RB-002: Check the `Build` type definition in `lib/types/project.types.ts` before implementation.
- RB-003: Add a "No builds yet" message or skip build entries if empty.

---

## File-by-file Plan

### 1. Review Current Data Shape

**File:** `scry-developer-dashboard/lib/types/project.types.ts`

Verify the Build interface has:
- `id` or `buildNumber`
- `versionId` (version name like `pr-123`, `main`)
- `createdAt` (timestamp)
- `status` (build status)
- `coverage?` (optional coverage data)

### 2. Update ProjectOverview Component

**File:** `scry-developer-dashboard/components/project-detail/ProjectOverview.tsx`

The component already imports `useBuilds` (L7) and calls it (L16). The "Recent Activity" card is at L117-174.

**Changes:**
1. Extract the 3 most recent builds from the `builds` array:
```tsx
const recentBuilds = useMemo(() => {
  if (!builds?.length) return [];
  return [...builds]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);
}, [builds]);
```

2. Add build entries to the Recent Activity list, between the existing static items:
```tsx
{recentBuilds.map((build) => (
  <div key={build.id} className="flex items-center gap-3">
    <Package className="h-4 w-4 text-muted-foreground" />
    <div className="flex-1">
      <p className="text-sm font-medium">
        Build deployed: {build.versionId}
        {build.buildNumber ? ` #${build.buildNumber}` : ''}
      </p>
      <p className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(build.createdAt), { addSuffix: true })}
      </p>
    </div>
    <Link href={`/projects/${projectId}/builds/${build.id}`}>
      <Button variant="ghost" size="sm">View</Button>
    </Link>
  </div>
))}
```

3. Handle loading state:
```tsx
{isLoadingBuilds && (
  <div className="space-y-3">
    <Skeleton className="h-8 w-full" />
    <Skeleton className="h-8 w-full" />
  </div>
)}
```

4. Optionally add `CoverageBadge` if build has coverage data:
```tsx
import { CoverageBadge } from '@/components/coverage/CoverageBadge';
// In the build entry:
{build.coverage && (
  <CoverageBadge coverage={build.coverage.summary.componentCoverage} />
)}
```

### 3. Add Missing Imports

May need to add:
- `Package` from `lucide-react` (for build icon)
- `Link` from `next/link`
- `formatDistanceToNow` from `date-fns`
- `Skeleton` from UI components
- `useMemo` from `react`

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-developer-dashboard/components/project-detail/ProjectOverview.tsx` | Target component (L117-174 Recent Activity) |
| `scry-developer-dashboard/lib/hooks/useBuilds.ts` | Data hook (already imported) |
| `scry-developer-dashboard/components/project-detail/ProjectBuilds.tsx` | Reference for build display patterns |
| `scry-developer-dashboard/lib/types/project.types.ts` | Build type definition |
| `scry-developer-dashboard/components/coverage/CoverageBadge.tsx` | Optional coverage badge |

---

## Verification

1. Project overview page renders without errors
2. 3 most recent builds appear in Recent Activity
3. Builds are sorted by date (newest first)
4. Each build shows version, timestamp, and link
5. Empty state (no builds) doesn't break the layout
6. Loading skeleton shows while builds are fetching
7. Clicking "View" navigates to the build detail page
