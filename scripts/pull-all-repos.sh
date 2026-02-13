#!/usr/bin/env bash

set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_MAP_FILE="${OPS_ROOT}/repo-map.yml"
BASE_DIR="$(dirname "${OPS_ROOT}")"
BRANCH=""
SKIP_DIRTY=true
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: bash scripts/pull-all-repos.sh [options]

Options:
  --base-dir <path>   Base directory where repos live/are cloned.
                      Default: parent directory of scry-ops.
  --branch <name>     Optional branch to checkout/pull in each existing repo.
  --skip-dirty        Skip repos with uncommitted changes (default).
  --allow-dirty       Attempt pull even if a repo has local changes.
  --dry-run           Print planned actions without changing anything.
  -h, --help          Show this help.
EOF
}

log() {
  printf '[pull-all-repos] %s\n' "$*"
}

warn() {
  printf '[pull-all-repos] WARN: %s\n' "$*" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-dir)
      BASE_DIR="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --skip-dirty)
      SKIP_DIRTY=true
      shift
      ;;
    --allow-dirty)
      SKIP_DIRTY=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      warn "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${BASE_DIR}" ]]; then
  warn "--base-dir requires a value"
  exit 1
fi

if [[ ! -f "${REPO_MAP_FILE}" ]]; then
  warn "Missing repo map file: ${REPO_MAP_FILE}"
  exit 1
fi

if [[ "${DRY_RUN}" == false ]]; then
  mkdir -p "${BASE_DIR}" || {
    warn "Failed to create base dir: ${BASE_DIR}"
    exit 1
  }
fi

mapfile -t REPOS < <(
  awk '
    /^services:/ { in_services=1; next }
    in_services && /^[^[:space:]]/ { in_services=0 }
    in_services && $1 == "repo:" { print $2 }
  ' "${REPO_MAP_FILE}"
)

# Ensure the orchestrator repo is always included.
REPOS+=("epinnock/scry-ops")

declare -A SEEN
UNIQUE_REPOS=()
for repo in "${REPOS[@]}"; do
  [[ -z "${repo}" ]] && continue
  if [[ -z "${SEEN[${repo}]:-}" ]]; then
    SEEN["${repo}"]=1
    UNIQUE_REPOS+=("${repo}")
  fi
done

if [[ ${#UNIQUE_REPOS[@]} -eq 0 ]]; then
  warn "No repositories found in ${REPO_MAP_FILE}"
  exit 1
fi

pulled=0
cloned=0
skipped_dirty=0
failed=0

log "Base dir: ${BASE_DIR}"
log "Repo map: ${REPO_MAP_FILE}"
log "Branch override: ${BRANCH:-<current branch>}"
log "Skip dirty repos: ${SKIP_DIRTY}"
log "Dry run: ${DRY_RUN}"
log "Discovered ${#UNIQUE_REPOS[@]} repos"

for repo in "${UNIQUE_REPOS[@]}"; do
  repo_name="${repo##*/}"
  repo_dir="${BASE_DIR}/${repo_name}"
  clone_url="https://github.com/${repo}.git"

  log "Processing ${repo} -> ${repo_dir}"

  if [[ -d "${repo_dir}/.git" ]]; then
    if [[ "${SKIP_DIRTY}" == true ]] && [[ -n "$(git -C "${repo_dir}" status --porcelain)" ]]; then
      warn "${repo_name}: skipped (dirty working tree)"
      skipped_dirty=$((skipped_dirty + 1))
      continue
    fi

    if [[ "${DRY_RUN}" == true ]]; then
      if [[ -n "${BRANCH}" ]]; then
        log "[dry-run] git -C \"${repo_dir}\" fetch origin \"${BRANCH}\""
        log "[dry-run] git -C \"${repo_dir}\" checkout \"${BRANCH}\" (or track origin/${BRANCH})"
        log "[dry-run] git -C \"${repo_dir}\" pull --ff-only origin \"${BRANCH}\""
      else
        log "[dry-run] git -C \"${repo_dir}\" pull --ff-only"
      fi
      pulled=$((pulled + 1))
      continue
    fi

    if [[ -n "${BRANCH}" ]]; then
      if ! git -C "${repo_dir}" fetch origin "${BRANCH}"; then
        warn "${repo_name}: failed to fetch origin/${BRANCH}"
        failed=$((failed + 1))
        continue
      fi
      if git -C "${repo_dir}" rev-parse --verify "${BRANCH}" >/dev/null 2>&1; then
        if ! git -C "${repo_dir}" checkout "${BRANCH}"; then
          warn "${repo_name}: failed to checkout ${BRANCH}"
          failed=$((failed + 1))
          continue
        fi
      else
        if ! git -C "${repo_dir}" checkout -b "${BRANCH}" --track "origin/${BRANCH}"; then
          warn "${repo_name}: failed to create tracking branch ${BRANCH}"
          failed=$((failed + 1))
          continue
        fi
      fi
      if ! git -C "${repo_dir}" pull --ff-only origin "${BRANCH}"; then
        warn "${repo_name}: failed to pull origin/${BRANCH}"
        failed=$((failed + 1))
        continue
      fi
    else
      if ! git -C "${repo_dir}" pull --ff-only; then
        warn "${repo_name}: failed to pull current branch"
        failed=$((failed + 1))
        continue
      fi
    fi

    pulled=$((pulled + 1))
    continue
  fi

  if [[ -e "${repo_dir}" ]]; then
    warn "${repo_name}: path exists but is not a git repo"
    failed=$((failed + 1))
    continue
  fi

  if [[ "${DRY_RUN}" == true ]]; then
    if [[ -n "${BRANCH}" ]]; then
      log "[dry-run] git clone --branch \"${BRANCH}\" \"${clone_url}\" \"${repo_dir}\""
    else
      log "[dry-run] git clone \"${clone_url}\" \"${repo_dir}\""
    fi
    cloned=$((cloned + 1))
    continue
  fi

  if [[ -n "${BRANCH}" ]]; then
    if ! git clone --branch "${BRANCH}" "${clone_url}" "${repo_dir}"; then
      warn "${repo_name}: clone failed"
      failed=$((failed + 1))
      continue
    fi
  else
    if ! git clone "${clone_url}" "${repo_dir}"; then
      warn "${repo_name}: clone failed"
      failed=$((failed + 1))
      continue
    fi
  fi

  cloned=$((cloned + 1))
done

log "Summary: pulled=${pulled}, cloned=${cloned}, skipped_dirty=${skipped_dirty}, failed=${failed}"

if [[ ${failed} -gt 0 ]]; then
  exit 1
fi
