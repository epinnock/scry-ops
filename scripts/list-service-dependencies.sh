#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_MAP_FILE="${1:-${OPS_ROOT}/repo-map.yml}"
LIST_SERVICES="${SCRIPT_DIR}/list-services.sh"

if [[ ! -x "${LIST_SERVICES}" ]]; then
  echo "missing executable script: ${LIST_SERVICES}" >&2
  exit 1
fi
if [[ ! -f "${REPO_MAP_FILE}" ]]; then
  echo "repo-map file not found: ${REPO_MAP_FILE}" >&2
  exit 1
fi

declare -A SERVICE_TO_LABEL
declare -A LABEL_EXISTS

while IFS=$'\t' read -r service_key _repo label _desc; do
  [[ -z "${service_key}" || -z "${label}" ]] && continue
  SERVICE_TO_LABEL["${service_key}"]="${label}"
  LABEL_EXISTS["${label}"]=1
done < <("${LIST_SERVICES}" "${REPO_MAP_FILE}")

# Parse depends_on lists from repo-map and resolve to service labels when possible.
while IFS=$'\t' read -r service_key raw_dep; do
  [[ -z "${service_key}" || -z "${raw_dep}" ]] && continue

  service_label="${SERVICE_TO_LABEL[${service_key}]:-}"
  [[ -z "${service_label}" ]] && continue

  dep_label=""
  if [[ -n "${LABEL_EXISTS[${raw_dep}]:-}" ]]; then
    dep_label="${raw_dep}"
  elif [[ -n "${SERVICE_TO_LABEL[${raw_dep}]:-}" ]]; then
    dep_label="${SERVICE_TO_LABEL[${raw_dep}]}"
  fi

  [[ -z "${dep_label}" ]] && continue
  [[ "${dep_label}" == "${service_label}" ]] && continue

  printf '%s\t%s\n' "${service_label}" "${dep_label}"
done < <(
  awk '
    BEGIN { in_services=0; service="" }
    function trim(s) {
      sub(/^[ \t\r\n]+/, "", s)
      sub(/[ \t\r\n]+$/, "", s)
      return s
    }
    /^services:[[:space:]]*$/ {
      in_services=1
      next
    }
    in_services && /^[^[:space:]]/ {
      in_services=0
      next
    }
    in_services && /^  [A-Za-z0-9._-]+:[[:space:]]*$/ {
      service=$1
      sub(/:$/, "", service)
      next
    }
    in_services && /^[[:space:]]+depends_on:[[:space:]]*\[/ {
      line=$0
      sub(/^[[:space:]]+depends_on:[[:space:]]*\[/, "", line)
      sub(/\][[:space:]]*$/, "", line)
      n=split(line, deps, ",")
      for (i=1; i<=n; i++) {
        dep=trim(deps[i])
        gsub(/^"/, "", dep)
        gsub(/"$/, "", dep)
        if (dep != "") {
          print service "\t" dep
        }
      }
      next
    }
  ' "${REPO_MAP_FILE}"
) | sort -u
