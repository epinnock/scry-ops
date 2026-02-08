# Risk Analysis: scry-node (scry-deployer) Integration

## Risk Summary

| Risk ID | Risk | Likelihood | Impact | Severity | Mitigation Status |
|---------|------|------------|--------|----------|-------------------|
| N-001 | scry-sbcov not installed causes failures | Low | Medium | Low | **Mitigated** |
| N-002 | Coverage analysis increases CI time significantly | Low | Medium | Low | **Mitigated** |
| N-003 | Git fetch-depth:0 requirement breaks existing workflows | Low | High | Medium | **Mitigated** |
| N-004 | PR comment posting fails silently | Medium | Low | Low | Planned |
| N-005 | Coverage upload fails but storybook succeeds | Medium | Medium | Medium | Planned |
| N-006 | Breaking changes to existing CLI interface | Low | High | Medium | Planned |

---

## Detailed Risk Analysis

### N-001: scry-sbcov Not Installed Causes Failures

**Description:** If users enable coverage but don't have `@scrymore/scry-sbcov` installed, the workflow will fail.

**Likelihood:** Low (reduced from High) - scry-sbcov is now a direct dependency

**Impact:** Medium - Deployment fails, but easy to fix

**Mitigation Status:** ✅ **MITIGATED** - scry-sbcov is bundled as a direct dependency of scry-deployer

**Implementation:**
- `@scrymore/scry-sbcov` added to `dependencies` in package.json (not peerDependencies)
- Users don't need to install it separately
- Version managed by scry-deployer maintainers

**Contingency:** None needed - dependency is always available

---

### N-002: Coverage Analysis Increases CI Time Significantly

**Description:** Running scry-sbcov adds time to CI workflows. For large projects, this could be 30-60+ seconds.

**Likelihood:** Low (reduced from Medium) - Optimizations implemented

**Impact:** Medium - Slower deployments, increased CI costs

**Mitigation Status:** ✅ **MITIGATED** - See [02-scry-node-spec.md](../02-scry-node-spec.md) Section 8

**Implemented Optimizations:**
1. **Node modules caching** - `cache: 'pnpm'` in setup-node action
2. **Skip for draft PRs** - `--no-coverage` flag automatically applied
3. **Bundled dependency** - No extra install time for scry-sbcov
4. **Coverage report caching** - Cache based on source file hash

**Contingency:** `--no-coverage` flag for quick deployments

---

### N-003: Git fetch-depth:0 Requirement Breaks Existing Workflows

**Description:** Coverage analysis requires full git history for new code detection. Existing workflows may use shallow clones.

**Likelihood:** Low (reduced from Medium) - Clear documentation and templates

**Impact:** High - Coverage analysis fails or produces incorrect results

**Mitigation Status:** ✅ **MITIGATED** - See [02-scry-node-spec.md](../02-scry-node-spec.md) Section 7

**Implementation:**
- All workflow templates include `fetch-depth: 0`
- Documentation explains why full history is needed
- Risk assessment: Only adds 1-5 seconds to checkout time
- No breaking changes - just a configuration setting

**Contingency:** Skip new-code analysis if git history unavailable (graceful degradation)

---

### N-004: PR Comment Posting Fails Silently

**Description:** If GITHUB_TOKEN is missing or has insufficient permissions, PR comments won't be posted.

**Likelihood:** Medium - Token permissions vary

**Impact:** Low - Coverage still works, just no PR comment

**Mitigation Strategies:**
1. Log clear warning if token missing
2. Document required token permissions
3. Continue deployment even if comment fails
4. Provide manual link to coverage in CLI output

**Contingency:** None needed - graceful degradation is acceptable

---

### N-005: Coverage Upload Fails But Storybook Succeeds

**Description:** Storybook uploads successfully but coverage upload fails, leaving build without coverage data.

**Likelihood:** Medium - Two separate uploads, either could fail

**Impact:** Medium - Inconsistent state, coverage page shows error

**Mitigation Strategies:**
1. Upload coverage first, then storybook
2. If coverage fails, log warning but continue
3. Store coverage locally as backup
4. Provide retry mechanism

**Contingency:** Allow manual coverage upload via separate command

---

### N-006: Breaking Changes to Existing CLI Interface

**Description:** Adding new flags or changing behavior could break existing user scripts and workflows.

**Likelihood:** Low - New flags are additive

**Impact:** High - User deployments fail

**Mitigation Strategies:**
1. All new flags are optional with sensible defaults
2. Existing behavior unchanged if no new flags used
3. Version bump with changelog
4. Test with existing workflow templates

**Contingency:** Revert changes, release as major version

---

## Dependencies

| Dependency | Risk if Unavailable | Fallback |
|------------|---------------------|----------|
| @scrymore/scry-sbcov | No coverage analysis | Skip coverage, deploy storybook only |
| @octokit/rest | No PR comments | Log to console instead |
| GITHUB_TOKEN | No PR comments | Continue without comments |
| Git history | No new-code analysis | Analyze all code as existing |

---

## Compatibility Matrix

| Node Version | Status | Notes |
|--------------|--------|-------|
| 18.x | Supported | Minimum required |
| 20.x | Supported | Recommended |
| 22.x | Supported | Latest LTS |

| Package Manager | Status | Notes |
|-----------------|--------|-------|
| npm | Supported | Default |
| pnpm | Supported | Recommended |
| yarn | Supported | Classic and Berry |

---

## Testing Requirements

1. **Unit Tests:**
   - Coverage module handles missing scry-sbcov
   - PR comment formatting with various data
   - Config loading with coverage options

2. **Integration Tests:**
   - Full deployment with coverage
   - Deployment without coverage (--no-coverage)
   - Deployment with coverage failure (--coverage-fail-on-threshold)

3. **Manual Testing:**
   - Test in real GitHub Actions environment
   - Test PR comment appearance
   - Test with various project sizes
