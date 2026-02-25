# Implementation Plan: scry-sbcov

**Service:** scry-sbcov (`/home/boxuser/scry/scry-sbcov`)
**Stack:** TypeScript, Commander CLI, Playwright, ts-morph
**Test command:** `npm test` (Vitest)

---

## Goal

Add `--screenshots` and `--output-zip <path>` CLI flags that:
1. Capture a screenshot of every **passing** story during Playwright execution
2. Generate a `metadata.json` with story metadata (including new `location` and `componentFilePath` fields)
3. Bundle screenshots + metadata into a ZIP compatible with `scry-build-processing-service`

**Broken stories are excluded** — screenshots only happen after all validation checks pass. This leverages the existing error-checking pipeline (render errors, Storybook errors, page errors, console errors, play function failures) with zero duplication.

---

## metadata.json Output Format

```json
[
  {
    "filepath": "src/components/Button.stories.tsx",
    "componentFilePath": "src/components/Button.tsx",
    "componentName": "Button",
    "testName": "Primary",
    "storyTitle": "Components/Button",
    "screenshotPath": "images/button--primary.png",
    "location": { "startLine": 15, "endLine": 22 }
  }
]
```

### Build-processing compatibility

Build-processing's `MetadataStory` interface (in `src/pipeline/metadata-parser.ts:3-10`):
- All fields are **optional** with defaults: `filepath=''`, `componentName='Unknown'`, `testName='Default'`
- Only `screenshotPath` is functionally required (stories without it are skipped)
- Unknown fields like `componentFilePath` are silently ignored
- Accepts both array and `{ stories: [...] }` formats
- Screenshot matching has 3-level fallback: exact path → suffix match → filename only

**Result:** Our output is fully compatible with no changes needed in build-processing.

---

## Files to Modify

### 1. `src/types/index.ts`

**Add to `ParsedStory`** (line 652-660):
```typescript
/** Source location of the story export declaration */
location?: { startLine: number; endLine: number };
```

**Add to `StoryExecutionResult`** (line 246-273):
```typescript
/** Path to captured screenshot (only for passing stories when --screenshots enabled) */
screenshotPath?: string;
```

**Add to `ExecutionConfig`** (line 730-737):
```typescript
/** Capture screenshots for all passing stories (not just failures) */
captureAllScreenshots?: boolean;
```

**Add to `CliOptions`** (line 743-758):
```typescript
/** Enable screenshot capture for all passing stories */
screenshots?: boolean;
/** Output path for metadata+screenshots ZIP */
outputZip?: string;
```

---

### 2. `src/parsers/story-parser.ts`

**Goal:** Add `location` field to each `ParsedStory` with the line numbers of the story export declaration.

**Where:** In the function that extracts individual stories from story files (likely `extractStories()` or equivalent). When a story export like `export const Primary: Story = { ... }` is found:

If using **regex-based parsing**: the line number can be derived from counting newlines up to the match index. Use `code.substring(0, match.index).split('\n').length` for startLine. For endLine, find the closing brace of the story object.

If using **ts-morph AST**: call `.getStartLineNumber()` and `.getEndLineNumber()` on the variable declaration node. ts-morph is already a dependency.

**Note:** Check the actual implementation of `extractStories()` to determine which approach is appropriate. The parser may use regex (based on `META_REGEX`, `TITLE_REGEX` patterns seen in `extractMeta()`).

---

### 3. `src/core/story-executor.ts`

**Minimal change.** The existing error-checking pipeline is untouched. We only add screenshot capture on the success path.

**`executeStory()` (line 152-343):**

Add `captureAllScreenshots: boolean` parameter to the function signature.

**Success path** — insert between line 274 (`const duration = Date.now() - startTime;`) and line 276 (`await page.close()`):

```typescript
// Capture screenshot for metadata ZIP (only for passing stories)
let screenshotPath: string | undefined;
if (captureAllScreenshots) {
  screenshotPath = path.join(screenshotDir, `${story.storyId}.png`);
  await page.screenshot({ path: screenshotPath });
}
```

Add `screenshotPath` to the returned `StoryExecutionResult` object (line 278-288):
```typescript
return {
  storyId: story.storyId,
  componentName,
  storyName: story.storyName,
  status: 'passed',
  duration,
  failure: null,
  warnings,
  hasPlayFunction: story.hasPlayFunction,
  playFunctionStatus,
  screenshotPath,  // <-- add this
};
```

**Failure path** (line 289-342) — **no changes**. The existing failure screenshot (`{storyId}-failure.png`) stays as-is for debugging purposes. Failed stories are excluded from the metadata ZIP by the zip-generator.

**`executeStories()` (line 37-147):**

Pass `captureAllScreenshots` from config through to each `executeStory()` call. The config value comes from the new `ExecutionConfig.captureAllScreenshots` field.

---

### 4. `src/core/analyzer.ts`

**`analyze()` (line 17-119):**

After step 5 (story execution, lines 75-96), add step 6:

```typescript
// Step 6: Generate metadata ZIP (if requested)
if (config.outputZip && executionResults?.executed) {
  if (verbose) console.log('Step 6: Generating metadata ZIP...');
  const { generateMetadataZip } = await import('./zip-generator.js');
  await generateMetadataZip(config.outputZip, storyFiles, executionResults, projectPath);
  if (verbose) console.log(`  ZIP written to ${config.outputZip}`);
}
```

---

### 5. `src/cli/index.ts`

**Add CLI options** (around line 42, before `--ci`):
```typescript
.option('--screenshots', 'Capture screenshots for all passing stories (implies --execute)')
.option('--output-zip <path>', 'Output metadata+screenshots ZIP to this path')
```

**`run()` function** (line 56-119):

After loading config (line 67), handle new flags:
```typescript
if (options.screenshots) {
  config.execute = true;  // --screenshots implies --execute
  config.executionConfig = {
    ...config.executionConfig,
    captureAllScreenshots: true,
  };
}
if (options.outputZip) {
  config.outputZip = options.outputZip;
}
```

---

### 6. `src/cli/config.ts`

In `loadConfig()` — merge `screenshots` and `outputZip` from CLI options into the config object.

In `DEFAULT_CONFIG` or wherever defaults are defined:
```typescript
screenshots: false,
outputZip: null,
```

---

### 7. New file: `src/core/zip-generator.ts`

```typescript
import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import type { ParsedStoryFile, ExecutionResults } from '../types/index.js';

interface MetadataEntry {
  filepath: string;
  componentFilePath: string;
  componentName: string;
  testName: string;
  storyTitle: string;
  screenshotPath: string;
  location?: { startLine: number; endLine: number };
}

/**
 * Generate a metadata+screenshots ZIP compatible with scry-build-processing-service.
 * Only includes passing stories that have screenshots.
 */
export async function generateMetadataZip(
  outputPath: string,
  storyFiles: ParsedStoryFile[],
  executionResults: ExecutionResults,
  projectPath: string
): Promise<void> {
  const metadata: MetadataEntry[] = [];

  // Build lookup: storyId → execution result
  const resultMap = new Map(
    executionResults.stories.map(r => [r.storyId, r])
  );

  for (const file of storyFiles) {
    for (const story of file.stories) {
      const result = resultMap.get(story.storyId);

      // Skip failed/skipped stories and stories without screenshots
      if (!result || result.status !== 'passed' || !result.screenshotPath) {
        continue;
      }

      // Resolve componentFilePath from the story file's component import
      let componentFilePath = '';
      if (file.meta.componentPath) {
        const storyDir = path.dirname(file.filePath);
        const resolved = path.resolve(storyDir, file.meta.componentPath);
        componentFilePath = path.relative(projectPath, resolved);
        // Try common extensions if the import has no extension
        if (!path.extname(componentFilePath)) {
          for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
            if (fs.existsSync(path.resolve(projectPath, componentFilePath + ext))) {
              componentFilePath += ext;
              break;
            }
          }
        }
      }

      metadata.push({
        filepath: file.relativePath,
        componentFilePath,
        componentName: file.meta.componentName || 'Unknown',
        testName: story.storyName,
        storyTitle: file.meta.title || '',
        screenshotPath: `images/${story.storyId}.png`,
        location: story.location,
      });
    }
  }

  // Create ZIP archive
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);

    // Add metadata.json at root
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

    // Add screenshot files to images/ directory
    for (const entry of metadata) {
      // Find the execution result to get the actual screenshot path on disk
      const storyId = entry.screenshotPath.replace('images/', '').replace('.png', '');
      const result = resultMap.get(storyId);
      if (result?.screenshotPath && fs.existsSync(result.screenshotPath)) {
        archive.file(result.screenshotPath, { name: entry.screenshotPath });
      }
    }

    archive.finalize();
  });
}
```

---

### 8. `package.json`

Add dependency:
```json
"archiver": "^7.0.0"
```

This is consistent with scry-node which already uses `archiver@^7.0.1`.

---

## Tests

### New file: `tests/zip-generator.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateMetadataZip } from '../src/core/zip-generator.js';
import * as fs from 'fs';
import * as path from 'path';
import { unzipSync } from 'fflate';

describe('generateMetadataZip', () => {
  // Test: ZIP contains metadata.json with correct schema
  // Test: ZIP contains images/*.png matching metadata entries
  // Test: Stories with status 'failed' are excluded
  // Test: Stories without screenshotPath are excluded
  // Test: componentFilePath resolves correctly
  // Test: location field is populated
  // Test: Empty execution results produce valid ZIP with empty metadata array
});
```

### Existing test updates
- Verify `--screenshots` flag sets `captureAllScreenshots` in config
- Verify `--output-zip` flag sets `outputZip` in config
- Verify `--screenshots` implies `--execute`

---

## Checklist

- [ ] Add `location` to `ParsedStory` type
- [ ] Add `screenshotPath` to `StoryExecutionResult` type
- [ ] Add `captureAllScreenshots` to `ExecutionConfig` type
- [ ] Add `screenshots` and `outputZip` to `CliOptions` type
- [ ] Extract line numbers in story parser
- [ ] Capture screenshots on success path in `executeStory()`
- [ ] Pass `captureAllScreenshots` through `executeStories()`
- [ ] Create `zip-generator.ts` with `generateMetadataZip()`
- [ ] Add ZIP generation step to `analyze()` pipeline
- [ ] Add `--screenshots` and `--output-zip` CLI options
- [ ] Update config loader with new defaults
- [ ] Add `archiver` dependency
- [ ] Write tests for ZIP generation
- [ ] Run `npm test` — all tests pass
