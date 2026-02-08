# Alternative Approaches: Unified URL for Private Projects

## Goal

Keep the same URL structure for both public and private projects:

```
https://view.scrymore.com/{projectId}/{versionId}/
https://view.scrymore.com/{projectId}/{versionId}/coverage-report.json
```

This document explores options to achieve this while still enforcing authentication for private projects.

---

## Option A: CDN Login Redirect (OAuth/OIDC at the Edge)

### How It Works

1. User visits `https://view.scrymore.com/{projectId}/{versionId}/`
2. CDN checks if project is private
3. If private and no valid session cookie:
   - Redirect to `https://dashboard.scrymore.com/auth/login?redirect=<original-url>`
4. Dashboard authenticates user, sets a **cross-domain session cookie** (or uses a token exchange)
5. User is redirected back to CDN URL
6. CDN validates session and serves content

### Pros
- Unified URL for all projects
- Standard OAuth/OIDC flow

### Cons
- **Cross-domain cookies are blocked** by Safari, Firefox, and Chrome (third-party cookie restrictions)
- Requires complex token exchange or iframe-based auth
- Significant implementation effort

### Rating: 4/10 (blocked by browser restrictions)

---

## Option B: CDN Token in URL Query String

### How It Works

1. Dashboard generates a short-lived access token for the user
2. User clicks "View Storybook" → `https://view.scrymore.com/{projectId}/{versionId}/?token=<jwt>`
3. CDN validates token and serves content
4. Storybook assets include the token in their requests (via service worker or base URL rewriting)

### Pros
- Unified URL structure (with query param)
- Works across domains

### Cons
- **Token leaks** via browser history, referrer headers, server logs
- Storybook asset loading is complex (need to propagate token to all requests)
- Security risk: tokens in URLs are considered bad practice

### Rating: 5/10 (security concerns)

---

## Option C: CDN with Cloudflare Access (Zero Trust)

### How It Works

1. Configure Cloudflare Access in front of `view.scrymore.com`
2. For private projects, Cloudflare Access prompts for authentication
3. User authenticates via GitHub/Google/SAML (same identity provider as dashboard)
4. Cloudflare sets a `CF_Authorization` cookie
5. CDN serves content to authenticated users

### Pros
- Unified URL
- Enterprise-grade security
- No custom auth code at CDN layer
- Works with existing identity providers

### Cons
- **Cloudflare Access is a paid feature** (Zero Trust plan)
- Per-project access rules require dynamic configuration or a single "all private projects" policy
- Less control over authorization logic (membership checks)

### Rating: 7/10 (good if budget allows, but adds cost)

---

## Option D: Service Worker Auth Injection

### How It Works

1. User visits `https://view.scrymore.com/{projectId}/{versionId}/`
2. CDN serves a **login shell page** (not the actual Storybook) for private projects
3. Login shell:
   - Prompts user to authenticate via popup to dashboard
   - Receives a short-lived token via `postMessage`
   - Registers a **service worker** that injects `Authorization` header on all requests
4. Service worker intercepts all Storybook asset requests and adds the token
5. CDN validates token on each request

### Pros
- Unified URL
- Token not in URL (in header instead)
- Works for all assets

### Cons
- **Service worker complexity** (registration, scope, updates)
- First-load experience is degraded (shell → auth → reload)
- Service workers don't work in all contexts (incognito, some browsers)
- Significant implementation effort

### Rating: 5/10 (complex, fragile)

---

## Option E: Embed Viewer in Dashboard (iframe)

### How It Works

1. User visits `https://dashboard.scrymore.com/view/{projectId}/{versionId}/`
2. Dashboard authenticates user and checks membership
3. Dashboard renders an **iframe** pointing to CDN:
   - `<iframe src="https://view.scrymore.com/{projectId}/{versionId}/?internal_token=<short-lived>">`
4. CDN validates the internal token and serves content
5. Token is short-lived (e.g., 5 minutes) and single-use

### Pros
- Unified CDN URL (with internal token)
- Dashboard handles auth; CDN just validates token
- User sees dashboard URL, but content comes from CDN

### Cons
- **iframe limitations**: some Storybook features may not work well in iframes
- Token still in URL (but short-lived and internal)
- User cannot bookmark/share the CDN URL directly

### Rating: 6/10 (reasonable compromise)

---

## Option F: Reverse Proxy at CDN (Recommended for Unified URL)

### How It Works

1. CDN (`view.scrymore.com`) is configured to **reverse proxy** to the dashboard for private projects
2. User visits `https://view.scrymore.com/{projectId}/{versionId}/`
3. CDN checks if project is private:
   - If public: serve from R2 directly
   - If private: proxy the request to `https://dashboard.scrymore.com/view/{projectId}/{versionId}/`
4. Dashboard authenticates via session cookie (same-origin to dashboard)
5. Dashboard fetches from R2 (with internal secret) and returns content
6. CDN returns the response to the user

### Pros
- **Unified URL** for all projects
- Authentication happens at dashboard (session cookie works)
- No tokens in URLs
- CDN remains simple (just routing logic)

### Cons
- **Latency**: extra hop through dashboard for private projects
- Dashboard must handle potentially high traffic for popular private projects
- Requires CDN to make subrequests (Cloudflare Workers support this)

### Rating: 8/10 (best balance of simplicity and unified URL)

---

## Comparison Matrix

| Option | Unified URL | Security | Complexity | Cost | Rating |
|--------|:-----------:|:--------:|:----------:|:----:|:------:|
| A: OAuth Redirect | ✅ | ⚠️ | High | Low | 4/10 |
| B: Token in URL | ✅ | ❌ | Medium | Low | 5/10 |
| C: Cloudflare Access | ✅ | ✅ | Low | High | 7/10 |
| D: Service Worker | ✅ | ✅ | Very High | Low | 5/10 |
| E: iframe Embed | ⚠️ | ✅ | Medium | Low | 6/10 |
| **F: Reverse Proxy** | ✅ | ✅ | Medium | Low | **8/10** |

---

## Recommendation

### For Unified URL: **Option F (Reverse Proxy at CDN)**

This approach:
- Keeps `https://view.scrymore.com/{projectId}/{versionId}/` for all projects
- Leverages existing dashboard session cookie auth
- Avoids tokens in URLs
- Is implementable with Cloudflare Workers (subrequest to dashboard)

### Trade-off

- Private project requests have higher latency (CDN → Dashboard → R2)
- Dashboard becomes a critical path for private project viewing

### If Budget Allows: **Option C (Cloudflare Access)**

- Simplest implementation
- Best security
- But requires Zero Trust subscription

---

## Implementation Sketch for Option F

### CDN Worker Changes

```typescript
// In zip-static.ts or a new middleware

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { projectId, versionId, filePath } = parseUrl(request.url);
  
  // Check project visibility (cached in KV)
  const visibility = await getProjectVisibility(projectId, env);
  
  if (visibility === 'public') {
    // Serve directly from R2
    return serveFromR2(projectId, versionId, filePath, env);
  }
  
  // Private: proxy to dashboard
  const dashboardUrl = `${env.DASHBOARD_URL}/view/${projectId}/${versionId}/${filePath}`;
  
  // Forward cookies for authentication
  const proxyRequest = new Request(dashboardUrl, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers),
      'X-Forwarded-Host': new URL(request.url).host,
    },
  });
  
  return fetch(proxyRequest);
}
```

### Dashboard Changes

- Existing `/view/[...path]` route already handles auth and proxying
- Add `X-Forwarded-Host` handling to preserve original URL in responses

---

## Next Steps

1. **Decide**: Option F (reverse proxy) or Option C (Cloudflare Access)?
2. If Option F:
   - Update CDN worker to detect private projects and proxy
   - Ensure dashboard `/view/*` route handles forwarded requests
   - Test latency impact
3. If Option C:
   - Evaluate Cloudflare Zero Trust pricing
   - Configure Access policies
