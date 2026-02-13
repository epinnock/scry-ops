#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_MAP_FILE="${1:-${OPS_ROOT}/repo-map.yml}"

if [[ ! -f "${REPO_MAP_FILE}" ]]; then
  echo "repo-map file not found: ${REPO_MAP_FILE}" >&2
  exit 1
fi

# Output format (tab-separated):
# service_key <TAB> repo <TAB> label <TAB> description
awk '
  BEGIN {
    in_services = 0
    service = ""
    repo = ""
    label = ""
    desc = ""
  }
  function trim(s) {
    sub(/^[ \t\r\n]+/, "", s)
    sub(/[ \t\r\n]+$/, "", s)
    return s
  }
  function emit() {
    if (service != "" && repo != "" && label != "") {
      print service "\t" repo "\t" label "\t" desc
    }
  }
  /^services:[[:space:]]*$/ {
    in_services = 1
    next
  }
  in_services && /^[^[:space:]]/ {
    emit()
    in_services = 0
    next
  }
  in_services && /^  [A-Za-z0-9._-]+:[[:space:]]*$/ {
    emit()
    service = $1
    sub(/:$/, "", service)
    repo = ""
    label = ""
    desc = ""
    next
  }
  in_services && /^[[:space:]]+repo:[[:space:]]*/ {
    repo = $2
    next
  }
  in_services && /^[[:space:]]+label:[[:space:]]*/ {
    label = $2
    next
  }
  in_services && /^[[:space:]]+description:[[:space:]]*/ {
    line = $0
    sub(/^[[:space:]]+description:[[:space:]]*/, "", line)
    gsub(/^"/, "", line)
    gsub(/"$/, "", line)
    desc = trim(line)
    next
  }
  END {
    if (in_services) {
      emit()
    }
  }
' "${REPO_MAP_FILE}"
