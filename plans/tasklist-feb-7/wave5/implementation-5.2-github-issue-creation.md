# Task 5.2: GitHub Issue Creation Flow (Dashboard Backend)

## Overview

Implement the backend API routes for creating GitHub issues from the Scry developer dashboard, following the v2 plans in `plans/github-ticketing-feature/`. Uses a GitHub App for authentication (not user OAuth tokens). This enables teams to create GitHub issues directly from coverage reports and component analysis results.

**Time Estimate:** 60 min
**Target Repo:** `scry-developer-dashboard`
**Agent Tools Required:** Code-only (read/write files, run tests). GitHub App registration requires browser/GitHub access (document as manual step).
**Dependencies:** Task 3.5 (GitHub App plan consolidation) must be complete

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| GI-001 | GitHub App JWT signing is complex to implement correctly | Medium | High | High |
| GI-002 | Installation token caching and refresh logic is error-prone | Medium | Medium | Medium |
| GI-003 | Webhook secret validation has security implications | Medium | High | High |
| GI-004 | Firestore schema for issue links conflicts with existing data | Low | Medium | Low |
| GI-005 | Rate limiting from GitHub API during heavy usage | Low | Medium | Low |

**Mitigation:**
- GI-001: Use `@octokit/auth-app` which handles JWT signing. Well-tested library.
- GI-002: Use `@octokit/auth-app` built-in installation token caching.
- GI-003: Use `@octokit/webhooks` for signature verification. Never skip validation.
- GI-004: Use a separate Firestore collection (`githubIssues`) to avoid conflicts.
- GI-005: Use Octokit's built-in rate limiting and retry logic.

---

## File-by-file Plan

### 1. Install Dependencies

```bash
cd scry-developer-dashboard
pnpm add @octokit/auth-app @octokit/rest @octokit/webhooks
```

### 2. Create GitHub App Service Module

**File:** `scry-developer-dashboard/lib/services/github-app.ts` (NEW)

```typescript
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

export class GitHubAppService {
  private appId: string;
  private privateKey: string;

  constructor() {
    this.appId = process.env.GITHUB_APP_ID!;
    this.privateKey = process.env.GITHUB_APP_PRIVATE_KEY!;
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: this.privateKey,
        installationId,
      },
    });
  }

  async createIssue(
    installationId: number,
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[]
  ) {
    const octokit = await this.getInstallationOctokit(installationId);
    return octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });
  }
}
```

### 3. Create API Route - Create Issue

**File:** `scry-developer-dashboard/app/api/github/issues/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GitHubAppService } from '@/lib/services/github-app';
import { verifyFirebaseToken } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  // 1. Verify Firebase auth token
  const user = await verifyFirebaseToken(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Parse request body
  const { installationId, owner, repo, title, body, labels, projectId, componentId } =
    await request.json();

  // 3. Create GitHub issue
  const github = new GitHubAppService();
  const issue = await github.createIssue(installationId, owner, repo, title, body, labels);

  // 4. Store issue link in Firestore
  // Save mapping: projectId + componentId -> GitHub issue URL

  return NextResponse.json({ issue: issue.data });
}
```

### 4. Create API Route - Webhook Handler

**File:** `scry-developer-dashboard/app/api/github/webhooks/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { Webhooks } from '@octokit/webhooks';

const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256')!;
  const payload = await request.text();

  // Verify webhook signature
  const isValid = await webhooks.verify(payload, signature);
  if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  const event = request.headers.get('x-github-event');
  const body = JSON.parse(payload);

  if (event === 'issues') {
    // Update issue status in Firestore
    // Handle: opened, closed, reopened, labeled, etc.
  }

  return NextResponse.json({ received: true });
}
```

### 5. Firestore Schema

**Collection:** `githubIssues`

```typescript
interface GitHubIssueDoc {
  projectId: string;
  componentId?: string;
  issueNumber: number;
  issueUrl: string;
  owner: string;
  repo: string;
  title: string;
  state: 'open' | 'closed';
  createdAt: Timestamp;
  createdBy: string; // Firebase UID
  updatedAt: Timestamp;
  labels: string[];
}
```

### 6. Environment Variables

**File:** `.env.local.example` (update)

```
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

### 7. Add Tests

**File:** `scry-developer-dashboard/lib/services/__tests__/github-app.test.ts` (NEW)

Test:
- JWT signing produces valid token
- createIssue calls Octokit correctly
- Error handling for invalid installations
- Webhook signature verification

---

## Manual Setup Steps (Document for Human)

1. Create GitHub App at https://github.com/settings/apps/new
   - Name: "Scry"
   - Permissions: Issues (Read & Write), Pull Requests (Read)
   - Webhook URL: `https://dashboard.scrymore.com/api/github/webhooks`
   - Generate and download private key
2. Install the app on target repositories
3. Note the App ID and Installation ID
4. Set environment variables in Vercel

---

## Reference Files

| File | Purpose |
|------|---------|
| `plans/github-ticketing-feature/05-v2-implementation-plan.md` | Detailed implementation plan |
| `plans/github-ticketing-feature/01-scry-developer-dashboard.md` | Dashboard-specific plan |
| `plans/github-ticketing-feature/06-gaps-and-fixes.md` | Known gaps |
| `scry-developer-dashboard/app/api/` | Existing API route patterns |

---

## Verification

1. `pnpm test` passes with new tests
2. POST `/api/github/issues` creates an issue (with mock GitHub API)
3. POST `/api/github/webhooks` validates signatures correctly
4. Invalid signatures are rejected with 401
5. Firestore document is created when issue is created
6. Error handling covers: invalid auth, missing params, GitHub API errors
