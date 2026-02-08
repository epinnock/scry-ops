# Cloudflare Access (Zero Trust) — Deep Dive

## ⚠️ Important: Firebase Auth Compatibility

You're already using **Firebase Authentication** for the dashboard. Here's how Cloudflare Access relates:

### The Challenge

| System | Purpose | Where |
|--------|---------|-------|
| Firebase Auth | Dashboard login, API auth | `dashboard.scrymore.com` |
| Cloudflare Access | CDN/viewer auth | `view.scrymore.com` |

These are **two separate identity systems**. A user logged into Firebase is NOT automatically logged into Cloudflare Access.

### Options for Mixing Firebase + Cloudflare Access

#### Option 1: Use Same Identity Provider (GitHub)

Both Firebase and Cloudflare Access can use **GitHub as the identity provider**:

```
Firebase Auth → GitHub OAuth → User logs in
Cloudflare Access → GitHub OAuth → Same user logs in again
```

**Pros**: Same GitHub account, familiar flow
**Cons**: User must log in twice (once to dashboard, once to viewer)

#### Option 2: Cloudflare Access with OIDC (Firebase as IdP)

Configure Cloudflare Access to use Firebase as an **OIDC provider**:

```
User → Cloudflare Access → Firebase Auth (OIDC) → Authenticated
```

**Pros**: Single sign-on experience
**Cons**: Complex setup; Firebase doesn't natively expose OIDC endpoints (requires custom implementation)

#### Option 3: Skip Cloudflare Access, Use Reverse Proxy (Recommended)

Keep Firebase Auth as the single source of truth:

```
User → view.scrymore.com → CDN proxies to dashboard → Firebase session cookie → Authenticated
```

**Pros**: One auth system, no double login
**Cons**: Extra latency for private projects

#### Option 4: Cloudflare Access for Viewer, Firebase for Dashboard (Accept Double Login)

Accept that users log in twice:
- Dashboard: Firebase (GitHub)
- Viewer: Cloudflare Access (GitHub)

**Pros**: Simplest implementation
**Cons**: Poor UX (two logins)

### Recommendation

Given you're already using Firebase Auth, **Option 3 (Reverse Proxy)** is likely the best fit:
- Single auth system (Firebase)
- No double login
- Unified URL via CDN proxy to dashboard

Cloudflare Access makes more sense if:
- You're starting fresh (no existing auth)
- You want to replace Firebase Auth entirely
- You're okay with users logging in twice

---

## What is Cloudflare Access?

Cloudflare Access is part of Cloudflare's **Zero Trust** platform. It acts as an identity-aware proxy that sits in front of your applications and enforces authentication before allowing access.

Think of it as a "login gate" at the edge — users must authenticate before they can even reach your application.

---

## How It Works

```
User → Cloudflare Edge → Access Policy Check → Your Application
                              ↓
                    Identity Provider (GitHub, Google, etc.)
```

1. **User visits** `https://view.scrymore.com/{projectId}/{versionId}/`
2. **Cloudflare Access intercepts** the request
3. **If no valid session**: redirects to identity provider (GitHub, Google, SAML, etc.)
4. **User authenticates** with their existing account
5. **Cloudflare sets** a `CF_Authorization` cookie (JWT)
6. **User is redirected** back to the original URL
7. **Cloudflare validates** the cookie on subsequent requests
8. **Your CDN worker** receives the request with user identity in headers

---

## Key Features

### 1. Identity Provider Integration

Supports many identity providers out of the box:
- **GitHub** (perfect for developer tools)
- Google Workspace
- Okta
- Azure AD
- SAML 2.0
- OpenID Connect (OIDC)
- One-time PIN (email-based)

### 2. Access Policies

Define who can access what:

```yaml
# Example policy for view.scrymore.com
Application: Storybook Viewer
Domain: view.scrymore.com

Policy: "Allow Project Members"
  - Include: Emails ending in @yourcompany.com
  - Include: GitHub organization members
  - Include: Specific email list
```

### 3. Per-Path Policies

You can create different policies for different paths:

```yaml
# Public paths (no auth required)
Path: /public/*
Policy: Bypass

# Private paths (auth required)
Path: /*
Policy: Require GitHub login
```

### 4. Service Tokens

For CI/CD and API access:
- Generate service tokens for non-interactive access
- CLI tools can use `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers

---

## Integration with Your CDN Worker

When Access is enabled, your worker receives additional headers:

```typescript
// Headers added by Cloudflare Access
const userEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
const userIdentity = request.headers.get('Cf-Access-Jwt-Assertion'); // JWT with full identity

// You can use this to:
// 1. Log who accessed what
// 2. Make authorization decisions (is this user a project member?)
// 3. Pass identity to downstream services
```

---

## Authorization: The Missing Piece

Cloudflare Access handles **authentication** (who is this user?), but not **authorization** (can this user access this specific project?).

### Option 1: Access Handles Everything (Simple)

If all private projects should be accessible to the same group:

```yaml
Policy: "Allow All Authenticated Users"
  - Include: GitHub organization "scrymore"
```

**Pros**: Zero custom code
**Cons**: No per-project access control

### Option 2: Access + Worker Authorization (Recommended)

Access authenticates; your worker authorizes:

```typescript
// In your CDN worker
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { projectId } = parseUrl(request.url);
  const visibility = await getProjectVisibility(projectId, env);
  
  if (visibility === 'public') {
    return serveFromR2(request, env);
  }
  
  // Private project: check membership
  const userEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
  
  if (!userEmail) {
    // Access should have blocked this, but defense in depth
    return new Response('Unauthorized', { status: 401 });
  }
  
  const isMember = await checkProjectMembership(projectId, userEmail, env);
  
  if (!isMember) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return serveFromR2(request, env);
}
```

---

## Pricing

### Free Tier (50 users)

Cloudflare offers a **free tier** for up to 50 users:
- Full Access functionality
- All identity providers
- Unlimited applications

**This might be enough for your use case!**

### Paid Plans

| Plan | Users | Price |
|------|-------|-------|
| Free | Up to 50 | $0/month |
| Pay-as-you-go | 51+ | $3/user/month |
| Contract | Enterprise | Custom |

---

## Implementation Steps

### 1. Enable Cloudflare Access

```bash
# In Cloudflare Dashboard:
# Zero Trust → Access → Applications → Add an application
```

### 2. Configure Application

```yaml
Application name: Storybook Viewer
Application domain: view.scrymore.com
Session duration: 24 hours
```

### 3. Add Identity Provider

```yaml
# Zero Trust → Settings → Authentication → Add new
Provider: GitHub
Client ID: <from GitHub OAuth app>
Client Secret: <from GitHub OAuth app>
```

### 4. Create Access Policy

```yaml
Policy name: Allow Authenticated Users
Action: Allow
Include:
  - Login Methods: GitHub
```

### 5. (Optional) Add Bypass for Public Projects

```yaml
Policy name: Public Projects Bypass
Action: Bypass
Include:
  - Everyone
Selector:
  - Path matches: /public-project-id/*
```

### 6. Update CDN Worker for Authorization

Add membership checks as shown above.

---

## Pros and Cons

### Pros

1. **Unified URL** — `view.scrymore.com` works for all projects
2. **No custom auth code** — Cloudflare handles login flow
3. **Enterprise-grade security** — battle-tested, SOC 2 compliant
4. **Works with existing IdP** — users log in with GitHub (same as dashboard)
5. **Session management** — automatic token refresh, logout
6. **Audit logs** — who accessed what, when
7. **Free for small teams** — 50 users included

### Cons

1. **Vendor lock-in** — tied to Cloudflare
2. **Per-project authorization** — still needs custom code in worker
3. **Cost at scale** — $3/user/month after 50 users
4. **Configuration complexity** — Access policies can get complex
5. **Bypass for public projects** — need to maintain list or use worker logic

---

## Comparison with Option F (Reverse Proxy)

| Aspect | Cloudflare Access | Reverse Proxy |
|--------|-------------------|---------------|
| Auth implementation | Cloudflare handles | Dashboard handles |
| Custom code | Minimal (just authz) | Medium (proxy logic) |
| Latency | Low (edge auth) | Higher (extra hop) |
| Cost | $0-$3/user/month | $0 |
| Vendor dependency | High | Low |
| Complexity | Low | Medium |

---

## Recommendation

### Use Cloudflare Access if:

- You have ≤50 users (free tier)
- You want minimal custom code
- You're already using Cloudflare
- You need audit logs and compliance features
- You want the simplest possible implementation

### Use Reverse Proxy (Option F) if:

- You want to avoid vendor lock-in
- You have >50 users and want to avoid per-user costs
- You need fine-grained authorization logic
- You prefer keeping auth in your own codebase

---

## Quick Start (If You Choose Access)

1. Go to Cloudflare Dashboard → Zero Trust
2. Create a new Access Application for `view.scrymore.com`
3. Add GitHub as an identity provider
4. Create a policy: "Allow GitHub authenticated users"
5. Test: visit `view.scrymore.com` — you should see GitHub login
6. Add worker logic to check project membership using `Cf-Access-Authenticated-User-Email`

---

## References

- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [Access with Workers](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- [Pricing](https://www.cloudflare.com/plans/zero-trust-services/)
