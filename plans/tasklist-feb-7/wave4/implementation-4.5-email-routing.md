# Task 4.5: Set Up scrymore.com Email Routing

## Overview

Configure email routing for the scrymore.com domain using Cloudflare Email Routing. The domain is already on Cloudflare (confirmed by `wrangler.toml` references to `zone_name = "scrymore.com"`). This is primarily a Cloudflare dashboard configuration task with documentation.

**Time Estimate:** 30 min
**Target Repo:** `scry` (documentation only)
**Agent Tools Required:** Cloudflare dashboard (browser), code for documentation
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| EM-001 | MX record changes break existing email delivery | Low | High | Medium |
| EM-002 | SPF/DKIM/DMARC misconfiguration causes emails to go to spam | Medium | Medium | Medium |
| EM-003 | Catch-all route forwards spam to destination inbox | Medium | Low | Low |

**Overall Risk: Low** - Standard Cloudflare feature, well-documented.

**Mitigation:**
- EM-001: Verify no existing MX records before adding Cloudflare's. If existing email is set up, coordinate migration.
- EM-002: Follow Cloudflare's recommended SPF/DKIM/DMARC records exactly.
- EM-003: Use specific address routes instead of catch-all, or apply Cloudflare's spam filtering.

---

## Implementation Steps (Cloudflare Dashboard)

### 1. Enable Email Routing

1. Log in to Cloudflare Dashboard
2. Select the `scrymore.com` domain
3. Navigate to **Email** > **Email Routing**
4. Click **Enable Email Routing**
5. Cloudflare will add required MX and TXT records automatically

### 2. Configure Email Addresses

Set up specific routing rules:

| Address | Destination | Purpose |
|---------|-------------|---------|
| `support@scrymore.com` | Team inbox | Customer support |
| `team@scrymore.com` | Team inbox | Internal communication |
| `security@scrymore.com` | Security contact | Security reports (referenced in SECURITY.md) |
| `noreply@scrymore.com` | Drop | System emails sender address |

### 3. Configure DNS Records

Cloudflare will auto-add most records. Verify:

```
MX    scrymore.com    route1.mx.cloudflare.net    Priority: 69
MX    scrymore.com    route2.mx.cloudflare.net    Priority: 37
MX    scrymore.com    route3.mx.cloudflare.net    Priority: 90
TXT   scrymore.com    v=spf1 include:_spf.mx.cloudflare.net ~all
```

### 4. Set Up DMARC (if not present)

```
TXT   _dmarc.scrymore.com    v=DMARC1; p=quarantine; rua=mailto:dmarc@scrymore.com
```

### 5. Documentation

**File:** `docs/email-routing-setup.md` (NEW)

Document:
- Current email routing configuration
- How to add/modify email addresses
- DNS records in place
- SPF/DKIM/DMARC configuration
- How to verify email delivery
- Troubleshooting steps

---

## Verification

1. Send test email to `support@scrymore.com` - should arrive at destination
2. Send test email to `team@scrymore.com` - should arrive at destination
3. MX records resolve correctly: `dig MX scrymore.com`
4. SPF record validates: `dig TXT scrymore.com`
5. DMARC record exists: `dig TXT _dmarc.scrymore.com`
6. Documentation is complete and accurate
