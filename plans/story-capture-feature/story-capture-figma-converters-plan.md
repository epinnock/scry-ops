# Figma Converters Plan — Story Capture Service

## Goal

Support two DOM-to-Figma conversion options within the unified capture service:
1. **html-to-figma** — Local, bundled, free
2. **code.to.design** — Cloud API, paid, higher fidelity

---

## Converter Comparison

| Feature | html-to-figma | code.to.design |
|---------|---------------|----------------|
| Type | Local (bundled at build) | Cloud API |
| Cost | Free | Paid (API key required) |
| Fidelity | Good | Higher (complex CSS, gradients) |
| Offline | Yes | No |
| Speed | Fast (no network) | Slower (API call) |
| Dependencies | None (bundled) | Optional SDK |
| CSS Support | Basic transforms, shadows | Advanced (grid, animations) |

---

## html-to-figma Integration

### Source Location
```
/home/boxuser/scry/html2fig/html-to-figma/
├── src/browser/
│   ├── html-to-figma.ts      # Main entry: htmlToFigma(selector)
│   ├── element-to-figma.ts   # Element → Figma node conversion
│   ├── text-to-figma.ts      # Text node handling
│   ├── dom-utils.ts          # DOM utilities, image processing
│   └── add-constraints.ts    # CSS → Figma constraints
├── src/types.ts              # LayerNode type definitions
└── package.json              # html-figma package
```

### How It Works

1. **TreeWalker** traverses DOM starting from selector
2. For each element, `elementToFigma()` extracts:
   - `getBoundingClientRect()` → x, y, width, height
   - `getComputedStyle()` → fills, strokes, effects, fonts
   - Pseudo-elements (::before, ::after)
   - SVG content
3. Builds hierarchical `LayerNode` tree matching Figma structure
4. Returns JSON ready for Figma plugin API

### Bundle Strategy

**Build-time bundling** (not runtime dependency):

```javascript
// scripts/bundle-html-to-figma.mjs
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['html2fig/html-to-figma/src/browser/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'HtmlToFigma',
  minify: true,
});

// Embed as string constant
const bundle = `${result.outputFiles[0].text}\nwindow.htmlToFigma = HtmlToFigma.htmlToFigma;`;
```

**Injection into Playwright page:**

```typescript
// src/figma/html-to-figma.bundle.ts
export const HTML_TO_FIGMA_BUNDLE = `...bundled code...`;

export async function injectHtmlToFigma(page: Page): Promise<void> {
  await page.addScriptTag({ content: HTML_TO_FIGMA_BUNDLE });
}

export async function extractWithHtmlToFigma(page: Page, selector: string): Promise<LayerNode> {
  return page.evaluate((sel) => window.htmlToFigma(sel), selector);
}
```

### Known Limitations

From html2fig spec analysis:

| Gap | Impact | Workaround |
|-----|--------|------------|
| CSS Gradients | Linear/radial → solid color | Use code.to.design |
| CSS Grid | Layouts may break | Manual adjustment |
| Multiple box shadows | Only first captured | Use code.to.design |
| CSS Transforms | Rotation/scale ignored | None |
| Blend modes | Ignored | None |

---

## code.to.design Integration

### API Details

**Endpoint:** `https://api.to.design/html`

**Authentication:** Bearer token in Authorization header

**Request:**
```json
POST /html
{
  "html": "<style>${CSS}</style>${HTML}",
  "clip": false
}
```

**Response:**
```json
{
  "model": { /* LayerNode tree */ },
  "images": [ /* Associated image assets */ ]
}
```

### Implementation

```typescript
// src/figma/code-to-design.ts

const DEFAULT_API_URL = 'https://api.to.design/html';

interface CodeToDesignOptions {
  apiKey: string;
  apiUrl?: string;
}

interface CodeToDesignResult {
  model: LayerNode;
  images: Array<{
    hash: string;
    url: string;
    data?: Uint8Array;
  }>;
}

export async function extractWithCodeToDesign(
  html: string,
  css: string,
  options: CodeToDesignOptions
): Promise<CodeToDesignResult> {
  const response = await fetch(options.apiUrl || DEFAULT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      html: `<style>${css}</style>${html}`,
      clip: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`code.to.design API error (${response.status}): ${error}`);
  }

  return response.json();
}
```

### Extracting HTML/CSS from Page

```typescript
async function getPageContent(page: Page, selector: string): Promise<{ html: string; css: string }> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error(`Selector not found: ${sel}`);

    // Get element HTML
    const html = element.innerHTML;

    // Collect all CSS rules (may fail on cross-origin stylesheets)
    const css = Array.from(document.styleSheets)
      .flatMap(sheet => {
        try {
          return Array.from(sheet.cssRules || []);
        } catch {
          return []; // Cross-origin stylesheet
        }
      })
      .map(rule => rule.cssText)
      .join('\n');

    return { html, css };
  }, selector);
}
```

### SDK Integration (Optional)

```typescript
// For image processing in Figma plugin
import { toBinary, c2dToFigmaCanvas } from '@divriots/c2d-sdk';

// Convert images to binary format
const processedResult = await toBinary(result);

// Apply to Figma canvas (in plugin context)
await c2dToFigmaCanvas(processedResult);
```

---

## Unified Interface

```typescript
// src/figma/index.ts

import { injectHtmlToFigma, extractWithHtmlToFigma } from './html-to-figma.bundle.js';
import { extractWithCodeToDesign } from './code-to-design.js';
import type { FigmaLayerOptions, LayerNode } from '../types/index.js';
import type { Page } from 'playwright';

export async function extractFigmaLayers(
  page: Page,
  selector: string,
  options: FigmaLayerOptions | true
): Promise<LayerNode | null> {
  // Normalize options
  const opts: FigmaLayerOptions = options === true
    ? { converter: 'html-to-figma' }
    : options;

  switch (opts.converter) {
    case 'html-to-figma': {
      await injectHtmlToFigma(page);
      return extractWithHtmlToFigma(page, selector);
    }

    case 'code-to-design': {
      if (!opts.apiKey) {
        throw new Error('code-to-design requires apiKey');
      }

      const { html, css } = await getPageContent(page, selector);
      const result = await extractWithCodeToDesign(html, css, {
        apiKey: opts.apiKey,
        apiUrl: opts.apiUrl,
      });

      return result.model;
    }

    default:
      throw new Error(`Unknown converter: ${(opts as any).converter}`);
  }
}

async function getPageContent(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      html: el?.innerHTML || '',
      css: Array.from(document.styleSheets)
        .flatMap(s => { try { return Array.from(s.cssRules || []); } catch { return []; } })
        .map(r => r.cssText)
        .join('\n'),
    };
  }, selector);
}
```

---

## Usage Examples

### Default (html-to-figma)
```typescript
// Shorthand
await captureStory(url, id, { figmaLayers: true });

// Explicit
await captureStory(url, id, {
  figmaLayers: { converter: 'html-to-figma' }
});
```

### code.to.design
```typescript
await captureStory(url, id, {
  figmaLayers: {
    converter: 'code-to-design',
    apiKey: process.env.CODE_TO_DESIGN_API_KEY,
  }
});

// Custom endpoint (for enterprise/self-hosted)
await captureStory(url, id, {
  figmaLayers: {
    converter: 'code-to-design',
    apiKey: '...',
    apiUrl: 'https://custom.api.endpoint/html',
  }
});
```

### Batch with converter selection
```typescript
const session = await createBrowserSession();

// Use local converter for most stories
const basicResults = await session.captureMany(url, basicStoryIds, {
  figmaLayers: true, // html-to-figma
});

// Use cloud converter for complex stories
const complexResults = await session.captureMany(url, complexStoryIds, {
  figmaLayers: {
    converter: 'code-to-design',
    apiKey: process.env.CODE_TO_DESIGN_API_KEY,
  },
});

await session.close();
```

---

## Error Handling

```typescript
// Errors are isolated to figmaLayers output
const result = await captureStory(url, id, {
  verify: true,
  screenshot: 'always',
  figmaLayers: { converter: 'code-to-design', apiKey: 'invalid' },
});

// verification and screenshot still succeed
expect(result.verification.status).toBe('passed');
expect(result.screenshot.buffer).toBeDefined();

// figmaLayers error captured separately
expect(result.figmaLayers).toBeUndefined();
expect(result.captureErrors).toContainEqual({
  output: 'figmaLayers',
  message: expect.stringContaining('401'),
});
```

---

## Environment Variables

| Variable | Converter | Description |
|----------|-----------|-------------|
| `CODE_TO_DESIGN_API_KEY` | code-to-design | API key (alternative to passing in options) |

---

## Tests

### html-to-figma tests
```typescript
describe('html-to-figma converter', () => {
  it('extracts basic button component');
  it('handles nested elements');
  it('captures text styles');
  it('processes SVG elements');
  it('returns null for empty selector');
});
```

### code.to.design tests
```typescript
describe('code-to-design converter', () => {
  it('sends correct request format');
  it('throws without API key');
  it('handles API errors gracefully');
  it('parses response correctly');
});
```

### Integration tests
```typescript
describe('extractFigmaLayers', () => {
  it('dispatches to html-to-figma by default');
  it('dispatches to code-to-design when specified');
  it('throws for unknown converter');
});
```

---

## Acceptance Criteria

- [ ] html-to-figma bundled at build time
- [ ] Bundle injected correctly into Playwright page
- [ ] `htmlToFigma()` callable from page.evaluate()
- [ ] code.to.design API client implemented
- [ ] Unified interface dispatches to correct converter
- [ ] Errors isolated per-output
- [ ] Both converters tested
- [ ] Documentation updated with usage examples
