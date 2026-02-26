#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/boxuser/scry"
PORT="${PORT:-3910}"
PROJECT="${PROJECT:-local-sample}"
VERSION="${VERSION:-e2e-$(date +%s)}"
SAMPLE_APP="$ROOT/scry-sample-storybook-app"
STORYBOOK_DIR="$SAMPLE_APP/storybook-static"
OUT_DIR="${OUT_DIR:-/tmp/screenshot-metadata-e2e-${VERSION}}"
MOCK_LOG="$OUT_DIR/mock-server.log"

mkdir -p "$OUT_DIR"

if [[ ! -d "$STORYBOOK_DIR" ]]; then
  echo "Missing storybook-static directory at $STORYBOOK_DIR"
  exit 1
fi

echo "[1/5] Build local scry-sbcov CLI"
(
  cd "$ROOT/scry-sbcov"
  npm run build
)

echo "[2/5] Start local mock upload service on :$PORT"
node "$ROOT/scripts/screenshot-metadata-zip/mock-upload-service.mjs" \
  --port "$PORT" \
  --output-dir "$OUT_DIR" >"$MOCK_LOG" 2>&1 &
MOCK_PID=$!

cleanup() {
  if ps -p "$MOCK_PID" >/dev/null 2>&1; then
    kill "$MOCK_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

sleep 1
if ! ps -p "$MOCK_PID" >/dev/null 2>&1; then
  echo "Mock server failed to start. Log:"
  cat "$MOCK_LOG"
  exit 1
fi

echo "[3/5] Run scry-node deploy --with-analysis against local branches"
SCRY_SBCOV_CMD="node $ROOT/scry-sbcov/dist/cli/index.js" \
node "$ROOT/scry-node/bin/cli.js" \
  --dir "$STORYBOOK_DIR" \
  --project "$PROJECT" \
  --version "$VERSION" \
  --api-url "http://127.0.0.1:$PORT" \
  --api-key "scry_local_e2e_key" \
  --with-analysis \
  --coverage-base "HEAD" \
  --verbose

echo "[4/5] Validate uploaded artifacts"
STORYBOOK_ZIP="$OUT_DIR/r2/$PROJECT/$VERSION/storybook.zip"
METADATA_ZIP="$OUT_DIR/api/$PROJECT/$VERSION/builds/1/metadata-screenshots.zip"
COVERAGE_JSON="$OUT_DIR/api/$PROJECT/$VERSION/coverage-report.json"

if [[ ! -f "$STORYBOOK_ZIP" ]]; then
  echo "Expected storybook ZIP not found: $STORYBOOK_ZIP"
  exit 1
fi

if [[ ! -f "$COVERAGE_JSON" ]]; then
  echo "Expected coverage JSON not found: $COVERAGE_JSON"
  exit 1
fi

if [[ ! -f "$METADATA_ZIP" ]]; then
  echo "Expected metadata ZIP not found: $METADATA_ZIP"
  echo "This usually means scry-sbcov execution did not produce screenshots."
  echo "Check logs and ensure Playwright can run in this environment."
  exit 1
fi

echo "[5/5] Validate metadata ZIP contents"
unzip -Z1 "$METADATA_ZIP" | tee "$OUT_DIR/metadata-zip-entries.txt"
if ! unzip -Z1 "$METADATA_ZIP" | grep -q "^metadata.json$"; then
  echo "metadata.json missing from metadata ZIP"
  exit 1
fi

echo "Local E2E smoke flow passed."
echo "Artifacts written to: $OUT_DIR"
