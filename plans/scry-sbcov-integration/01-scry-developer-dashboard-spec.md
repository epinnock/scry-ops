# scry-developer-dashboard Implementation Spec

## Overview

Add Storybook coverage report viewing capabilities to the developer dashboard, including:
- Coverage summary display on build cards
- Dedicated coverage detail page
- Data fetching from R2 storage

---

## 1. Type Definitions

### File: `lib/types/project.types.ts`

Add coverage-related types to the existing Build interface:

```typescript
// Add new interfaces
export interface CoverageSummary {
  componentCoverage: number;
  propCoverage: number;
  variantCoverage: number;
  passRate: number;
  totalComponents: number;
  componentsWithStories: number;
  failingStories: number;
}

export interface QualityGateCheck {
  name: string;
  threshold: number;
  actual: number;
  passed: boolean;
}

export interface QualityGateResult {
  passed: boolean;
  checks: QualityGateCheck[];
}

export interface BuildCoverage {
  reportUrl: string;
  summary: CoverageSummary;
  qualityGate: QualityGateResult;
  generatedAt: string;
}

// Extend existing Build interface
export interface Build {
  id: string;
  projectId: string;
  versionId: string;
  buildNumber: number;
  zipUrl: string;
  status: BuildStatus;
  createdAt: Date;
  createdBy: string;
  archivedAt?: Date;
  archivedBy?: string;
  // NEW
  coverage?: BuildCoverage;
}

// Extend BuildDoc for Firestore
export interface BuildDoc {
  // ... existing fields
  coverage?: {
    reportUrl: string;
    summary: CoverageSummary;
    qualityGate: QualityGateResult;
    generatedAt: string;
  };
}
```

---

## 2. Build Service Updates

### File: `lib/services/build.service.ts`

Update the BuildService to handle coverage data:

```typescript
// Update CreateBuildData interface
export interface CreateBuildData {
  projectId: string;
  versionId: string;
  zipUrl: string;
  // NEW
  coverage?: {
    reportUrl: string;
    summary: CoverageSummary;
    qualityGate: QualityGateResult;
    generatedAt: string;
  };
}

// Update createBuild method to include coverage
async createBuild(
  projectId: string,
  userId: string,
  data: CreateBuildData
): Promise<Build> {
  return this.db.runTransaction(async (transaction) => {
    // ... existing counter logic ...
    
    const buildData = {
      projectId,
      versionId: data.versionId,
      buildNumber,
      zipUrl: data.zipUrl,
      status: 'active' as const,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userId,
      // NEW: Include coverage if provided
      ...(data.coverage && { coverage: data.coverage }),
    };
    
    // ... rest of method
  });
}

// Add method to update coverage for existing build
async updateBuildCoverage(
  projectId: string,
  buildId: string,
  coverage: BuildCoverage
): Promise<void> {
  const buildRef = this.db.doc(`projects/${projectId}/builds/${buildId}`);
  await buildRef.update({ coverage });
}
```

---

## 3. API Route Updates

### File: `app/api/projects/[id]/builds/route.ts`

Update the builds API to accept coverage data:

```typescript
// POST handler - create build with optional coverage
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { versionId, zipUrl, coverage } = await request.json();
  
  // Validate coverage if provided
  if (coverage) {
    if (!coverage.reportUrl || !coverage.summary || !coverage.qualityGate) {
      return NextResponse.json(
        { error: 'Invalid coverage data' },
        { status: 400 }
      );
    }
  }
  
  const build = await buildService.createBuild(params.id, userId, {
    projectId: params.id,
    versionId,
    zipUrl,
    coverage,
  });
  
  return NextResponse.json(build);
}
```

### File: `app/api/projects/[id]/builds/[buildId]/coverage/route.ts` (NEW)

New API route for coverage-specific operations:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { buildService } from '@/lib/services/build.service';
import { verifyAuth } from '@/lib/auth-helpers';

// GET - fetch coverage report URL
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; buildId: string } }
) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const build = await buildService.getBuild(params.id, params.buildId);
  
  if (!build) {
    return NextResponse.json({ error: 'Build not found' }, { status: 404 });
  }
  
  if (!build.coverage) {
    return NextResponse.json({ error: 'No coverage data' }, { status: 404 });
  }
  
  return NextResponse.json({
    reportUrl: build.coverage.reportUrl,
    summary: build.coverage.summary,
    qualityGate: build.coverage.qualityGate,
  });
}

// PUT - update coverage for existing build
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; buildId: string } }
) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const coverage = await request.json();
  
  await buildService.updateBuildCoverage(params.id, params.buildId, coverage);
  
  return NextResponse.json({ success: true });
}
```

---

## 4. React Hooks Updates

### File: `lib/hooks/useBuilds.ts`

No changes needed - builds already include all fields. Coverage will be included automatically.

### File: `lib/hooks/useCoverageReport.ts` (NEW)

New hook for fetching full coverage report:

```typescript
import { useQuery } from '@tanstack/react-query';

interface UseCoverageReportOptions {
  projectId: string;
  buildId: string;
  enabled?: boolean;
}

export function useCoverageReport({ projectId, buildId, enabled = true }: UseCoverageReportOptions) {
  return useQuery({
    queryKey: ['coverage-report', projectId, buildId],
    queryFn: async () => {
      // First get the report URL from our API
      const metaResponse = await fetch(`/api/projects/${projectId}/builds/${buildId}/coverage`);
      if (!metaResponse.ok) {
        throw new Error('Failed to fetch coverage metadata');
      }
      const { reportUrl } = await metaResponse.json();
      
      // Then fetch the full report from R2
      const reportResponse = await fetch(reportUrl);
      if (!reportResponse.ok) {
        throw new Error('Failed to fetch coverage report');
      }
      
      return reportResponse.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - reports don't change
  });
}
```

---

## 5. UI Components

### File: `components/coverage/CoverageBadge.tsx` (NEW)

Small badge component for displaying coverage on build cards:

```typescript
'use client';

import { Badge } from '@/components/ui/badge/Badge';
import { Progress } from '@/components/ui/progress/Progress';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { CoverageSummary, QualityGateResult } from '@/lib/types/project.types';

interface CoverageBadgeProps {
  summary: CoverageSummary;
  qualityGate: QualityGateResult;
  compact?: boolean;
}

export function CoverageBadge({ summary, qualityGate, compact = false }: CoverageBadgeProps) {
  const coverage = summary.componentCoverage;
  const status = qualityGate.passed ? 'passed' : 'failed';
  
  if (compact) {
    return (
      <Badge variant={status === 'passed' ? 'default' : 'destructive'}>
        {status === 'passed' ? (
          <CheckCircle2 className="h-3 w-3 mr-1" />
        ) : (
          <XCircle className="h-3 w-3 mr-1" />
        )}
        {coverage.toFixed(0)}%
      </Badge>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Coverage</span>
        <div className="flex items-center gap-2">
          <span className="font-medium">{coverage.toFixed(0)}%</span>
          <Badge 
            variant={status === 'passed' ? 'default' : 'destructive'}
            className="text-xs"
          >
            {status === 'passed' ? (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            ) : (
              <XCircle className="h-3 w-3 mr-1" />
            )}
            {status === 'passed' ? 'Passed' : 'Failed'}
          </Badge>
        </div>
      </div>
      <Progress value={coverage} className="h-2" />
    </div>
  );
}
```

### File: `components/coverage/CoverageDashboard.tsx` (NEW)

Adapted from `storybook-coverage-report/components/storybook-coverage-dashboard.tsx`:

```typescript
'use client';

import type React from 'react';
import { Card } from '@/components/ui/card/Card';
import { Badge } from '@/components/ui/badge/Badge';
import { Button } from '@/components/ui/button/Button';
import { Progress } from '@/components/ui/progress/Progress';
import { Input } from '@/components/ui/input/Input';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ExternalLink,
  FileCode,
  GitBranch,
  XCircle,
  Info,
  Search,
  GitCommit,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';

// Import types from scry-sbcov or define locally
import type { StorybookCoverageReport } from '@/types/coverage';

interface CoverageDashboardProps {
  report: StorybookCoverageReport;
  projectId: string;
  buildId: string;
  storybookUrl?: string;
}

export function CoverageDashboard({ 
  report, 
  projectId, 
  buildId,
  storybookUrl 
}: CoverageDashboardProps) {
  // ... adapted implementation from storybook-coverage-dashboard.tsx
  // Key changes:
  // 1. Add back navigation to builds
  // 2. Use dashboard UI components
  // 3. Link to Storybook viewer if URL provided
  
  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </Link>
        <div className="text-sm text-muted-foreground">
          Build #{buildId} Coverage Report
        </div>
      </div>
      
      {/* Rest of dashboard content - adapted from reference */}
      {/* ... */}
    </div>
  );
}
```

---

## 6. Coverage Page

### File: `app/projects/[id]/builds/[buildId]/coverage/page.tsx` (NEW)

New page for viewing full coverage report:

```typescript
'use client';

import { useParams } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard-sidebar/DashboardSidebar';
import { DashboardHeader } from '@/components/dashboard-header/DashboardHeader';
import { CoverageDashboard } from '@/components/coverage/CoverageDashboard';
import { useCoverageReport } from '@/lib/hooks/useCoverageReport';
import { useBuilds } from '@/lib/hooks/useBuilds';

export default function CoveragePage() {
  const params = useParams();
  const projectId = params.id as string;
  const buildId = params.buildId as string;
  
  const { data: report, isLoading, error } = useCoverageReport({
    projectId,
    buildId,
  });
  
  // Get build info for Storybook URL
  const { data: builds } = useBuilds(projectId);
  const build = builds?.find(b => b.id === buildId);
  const storybookUrl = build ? `https://view.scrymore.com/${projectId}/${build.versionId}/` : undefined;
  
  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading coverage report...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error || !report) {
    return (
      <div className="flex h-screen bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive">
              {error?.message || 'Coverage report not found'}
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardHeader 
          title="Coverage Report" 
          subtitle={`Build #${build?.buildNumber || buildId}`}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <CoverageDashboard 
            report={report}
            projectId={projectId}
            buildId={buildId}
            storybookUrl={storybookUrl}
          />
        </main>
      </div>
    </div>
  );
}
```

---

## 7. ProjectBuilds Component Updates

### File: `components/project-detail/ProjectBuilds.tsx`

Update to show coverage and link to coverage page:

```typescript
// Add imports
import { CoverageBadge } from '@/components/coverage/CoverageBadge';
import { BarChart3 } from 'lucide-react';
import Link from 'next/link';

// In the build card rendering, add coverage display:
{builds.map((build) => (
  <Card key={build.id}>
    <div className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Existing build info */}
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold">
              Build #{build.buildNumber}
            </h3>
            <Badge variant={build.status === 'active' ? 'default' : 'secondary'}>
              {build.status}
            </Badge>
          </div>
          
          {/* Version and date info */}
          <div className="space-y-1 text-sm">
            {/* ... existing fields ... */}
          </div>
          
          {/* NEW: Coverage summary */}
          {build.coverage && (
            <div className="mt-4 pt-4 border-t">
              <CoverageBadge 
                summary={build.coverage.summary}
                qualityGate={build.coverage.qualityGate}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Existing buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleView(build.versionId)}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View
          </Button>
          
          {/* NEW: Coverage button */}
          {build.coverage && (
            <Link href={`/projects/${projectId}/builds/${build.id}/coverage`}>
              <Button variant="outline" size="sm">
                <BarChart3 className="mr-2 h-4 w-4" />
                Coverage
              </Button>
            </Link>
          )}
          
          {/* ... rest of buttons ... */}
        </div>
      </div>
    </div>
  </Card>
))}
```

---

## 8. Types File for Coverage Report

### File: `types/coverage.ts` (NEW)

Copy the coverage report types from scry-sbcov or storybook-coverage-report:

```typescript
// Copy from storybook-coverage-report/types/coverage.ts
// This ensures type compatibility with the JSON reports

export interface StorybookCoverageReport {
  version: string;
  generatedAt: string;
  git: {
    commitSha: string;
    branch: string;
    baseBranch: string;
    baseCommitSha: string;
  };
  // ... rest of types
}

// ... all other interfaces
```

---

## 9. File Summary

| File | Action | Description |
|------|--------|-------------|
| `lib/types/project.types.ts` | Modify | Add coverage types to Build |
| `lib/services/build.service.ts` | Modify | Handle coverage in create/update |
| `app/api/projects/[id]/builds/route.ts` | Modify | Accept coverage in POST |
| `app/api/projects/[id]/builds/[buildId]/coverage/route.ts` | Create | Coverage-specific API |
| `lib/hooks/useCoverageReport.ts` | Create | Hook for fetching full report |
| `components/coverage/CoverageBadge.tsx` | Create | Coverage display badge |
| `components/coverage/CoverageDashboard.tsx` | Create | Full coverage dashboard |
| `app/projects/[id]/builds/[buildId]/coverage/page.tsx` | Create | Coverage detail page |
| `components/project-detail/ProjectBuilds.tsx` | Modify | Add coverage display and link |
| `types/coverage.ts` | Create | Coverage report type definitions |

---

## 10. Dependencies

No new npm dependencies required. Uses existing:
- `@tanstack/react-query` for data fetching
- Existing UI components (Card, Badge, Button, Progress, Input)
- `lucide-react` for icons

---

## 11. Testing Considerations

1. **Unit Tests:**
   - CoverageBadge component rendering
   - useCoverageReport hook behavior
   - Build service coverage methods

2. **Integration Tests:**
   - API routes for coverage
   - Coverage page data flow

3. **E2E Tests:**
   - Navigate from builds to coverage page
   - Coverage dashboard interactions
