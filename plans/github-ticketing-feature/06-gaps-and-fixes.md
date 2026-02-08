# 06 – Identified Gaps and Fixes

This document captures potential issues identified during planning review and their recommended fixes.

---

## Gap 1: Same Story, Different Errors

### Problem
Fingerprint is story-based, not error-based. Same story failing for different reasons on different branches would be linked to the same issue.

### Example
```
Branch A: Button/Primary fails → "TypeError: undefined is not a function"
Branch B: Button/Primary fails → "Assertion failed: expected color to be red"

Both have fingerprint: "a1b2c3d4e5f67890"
But they're different bugs!
```

### Fix: Error Fingerprint

Include an error fingerprint in the issue linking key:

```typescript
// Generate error fingerprint from failure details
function generateErrorFingerprint(failure: StoryFailure): string {
  const errorType = failure.failureType; // 'render_error', 'play_function', etc.
  const errorPrefix = failure.message.substring(0, 50); // First 50 chars
  const canonical = `${errorType}::${errorPrefix}`;
  return hash(canonical).substring(0, 8); // 8 hex chars
}

// Composite key for issue linking
const issueLinkKey = `${storyFingerprint}_${errorFingerprint}`;
// Example: "a1b2c3d4e5f67890_TypeError1"
```

### Updated Firestore Schema

```typescript
// issueLinks/{storyFingerprint}_{errorFingerprint}
{
  storyFingerprint: "a1b2c3d4e5f67890",
  errorFingerprint: "TypeError1",
  storyId: "button--primary",
  errorType: "render_error",
  errorMessage: "TypeError: undefined is not a function",
  issueNumber: 42,
  issueState: "open",
  // ...
}
```

### Affected Files
- `scry-sbcov/src/utils/fingerprint.ts` – Add `generateErrorFingerprint()`
- `scry-sbcov/src/types/index.ts` – Add `errorFingerprint` to `StoryFailure`
- `scry-developer-dashboard/lib/types/github.types.ts` – Update `IssueLink` type
- Dashboard API routes – Use composite key for lookups

---

## Gap 2: Flaky Tests Create Issue Churn

### Problem
A flaky story that passes/fails intermittently will create/close issues repeatedly.

### Fix: Flaky Detection

Track issue lifecycle history and detect flaky patterns:

```typescript
// issueLinks/{key}
{
  // ... existing fields
  
  // Flaky detection
  lifecycleHistory: [
    { event: 'created', buildId: 'build-1', timestamp: Timestamp },
    { event: 'closed', buildId: 'build-3', timestamp: Timestamp },
    { event: 'reopened', buildId: 'build-4', timestamp: Timestamp },
    { event: 'closed', buildId: 'build-6', timestamp: Timestamp },
  ],
  flakyScore: 3,  // Number of close/reopen cycles
  isFlaky: true,  // flakyScore >= 2
}
```

### Flaky Handling Policy
- If `isFlaky: true`, skip auto-close
- Show "Flaky" badge in UI
- Require manual confirmation to close

---

## Gap 3: Private Repo Access Verification

### Problem
User configures a private repo, but the GitHub App doesn't have access.

### Fix: Validation API Route

```typescript
// app/api/github/repos/[owner]/[repo]/validate/route.ts

export async function GET(request, { params }) {
  const { owner, repo } = params;
  
  // 1. Find installation for owner
  const installation = await findInstallationForOwner(owner);
  if (!installation) {
    return Response.json({
      valid: false,
      error: 'no_installation',
      message: `GitHub App is not installed on ${owner}`,
      installUrl: 'https://github.com/apps/scry-storybook/installations/new'
    }, { status: 404 });
  }
  
  // 2. Check repo access
  const hasAccess = await checkRepoAccess(installation.id, owner, repo);
  if (!hasAccess) {
    return Response.json({
      valid: false,
      error: 'no_repo_access',
      message: `App installed but no access to ${repo}`,
      settingsUrl: `https://github.com/organizations/${owner}/settings/installations/${installation.id}`
    }, { status: 403 });
  }
  
  // 3. Check permissions
  const permissions = await getInstallationPermissions(installation.id);
  if (permissions.issues !== 'write') {
    return Response.json({
      valid: false,
      error: 'insufficient_permissions',
      message: 'App needs Issues: Read & Write permission'
    }, { status: 403 });
  }
  
  return Response.json({ valid: true, installationId: installation.id });
}
```

### UI Integration
- Call validation when user enters repo URL
- Show appropriate error message with action link
- Block save until validation passes

---

## Gap 4: Webhook Delivery Failures

### Problem
If GitHub webhooks fail to deliver, Firestore issue state becomes stale.

### Fix: Periodic Sync + Manual Refresh

```typescript
// Periodic sync job (Cloud Function or cron)
async function syncIssueStates(projectId: string) {
  const issueLinks = await getIssueLinks(projectId);
  const installation = await getProjectInstallation(projectId);
  const token = await getInstallationToken(installation.id);
  
  for (const link of issueLinks) {
    const issue = await fetchGitHubIssue(token, link.owner, link.repo, link.issueNumber);
    if (issue.state !== link.issueState) {
      await updateIssueLink(link.id, { issueState: issue.state, lastSyncedAt: now() });
    }
  }
}

// Manual refresh button in UI
// POST /api/projects/{id}/issues/sync
```

---

## Gap 5: Rate Limiting

### Problem
Bulk issue creation or metadata fetching can hit GitHub rate limits.

### Fix: Rate Limit Handling

```typescript
// lib/services/github-app.service.ts

async function callGitHubWithRateLimit(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  
  // Check rate limit headers
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
  const resetTime = parseInt(response.headers.get('X-RateLimit-Reset') || '0');
  
  if (response.status === 403 && remaining === 0) {
    const waitMs = (resetTime * 1000) - Date.now();
    throw new RateLimitError(`Rate limited. Retry after ${waitMs}ms`, waitMs);
  }
  
  return response;
}

// Bulk issue creation with delays
async function createIssuesBulk(issues: IssueCreateRequest[]) {
  const results = [];
  for (const issue of issues) {
    try {
      const result = await createIssue(issue);
      results.push(result);
      await delay(2000); // 2 second delay between issues
    } catch (e) {
      if (e instanceof RateLimitError) {
        await delay(e.waitMs);
        // Retry
      }
    }
  }
  return results;
}
```

---

## Gap 6: Bulk Selection Creates Giant Issue

### Problem
Selecting 50 failing stories creates one issue with 50 failures.

### Fix: Issue Creation Mode Selection

```typescript
// UI options in GitHubIssueModal
type IssueCreationMode = 
  | 'single'      // One issue for all selected stories
  | 'per-story'   // One issue per story
  | 'per-component'; // One issue per component

// Default to per-story for small selections, per-component for large
const defaultMode = selectedStories.length <= 5 ? 'per-story' : 'per-component';
```

### Preview Before Creation
- Show preview: "This will create N issues"
- List issue titles before confirming

---

## Gap 7: Auto-Close Policy Conflicts

### Problem
Auto-close might close an issue with active human discussion.

### Fix: Activity Check + Comment

```typescript
// Before auto-closing
async function shouldAutoClose(issueLink: IssueLink): Promise<boolean> {
  // Check for recent human activity
  const comments = await fetchIssueComments(issueLink.issueNumber);
  const recentComments = comments.filter(c => 
    c.created_at > issueLink.lastSyncedAt &&
    !c.user.login.includes('[bot]')
  );
  
  if (recentComments.length > 0) {
    // Add label instead of closing
    await addLabel(issueLink.issueNumber, 'ready-to-close');
    return false;
  }
  
  return true;
}

// When closing, add explanatory comment
await addComment(issueNumber, 
  `🤖 Auto-closed by Scry: Story "${storyName}" passed in builds ${buildIds.join(', ')}.`
);
```

---

## Summary: Implementation Priority

| Gap | Priority | Complexity | Phase |
|-----|----------|------------|-------|
| Error fingerprint | P0 | Medium | v2.0 |
| Repo access validation | P0 | Low | v2.0 |
| Flaky detection | P1 | Medium | v2.1 |
| Webhook sync | P1 | Medium | v2.1 |
| Rate limiting | P1 | Low | v2.0 |
| Bulk mode options | P2 | Low | v2.1 |
| Auto-close activity check | P2 | Low | v2.1 |

---

## Updated Fingerprint Schema

### Story Fingerprint (unchanged)
```
storyFingerprint = SHA256(storyFilePath + "::" + storyExportName)[0:16]
```

### Error Fingerprint (new)
```
errorFingerprint = SHA256(failureType + "::" + errorMessage[0:50])[0:8]
```

### Composite Issue Link Key
```
issueLinkKey = storyFingerprint + "_" + errorFingerprint
Example: "a1b2c3d4e5f67890_abc12345"
```
