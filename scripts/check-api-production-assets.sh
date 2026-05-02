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
  grep -Fq "$text" "${ROOT_DIR}/${file}" || fail "${file} must contain: ${text}"
}

reject_text() {
  local file="$1"
  local text="$2"
  if grep -Fq "$text" "${ROOT_DIR}/${file}"; then
    fail "${file} must not contain production-hostile path: ${text}"
  fi
}

require_text "services/api/Dockerfile" "COPY --from=builder /app/packages/shared/dist ./packages/shared/dist"
require_text "services/api/Dockerfile" "COPY services/api/src/legal ./services/api/legal"
require_text "services/api/package.json" "src/scripts/scanOrphanStorageFiles.ts"
require_text "services/api/src/utils/i18nLoader.ts" "@wondertales/shared/i18n/uk.json"
reject_text "services/api/src/utils/i18nLoader.ts" "packages/shared/src/i18n"

echo "API production asset check passed."
