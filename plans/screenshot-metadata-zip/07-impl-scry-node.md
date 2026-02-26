# Implementation Plan: scry-node

**Service:** scry-node (`/home/boxuser/scry/scry-node`)
**Stack:** Node.js, CommonJS, Yargs CLI, Axios
**Test command:** `npm test` (Jest)

---

## Goal

Replace the existing storycap + `analyzeStorybook()` + `createMasterZip()` flow with a single scry-sbcov invocation when deploying with `--with-analysis`. Upload the resulting metadata ZIP to the upload-service's new `/metadata` endpoint.

---

## Current Deploy Flow (with --with-analysis)

```
bin/cli.js: runDeployment(argv)
│
├─ resolveCoverage(argv)
│  └─ runCoverageAnalysis() → coverage report JSON
│
├─ captureScreenshots(storybookUrl)          ← storycap (Puppeteer)
│  └─ saves to __screenshots__/
│
├─ analyzeStorybook({ storiesDir, screenshotsDir })
│  └─ returns metadata object with stories[]
│
├─ createMasterZip({ staticsiteDir, screenshotsDir, metadata })
│  └─ single ZIP: static site + images/ + metadata.json
│
├─ uploadBuild({ zipPath, coverageReport })
│  ├─ uploadFileDirectly() → presigned URL → R2
│  └─ uploadCoverageReportDirectly() → /coverage endpoint
│
└─ cleanup temp files
```

**Problems with current flow:**
- Two separate browser sessions: storycap (Puppeteer) for screenshots + scry-sbcov (Playwright) for coverage
- Metadata from `analyzeStorybook()` is less rich than scry-sbcov's AST-based metadata
- The master ZIP combines static site + screenshots + metadata into one file — but build-processing needs screenshots+metadata as a separate artifact
- No queue trigger — metadata never reaches build-processing

---

## New Deploy Flow (with --with-analysis)

```
bin/cli.js: runDeployment(argv)
│
├─ resolveCoverage(argv)
│  └─ runCoverageAnalysis({ screenshots: true, outputZipPath })
│     └─ scry-sbcov handles: coverage + screenshots + metadata ZIP
│     └─ returns: { report, metadataZipPath }
│
├─ zipDirectory(argv.dir, outPath)
│  └─ storybook static site only (no screenshots, no metadata)
│
├─ uploadBuild({ zipPath, coverageReport, metadataZipPath })
│  ├─ uploadFileDirectly() → storybook.zip to R2
│  ├─ uploadCoverageReportDirectly() → /coverage endpoint
│  └─ uploadMetadataZip() → /metadata endpoint (triggers queue)
│
└─ cleanup temp files
```

**What changes:**
- `captureScreenshots()` removed — scry-sbcov handles this
- `analyzeStorybook()` removed — scry-sbcov has richer metadata
- `createMasterZip()` replaced with `zipDirectory()` — storybook static files only
- New `uploadMetadataZip()` step after coverage upload
- Single browser session (Playwright) for everything

**What stays the same:**
- Simple deploy (without `--with-analysis`) is completely unchanged
- Coverage report upload flow unchanged
- PR comment posting unchanged
- Config resolution unchanged

---

## Files to Modify

### 1. `lib/coverage.js`

**`runCoverageAnalysis()` (line 29-102):**

Add parameters to the options object:
```javascript
async function runCoverageAnalysis({
  storybookDir,
  baseBranch = 'main',
  failOnThreshold = false,
  execute = false,
  outputPath,
  keepReport = false,
  // NEW:
  screenshots = false,
  outputZipPath = null,
} = {})
```

Extend the scry-sbcov command construction (around line 50-60):
```javascript
let command = `npx -y @scrymore/scry-sbcov@latest`;
command += ` --storybook-static "${storybookDir}"`;
command += ` --output "${outputPath}"`;
command += ` --base "${baseBranch}"`;
if (execute || screenshots) command += ' --execute';
if (screenshots && outputZipPath) {
  command += ' --screenshots';
  command += ` --output-zip "${outputZipPath}"`;
}
if (verbose) command += ' --verbose';
if (ci) command += ' --ci';
```

Update return value — instead of returning just the parsed report:
```javascript
// BEFORE:
return report;

// AFTER:
return {
  report,
  metadataZipPath: (screenshots && outputZipPath && fs.existsSync(outputZipPath))
    ? outputZipPath
    : null,
};
```

**Breaking change note:** The return type changes from a plain object to `{ report, metadataZipPath }`. All callers of `runCoverageAnalysis()` need to be updated to use `.report` instead of the direct return value.

---

### 2. `lib/apiClient.js`

**Add `uploadMetadataZip()` function** (after `uploadCoverageReportDirectly()`, around line 283):

```javascript
/**
 * Upload metadata+screenshots ZIP to the upload service.
 * This triggers build-processing via queue message.
 */
async function uploadMetadataZip(apiClient, target, metadataZipPath, logger) {
  const { project, version } = target;
  const url = `/upload/${project}/${version}/metadata`;

  logger.info('Uploading metadata ZIP...');
  const fileBuffer = fs.readFileSync(metadataZipPath);

  try {
    const response = await apiClient.post(url, fileBuffer, {
      headers: { 'Content-Type': 'application/zip' },
      maxContentLength: 100 * 1024 * 1024, // 100MB limit
    });

    const data = response.data;
    logger.success(`Metadata ZIP uploaded (build #${data.buildNumber}, queued: ${data.queued})`);

    return {
      success: true,
      status: response.status,
      queued: data.queued,
      buildNumber: data.buildNumber,
      zipKey: data.zipKey,
    };
  } catch (error) {
    const message = error.response?.data?.error || error.message;
    logger.warn(`Metadata ZIP upload failed: ${message}`);
    return { success: false, error: message };
  }
}
```

**Update `uploadBuild()` (line 295-317):**

Add `metadataZipPath` to options and call `uploadMetadataZip()` after coverage:

```javascript
async function uploadBuild(apiClient, target, options) {
  // ... existing storybook.zip upload ...

  // ... existing coverage upload with retry ...

  // Upload metadata ZIP (if provided)
  let metadataUpload = null;
  if (options.metadataZipPath) {
    metadataUpload = await uploadMetadataZip(
      apiClient, target, options.metadataZipPath, logger
    );
  }

  return { zipUpload, coverageUpload, metadataUpload };
}
```

**Update `module.exports` (line 319):**
```javascript
module.exports = { getApiClient, uploadBuild, uploadFileDirectly, uploadMetadataZip };
```

---

### 3. `bin/cli.js`

**Update `resolveCoverage()` (line 484-519):**

```javascript
async function resolveCoverage(argv, logger) {
  if (argv.coverage === false) {
    return { coverageReport: null, coverageSummary: null, metadataZipPath: null };
  }

  // ... existing coverage report loading logic ...

  // Determine if we need screenshots
  const needsScreenshots = !!argv.withAnalysis;
  const outputZipPath = needsScreenshots
    ? path.join(os.tmpdir(), `scry-metadata-${Date.now()}.zip`)
    : null;

  const result = await runCoverageAnalysis({
    storybookDir: argv.dir,
    baseBranch: argv.coverageBase || 'main',
    failOnThreshold: argv.coverageFailOnThreshold,
    execute: true,
    screenshots: needsScreenshots,
    outputZipPath,
    // ... existing options
  });

  const coverageReport = result.report;
  const coverageSummary = coverageReport ? extractCoverageSummary(coverageReport) : null;

  return {
    coverageReport,
    coverageSummary,
    metadataZipPath: result.metadataZipPath,
  };
}
```

**Update `runDeployment()` (line 82-180):**

The `--with-analysis` branch changes:

```javascript
async function runDeployment(argv) {
  const { coverageReport, coverageSummary, metadataZipPath } = await resolveCoverage(argv, logger);

  let outPath;

  if (argv.withAnalysis) {
    // NEW: scry-sbcov already handled screenshots + metadata ZIP
    // Just zip the storybook static site (no screenshots, no metadata in this ZIP)
    outPath = path.join(os.tmpdir(), `storybook-${Date.now()}.zip`);
    logger.info('Creating storybook archive...');
    await zipDirectory(argv.dir, outPath);
    logger.success('Storybook archive created.');
  } else {
    // Simple deploy — same as before
    outPath = path.join(os.tmpdir(), `storybook-${Date.now()}.zip`);
    await zipDirectory(argv.dir, outPath);
  }

  // Upload all artifacts
  const apiClient = getApiClient(argv.apiUrl, argv.apiKey);
  const target = { project: argv.project, version: argv.version };
  const uploadResult = await uploadBuild(apiClient, target, {
    zipPath: outPath,
    coverageReport,
    metadataZipPath,  // NEW — will be null if not --with-analysis
  });

  // ... existing PR comment and URL logging ...

  // Cleanup
  try {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    if (metadataZipPath && fs.existsSync(metadataZipPath)) fs.unlinkSync(metadataZipPath);
  } catch (e) {
    logger.warn('Cleanup failed: ' + e.message);
  }
}
```

**Remove from `--with-analysis` path:**
- `captureScreenshots()` call
- `analyzeStorybook()` call
- `createMasterZip()` call
- References to `screenshotsDir` and `storiesDir`

**Keep:**
- `zipDirectory()` for creating the storybook-only ZIP (this function already exists in `archiveUtils.js`)
- All other paths (simple deploy, analyze command) unchanged

---

### 4. `lib/archiveUtils.js`

**No changes needed.** Keep `createMasterZip()` for backward compatibility — the `analyze` command may still use it. `zipDirectory()` (line 6-12) already exists and creates a simple ZIP of a directory.

---

### 5. `package.json`

`@scrymore/scry-sbcov` is already a dependency at `^0.2.2`. After scry-sbcov changes are published with the new `--screenshots` and `--output-zip` flags, this version range should pick up the update (assuming semver minor bump to 0.3.0).

If scry-sbcov is published as 0.3.0:
```json
"@scrymore/scry-sbcov": "^0.3.0"
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| scry-sbcov fails during coverage analysis | `resolveCoverage()` returns null report. Deploy continues without metadata ZIP. |
| scry-sbcov succeeds but ZIP generation fails | `metadataZipPath` will be null (file doesn't exist). Upload skips metadata. |
| Storybook ZIP upload succeeds, metadata upload fails | Log warning. Deploy still succeeds (storybook is deployed). |
| No build record exists when uploading metadata | Upload service returns 400. Logged as warning. |
| Queue not configured on upload service | ZIP stored but `queued: false`. Logged. |

The metadata ZIP upload is **non-blocking** — if it fails, the storybook deploy still succeeds. This is intentional: search indexing is a secondary feature that shouldn't block deployments.

---

## Tests

### `test/coverage.test.js`

Existing tests need updating for the new return format:

```javascript
// Test: runCoverageAnalysis with screenshots=true includes --screenshots flag
it('should pass --screenshots flag when screenshots is true', async () => {
  const result = await runCoverageAnalysis({
    storybookDir: '/tmp/storybook',
    screenshots: true,
    outputZipPath: '/tmp/metadata.zip',
  });
  // Verify execSync was called with command containing '--screenshots --output-zip'
  expect(execSync).toHaveBeenCalledWith(
    expect.stringContaining('--screenshots'),
    expect.anything()
  );
});

// Test: return value includes metadataZipPath
it('should return metadataZipPath when screenshots enabled', async () => {
  const result = await runCoverageAnalysis({ screenshots: true, outputZipPath: '/tmp/meta.zip' });
  expect(result).toHaveProperty('metadataZipPath');
  expect(result).toHaveProperty('report');
});
```

### `test/apiClient.test.js`

```javascript
// Test: uploadMetadataZip POSTs to correct endpoint
it('should POST to /upload/{project}/{version}/metadata', async () => {
  await uploadMetadataZip(mockClient, { project: 'test', version: 'v1' }, '/tmp/meta.zip', logger);
  expect(mockClient.post).toHaveBeenCalledWith(
    '/upload/test/v1/metadata',
    expect.any(Buffer),
    expect.objectContaining({ headers: { 'Content-Type': 'application/zip' } })
  );
});

// Test: uploadBuild includes metadata upload when metadataZipPath provided
it('should upload metadata ZIP when metadataZipPath provided', async () => {
  const result = await uploadBuild(mockClient, target, {
    zipPath: '/tmp/storybook.zip',
    metadataZipPath: '/tmp/metadata.zip',
  });
  expect(result.metadataUpload).not.toBeNull();
});

// Test: uploadBuild skips metadata when no path
it('should skip metadata upload when metadataZipPath not provided', async () => {
  const result = await uploadBuild(mockClient, target, { zipPath: '/tmp/storybook.zip' });
  expect(result.metadataUpload).toBeNull();
});
```

### `test/cli.test.js`

```javascript
// Test: --with-analysis triggers scry-sbcov with --screenshots
// Test: simple deploy (no --with-analysis) doesn't pass screenshots flag
// Test: metadata ZIP is cleaned up in finally block
```

---

## Checklist

- [ ] Update `runCoverageAnalysis()` to accept `screenshots` and `outputZipPath` params
- [ ] Update `runCoverageAnalysis()` return type to `{ report, metadataZipPath }`
- [ ] Update all callers of `runCoverageAnalysis()` for new return format
- [ ] Add `uploadMetadataZip()` function to `apiClient.js`
- [ ] Update `uploadBuild()` to accept and handle `metadataZipPath`
- [ ] Add `uploadMetadataZip` to `module.exports`
- [ ] Update `resolveCoverage()` to pass screenshots/outputZipPath
- [ ] Update `runDeployment()` to use new flow (remove storycap/analyzeStorybook/createMasterZip)
- [ ] Ensure `zipDirectory()` is used for storybook-only ZIP
- [ ] Add temp file cleanup for metadata ZIP
- [ ] Update tests for coverage.js return format change
- [ ] Add tests for uploadMetadataZip
- [ ] Add tests for CLI flow changes
- [ ] Run `npm test` — all tests pass
