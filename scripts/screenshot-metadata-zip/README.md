# Screenshot Metadata ZIP Local Automation

## Scripts

- `run-repo-tests.sh`
  - Runs the main test suite in `scry-sbcov`, `scry-storybook-upload-service`, and `scry-node`.

- `run-local-e2e-smoke.sh`
  - Builds local `scry-sbcov`
  - Starts a local mock upload service
  - Runs `scry-node --with-analysis` against `scry-sample-storybook-app/storybook-static`
  - Verifies that `storybook.zip`, `coverage-report.json`, and `metadata-screenshots.zip` were produced/uploaded
  - Verifies metadata ZIP contains `metadata.json`

- `mock-upload-service.mjs`
  - Lightweight local HTTP server used by the E2E smoke script.

## Usage

```bash
cd /home/boxuser/scry/scripts/screenshot-metadata-zip
chmod +x run-repo-tests.sh run-local-e2e-smoke.sh
./run-repo-tests.sh
./run-local-e2e-smoke.sh
```

## Optional environment variables

- `PORT` (default: `3910`)
- `PROJECT` (default: `local-sample`)
- `VERSION` (default: `e2e-<timestamp>`)
- `OUT_DIR` (default: `/tmp/screenshot-metadata-e2e-<version>`)
