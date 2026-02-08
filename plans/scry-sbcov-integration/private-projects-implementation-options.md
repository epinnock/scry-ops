# Private Projects Implementation Options

## Goal
Implement private project access control so that projects are no longer viewable with just a link. The solution should be:
- **Easy and straightforward to implement**
- **Easy to understand and maintain**
- **Secure**

---

## Option 1: Authenticated Access Only (No Public Share Links)

### Rating: 9/10

### Description
Only signed-in project members can view artifacts (Storybook, coverage reports). No public share links are generated or supported.

### How It Works
1. **Dashboard**: All artifact views require Firebase authentication
2. **CDN Service**: Validates JWT tokens from authenticated users
3. **Firestore**: Stores project membership; access checks verify user is a member
4. **CLI**: Continues to print view URLs, but viewing requires login

### Implementation Steps
1. Add `visibility: 'public' | 'private'` field to project documents in Firestore (default: `'public'`)
2. Add visibility toggle in Project Settings UI (admin/owner only)
3. Update dashboard routes to check project membership before rendering (when private)
4. Add token validation middleware to CDN service for private projects
5. Dashboard fetches artifacts via server-side proxy (already exists at `/api/view/[...path]`)

### Visibility Toggle
- **Who can toggle**: Project owners and admins only
- **Where**: Project Settings page in dashboard
- **Behavior**:
  - Public → Private: Immediate effect, unauthenticated access blocked
  - Private → Public: Immediate effect, anyone with link can view

### Pros
- Simplest secure model
- No token management or revocation logic
- Easy to reason about: "members only"
- Minimal new code

### Cons
- Cannot share with external stakeholders without adding them as members
- Requires login for all private project views

### Effort Estimate
- Dashboard: ~2-3 days
- CDN Service: ~1-2 days
- Testing: ~1 day

---

## Option 2: Private by Default + Revocable Share Tokens

### Rating: 8/10

### Description
Projects are private by default. Owners can generate share tokens (per-project or per-build) that grant read-only access. Tokens are stored in Firestore and can be revoked.

### How It Works
1. **Dashboard**: Provides UI to generate/revoke share tokens
2. **Firestore**: Stores share tokens with metadata (projectId, buildId, createdAt, expiresAt, revoked)
3. **CDN Service**: Validates `?token=xxx` query parameter against Firestore
4. **CLI**: Can optionally request a share token and print it with the view URL

### Implementation Steps
1. Add `visibility: 'public' | 'private'` field to project documents in Firestore (default: `'public'`)
2. Add visibility toggle in Project Settings UI (admin/owner only)
3. Add `shareTokens` subcollection to projects in Firestore
4. Create dashboard API routes: `POST /api/projects/:id/share-tokens`, `DELETE /api/projects/:id/share-tokens/:tokenId`
5. Add share token validation middleware to CDN service
6. Update dashboard UI with "Generate Share Link" button (only shown for private projects)
7. Add token expiry and revocation checks

### Visibility Toggle
- **Who can toggle**: Project owners and admins only
- **Where**: Project Settings page in dashboard
- **Behavior**:
  - Public → Private: Immediate effect, unauthenticated access blocked (existing share tokens still work)
  - Private → Public: Immediate effect, anyone with link can view (share tokens become unnecessary but remain valid)
- **Share tokens**: Only meaningful for private projects; UI hides token management when public

### Pros
- Balanced usability and security
- External sharing without adding members
- Revocation provides control
- Optional expiry for time-limited access

### Cons
- More moving parts than Option 1
- Token storage and validation adds complexity
- Need to handle token in URLs (query param or path segment)

### Effort Estimate
- Dashboard: ~3-4 days
- CDN Service: ~2 days
- Firestore schema: ~0.5 days
- Testing: ~1-2 days

---

## Option 3: Signed URLs with Short TTL (Stateless)

### Rating: 6/10

### Description
Generate cryptographically signed URLs with embedded expiry. No server-side token storage; validation is purely cryptographic.

### How It Works
1. **Dashboard/CLI**: Signs URLs using a shared secret (HMAC) or asymmetric key
2. **CDN Service**: Validates signature and expiry on each request
3. **No Firestore storage**: Tokens are self-contained

### Implementation Steps
1. Implement URL signing utility (HMAC-SHA256 with secret key)
2. Add signature validation middleware to CDN service
3. Dashboard generates signed URLs on-demand for private projects
4. Implement key rotation strategy

### Pros
- Highly scalable (no database lookups)
- Secure if keys are managed properly
- No revocation storage needed

### Cons
- Cannot revoke individual links (only rotate keys)
- Short TTL means links expire quickly; users need to regenerate
- Key management adds operational complexity
- Harder to debug (no audit trail without logging)

### Effort Estimate
- Dashboard: ~2-3 days
- CDN Service: ~2-3 days
- Key management: ~1-2 days
- Testing: ~2 days

---

## Comparison Matrix

| Criteria                     | Option 1 (Auth Only) | Option 2 (Share Tokens) | Option 3 (Signed URLs) |
|------------------------------|:--------------------:|:-----------------------:|:----------------------:|
| **Overall Rating**           | 9/10                 | 8/10                    | 6/10                   |
| **Implementation Simplicity**| ★★★★★                | ★★★★☆                   | ★★★☆☆                  |
| **Maintainability**          | ★★★★★                | ★★★★☆                   | ★★★☆☆                  |
| **Security**                 | ★★★★★                | ★★★★★                   | ★★★★☆                  |
| **External Sharing**         | ★★☆☆☆                | ★★★★★                   | ★★★★☆                  |
| **Revocation Control**       | N/A                  | ★★★★★                   | ★★☆☆☆                  |
| **Effort (days)**            | ~4-6                 | ~7-10                   | ~7-10                  |

---

## Recommendation

### For Maximum Simplicity: **Option 1**
If you can accept "members only" access and don't need external sharing, Option 1 is the clear winner. It's the easiest to implement, understand, and maintain.

### For Balanced Usability: **Option 2**
If you need to share with external stakeholders (clients, reviewers) without adding them as project members, Option 2 provides a good balance. The added complexity is manageable and the revocation capability is valuable.

### Not Recommended: **Option 3**
While technically elegant, signed URLs add operational complexity (key rotation, no revocation) that doesn't align with your goals of simplicity and maintainability.

---

## Next Steps

1. **Choose an option** based on your sharing requirements
2. **Create detailed implementation plan** for the chosen option
3. **Update Firestore schema** with new fields
4. **Implement in phases**: Dashboard → CDN → CLI
5. **Test thoroughly** before making R2 bucket private

---

## Related Documents
- [`private-bucket-cdn-url-plan.md`](./private-bucket-cdn-url-plan.md) - CDN URL rewriting for private buckets
- [`01-scry-developer-dashboard-spec.md`](./01-scry-developer-dashboard-spec.md) - Dashboard specification
- [`04-scry-cdn-service-spec.md`](./04-scry-cdn-service-spec.md) - CDN service specification
