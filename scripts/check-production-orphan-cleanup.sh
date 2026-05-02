#!/usr/bin/env bash

# Non-destructive production orphan-storage cleanup preview.
# Runs the bundled production scanner in dry-run mode and fails only if the
# command is not a dry-run or reports deleted files.
#
# Usage:
#   ./scripts/check-production-orphan-cleanup.sh
#   ORPHAN_CLEANUP_MIN_AGE_HOURS=168 ./scripts/check-production-orphan-cleanup.sh

set -Eeuo pipefail

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
MIN_AGE_HOURS="${ORPHAN_CLEANUP_MIN_AGE_HOURS:-168}"

tmp_output="$(mktemp)"
cleanup() {
  rm -f "$tmp_output"
}
trap cleanup EXIT

echo "Production orphan cleanup dry-run on ${DROPLET_USER}@${DROPLET_IP}"
echo "Minimum age: ${MIN_AGE_HOURS} hour(s)"

ssh -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" \
  "cd ${DROPLET_PATH} && docker compose -f ${COMPOSE_FILE} exec -T api sh -lc 'cd /app/services/api && test -f dist/scripts/scanOrphanStorageFiles.js && LOG_LEVEL=fatal node dist/scripts/scanOrphanStorageFiles.js --summary --min-age-hours=${MIN_AGE_HOURS}'" \
  > "$tmp_output"

node - "$tmp_output" <<'NODE'
const fs = require('node:fs');

const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (error) {
  console.error('FAIL scanner output was not clean JSON');
  console.error(raw.slice(0, 1000));
  process.exit(1);
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

if (data.dryRun !== true) {
  fail('scanner did not run in dry-run mode');
}
if (data.deletedCount !== 0) {
  fail(`scanner reported deletedCount=${data.deletedCount}`);
}

console.log(`PASS dry-run scanned ${data.scannedFiles} file(s) against ${data.referencedPaths} referenced path(s)`);
console.log(`PASS orphan candidates: ${data.orphanCount}; eligible by age: ${data.eligibleOrphanCount}; skipped young: ${data.skippedYoungOrphanCount}`);
console.log('PASS no files were deleted');
NODE
