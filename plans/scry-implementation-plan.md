# Scry Multi-Build Support - Implementation Plan (Option B)

**Document Version**: 1.0  
**Date**: 2025-11-15  
**Approach**: Recommended Pattern with Backward Compatibility  
**Priority**: High

---

## Executive Summary

This implementation plan outlines the technical approach for enabling multiple builds per version in the Scry deployment system. The solution supports PR builds (`pr-{number}`), branch builds (`main`, `develop`, `feature-*`), release builds (`v1.2.3`), and custom builds while maintaining backward compatibility with existing deployments.

**Key Benefits:**
- ✅ Multiple builds per PR/branch/version
- ✅ Human-readable URLs with build numbers
- ✅ Clean storage organization
- ✅ Zero breaking changes for existing deployments
- ✅ Enhanced build tracking and retention policies

**Estimated Timeline**: 2-3 weeks  
**Risk Level**: Low (backward compatible)  
**Dependencies**: None (can be deployed incrementally)

---

## Architecture Overview

### New Storage Pattern
```
{project}/{version}/builds/{buildNumber}/storybook.zip
```

**Examples:**
- `myapp/pr-123/builds/1/storybook.zip`
- `myapp/main/builds/5/storybook.zip`
- `myapp/v1.2.3/builds/1/storybook.zip`

### New URL Pattern
```
/{project}/{version}/{buildNumber}/path/to/file
```

**Examples:**
- `https://cdn.scry.com/myapp/pr-123/1/index.html`
- `https://cdn.scry.com/myapp/main/5/index.html`
- `https://cdn.scry.com/myapp/v1.2.3/1/index.html`

### Backward Compatibility
```
/{project}/{version}/path/to/file → defaults to build #1
```

---

## Implementation Phases

### Phase 1: Core Services (Week 1)
1. **Upload Service** - Update storage key pattern and API responses
2. **CDN Service** - Enhance path parsing and storage key resolution
3. **Testing** - End-to-end validation

### Phase 2: Client Integration (Week 2)
1. **CLI Tool** - Add build number support
2. **Developer Dashboard** - Update build queries and UI
3. **Testing** - Integration testing

### Phase 3: Documentation & Rollout (Week 3)
1. **Documentation** - Update all READMEs and guides
2. **Migration** - Migrate existing deployments (optional)
3. **Monitoring** - Production validation

---

## Project Impact Matrix

| Project | Files Changed | Complexity | Risk | Timeline |
|---------|--------------|------------|------|----------|
| scry-storybook-upload-service | 3 files | Medium | Low | 2-3 days |
| scry-cdn-service | 2 files | Medium | Low | 2-3 days |
| scry-node | 3 files | Low | Low | 1-2 days |
| scry-developer-dashboard | 4 files | Medium | Low | 3-4 days |

---

## Technical Requirements

### Version Format Support
- ✅ `pr-{number}` (e.g., `pr-123`)
- ✅ Branch names (e.g., `main`, `develop`, `feature-new-ui`)
- ✅ Semantic versions (e.g., `v1.2.3`)
- ✅ Custom identifiers (alphanumeric, hyphens, underscores)

### API Changes
**Upload Service:**
- Storage key: `{project}/{version}/builds/{buildNumber}/storybook.zip`
- Response includes `buildNumber` and `buildId`
- Presigned URL endpoint accepts optional `buildNumber` parameter

**CDN Service:**
- Path pattern: `/{project}/{version}/{buildNumber}/path/to/file`
- Fallback: `/{project}/{version}/path/to/file` → build #1
- Version format detection: PR, branch, release, custom

### CLI Changes
- New optional parameter: `--build-number`
- Defaults to latest build if not specified
- Displays build number in success messages

### Dashboard Changes
- Build queries support multiple builds per version
- UI shows build number and creation date
- Direct links to specific builds

---

## Success Criteria

1. ✅ Multiple builds can be uploaded for same PR/branch/version
2. ✅ Each build has unique, accessible URL
3. ✅ Existing deployments continue working without changes
4. ✅ Build numbers auto-increment per project
5. ✅ All version formats (PR, branch, release) are supported
6. ✅ Documentation updated with examples
7. ✅ End-to-end tests pass for all scenarios

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing URLs | High | Backward compatibility fallback to build #1 |
| Storage key conflicts | Medium | Use builds subdirectory pattern |
| Performance degradation | Low | CDN caching unchanged, R2 is fast |
| Version format rejection | Low | Regex already supports all formats |
| Build number collisions | Low | Firestore transaction-based increment |

---

## Rollback Plan

If issues arise during deployment:

1. **CDN Service**: Revert to previous version (existing URLs still work)
2. **Upload Service**: New builds use old pattern, old builds still accessible
3. **CLI**: Users can pin to previous version
4. **Dashboard**: Show only latest build per version temporarily

**Rollback Time**: < 5 minutes per service

---

## Monitoring & Validation

### Key Metrics
- Build upload success rate
- CDN request latency (should not increase)
- Storage usage growth
- Error rates by version format

### Validation Checklist
- [ ] PR builds: `pr-123` format works
- [ ] Branch builds: `main`, `develop` work
- [ ] Release builds: `v1.2.3` format works
- [ ] Multiple builds per version accessible
- [ ] Old URLs still resolve correctly
- [ ] Build numbers auto-increment
- [ ] Dashboard shows all builds

---

## Next Steps

1. Review project-level implementation plans
2. Approve approach and timeline
3. Begin Phase 1 implementation
4. Set up testing environment
5. Schedule rollout windows

---

**Document Owner**: Architecture Team  
**Reviewers**: Engineering Lead, Product Manager  
**Approval Required**: Yes