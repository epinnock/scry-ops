#!/usr/bin/env bash
# apply-workflow-patches.sh
#
# Copies patched workflow files from patches/workflows/ into .github/workflows/.
# Run this from the repo root to apply all workflow fixes at once.
#
# Usage:
#   bash patches/apply-workflow-patches.sh          # apply patches
#   bash patches/apply-workflow-patches.sh --diff   # preview diff without applying

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCHES_DIR="${REPO_ROOT}/patches/workflows"
TARGET_DIR="${REPO_ROOT}/.github/workflows"

if [ ! -d "$PATCHES_DIR" ]; then
  echo "Error: patches/workflows/ directory not found"
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: .github/workflows/ directory not found"
  exit 1
fi

if [ "${1:-}" = "--diff" ]; then
  echo "=== Diff preview (patches vs current workflows) ==="
  echo ""
  for patch_file in "${PATCHES_DIR}"/*.yml; do
    filename=$(basename "$patch_file")
    target_file="${TARGET_DIR}/${filename}"
    if [ -f "$target_file" ]; then
      echo "--- ${filename} ---"
      diff -u "$target_file" "$patch_file" || true
      echo ""
    else
      echo "--- ${filename} (NEW FILE) ---"
      echo "File does not exist in .github/workflows/ yet"
      echo ""
    fi
  done
  exit 0
fi

echo "Applying workflow patches..."
echo ""

for patch_file in "${PATCHES_DIR}"/*.yml; do
  filename=$(basename "$patch_file")
  target_file="${TARGET_DIR}/${filename}"
  echo "  ${filename}: copying to .github/workflows/"
  cp "$patch_file" "$target_file"
done

echo ""
echo "Done. All patches applied to .github/workflows/"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff .github/workflows/"
echo "  2. Commit: git add .github/workflows/ && git commit -m 'fix: comprehensive workflow permission and project sync fixes'"
echo "  3. Push: git push origin main"
