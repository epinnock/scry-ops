# Private Projects Implementation Plan

This directory contains the implementation plan for adding private project visibility to Scry.

## Overview

**Goal**: Allow project owners to restrict access to Storybook and coverage reports to authenticated project members only.

**Approach**: Shared JWT (Parent Domain Cookie) - Firebase session cookies shared across `.scrymore.com` subdomains.

## Documents

| Document | Description |
|----------|-------------|
| [00-private-projects-prd-v2.md](./00-private-projects-prd-v2.md) | Product Requirements Document |
| [01-dashboard-shared-jwt-spec.md](./01-dashboard-shared-jwt-spec.md) | Dashboard implementation spec |
| [02-cdn-service-shared-jwt-spec.md](./02-cdn-service-shared-jwt-spec.md) | CDN service implementation spec |
| [03-cli-shared-jwt-spec.md](./03-cli-shared-jwt-spec.md) | CLI implementation spec |
| [04-local-integration-qa-guide.md](./04-local-integration-qa-guide.md) | Local testing, Wrangler setup & QA guide |
| [options-comparison-summary.md](./options-comparison-summary.md) | Analysis of all approaches considered |
| [shared-jwt-auth-approach.md](./shared-jwt-auth-approach.md) | Deep dive on Shared JWT approach |

## Quick Start

1. Read the [PRD](./00-private-projects-prd-v2.md) for the full picture
2. Review component specs in order (01, 02, 03)
3. Check [options-comparison-summary.md](./options-comparison-summary.md) for why this approach was chosen

## Estimated Effort

| Component | Effort |
|-----------|--------|
| Dashboard | 3-4 days |
| CDN Service | 3-4 days |
| CLI | 0.5 days |
| **Total** | **7-9 days** |

## Key Technical Decisions

1. **Firebase Session Cookies** over custom JWTs (standard, secure, maintained by Google)
2. **Parent Domain Cookie** (`.scrymore.com`) for cross-subdomain auth
3. **jose library** for JWT validation in Cloudflare Workers
4. **KV caching** for project visibility lookups (60s TTL)

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    Dashboard     │     │   CDN Service    │     │       CLI        │
│                  │     │                  │     │                  │
│ • Session cookie │────▶│ • JWT validation │     │ • Upload (no     │
│ • Visibility UI  │     │ • Visibility     │     │   auth changes)  │
│ • Member mgmt    │     │   check          │     │ • Link output    │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │
         │    __session cookie    │
         │   (domain: .scrymore.com)
         └────────────────────────┘
```
