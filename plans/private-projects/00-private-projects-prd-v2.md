# Private Projects PRD v2

## Executive Summary

Implement private project visibility using **Shared JWT (Parent Domain Cookie)** authentication. This approach allows project owners to restrict access to Storybook and coverage reports to authenticated project members only.

---

## Problem Statement

Currently, all Scry projects are publicly accessible via their URLs. Anyone with a link can view:
- Storybook deployments
- Coverage reports
- Build history

Many teams need to keep their component libraries and coverage data private for:
- Proprietary UI components
- Internal tooling
- Pre-release features
- Compliance requirements

---

## Solution: Shared JWT Authentication

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Login Flow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. User logs into dashboard.scrymore.com                           │
│                                                                      │
│  2. Dashboard creates Firebase session cookie                        │
│     Cookie: __session=<JWT>                                         │
│     Domain: .scrymore.com  ← Parent domain!                         │
│                                                                      │
│  3. User clicks link to view.scrymore.com/project/v1/               │
│     Browser automatically sends __session cookie                     │
│                                                                      │
│  4. CDN Worker validates JWT using Google's public keys             │
│     - Checks project visibility                                      │
│     - Checks user membership                                         │
│                                                                      │
│  5. If authorized → serve content                                    │
│     If not → return 401/403                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Single login** | Log in once on dashboard, access all subdomains |
| **Unified URLs** | Same URL pattern for public and private projects |
| **No double auth** | Unlike Cloudflare Access, no separate login required |
| **Standard approach** | Uses Firebase's built-in session cookies |
| **Secure** | JWTs signed by Google, validated with public keys |

---

## Data Model

### Project Document

```typescript
interface Project {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  visibility: 'public' | 'private';  // NEW
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Default Behavior

- **New projects**: `visibility: 'public'` (backward compatible)
- **Existing projects**: Migration sets `visibility: 'public'`

---

## User Experience

### Setting Visibility

1. Navigate to project in dashboard
2. Go to **Settings** tab
3. Toggle **Private Project** switch
4. Confirm change

### Accessing Private Projects

**For project members:**
1. Log into dashboard (once)
2. Click any project link
3. Content loads automatically

**For non-members:**
1. Click project link
2. See "Unauthorized" message
3. Option to request access (future)

---

## Implementation Specs

| Component | Spec Document | Effort |
|-----------|---------------|--------|
| Dashboard | [01-dashboard-shared-jwt-spec.md](./01-dashboard-shared-jwt-spec.md) | 3-4 days |
| CDN Service | [02-cdn-service-shared-jwt-spec.md](./02-cdn-service-shared-jwt-spec.md) | 3-4 days |
| CLI | [03-cli-shared-jwt-spec.md](./03-cli-shared-jwt-spec.md) | 0.5 days |

**Total estimated effort**: 7-9 days

---

## Rollout Plan

### Phase 1: Infrastructure (Week 1)
- [ ] Dashboard: Session cookie endpoints
- [ ] CDN: JWT validation middleware
- [ ] CDN: Visibility check service

### Phase 2: UI & Testing (Week 2)
- [ ] Dashboard: Visibility toggle UI
- [ ] Integration tests
- [ ] Staging deployment

### Phase 3: Production (Week 3)
- [ ] Production deployment
- [ ] Migration of existing projects
- [ ] Documentation updates

---

## Success Criteria

1. **Functional**: Private projects return 401 for unauthenticated users
2. **Functional**: Private projects return 403 for non-members
3. **Functional**: Private projects load for authenticated members
4. **Performance**: <5ms latency impact (cached visibility)
5. **UX**: Single login works across all subdomains

---

## Future Enhancements

### Build-Level Visibility (v2)

Allow individual builds to override project visibility:

```typescript
interface Build {
  // ... existing fields
  visibility?: 'public' | 'private' | 'inherit';  // Default: 'inherit'
}
```

Use case: Make a specific build public for a demo while keeping the project private.

### Share Links (v3)

Generate time-limited share tokens for external reviewers:

```
https://view.scrymore.com/project/v1/?token=abc123
```

---

## Alternatives Considered

See [options-comparison-summary.md](./options-comparison-summary.md) for full analysis of 10 approaches evaluated.

**Why Shared JWT won:**
1. Best practice for cross-subdomain auth
2. Uses existing Firebase infrastructure
3. No additional services required
4. Single login experience
5. Unified URL structure

---

## References

- [Firebase Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [jose JWT Library](https://github.com/panva/jose)
- [Google Public Keys Endpoint](https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys)
