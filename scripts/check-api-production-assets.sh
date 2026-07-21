#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "API production asset check failed: $*" >&2
  exit 1
}

require_text() {
  local file="$1"
  local text="$2"
  grep -Fq -- "$text" "${ROOT_DIR}/${file}" || fail "${file} must contain: ${text}"
}

reject_text() {
  local file="$1"
  local text="$2"
  if grep -Fq -- "$text" "${ROOT_DIR}/${file}"; then
    fail "${file} must not contain production-hostile path: ${text}"
  fi
}

require_text "services/api/Dockerfile" "COPY --from=builder /app/packages/shared/dist ./packages/shared/dist"
require_text "services/api/Dockerfile" "COPY services/api/src/legal ./services/api/legal"
require_text "services/api/package.json" "src/scripts/scanOrphanStorageFiles.ts"
require_text "services/api/src/utils/i18nLoader.ts" "@wondertales/shared/i18n/uk.json"
require_text "scripts/deploy.sh" "--artifacts"
require_text "scripts/deploy.sh" "sync_story_artifact_images"
require_text "scripts/deploy.sh" "DEPLOY_ARTIFACTS=true"
require_text "scripts/deploy.sh" "sync_migration_files"
require_text "scripts/deploy.sh" "send_deploy_telegram_notification"
require_text "scripts/deploy.sh" "notify_deploy_telegram_best_effort"
require_text "scripts/deploy.sh" "sync_deploy_telegram_helper_best_effort"
require_text "scripts/deploy.sh" "/etc/wondertales/ops-alert.env"
require_text "scripts/deploy.sh" "docker image prune -f"
require_text "scripts/deploy.sh" "API_RUNTIME_DISK_RESERVE_KB=2097152"
require_text "scripts/deploy.sh" "The running API was left untouched"
reject_text "scripts/deploy.sh" "docker image prune -a -f"
require_text "scripts/lib/telegram-alert.js" "sendRichMessage"
require_text "scripts/lib/telegram-alert.js" "editMessageText"
require_text "scripts/lib/telegram-alert.js" "sendMessage"
reject_text "services/api/src/utils/i18nLoader.ts" "packages/shared/src/i18n"

echo "API production asset check passed."
