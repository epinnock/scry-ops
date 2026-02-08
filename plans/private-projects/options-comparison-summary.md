# Private Projects: All Options Ranked

## Summary of All Options Explored

| # | Option | Unified URL | Single Login | Best Practice | Ease of Implementation | Overall Rank |
|---|--------|:-----------:|:------------:|:-------------:|:----------------------:|:------------:|
| 1 | Shared JWT (Parent Domain Cookie) | ✅ | ✅ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **#1** |
| 2 | Reverse Proxy (CDN → Dashboard) | ✅ | ✅ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **#2** |
| 3 | Dashboard Proxy (Different URLs) | ❌ | ✅ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **#3** |
| 4 | Cloudflare Access (Zero Trust) | ✅ | ❌ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | #4 |
| 5 | Revocable Share Tokens | ✅ | N/A | ⭐⭐⭐⭐ | ⭐⭐⭐ | #5 |
| 6 | iframe Embed | ⚠️ | ✅ | ⭐⭐⭐ | ⭐⭐⭐ | #6 |
| 7 | Service Worker Auth | ✅ | ✅ | ⭐⭐ | ⭐⭐ | #7 |
| 8 | Token in URL Query | ✅ | ✅ | ⭐ | ⭐⭐⭐⭐ | #8 |
| 9 | Signed URLs (Short TTL) | ✅ | N/A | ⭐⭐⭐ | ⭐⭐ | #9 |
| 10 | OAuth Redirect at CDN | ✅ | ❌ | ⭐⭐ | ⭐ | #10 |

---

## Detailed Rankings

### #1: Shared JWT (Parent Domain Cookie) ⭐⭐⭐⭐⭐

**Best Practice: 5/5** | **Ease: 4/5**

```
dashboard.scrymore.com sets cookie on .scrymore.com
view.scrymore.com reads same cookie, validates JWT
```

| Pros | Cons |
|------|------|
| Single login | JWT validation in Worker |
| Unified URL | Need to cache Google keys |
| Uses existing Firebase Auth | Cookie size (~1KB) |
| No tokens in URLs | |
| Industry standard pattern | |

**Why #1**: This is the canonical solution for cross-subdomain auth. It's how Google, GitHub, and most SaaS products handle it.

---

### #2: Reverse Proxy (CDN → Dashboard) ⭐⭐⭐⭐

**Best Practice: 4/5** | **Ease: 4/5**

```
view.scrymore.com (private) → proxies to → dashboard.scrymore.com/view/*
```

| Pros | Cons |
|------|------|
| Single login | Extra latency hop |
| Unified URL | Dashboard handles viewer traffic |
| Simple CDN logic | |
| Uses existing Firebase Auth | |

**Why #2**: Very clean, but adds latency. Good fallback if JWT validation in Worker is too complex.

---

### #3: Dashboard Proxy (Different URLs) ⭐⭐⭐⭐

**Best Practice: 4/5** | **Ease: 5/5**

```
Public:  view.scrymore.com/{project}/{version}/
Private: dashboard.scrymore.com/view/{project}/{version}/
```

| Pros | Cons |
|------|------|
| Simplest implementation | Different URLs for public/private |
| Single login | Users may be confused |
| No CDN changes needed | |

**Why #3**: Easiest to implement, but sacrifices unified URL. Good for MVP.

---

### #4: Cloudflare Access (Zero Trust) ⭐⭐⭐⭐⭐

**Best Practice: 5/5** | **Ease: 5/5**

```
Cloudflare handles auth at edge, sets CF_Authorization cookie
```

| Pros | Cons |
|------|------|
| Enterprise-grade security | Double login (Firebase + CF Access) |
| Minimal custom code | Paid after 50 users |
| Audit logs included | Doesn't use existing Firebase Auth |
| Unified URL | |

**Why #4**: Best practice for greenfield, but doesn't integrate with your existing Firebase Auth.

---

### #5: Revocable Share Tokens ⭐⭐⭐⭐

**Best Practice: 4/5** | **Ease: 3/5**

```
Generate tokens stored in Firestore, validate at CDN
```

| Pros | Cons |
|------|------|
| Shareable with non-members | Token management complexity |
| Revocable | More moving parts |
| Unified URL | |

**Why #5**: Good for external sharing, but adds complexity. Consider as Phase 2.

---

### #6: iframe Embed ⭐⭐⭐

**Best Practice: 3/5** | **Ease: 3/5**

```
Dashboard embeds CDN content in iframe with short-lived token
```

| Pros | Cons |
|------|------|
| Dashboard handles auth | iframe limitations |
| CDN stays simple | Some Storybook features may break |

**Why #6**: Works, but iframes have quirks. Not recommended for primary solution.

---

### #7: Service Worker Auth ⭐⭐

**Best Practice: 2/5** | **Ease: 2/5**

```
Service worker intercepts requests, adds auth header
```

| Pros | Cons |
|------|------|
| Unified URL | Very complex |
| Token not in URL | Fragile (SW lifecycle issues) |
| | Doesn't work in incognito |

**Why #7**: Clever but fragile. Not recommended.

---

### #8: Token in URL Query ⭐

**Best Practice: 1/5** | **Ease: 4/5**

```
view.scrymore.com/{project}/{version}/?token=<jwt>
```

| Pros | Cons |
|------|------|
| Easy to implement | Security risk (token leaks) |
| Unified URL | Tokens in browser history |
| | Tokens in server logs |

**Why #8**: Easy but insecure. Avoid.

---

### #9: Signed URLs (Short TTL) ⭐⭐⭐

**Best Practice: 3/5** | **Ease: 2/5**

```
HMAC-signed URLs with embedded expiry
```

| Pros | Cons |
|------|------|
| Stateless | Cannot revoke individual links |
| Scalable | Short TTL = frequent regeneration |
| | Key rotation complexity |

**Why #9**: Good for S3-style object access, but not ideal for interactive Storybook viewing.

---

### #10: OAuth Redirect at CDN ⭐⭐

**Best Practice: 2/5** | **Ease: 1/5**

```
CDN redirects to dashboard for OAuth, then back
```

| Pros | Cons |
|------|------|
| Unified URL | Blocked by third-party cookie restrictions |
| | Complex token exchange |

**Why #10**: Doesn't work reliably in modern browsers. Avoid.

---

## Final Recommendation

### For Your Use Case (Firebase Auth + Unified URL)

**Go with #1: Shared JWT (Parent Domain Cookie)**

- ✅ Single login (Firebase)
- ✅ Unified URL (`view.scrymore.com`)
- ✅ Industry best practice
- ✅ Secure (no tokens in URLs)

**Implementation effort**: ~5-7 days
- Dashboard: Set cookie on `.scrymore.com` (~1 day)
- CDN Worker: JWT validation with `jose` (~2-3 days)
- CDN Worker: Project visibility + membership checks (~2 days)
- Testing (~1 day)

### Fallback: #3 (Dashboard Proxy with Different URLs)

If JWT validation in Worker proves too complex, fall back to different URLs:
- Public: `view.scrymore.com`
- Private: `dashboard.scrymore.com/view/`

This is the simplest implementation and can be upgraded to #1 later.

---

## Decision Matrix

| If you want... | Choose |
|----------------|--------|
| Unified URL + Single Login + Best Practice | #1 Shared JWT |
| Unified URL + Simplest CDN | #2 Reverse Proxy |
| Fastest MVP | #3 Dashboard Proxy (different URLs) |
| Enterprise security + budget | #4 Cloudflare Access |
| External sharing | #5 Share Tokens (add later) |
