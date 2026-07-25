#!/bin/bash

# Safely provision local, Git-ignored promo credentials into production.
# The manifest is copied only to the existing read-only production secrets mount,
# consumed by the API container, then removed from the droplet.
#
# Usage:
#   ./scripts/provision-production-promo-accounts.sh --input secrets/promo-blogger-accounts.json --dry-run --only=ivanryzhenko.promo-test@wondertales.art
#   ./scripts/provision-production-promo-accounts.sh --input secrets/promo-blogger-accounts.json --apply --only=ivanryzhenko.promo-test@wondertales.art

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DROPLET_USER="root"
DROPLET_IP="167.172.102.75"
DROPLET_PATH="/var/www/kazka"
INPUT_FILE=""
APPLY=false
DRY_RUN=false
ONLY=""
REMOTE_FILE=""

usage() {
  sed -n '1,9p' "$0"
}

cleanup() {
  if [[ -n "$REMOTE_FILE" ]]; then
    ssh "${DROPLET_USER}@${DROPLET_IP}" "rm -f '$REMOTE_FILE'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for arg in "$@"; do
  case "$arg" in
    --input=*) INPUT_FILE="${arg#--input=}" ;;
    --only=*) ONLY="${arg#--only=}" ;;
    --apply) APPLY=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$INPUT_FILE" || ! -f "$INPUT_FILE" ]]; then
  echo "A readable --input=path/to/promo-accounts.json is required" >&2
  exit 1
fi
if [[ "$APPLY" == "$DRY_RUN" ]]; then
  echo "Specify exactly one of --dry-run or --apply" >&2
  exit 1
fi

REMOTE_FILE="${DROPLET_PATH}/secrets/promo-accounts-$$.json"
echo "Uploading private promo manifest to the temporary production secrets mount..."
scp "$INPUT_FILE" "${DROPLET_USER}@${DROPLET_IP}:$REMOTE_FILE"
ssh "${DROPLET_USER}@${DROPLET_IP}" "chmod 600 '$REMOTE_FILE'"

SCRIPT_ARGS="--input=/app/secrets/$(basename "$REMOTE_FILE")"
if [[ "$DRY_RUN" == true ]]; then
  SCRIPT_ARGS="$SCRIPT_ARGS --dry-run"
fi
if [[ -n "$ONLY" ]]; then
  SCRIPT_ARGS="$SCRIPT_ARGS --only=$ONLY"
fi

echo "Running promo provisioning in the production API container..."
ssh "${DROPLET_USER}@${DROPLET_IP}" \
  "docker exec wondertales-api-prod sh -lc 'cd /app/services/api && pnpm exec tsx src/scripts/provisionPromoAccounts.ts $SCRIPT_ARGS'"

echo "Promo provisioning completed. The temporary manifest will now be removed."
