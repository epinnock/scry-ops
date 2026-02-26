#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    port: 3910,
    outputDir: path.join('/tmp', `screenshot-metadata-mock-${Date.now()}`),
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port') parsed.port = Number(args[i + 1]);
    if (arg === '--output-dir') parsed.outputDir = args[i + 1];
  }

  return parsed;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function writeJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(root, relativePath, buffer) {
  const absPath = path.join(root, relativePath);
  ensureDir(path.dirname(absPath));
  fs.writeFileSync(absPath, buffer);
  return absPath;
}

function parseRoute(urlPath) {
  const segments = urlPath.split('/').filter(Boolean);
  return segments;
}

async function main() {
  const { port, outputDir } = parseArgs();
  ensureDir(outputDir);

  let buildNumber = 1;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      const route = parseRoute(url.pathname);
      const method = req.method || 'GET';

      if (method === 'GET' && url.pathname === '/health') {
        return writeJson(res, 200, { ok: true });
      }

      // POST /presigned-url/:project/:version/:filename
      if (method === 'POST' && route[0] === 'presigned-url' && route.length >= 4) {
        const project = route[1];
        const version = route[2];
        const filename = route.slice(3).join('/');
        const key = `${project}/${version}/${filename}`;
        const uploadUrl = `http://127.0.0.1:${port}/r2/${key}`;
        return writeJson(res, 200, {
          url: uploadUrl,
          fields: { key },
          buildId: 'local-build-1',
          buildNumber,
          visibility: 'public',
        });
      }

      // PUT /r2/:project/:version/:filename...
      if (method === 'PUT' && route[0] === 'r2' && route.length >= 4) {
        const relativeKey = route.slice(1).join('/');
        const body = await readBody(req);
        writeFile(outputDir, `r2/${relativeKey}`, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ stored: true, key: relativeKey }));
      }

      // POST /upload/:project/:version/coverage
      if (method === 'POST' && route[0] === 'upload' && route.length === 4 && route[3] === 'coverage') {
        const project = route[1];
        const version = route[2];
        const body = await readBody(req);
        const relativePath = `api/${project}/${version}/coverage-report.json`;
        writeFile(outputDir, relativePath, body);
        return writeJson(res, 201, {
          success: true,
          buildId: 'local-build-1',
          coverageUrl: `http://127.0.0.1:${port}/artifact/${relativePath}`,
        });
      }

      // POST /upload/:project/:version/metadata
      if (method === 'POST' && route[0] === 'upload' && route.length === 4 && route[3] === 'metadata') {
        const project = route[1];
        const version = route[2];
        const body = await readBody(req);
        const zipKey = `${project}/${version}/builds/${buildNumber}/metadata-screenshots.zip`;
        writeFile(outputDir, `api/${zipKey}`, body);
        return writeJson(res, 201, {
          success: true,
          message: 'Metadata ZIP uploaded and processing queued',
          queued: true,
          buildNumber,
          zipKey,
        });
      }

      writeJson(res, 404, { error: 'Not found', path: url.pathname, method });
    } catch (error) {
      writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`mock-upload-service listening on ${port}\n`);
    process.stdout.write(`artifacts: ${outputDir}\n`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
