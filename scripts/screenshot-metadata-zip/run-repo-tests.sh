#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/boxuser/scry"

echo "[1/3] scry-sbcov tests"
(
  cd "$ROOT/scry-sbcov"
  npm test -- --run
)

echo "[2/3] scry-storybook-upload-service tests"
(
  cd "$ROOT/scry-storybook-upload-service"
  npm test -- --run
)

echo "[3/3] scry-node tests"
(
  cd "$ROOT/scry-node"
  npm test
)

echo "All repo test suites completed."
