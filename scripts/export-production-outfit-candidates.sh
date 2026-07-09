#!/bin/bash

# Export production-only outfit plate cache rows and images for local review.
#
# Usage:
#   ./scripts/export-production-outfit-candidates.sh
#   ./scripts/export-production-outfit-candidates.sh --max-images 800
#   ./scripts/export-production-outfit-candidates.sh --output-dir services/api/output/outfit-pregen-library/production-candidates/manual

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
SSH_CONTROL_PATH="/tmp/wt-outfit-export-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=60"
if [[ -n "${WT_DROPLET_SSH_KEY:-}" ]]; then
  SSH_OPTS="${SSH_OPTS} -i ${WT_DROPLET_SSH_KEY} -o IdentitiesOnly=yes"
fi

TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
REMOTE_WORKDIR="/tmp/wt-outfit-candidate-export-${TIMESTAMP}"
CONTAINER_WORKDIR="/app/services/api/.tmp-outfit-candidate-export-${TIMESTAMP}"
LOCAL_OUTPUT_DIR="${PROJECT_ROOT}/services/api/output/outfit-pregen-library/production-candidates/${TIMESTAMP}"
MAX_IMAGES=500
INCLUDE_FILE_ONLY=true

cleanup() {
  ssh -O exit -o ControlPath=${SSH_CONTROL_PATH} ${DROPLET_USER}@${DROPLET_IP} 2>/dev/null || true
}

usage() {
  sed -n '1,12p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-images)
      MAX_IMAGES="$2"
      shift 2
      ;;
    --max-images=*)
      MAX_IMAGES="${1#*=}"
      shift
      ;;
    --output-dir)
      LOCAL_OUTPUT_DIR="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
      shift 2
      ;;
    --output-dir=*)
      OUTPUT_VALUE="${1#*=}"
      LOCAL_OUTPUT_DIR="$(cd "$(dirname "${OUTPUT_VALUE}")" && pwd)/$(basename "${OUTPUT_VALUE}")"
      shift
      ;;
    --no-file-only)
      INCLUDE_FILE_ONLY=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if ! [[ "${MAX_IMAGES}" =~ ^[0-9]+$ ]]; then
  echo "MAX_IMAGES must be a non-negative integer"
  exit 1
fi

SCRIPT_SOURCE="${PROJECT_ROOT}/services/api/src/scripts/exportProductionOutfitCandidates.ts"
CATALOG_ONE="${PROJECT_ROOT}/services/api/output/outfit-pregen-library/outfits.json"
CATALOG_TWO="${PROJECT_ROOT}/services/api/output/outfit-pregen-library/outfits-next-330.json"
DEDUPE_REPORT="${PROJECT_ROOT}/services/api/output/outfit-pregen-library/visual-audit/deduplication-report.json"

for required in "${SCRIPT_SOURCE}" "${CATALOG_ONE}" "${CATALOG_TWO}"; do
  if [[ ! -f "${required}" ]]; then
    echo "Required file is missing: ${required}"
    exit 1
  fi
done

trap cleanup EXIT

echo "Opening SSH connection to ${DROPLET_USER}@${DROPLET_IP}..."
ssh $SSH_OPTS -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" true

TMP_DIR="$(mktemp -d)"
BUNDLE="${TMP_DIR}/outfit-candidate-export-inputs.tar.gz"
mkdir -p "${TMP_DIR}/bundle/catalogs" "${TMP_DIR}/bundle/visual-audit"
cp "${SCRIPT_SOURCE}" "${TMP_DIR}/bundle/exportProductionOutfitCandidates.ts"
cp "${CATALOG_ONE}" "${TMP_DIR}/bundle/catalogs/outfits.json"
cp "${CATALOG_TWO}" "${TMP_DIR}/bundle/catalogs/outfits-next-330.json"
if [[ -f "${DEDUPE_REPORT}" ]]; then
  cp "${DEDUPE_REPORT}" "${TMP_DIR}/bundle/visual-audit/deduplication-report.json"
fi

COPYFILE_DISABLE=1 tar --no-xattrs -czf "${BUNDLE}" -C "${TMP_DIR}/bundle" .

echo "Uploading export inputs to droplet..."
ssh $SSH_OPTS "${DROPLET_USER}@${DROPLET_IP}" "mkdir -p '${REMOTE_WORKDIR}'"
scp -o ControlPath=${SSH_CONTROL_PATH} "${BUNDLE}" "${DROPLET_USER}@${DROPLET_IP}:${REMOTE_WORKDIR}/inputs.tar.gz"

rm -rf "${TMP_DIR}"

REMOTE_INCLUDE_ARG="--include-file-only"
if [[ "${INCLUDE_FILE_ONLY}" != "true" ]]; then
  REMOTE_INCLUDE_ARG="--no-file-only"
fi

echo "Running read-only export inside wondertales-api-prod..."
ssh $SSH_OPTS "${DROPLET_USER}@${DROPLET_IP}" << EOF
set -Eeuo pipefail
if ! docker ps --filter name=wondertales-api-prod --filter status=running --format '{{.Names}}' | grep -q wondertales-api-prod; then
  echo "wondertales-api-prod is not running"
  exit 1
fi
docker exec wondertales-api-prod sh -lc 'mkdir -p "${CONTAINER_WORKDIR}"'
docker cp '${REMOTE_WORKDIR}/inputs.tar.gz' wondertales-api-prod:'${CONTAINER_WORKDIR}/inputs.tar.gz'
docker exec wondertales-api-prod sh -lc '
  set -Eeuo pipefail
  mkdir -p "${CONTAINER_WORKDIR}"
  tar -xzf "${CONTAINER_WORKDIR}/inputs.tar.gz" -C "${CONTAINER_WORKDIR}"
  cd /app/services/api
  npx tsx "${CONTAINER_WORKDIR}/exportProductionOutfitCandidates.ts" \
    --catalog "${CONTAINER_WORKDIR}/catalogs/outfits.json" \
    --catalog "${CONTAINER_WORKDIR}/catalogs/outfits-next-330.json" \
    --dedupe-report "${CONTAINER_WORKDIR}/visual-audit/deduplication-report.json" \
    --out-dir "${CONTAINER_WORKDIR}/results" \
    --uploads-dir "/app/services/api/uploads" \
    ${REMOTE_INCLUDE_ARG} \
    --max-images "${MAX_IMAGES}"
  tar -czf "${CONTAINER_WORKDIR}/results.tar.gz" -C "${CONTAINER_WORKDIR}" results
'
docker cp wondertales-api-prod:'${CONTAINER_WORKDIR}/results.tar.gz' '${REMOTE_WORKDIR}/results.tar.gz'
EOF

mkdir -p "${LOCAL_OUTPUT_DIR}"
echo "Downloading results to ${LOCAL_OUTPUT_DIR}..."
scp -o ControlPath=${SSH_CONTROL_PATH} "${DROPLET_USER}@${DROPLET_IP}:${REMOTE_WORKDIR}/results.tar.gz" "${LOCAL_OUTPUT_DIR}/results.tar.gz"
tar -xzf "${LOCAL_OUTPUT_DIR}/results.tar.gz" -C "${LOCAL_OUTPUT_DIR}" --strip-components=1

echo "Cleaning remote temp files..."
ssh $SSH_OPTS "${DROPLET_USER}@${DROPLET_IP}" "rm -rf '${REMOTE_WORKDIR}' && docker exec wondertales-api-prod sh -lc 'rm -rf \"${CONTAINER_WORKDIR}\"' >/dev/null 2>&1 || true"

echo ""
echo "Export complete: ${LOCAL_OUTPUT_DIR}"
if command -v python3 >/dev/null 2>&1 && [[ -f "${LOCAL_OUTPUT_DIR}/summary.json" ]]; then
  python3 - "${LOCAL_OUTPUT_DIR}/summary.json" <<'PY'
import json
import sys

summary = json.load(open(sys.argv[1]))
print(json.dumps({
    "db": summary.get("db"),
    "files": summary.get("files"),
    "review": summary.get("review"),
}, indent=2, ensure_ascii=False))
PY
fi
