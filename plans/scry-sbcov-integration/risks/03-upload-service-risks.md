# Risk Analysis: scry-storybook-upload-service Integration

## Risk Summary

| Risk ID | Risk | Likelihood | Impact | Severity | Mitigation Status |
|---------|------|------------|--------|----------|-------------------|
| U-001 | Firestore document size limit exceeded | Low | High | Medium | Planned |
| U-002 | Coverage upload increases request latency | Medium | Medium | Medium | Planned |
| U-003 | Concurrent uploads cause race conditions | Low | Medium | Low | Planned |
| U-004 | Invalid coverage data corrupts build records | Medium | High | High | Planned |
| U-005 | R2 upload failures leave orphaned Firestore records | Medium | Medium | Medium | Planned |
| U-006 | API breaking changes affect existing clients | Low | High | Medium | Planned |

---

## Detailed Risk Analysis

### U-001: Firestore Document Size Limit Exceeded

**Description:** Firestore has a 1MB document size limit. If coverage summary is too large, writes will fail.

**Likelihood:** Low - Summary is ~500 bytes, well under limit

**Impact:** High - Build creation fails

**Mitigation Strategies:**
1. Only store summary in Firestore, full report in R2
2. Validate summary size before write
3. Truncate large arrays (e.g., quality gate checks)
4. Monitor document sizes in production

**Contingency:** Move coverage to separate collection if needed

---

### U-002: Coverage Upload Increases Request Latency

**Description:** Adding coverage upload to the build creation flow increases total request time.

**Likelihood:** Medium - Additional R2 write and Firestore update

**Impact:** Medium - Slower deployments, potential timeouts

**Mitigation Strategies:**
1. Upload coverage JSON in parallel with storybook zip
2. Use streaming upload for large files
3. Set appropriate timeouts
4. Consider async coverage processing

**Contingency:** Make coverage upload async (return immediately, process in background)

---

### U-003: Concurrent Uploads Cause Race Conditions

**Description:** Multiple uploads for the same project/version could cause data inconsistency.

**Likelihood:** Low - Unlikely to upload same version twice

**Impact:** Medium - Incorrect coverage data

**Mitigation Strategies:**
1. Use Firestore transactions for updates
2. Check for existing build before creating
3. Use version-specific keys in R2
4. Implement idempotent uploads

**Contingency:** Add locking mechanism for uploads

---

### U-004: Invalid Coverage Data Corrupts Build Records

**Description:** Malformed or invalid coverage JSON could be stored, causing dashboard errors.

**Likelihood:** Medium - External data, could be malformed

**Impact:** High - Dashboard crashes, data corruption

**Mitigation Strategies:**
1. Validate coverage data with Zod schema
2. Sanitize numeric values (handle NaN, Infinity)
3. Provide default values for missing fields
4. Log validation errors for debugging

**Contingency:** Add data migration to fix corrupted records

---

### U-005: R2 Upload Failures Leave Orphaned Firestore Records

**Description:** If R2 upload succeeds but Firestore update fails (or vice versa), data becomes inconsistent.

**Likelihood:** Medium - Two separate services, either could fail

**Impact:** Medium - Coverage page shows error, data inconsistency

**Mitigation Strategies:**
1. Upload to R2 first, then update Firestore
2. Store R2 URL in Firestore only after successful upload
3. Implement cleanup for orphaned files
4. Add health check for data consistency

**Contingency:** Manual cleanup script for orphaned data

---

### U-006: API Breaking Changes Affect Existing Clients

**Description:** Changes to upload API could break existing scry-deployer versions.

**Likelihood:** Low - New endpoints are additive

**Impact:** High - Existing deployments fail

**Mitigation Strategies:**
1. New coverage endpoint is separate from existing upload
2. Coverage fields in existing endpoint are optional
3. Version API if breaking changes needed
4. Maintain backward compatibility

**Contingency:** Support multiple API versions

---

## Dependencies

| Dependency | Risk if Unavailable | Fallback |
|------------|---------------------|----------|
| R2 Storage | Coverage upload fails | Return error, don't update Firestore |
| Firestore | Build record not updated | Log error, coverage in R2 only |
| API Key Service | Auth fails | Reject request |

---

## Security Considerations

| Concern | Risk Level | Mitigation |
|---------|------------|------------|
| Unauthorized coverage upload | Medium | API key auth required |
| Coverage data injection | Low | Validate and sanitize all input |
| Large file DoS | Medium | File size limits (5MB) |
| Cross-project access | Medium | Verify API key matches project |

---

## Performance Considerations

| Metric | Target | Risk if Exceeded |
|--------|--------|------------------|
| Upload latency | < 5s | User frustration, timeouts |
| Coverage JSON size | < 2MB | Slow uploads, memory issues |
| Firestore write time | < 500ms | Request timeout |

---

## Testing Requirements

1. **Unit Tests:**
   - Coverage data validation
   - Firestore update methods
   - Error handling for invalid data

2. **Integration Tests:**
   - Full upload with coverage
   - Separate coverage upload endpoint
   - Error scenarios (R2 fail, Firestore fail)

3. **Load Testing:**
   - Concurrent uploads
   - Large coverage files
   - High request volume
