# GitHub Ticketing from Coverage Failures (Feature Folder)

This folder follows the same structure as the private-projects plans: one top-level overview plus **one markdown per subproject**.

## Documents

1. [`00-overview.md`](00-overview.md) – Feature overview and architecture
2. [`01-scry-developer-dashboard.md`](01-scry-developer-dashboard.md) – Dashboard implementation plan
3. [`02-scry-node.md`](02-scry-node.md) – Node implementation plan
4. [`03-scry-sbcov.md`](03-scry-sbcov.md) – sbcov implementation plan
5. [`04-github-app-and-v2.md`](04-github-app-and-v2.md) – GitHub App design and v2 features
6. [`05-v2-implementation-plan.md`](05-v2-implementation-plan.md) – Detailed v2 implementation plan
7. [`06-gaps-and-fixes.md`](06-gaps-and-fixes.md) – **Identified gaps and solutions** (error fingerprints, flaky detection, repo validation)

## Implementation Approach

**We are jumping directly to v2** – skipping the v1 OAuth-user-token approach in favor of GitHub App integration from the start.

### Key v2 Components

1. **Story Fingerprints** – Stable identifiers for cross-build correlation
2. **GitHub App** – Installation tokens instead of user OAuth
3. **Issue Lifecycle** – Auto-close when story passes
4. **Webhook Sync** – Keep dashboard in sync with GitHub

## Scope Summary

| Subproject | v2 Scope |
|---|---|
| `scry-sbcov` | Generate fingerprints, capture artifacts |
| `scry-developer-dashboard` | GitHub App integration, issue modal, lifecycle UI |
| `scry-node` | Pass-through (uses scry-sbcov output) |
| `scry-cdn-service` | ❌ No changes |
| `scry-cli` | ❌ No changes |

## Quick Links

- [Fingerprint Design](05-v2-implementation-plan.md#1-story-fingerprint-design)
- [Firestore Schema](05-v2-implementation-plan.md#3-firestore-schema-v2)
- [Environment Variables](05-v2-implementation-plan.md#4-environment-variables)
- [Implementation Checklist](05-v2-implementation-plan.md#5-implementation-checklist)
