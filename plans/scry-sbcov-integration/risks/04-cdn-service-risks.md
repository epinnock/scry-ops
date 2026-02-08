# Risk Analysis: scry-cdn-service Integration

## Risk Summary

| Risk ID | Risk | Likelihood | Impact | Severity | Mitigation Status |
|---------|------|------------|--------|----------|-------------------|
| C-001 | CORS misconfiguration blocks dashboard | Low | High | Medium | **Documented** |
| C-002 | Cache invalidation issues show stale data | Low | Medium | Low | Planned |
| C-003 | Large coverage files impact CDN performance | Low | Medium | Low | Planned |
| C-004 | Missing coverage files return unclear errors | Medium | Low | Low | Planned |

---

## Detailed Risk Analysis

### C-001: CORS Misconfiguration Blocks Dashboard

**Description:** The dashboard fetches coverage JSON from CDN. If CORS headers are incorrect, browser will block the request.

**Likelihood:** Low (reduced from Medium) - Step-by-step implementation guide now documented

**Impact:** High - Coverage page completely broken

**Mitigation Status:** ✅ **DOCUMENTED** - See [04-scry-cdn-service-spec.md](../04-scry-cdn-service-spec.md) Section 1

**Implementation Steps (from spec):**
1. Create CORS middleware with allowed origins
2. Handle OPTIONS preflight requests
3. Apply CORS headers to all responses
4. Test with curl before dashboard deployment
5. Verify from browser console

**Contingency:** Proxy coverage through dashboard API

---

### C-002: Cache Invalidation Issues Show Stale Data

**Description:** Coverage reports are cached by CDN. If a build is re-uploaded with new coverage, users might see old data.

**Likelihood:** Low - Coverage reports are typically immutable

**Impact:** Medium - Confusing UX, incorrect data displayed

**Mitigation Strategies:**
1. Use immutable cache headers (coverage tied to version)
2. Include version/timestamp in cache key
3. Set reasonable cache TTL (1 hour for development)
4. Document cache behavior

**Contingency:** Add cache-busting query parameter

---

### C-003: Large Coverage Files Impact CDN Performance

**Description:** Very large coverage reports (>2MB) could slow down CDN response times.

**Likelihood:** Low - Most reports are < 500KB

**Impact:** Medium - Slow page loads

**Mitigation Strategies:**
1. Enable gzip compression for JSON
2. Set appropriate Content-Encoding headers
3. Monitor response times
4. Consider CDN edge caching

**Contingency:** Implement report pagination/chunking

---

### C-004: Missing Coverage Files Return Unclear Errors

**Description:** If coverage file doesn't exist in R2, CDN might return generic 404 or HTML error page.

**Likelihood:** Medium - Files could be missing for various reasons

**Impact:** Low - Poor UX, but dashboard can handle gracefully

**Mitigation Strategies:**
1. Return JSON error response for missing files
2. Include helpful error message
3. Dashboard handles 404 gracefully
4. Log missing file requests for debugging

**Contingency:** None needed - graceful degradation acceptable

---

## Dependencies

| Dependency | Risk if Unavailable | Fallback |
|------------|---------------------|----------|
| R2 Storage | Coverage files inaccessible | Show error in dashboard |
| Cloudflare CDN | Slow/unavailable responses | Direct R2 access (slower) |

---

## Security Considerations

| Concern | Risk Level | Mitigation |
|---------|------------|------------|
| Unauthorized access to coverage | Low | Coverage is public data |
| Path traversal attacks | Low | Validate path format |
| DoS via large requests | Low | CDN rate limiting |

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| TTFB | < 100ms | For cached responses |
| Full response | < 500ms | For typical coverage files |
| Cache hit rate | > 90% | After initial fetch |

---

## Testing Requirements

1. **Manual Testing:**
   - Verify CORS headers from dashboard origin
   - Test cache behavior with repeated requests
   - Test 404 handling for missing files

2. **Integration Testing:**
   - Dashboard can fetch coverage from CDN
   - Error responses are JSON formatted
   - Compression is working

3. **Performance Testing:**
   - Response times for various file sizes
   - CDN cache effectiveness
