# Task 1.5: Set Up PostHog for CLI (scry-node)

## Overview

Add PostHog analytics to the Node.js CLI tool to track deployment events, feature usage, and error patterns. Sentry is already integrated for error tracking; PostHog adds product analytics. Must include opt-out mechanism since CLI tools should respect user privacy preferences.

**Time Estimate:** 30 min
**Target Repo:** `scry-node`
**Agent Tools Required:** Code-only (read/write files, `npm install`, `npm test`)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| PC-001 | Telemetry slows down CLI exit (flush timeout) | Medium | Medium | Medium |
| PC-002 | Users object to telemetry without disclosure | Medium | High | High |
| PC-003 | PostHog SDK adds significant bundle size | Low | Low | Low |
| PC-004 | Network errors from PostHog block CLI operations | Low | High | Medium |

**Mitigation:**
- PC-001: Use `posthog.shutdown()` with a max 2s timeout, same pattern as Sentry's `Sentry.close(2000)`
- PC-002: Add `--no-telemetry` flag AND `SCRY_TELEMETRY_DISABLED` env var. Print telemetry notice on first run.
- PC-003: `posthog-node` is lightweight (~50KB)
- PC-004: PostHog calls are fire-and-forget, never block CLI flow

---

## File-by-file Plan

### 1. Install Dependency

```bash
cd scry-node
npm install posthog-node
```

### 2. Create Telemetry Module

**File:** `scry-node/lib/telemetry.js` (NEW)

```javascript
const { PostHog } = require('posthog-node');

let client = null;
let disabled = false;

function init(options = {}) {
  disabled = options.disabled ||
    process.env.SCRY_TELEMETRY_DISABLED === 'true' ||
    process.env.SCRY_TELEMETRY_DISABLED === '1';

  if (disabled) return;

  client = new PostHog(
    process.env.SCRY_POSTHOG_KEY || 'phc_YOUR_PUBLIC_KEY',
    { host: 'https://us.i.posthog.com' }
  );
}

function trackEvent(eventName, properties = {}) {
  if (disabled || !client) return;

  const distinctId = getAnonymousId();
  client.capture({
    distinctId,
    event: eventName,
    properties: {
      cli_version: require('../package.json').version,
      node_version: process.version,
      os_type: process.platform,
      os_arch: process.arch,
      ...properties,
    },
  });
}

function getAnonymousId() {
  // Use a hash of machine ID or hostname for anonymous tracking
  const os = require('os');
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 16);
}

async function shutdown() {
  if (client) {
    await client.shutdown();
  }
}

module.exports = { init, trackEvent, shutdown };
```

### 3. Integrate into CLI Entry Point

**File:** `scry-node/bin/cli.js`

Add telemetry initialization alongside existing Sentry init:

```javascript
const telemetry = require('../lib/telemetry');

// Near Sentry.init() (around line 220):
telemetry.init({ disabled: argv['no-telemetry'] });

// In deploy command handler:
telemetry.trackEvent('deploy_started', { project: argv.project });
// ... on success:
telemetry.trackEvent('deploy_completed', { project: argv.project, duration_ms: elapsed });
// ... on failure:
telemetry.trackEvent('deploy_failed', { project: argv.project, error_type: err.code });

// In coverage analysis handler:
telemetry.trackEvent('coverage_analysis_started', { project: argv.project });
telemetry.trackEvent('coverage_analysis_completed', { components: count });

// Before process exit (near Sentry.close):
await telemetry.shutdown();
```

### 4. Add --no-telemetry Flag

**File:** `scry-node/bin/cli.js`

Add to yargs global options:

```javascript
.option('no-telemetry', {
  type: 'boolean',
  description: 'Disable anonymous usage analytics',
  default: false,
})
```

### 5. Update README

**File:** `scry-node/README.md`

Add a "Telemetry" section:

```markdown
## Telemetry

scry-deployer collects anonymous usage analytics to improve the tool.
No personally identifiable information is collected.

To opt out:
- Set environment variable: `SCRY_TELEMETRY_DISABLED=true`
- Or use the flag: `scry deploy --no-telemetry`
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-node/bin/cli.js` | Main entry point, Sentry integration at L220 |
| `scry-node/lib/` | Module directory for new telemetry.js |
| `scry-node/package.json` | Dependencies |
| `scry-node/README.md` | Documentation |

---

## Verification

1. `npm test` passes
2. `node bin/cli.js --help` shows `--no-telemetry` option
3. With telemetry enabled: events are captured (check PostHog dashboard)
4. With `--no-telemetry`: no network calls to PostHog
5. With `SCRY_TELEMETRY_DISABLED=true`: no network calls to PostHog
6. CLI exit is not delayed more than 2s for telemetry flush
7. Sentry continues to work alongside PostHog
