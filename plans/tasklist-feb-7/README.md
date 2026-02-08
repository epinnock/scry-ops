# Scry Tasklist - February 7, 2026

## Overview

23 tasks broken down from the backlog into 30min-1hr sized units for parallel execution by 4-5 LLM agents. Organized into 5 waves based on dependencies.

## Deferred Tasks

| Backlog Item | Reason |
|---|---|
| Fork monet and set up storybook and scry | Skipped - will revisit later |
| Set up Google Drive sync with scry-server | Skipped - will revisit later |
| Take a look at marker.io | Skipped - will revisit later |
| Possibly split figma scry library | Needs architecture decision |
| Clone items from mobbin (scry-ingestion-service) | Ongoing interactive task |

---

## Wave 1 - Independent Foundation (6 tasks, no dependencies)

| Task | File | Time | Repo | Tools | Risk |
|------|------|------|------|-------|------|
| 1.0 Verify Sentry upload-service | [implementation-1.0](wave1/implementation-1.0-verify-sentry-upload-service.md) | 15m | scry-storybook-upload-service | Code-only | Low |
| 1.1 Add Sentry to CDN service | [implementation-1.1](wave1/implementation-1.1-sentry-cdn-service.md) | 45m | scry-cdn-service | Code-only | Medium |
| 1.2 Fix /latest route | [implementation-1.2](wave1/implementation-1.2-fix-latest-route.md) | 30m | scry-cdn-service | Code-only | Medium |
| 1.3 Remove GitHub stars | [implementation-1.3](wave1/implementation-1.3-remove-github-stars.md) | 15m | scry-landing-page | Code-only | Very Low |
| 1.4 PostHog for dashboard | [implementation-1.4](wave1/implementation-1.4-posthog-dashboard.md) | 45m | scry-developer-dashboard | Code + Browser | Low |
| 1.5 PostHog for CLI | [implementation-1.5](wave1/implementation-1.5-posthog-cli.md) | 30m | scry-node | Code-only | Low |

## Wave 2 - Infrastructure & Rename (5 tasks)

| Task | File | Time | Repo | Tools | Risk | Depends On |
|------|------|------|------|-------|------|------------|
| 2.1 Rename cdn -> viewer | [implementation-2.1](wave2/implementation-2.1-rename-cdn-to-viewer.md) | 60m | scry-cdn-service | Code + GitHub | High | 1.1, 1.2 |
| 2.2 Update bucket names | [implementation-2.2](wave2/implementation-2.2-update-bucket-names.md) | 45m | cdn + upload svc | Code + Cloudflare | Critical (prep only) | - |
| 2.3 Quality gates: scry-node | [implementation-2.3](wave2/implementation-2.3-quality-gates-scry-node.md) | 30m | scry-node | Code-only | Low | - |
| 2.4 Quality gates: dashboard | [implementation-2.4](wave2/implementation-2.4-quality-gates-dashboard.md) | 30m | scry-developer-dashboard | Code-only | Low | - |
| 2.5 Quality gates: upload-svc | [implementation-2.5](wave2/implementation-2.5-quality-gates-upload-service.md) | 30m | scry-storybook-upload-service | Code-only | Very Low | - |

## Wave 3 - Feature Work & E2E (5 tasks)

| Task | File | Time | Repo | Tools | Risk | Depends On |
|------|------|------|------|-------|------|------------|
| 3.1 Recent builds in overview | [implementation-3.1](wave3/implementation-3.1-recent-builds-overview.md) | 45m | scry-developer-dashboard | Code-only | Low | - |
| 3.2 E2E tests: CDN service | [implementation-3.2](wave3/implementation-3.2-e2e-cdn-service.md) | 60m | scry-cdn-service | Code-only | High | - |
| 3.3 E2E tests: dashboard | [implementation-3.3](wave3/implementation-3.3-e2e-dashboard.md) | 60m | scry-developer-dashboard | Code-only | High | - |
| 3.4 CI coverage thresholds | [implementation-3.4](wave3/implementation-3.4-ci-coverage-thresholds.md) | 45m | all projects | Code + GitHub | Medium | 2.3, 2.4, 2.5 |
| 3.5 GH App plan consolidation | [implementation-3.5](wave3/implementation-3.5-github-app-plan.md) | 60m | plans (read-only) | Code-only | Low | - |

## Wave 4 - Advanced Features (5 tasks)

| Task | File | Time | Repo | Tools | Risk | Depends On |
|------|------|------|------|-------|------|------------|
| 4.1 Google OAuth login | [implementation-4.1](wave4/implementation-4.1-google-oauth-login.md) | 60m | scry-developer-dashboard | Code + Firebase | High | - |
| 4.2 Staging E2E tests | [implementation-4.2](wave4/implementation-4.2-staging-e2e.md) | 45m | all services | Code + staging | Low | 3.2, 3.3 |
| 4.3 Production E2E tests | [implementation-4.3](wave4/implementation-4.3-production-e2e.md) | 45m | all services | Code + prod | High (safety) | 4.2 |
| 4.4 Analysis service scaffold | [implementation-4.4](wave4/implementation-4.4-analysis-service-scaffold.md) | 60m | NEW: scry-analysis-service | Code-only | Low | - |
| 4.5 Email routing setup | [implementation-4.5](wave4/implementation-4.5-email-routing.md) | 30m | docs only | Cloudflare (browser) | Low | - |

## Wave 5 - Integration & Polish (2 tasks)

| Task | File | Time | Repo | Tools | Risk | Depends On |
|------|------|------|------|-------|------|------------|
| 5.1 Deploy figma-scry private | [implementation-5.1](wave5/implementation-5.1-deploy-figma-scry.md) | 45m | html2fig -> new repo | GitHub + npm | Medium | - |
| 5.2 GH issue creation flow | [implementation-5.2](wave5/implementation-5.2-github-issue-creation.md) | 60m | scry-developer-dashboard | Code-only | High | 3.5 |

---

## Dependency Graph

```
Wave 1 (all independent)
  1.0 (verify sentry)
  1.1 ─┐
  1.2 ─┤──> 2.1 (rename cdn->viewer)
  1.3   │
  1.4   │
  1.5   │

Wave 2
  2.3 ─┐
  2.4 ─┤──> 3.4 (CI coverage thresholds)
  2.5 ─┘

Wave 3
  3.2 ─┐
  3.3 ─┤──> 4.2 (staging e2e) ──> 4.3 (prod e2e)
       │
  3.5 ────> 5.2 (GH issue creation)
```

## Agent Permissions Summary

| Permission Type | Task Count | Tasks |
|---|---|---|
| Code-only | 14 | 1.0, 1.1, 1.2, 1.3, 1.5, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.5, 4.4, 5.2 |
| Code + Browser | 2 | 1.4, 4.5 |
| Code + GitHub | 3 | 2.1, 3.4, 5.1 |
| Code + Cloudflare | 1 | 2.2 |
| Code + Firebase | 1 | 4.1 |
| Code + Env access | 2 | 4.2, 4.3 |

## Estimated Timeline

- **Total tasks:** 23
- **Total person-hours:** ~17 hours
- **Wall-clock with 5 parallel agents:** ~4-5 hours
