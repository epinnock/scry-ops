#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LIST_SCRIPT="${SCRIPT_DIR}/list-services.sh"
REPO_MAP_FILE="${OPS_ROOT}/repo-map.yml"

OPS_REPO="${OPS_REPO:-epinnock/scry-ops}"
PROJECT_OWNER="${PROJECT_OWNER:-epinnock}"
PROJECT_NUMBER="${PROJECT_NUMBER:-1}"
LABEL_COLOR="${LABEL_COLOR:-0E8A16}"

SYNC_LABELS=true
SYNC_PROJECT=true
DRY_RUN=false
SERVICE_FILTERS=()

usage() {
  cat <<'EOF'
Usage: bash scripts/sync-service-metadata.sh [options]

Syncs service metadata from repo-map.yml to:
1) scry-ops issue labels
2) GitHub Project "Service" field options

Options:
  --service <label>   Sync only one service label (can be repeated).
  --labels-only       Sync labels only.
  --project-only      Sync project field options only.
  --dry-run           Print actions without applying changes.
  -h, --help          Show help.

Auth:
  Preferred: GH_TOKEN
  Fallbacks: CROSS_REPO_PAT, GITHUB_TOKEN, or a valid `gh auth login` session

Optional env:
  OPS_REPO            Default: epinnock/scry-ops
  PROJECT_OWNER       Default: epinnock
  PROJECT_NUMBER      Default: 1
  LABEL_COLOR         Default: 0E8A16
EOF
}

log() {
  printf '[sync-service-metadata] %s\n' "$*"
}

warn() {
  printf '[sync-service-metadata] WARN: %s\n' "$*" >&2
}

url_encode() {
  jq -rn --arg v "$1" '$v|@uri'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE_FILTERS+=("${2:-}")
      shift 2
      ;;
    --labels-only)
      SYNC_LABELS=true
      SYNC_PROJECT=false
      shift
      ;;
    --project-only)
      SYNC_LABELS=false
      SYNC_PROJECT=true
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

if [[ ! -x "${LIST_SCRIPT}" ]]; then
  warn "Missing executable parser script: ${LIST_SCRIPT}"
  exit 1
fi

if [[ ! -f "${REPO_MAP_FILE}" ]]; then
  warn "Missing repo-map file: ${REPO_MAP_FILE}"
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  if [[ -n "${CROSS_REPO_PAT:-}" ]]; then
    export GH_TOKEN="${CROSS_REPO_PAT}"
  elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
    export GH_TOKEN="${GITHUB_TOKEN}"
  fi
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  if ! gh auth status >/dev/null 2>&1; then
    warn "No GH_TOKEN/CROSS_REPO_PAT/GITHUB_TOKEN found and gh auth session is invalid"
    warn 'Run `gh auth login -h github.com` or export GH_TOKEN, then retry.'
    exit 1
  fi
fi

is_selected_service() {
  local label="$1"
  if [[ ${#SERVICE_FILTERS[@]} -eq 0 ]]; then
    return 0
  fi
  for selected in "${SERVICE_FILTERS[@]}"; do
    if [[ "${selected}" == "${label}" ]]; then
      return 0
    fi
  done
  return 1
}

declare -A SERVICE_DESC
declare -a SERVICE_LABELS

while IFS=$'\t' read -r service_key repo label description; do
  [[ -z "${label}" ]] && continue
  if is_selected_service "${label}"; then
    SERVICE_LABELS+=("${label}")
    SERVICE_DESC["${label}"]="${description:-Service label for ${service_key}}"
  fi
done < <("${LIST_SCRIPT}" "${REPO_MAP_FILE}")

if [[ ${#SERVICE_LABELS[@]} -eq 0 ]]; then
  warn "No matching services found to sync"
  exit 0
fi

log "Services to sync: ${SERVICE_LABELS[*]}"
log "Dry run: ${DRY_RUN}"

if [[ "${SYNC_LABELS}" == true ]]; then
  created_labels=0
  for label in "${SERVICE_LABELS[@]}"; do
    encoded_label="$(url_encode "${label}")"
    if gh api "repos/${OPS_REPO}/labels/${encoded_label}" >/dev/null 2>&1; then
      log "Label exists: ${label}"
      continue
    fi

    description="${SERVICE_DESC[${label}]}"
    if [[ "${DRY_RUN}" == true ]]; then
      log "[dry-run] Create label ${label}"
      created_labels=$((created_labels + 1))
      continue
    fi

    gh api -X POST "repos/${OPS_REPO}/labels" \
      -f name="${label}" \
      -f color="${LABEL_COLOR}" \
      -f description="${description}" >/dev/null

    log "Created label: ${label}"
    created_labels=$((created_labels + 1))
  done
  log "Labels created: ${created_labels}"
fi

if [[ "${SYNC_PROJECT}" == true ]]; then
  log "Syncing project field options for project ${PROJECT_OWNER}/${PROJECT_NUMBER}"
  PROJECT_DATA="$(gh api graphql -f query='
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          field(name: "Service") {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
                color
              }
            }
          }
        }
      }
    }' -f owner="${PROJECT_OWNER}" -F number="${PROJECT_NUMBER}")"

  PROJECT_ID="$(echo "${PROJECT_DATA}" | jq -r '.data.user.projectV2.id')"
  FIELD_ID="$(echo "${PROJECT_DATA}" | jq -r '.data.user.projectV2.field.id')"

  if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "null" ]]; then
    warn "Project not found for owner=${PROJECT_OWNER} number=${PROJECT_NUMBER}"
    exit 1
  fi
  if [[ -z "${FIELD_ID}" || "${FIELD_ID}" == "null" ]]; then
    warn "Project field named \"Service\" not found"
    exit 1
  fi

  OPTIONS_JSON="$(echo "${PROJECT_DATA}" | jq -c '[.data.user.projectV2.field.options[] | {id: .id, name: .name, color: (.color // "GRAY")}]')"
  missing_count=0

  for label in "${SERVICE_LABELS[@]}"; do
    if echo "${OPTIONS_JSON}" | jq -e --arg name "${label}" '.[] | select(.name == $name)' >/dev/null; then
      log "Project option exists: ${label}"
      continue
    fi
    OPTIONS_JSON="$(echo "${OPTIONS_JSON}" | jq -c --arg name "${label}" '. + [{id: null, name: $name, color: "GRAY"}]')"
    missing_count=$((missing_count + 1))
    log "Project option missing and queued: ${label}"
  done

  if [[ ${missing_count} -eq 0 ]]; then
    log "No project option changes needed"
    exit 0
  fi

  if [[ "${DRY_RUN}" == true ]]; then
    log "[dry-run] Would append ${missing_count} project option(s)"
    exit 0
  fi

  OPTION_LITERAL="$(echo "${OPTIONS_JSON}" | jq -r '
    map(
      (if (.id // "") != "" then
        "{id: \"" + (.id | gsub("\\\\";"\\\\\\\\") | gsub("\""; "\\\"")) + "\", "
      else
        "{"
      end) +
      "name: \"" +
      (.name | gsub("\\\\";"\\\\\\\\") | gsub("\""; "\\\"")) +
      "\", color: " + ((.color // "GRAY") | ascii_upcase) + "}"
    ) | join(", ")
  ')"

  # Keep all existing options and append missing ones.
  MUTATION="mutation {
    updateProjectV2Field(
      input: {
        projectId: \"${PROJECT_ID}\"
        fieldId: \"${FIELD_ID}\"
        name: \"Service\"
        dataType: SINGLE_SELECT
        singleSelectOptions: [${OPTION_LITERAL}]
      }
    ) {
      projectV2Field {
        ... on ProjectV2SingleSelectField {
          id
          name
          options { id name }
        }
      }
    }
  }"

  MUTATION_RESPONSE="$(gh api graphql -f query="${MUTATION}" 2>&1)" || {
    warn "Failed to update project Service options via updateProjectV2Field mutation"
    warn "GraphQL/API response:"
    warn "${MUTATION_RESPONSE}"
    warn "Verify token scopes and ProjectV2 mutation support, then retry."
    exit 1
  }

  if [[ -n "${MUTATION_RESPONSE}" ]]; then
    log "Updated project Service options"
  fi
fi
