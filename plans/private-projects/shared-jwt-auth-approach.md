# Shared JWT Auth: Dashboard + CDN

## Future-Proofing: Visibility Flexibility

### Can users toggle public/private?

**Yes, absolutely.** The Shared JWT approach does NOT preclude toggling visibility.

The CDN checks visibility on each request:

```typescript
const visibility = await getProjectVisibility(projectId, env);

if (visibility === 'public') {
  return serveFromR2(request, env); // No auth needed
}

// Private: validate session cookie
const uid = await validateSessionCookie(cookie, env);
// ... membership check
```

Toggling `visibility` in Firestore immediately changes behavior.

### Can visibility be per-build/version?

**Yes, with a small schema extension.** The architecture supports this:

#### Option A: Project-level visibility (current plan)

```typescript
// Firestore: projects/{projectId}
{
  visibility: 'public' | 'private'
}
```

All builds inherit project visibility.

#### Option B: Build-level visibility override (future)

```typescript
// Firestore: projects/{projectId}/builds/{buildId}
{
  visibility?: 'public' | 'private' | 'inherit' // default: 'inherit'
}
```

CDN logic:

```typescript
async function getEffectiveVisibility(projectId: string, versionId: string, env: Env) {
  // Check build-level override first
  const build = await getBuild(projectId, versionId, env);
  if (build.visibility && build.visibility !== 'inherit') {
    return build.visibility;
  }
  
  // Fall back to project-level
  const project = await getProject(projectId, env);
  return project.visibility;
}
```

#### Example: "Latest public, others private"

```typescript
// Project: private by default
projects/my-project: { visibility: 'private' }

// Latest build: public override
projects/my-project/builds/latest: { visibility: 'public' }

// Other builds: inherit (private)
projects/my-project/builds/v1.0.0: { visibility: 'inherit' }
```

### Drawbacks of Shared JWT Approach

| Drawback | Mitigation |
|----------|------------|
| JWT validation in Worker | Use `jose` library; cache Google keys |
| Cookie size (~1KB) | Acceptable for modern browsers |
| Requires same parent domain | Already have `*.scrymore.com` ✅ |
| Google key rotation | Cache with TTL from response headers |
| No external sharing (non-members) | Add share tokens later (Option 5) |

### What this approach does NOT preclude

- ✅ Project-level visibility toggle
- ✅ Build-level visibility override
- ✅ "Latest public, others private" pattern
- ✅ Adding share tokens later for external users
- ✅ Revoking access by removing membership
- ✅ Audit logging (who accessed what)

---

## First Principles

**Goal**: User logs in once (dashboard), and that auth works on both:
- `dashboard.scrymore.com` (Next.js app)
- `view.scrymore.com` (Cloudflare Worker CDN)

**Core Idea**: Share a JWT between both domains.

---

## The Cross-Domain Cookie Problem

Cookies are domain-scoped. A cookie set on `dashboard.scrymore.com` is NOT sent to `view.scrymore.com`.

**Solutions**:

1. **Same parent domain** — Use a cookie on `.scrymore.com` (works for both subdomains)
2. **Token in URL** — Pass JWT as query param (security concerns)
3. **Token in localStorage + header** — Requires JavaScript to attach (doesn't work for asset loads)

---

## Option: Shared Cookie on Parent Domain

### How It Works

1. User logs into dashboard (`dashboard.scrymore.com`)
2. Dashboard creates a **session cookie** on `.scrymore.com` (parent domain)
3. Browser sends this cookie to ALL `*.scrymore.com` subdomains
4. CDN (`view.scrymore.com`) receives the cookie and validates the JWT

### Implementation

#### Dashboard: Set Cookie on Parent Domain

```typescript
// app/api/auth/session/route.ts
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  const { idToken } = await request.json();
  
  // Verify Firebase ID token
  const auth = getAdminAuth();
  const decodedToken = await auth.verifyIdToken(idToken);
  
  // Create a session cookie (5 days)
  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });
  
  // Set cookie on PARENT DOMAIN
  cookies().set('__session', sessionCookie, {
    maxAge: expiresIn / 1000,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: '.scrymore.com', // <-- KEY: parent domain
    path: '/',
  });
  
  return Response.json({ success: true });
}
```

#### CDN: Validate Firebase Session Cookie

```typescript
// In Cloudflare Worker (scry-cdn-service)
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Note: Firebase Admin SDK doesn't run in Workers directly.
// Use the REST API or a lightweight JWT validation library.

async function validateSessionCookie(cookie: string, env: Env): Promise<string | null> {
  // Option 1: Call Firebase REST API to verify session cookie
  // Option 2: Validate JWT signature locally using Firebase public keys
  
  // Firebase session cookies are JWTs signed by Google.
  // You can validate them using Google's public keys.
  
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: cookie }),
    }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  return data.users?.[0]?.localId || null; // Returns Firebase UID
}

// In request handler
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { projectId, versionId, filePath } = parseUrl(request.url);
  const visibility = await getProjectVisibility(projectId, env);
  
  if (visibility === 'public') {
    return serveFromR2(request, env);
  }
  
  // Private: validate session cookie
  const cookie = request.headers.get('Cookie');
  const sessionCookie = parseCookie(cookie, '__session');
  
  if (!sessionCookie) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const uid = await validateSessionCookie(sessionCookie, env);
  
  if (!uid) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Check project membership
  const isMember = await checkProjectMembership(projectId, uid, env);
  
  if (!isMember) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return serveFromR2(request, env);
}
```

---

## Technical Details

### Firebase Session Cookies

Firebase Admin SDK can create **session cookies** from ID tokens:

```typescript
const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });
```

These are JWTs that:
- Are signed by Google
- Contain the user's UID, email, and claims
- Can be verified using Google's public keys

### Validating in Cloudflare Workers

Firebase Admin SDK doesn't work in Workers (uses Node.js APIs). Options:

1. **REST API** — Call Firebase's `verifySessionCookie` equivalent via REST
2. **Manual JWT validation** — Fetch Google's public keys and verify signature
3. **Lightweight library** — Use `jose` or similar for JWT validation

#### Manual JWT Validation (Recommended for Workers)

```typescript
import * as jose from 'jose';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys';

async function verifyFirebaseSessionCookie(cookie: string, projectId: string): Promise<string | null> {
  try {
    // Fetch Google's public keys (cache these!)
    const keysResponse = await fetch(GOOGLE_CERTS_URL);
    const keys = await keysResponse.json();
    
    // Decode JWT header to get key ID
    const header = jose.decodeProtectedHeader(cookie);
    const publicKey = keys[header.kid];
    
    if (!publicKey) return null;
    
    // Import the public key
    const key = await jose.importX509(publicKey, 'RS256');
    
    // Verify the JWT
    const { payload } = await jose.jwtVerify(cookie, key, {
      issuer: `https://session.firebase.google.com/${projectId}`,
      audience: projectId,
    });
    
    return payload.sub as string; // Firebase UID
  } catch (error) {
    console.error('Session cookie validation failed:', error);
    return null;
  }
}
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
├─────────────────────────────────────────────────────────────────┤
│ Cookie: __session=<jwt>  (domain: .scrymore.com)                │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │ dashboard.scrymore│       │ view.scrymore.com │
        │      .com         │       │   (CDN Worker)    │
        ├───────────────────┤       ├───────────────────┤
        │ Receives cookie   │       │ Receives cookie   │
        │ Firebase Admin    │       │ Validate JWT      │
        │ verifies session  │       │ using Google keys │
        └───────────────────┘       └───────────────────┘
```

---

## Pros and Cons

### Pros

1. **Single login** — User logs in once on dashboard
2. **Unified URL** — `view.scrymore.com` works for all projects
3. **No tokens in URLs** — Cookie-based, secure
4. **Uses existing Firebase Auth** — No new identity system
5. **Standard approach** — Parent domain cookies are well-supported

### Cons

1. **Same parent domain required** — Both must be `*.scrymore.com`
2. **JWT validation in Worker** — Need to implement manually (no Firebase Admin SDK)
3. **Cookie size** — Firebase session cookies can be large (~1KB)
4. **Key rotation** — Need to handle Google key rotation (cache with TTL)

---

## Requirements

1. **Both domains under same parent**: `dashboard.scrymore.com` and `view.scrymore.com` ✅
2. **Dashboard sets cookie on `.scrymore.com`**
3. **CDN validates Firebase session cookie JWT**
4. **CDN checks project membership in Firestore**

---

## Implementation Checklist

### Dashboard Changes

- [ ] Update session cookie creation to use `domain: '.scrymore.com'`
- [ ] Ensure cookie is set on login
- [ ] Ensure cookie is cleared on logout

### CDN Changes

- [ ] Add JWT validation using `jose` library
- [ ] Cache Google public keys (with TTL based on Cache-Control header)
- [ ] Add project visibility check
- [ ] Add project membership check
- [ ] Return 401/403 for unauthorized requests

### Firestore

- [ ] Add `visibility` field to projects
- [ ] Ensure `memberIds` is populated

---

## Comparison with Other Options

| Aspect | Shared JWT | Reverse Proxy | Cloudflare Access |
|--------|:----------:|:-------------:|:-----------------:|
| Single login | ✅ | ✅ | ❌ (double login) |
| Unified URL | ✅ | ✅ | ✅ |
| Latency | Low | Higher | Low |
| Complexity | Medium | Medium | Low |
| Uses Firebase | ✅ | ✅ | ❌ |

---

## Recommendation

**Shared JWT on parent domain** is the cleanest approach if:
- Both domains are under `.scrymore.com` ✅
- You want single login with unified URLs
- You're comfortable implementing JWT validation in the Worker

This is likely the **best option** for your use case.
