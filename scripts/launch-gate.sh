#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run() {
  echo
  echo "==> $*"
  "$@"
}

run_in() {
  local dir="$1"
  shift
  echo
  echo "==> (${dir}) $*"
  (cd "${ROOT_DIR}/${dir}" && "$@")
}

API_TESTS=(
  src/jobs/__tests__/ConcurrentJobQueue.test.ts
  src/ssr/__tests__/publicSeoLocales.test.ts
  src/services/__tests__/assetAccessService.test.ts
  src/services/__tests__/audioQuotaReservationService.test.ts
  src/services/__tests__/bundlePeriodOverlap.test.ts
  src/services/__tests__/childProfileService.test.ts
  src/services/__tests__/consentService.test.ts
  src/services/__tests__/dataPrivacyRequestService.test.ts
  src/services/__tests__/photoInputSafetyService.test.ts
  src/services/__tests__/promptSafetyService.test.ts
  src/services/__tests__/storyDeletionService.test.ts
  src/services/__tests__/storyFromDrawingAccessService.test.ts
  src/services/__tests__/storyPublishSafetyService.test.ts
  src/services/__tests__/storyQuotaReservation.test.ts
  src/services/__tests__/uploadValidationService.test.ts
  src/services/__tests__/userDeletionService.test.ts
  src/services/__tests__/voiceAccessService.test.ts
)

run pnpm --filter @wondertales/shared build

for test_file in "${API_TESTS[@]}"; do
  run_in services/api pnpm exec tsx "${test_file}"
done

run_in services/api pnpm exec tsx src/scripts/checkMigrationFiles.ts

if [[ "${LAUNCH_GATE_RUN_LIVE_MIGRATIONS:-0}" == "1" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL must be set when LAUNCH_GATE_RUN_LIVE_MIGRATIONS=1."
    exit 1
  fi
  run_in services/api env WT_ENV_PRESERVE_KEYS=DATABASE_URL pnpm exec tsx src/scripts/runAllMigrations.ts
else
  echo
  echo "==> services/api migration check"
  echo "Live migration execution is skipped. Set LAUNCH_GATE_RUN_LIVE_MIGRATIONS=1 with DATABASE_URL to enable it."
fi

run_in services/api pnpm build
run_in apps/universal-app pnpm type-check
run_in apps/universal-app pnpm build:web
run bash scripts/scan-client-bundle-secrets.sh

echo
echo "Launch gate passed."
