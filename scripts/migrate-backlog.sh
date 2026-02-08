#!/bin/bash
#
# Migrate pending items from backlog.csv to GitHub Issues on scry-ops.
# Each issue gets service labels auto-applied and will be picked up by project-sync.yml.
#
# Usage:
#   export GH_TOKEN=ghp_your_pat_here
#   bash scripts/migrate-backlog.sh [--dry-run]
#
# Requires: gh CLI v2.20+ with project scope

set -euo pipefail

REPO="epinnock/scry-ops"
BACKLOG="backlog.csv"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN — no issues will be created ==="
fi

# Label mapping: backlog "Project" column → scry-ops label
declare -A LABEL_MAP
LABEL_MAP["scry-node"]="scry-node"
LABEL_MAP["scry-node "]="scry-node"
LABEL_MAP["scry-sbcov"]="sbcov"
LABEL_MAP["scry-developer-dashboard"]="dashboard"
LABEL_MAP["scry-develover-dashboard"]="dashboard"
LABEL_MAP["scry-storybook-upload-service"]="upload-service"
LABEL_MAP["scry-cdn-service"]="cdn-service"
LABEL_MAP["scry-cdn-sevice"]="cdn-service"
LABEL_MAP["scry-viewer-service"]="cdn-service"
LABEL_MAP["scry-landing-page"]="landing-page"
LABEL_MAP["scry-link"]="scry-link"
LABEL_MAP["scry-analysis-service"]="enhancement"
LABEL_MAP["html-to-figma"]="scry-link"
LABEL_MAP["html-to-figma "]="scry-link"

resolve_labels() {
  local project_col="$1"
  local labels=""

  # Handle comma-separated and slash-separated project names
  IFS=',' read -ra parts <<< "$project_col"
  for part in "${parts[@]}"; do
    # Also split on /
    IFS='/' read -ra subparts <<< "$part"
    for sub in "${subparts[@]}"; do
      sub=$(echo "$sub" | xargs)  # trim whitespace
      if [[ -n "${LABEL_MAP[$sub]:-}" ]]; then
        labels="${labels},${LABEL_MAP[$sub]}"
      fi
    done
  done

  # Deduplicate
  echo "$labels" | tr ',' '\n' | sort -u | grep -v '^$' | tr '\n' ',' | sed 's/,$//'
}

echo "Reading $BACKLOG..."
echo ""

CREATED=0
SKIPPED=0

# Skip header, process only Pending items
while IFS=',' read -r title project status start_date end_date result notes; do
  # Trim whitespace
  title=$(echo "$title" | xargs)
  project=$(echo "$project" | xargs)
  status=$(echo "$status" | xargs)

  # Skip done items and empty lines
  [[ -z "$title" ]] && continue
  [[ "$status" == "Done" ]] && continue
  [[ "$status" == "Status" ]] && continue  # header

  # Resolve labels
  LABELS=$(resolve_labels "$project")

  # Build issue body
  BODY="Migrated from backlog.csv"
  if [[ -n "$notes" ]] && [[ "$notes" != " " ]]; then
    BODY="${BODY}\n\n**Notes:** ${notes}"
  fi
  if [[ -n "$start_date" ]] && [[ "$start_date" != " " ]]; then
    BODY="${BODY}\n**Original start date:** ${start_date}"
  fi

  echo "---"
  echo "Title:  $title"
  echo "Labels: ${LABELS:-none}"
  echo "Status: ${status:-unset}"

  if $DRY_RUN; then
    echo "Action: [DRY RUN] Would create issue"
    ((SKIPPED++))
    continue
  fi

  # Create the issue
  LABEL_ARGS=""
  if [[ -n "$LABELS" ]]; then
    LABEL_ARGS="--label $LABELS"
  fi

  ISSUE_URL=$(gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$(printf "$BODY")" \
    $LABEL_ARGS \
    2>&1) || {
    echo "FAILED to create issue: $ISSUE_URL"
    continue
  }

  echo "Created: $ISSUE_URL"
  ((CREATED++))

  # Rate limit courtesy
  sleep 1

done < <(tail -n +2 "$BACKLOG")

echo ""
echo "=== Migration complete ==="
echo "Created: $CREATED"
echo "Skipped: $SKIPPED"
