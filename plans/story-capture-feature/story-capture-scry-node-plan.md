# scry-node Migration Plan — Story Capture Service

## Goal

Replace storycap dependency with `captureStory()` from scry-sbcov, enabling unified browser automation and Figma layer extraction.

---

## Current State

```javascript
// scry-node/lib/screencap.js (current)
const { execSync } = require('child_process');

async function captureScreenshots(storybookUrl, options = {}) {
  let command = `npx storycap "${storybookUrl}"`;
  // ... build command with options
  execSync(command, { stdio: 'inherit' });
}
```

**Problems:**
- Shells out to storycap (separate process)
- No integration with scry-sbcov's Playwright session
- Cannot extract Figma layers
- No browser session reuse for batch operations

---

## Target State

```javascript
// scry-node/lib/screencap.js (refactored)
const { createBrowserSession } = require('@scrymore/scry-sbcov');

async function captureScreenshots(storybookUrl, options = {}) {
  const session = await createBrowserSession();
  try {
    const storyIds = await fetchStoryIds(storybookUrl);
    return await session.captureMany(storybookUrl, storyIds, {
      screenshot: 'always',
      figmaLayers: options.figmaLayers || false,
      screenshotDir: options.outDir || './__screenshots__',
    });
  } finally {
    await session.close();
  }
}
```

---

## File-by-file Plan

### 1) [`scry-node/package.json`](scry-node/package.json)

Update dependencies:

```json
{
  "dependencies": {
    "@scrymore/scry-sbcov": "^0.3.0",  // Bump to version with captureStory
    // Remove: "storycap": "^4.2.0"
  }
}
```

### 2) [`scry-node/lib/screencap.js`](scry-node/lib/screencap.js)

Complete rewrite:

```javascript
const { createBrowserSession } = require('@scrymore/scry-sbcov');

/**
 * Captures screenshots from a Storybook URL using scry-sbcov
 * @param {string} storybookUrl - URL of the deployed Storybook
 * @param {Object} options - Capture options
 * @returns {Promise<import('@scrymore/scry-sbcov').CaptureResult[]>}
 */
async function captureScreenshots(storybookUrl, options = {}) {
  const session = await createBrowserSession({
    headless: true,
    viewport: { width: 1280, height: 720 },
  });

  try {
    // Fetch story list from Storybook
    const storyIds = await fetchStoryIds(storybookUrl);

    // Apply include/exclude filters
    const filteredIds = filterStoryIds(storyIds, options.include, options.exclude);

    // Configure Figma extraction
    let figmaLayers = false;
    if (options.extractFigma) {
      figmaLayers = {
        converter: options.figmaConverter || 'html-to-figma',
        apiKey: options.codeToDesignApiKey || process.env.CODE_TO_DESIGN_API_KEY,
      };
    }

    // Capture all stories
    const results = await session.captureMany(storybookUrl, filteredIds, {
      screenshot: 'always',
      verify: false,  // scry-node only wants screenshots
      figmaLayers,
      screenshotDir: options.outDir || './__screenshots__',
      concurrency: options.parallel || 4,
    });

    return results;
  } finally {
    await session.close();
  }
}

/**
 * Fetch story IDs from Storybook's index
 */
async function fetchStoryIds(storybookUrl) {
  const response = await fetch(`${storybookUrl}/index.json`);
  if (!response.ok) {
    // Fallback to older stories.json
    const fallback = await fetch(`${storybookUrl}/stories.json`);
    const data = await fallback.json();
    return Object.keys(data.stories || {});
  }
  const data = await response.json();
  return Object.entries(data.entries || {})
    .filter(([_, entry]) => entry.type === 'story')
    .map(([id]) => id);
}

/**
 * Filter story IDs by include/exclude patterns
 */
function filterStoryIds(storyIds, include, exclude) {
  let filtered = storyIds;

  if (include) {
    const pattern = new RegExp(include.replace('*', '.*'));
    filtered = filtered.filter(id => pattern.test(id));
  }

  if (exclude) {
    const pattern = new RegExp(exclude.replace('*', '.*'));
    filtered = filtered.filter(id => !pattern.test(id));
  }

  return filtered;
}

module.exports = { captureScreenshots, fetchStoryIds };
```

### 3) [`scry-node/bin/cli.js`](scry-node/bin/cli.js)

Add new CLI options:

```javascript
// In the yargs configuration, add:
.option('figma-converter', {
  describe: 'Figma converter to use: html-to-figma (default) or code-to-design',
  type: 'string',
  default: 'html-to-figma',
  choices: ['html-to-figma', 'code-to-design'],
})
.option('c2d-api-key', {
  describe: 'API key for code.to.design (or use CODE_TO_DESIGN_API_KEY env)',
  type: 'string',
})
.option('extract-figma', {
  describe: 'Extract Figma layers alongside screenshots',
  type: 'boolean',
  default: false,
})
```

Update calls to `captureScreenshots()`:

```javascript
// In runAnalysis() and runDeployment()
await captureScreenshots(argv.storybookUrl, {
  outDir: argv.screenshotsDir,
  include: argv.include,
  exclude: argv.exclude,
  parallel: argv.parallel,
  extractFigma: argv.extractFigma,
  figmaConverter: argv.figmaConverter,
  codeToDesignApiKey: argv.c2dApiKey,
});
```

### 4) [`scry-node/lib/config.js`](scry-node/lib/config.js)

Update default config:

```javascript
const DEFAULT_CONFIG = {
  // ... existing config
  screenshotOptions: {
    outDir: './__screenshots__',
    parallel: 4,
    extractFigma: false,
    figmaConverter: 'html-to-figma',
  },
  // Remove storycapOptions
};
```

### 5) Remove storycap references

Search and remove any remaining storycap references:

```bash
grep -r "storycap" scry-node/
```

---

## Migration Steps

### Step 1: Update scry-sbcov dependency
```bash
cd scry-node
npm install @scrymore/scry-sbcov@^0.3.0
```

### Step 2: Remove storycap
```bash
npm uninstall storycap
```

### Step 3: Rewrite screencap.js
Apply changes from section 2 above.

### Step 4: Update CLI
Apply changes from section 3 above.

### Step 5: Update config
Apply changes from section 4 above.

### Step 6: Test
```bash
npm test
# Manual test
scry analyze --storybook-url http://localhost:6006 --extract-figma
```

---

## Backward Compatibility

The external API remains compatible:

| Old API | New API | Status |
|---------|---------|--------|
| `captureScreenshots(url, opts)` | `captureScreenshots(url, opts)` | Same signature |
| `--outDir` | `--outDir` | Same |
| `--parallel` | `--parallel` | Same |
| `--include` | `--include` | Same |
| `--exclude` | `--exclude` | Same |

**New options added:**
- `--extract-figma`
- `--figma-converter`
- `--c2d-api-key`

---

## Tests

### Update existing tests

```javascript
// scry-node/test/screencap.test.js
describe('captureScreenshots', () => {
  it('captures screenshots for all stories');
  it('respects include/exclude filters');
  it('extracts figma layers when extractFigma: true');
  it('uses code-to-design when specified');
});
```

---

## Acceptance Criteria

- [ ] storycap removed from dependencies
- [ ] `captureScreenshots()` uses scry-sbcov's `createBrowserSession`
- [ ] Screenshots saved to same location as before
- [ ] `--extract-figma` flag works
- [ ] Both Figma converters work
- [ ] All existing tests pass
- [ ] CLI help shows new options
