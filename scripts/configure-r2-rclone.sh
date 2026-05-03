#!/usr/bin/env bash

# Configure rclone remotes for encrypted Cloudflare R2 production backups.
#
# Usage:
#   ./scripts/configure-r2-rclone.sh --dry-run
#   ./scripts/configure-r2-rclone.sh --status
#   ./scripts/configure-r2-rclone.sh --apply
#   ./scripts/configure-r2-rclone.sh --apply --smoke
#
# Required environment, usually loaded from .env.production:
#   CLOUDFLARE_R2_ACCOUNT_ID
#   CLOUDFLARE_R2_ACCESS_KEY_ID
#   CLOUDFLARE_R2_SECRET_ACCESS_KEY
#   CLOUDFLARE_R2_ENDPOINT
#   CLOUDFLARE_R2_BUCKET
#   OFFSITE_BACKUP_RCLONE_TARGET

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
RCLONE_R2_REMOTE_NAME="${RCLONE_R2_REMOTE_NAME:-wondertales-r2}"
RCLONE_R2_CRYPT_REMOTE_NAME="${RCLONE_R2_CRYPT_REMOTE_NAME:-wondertales-r2-crypt}"
RCLONE_CRYPT_RECOVERY_FILE="${RCLONE_CRYPT_RECOVERY_FILE:-${HOME}/.config/rclone/wondertales-r2-crypt.recovery.env}"
RUN_APPLY=0
RUN_SMOKE=0
RUN_STATUS=0

usage() {
  sed -n '1,16p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
    --dry-run)
      RUN_APPLY=0
      ;;
    --apply)
      RUN_APPLY=1
      ;;
    --status|--verify)
      RUN_STATUS=1
      ;;
    --smoke)
      RUN_SMOKE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

required_env=(
  CLOUDFLARE_R2_ACCOUNT_ID
  CLOUDFLARE_R2_ACCESS_KEY_ID
  CLOUDFLARE_R2_SECRET_ACCESS_KEY
  CLOUDFLARE_R2_ENDPOINT
  CLOUDFLARE_R2_BUCKET
  OFFSITE_BACKUP_RCLONE_TARGET
)

missing=0
for key in "${required_env[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env: ${key}" >&2
    missing=1
  fi
done
if [[ "$missing" == "1" ]]; then
  exit 1
fi

if [[ "${OFFSITE_BACKUP_RCLONE_TARGET}" != "${RCLONE_R2_CRYPT_REMOTE_NAME}:"* ]]; then
  echo "WARN OFFSITE_BACKUP_RCLONE_TARGET should normally start with ${RCLONE_R2_CRYPT_REMOTE_NAME}:" >&2
fi

echo "Cloudflare R2 rclone configuration"
echo "Mode: $([[ "$RUN_APPLY" == "1" ]] && echo apply || echo dry-run)"
echo "Plain remote: ${RCLONE_R2_REMOTE_NAME}"
echo "Encrypted remote: ${RCLONE_R2_CRYPT_REMOTE_NAME}"
echo "Bucket: ${CLOUDFLARE_R2_BUCKET}"
echo "Offsite target: ${OFFSITE_BACKUP_RCLONE_TARGET}"
echo "Crypt recovery file: ${RCLONE_CRYPT_RECOVERY_FILE}"

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null || echo "unknown"
}

rclone_remote_exists() {
  local remote_name="$1"
  rclone listremotes 2>/dev/null | grep -Fxq "${remote_name}:"
}

print_rclone_status() {
  local status_failed=0
  local target="${OFFSITE_BACKUP_RCLONE_TARGET%/}"

  echo
  echo "== rclone status =="

  if ! command -v rclone >/dev/null 2>&1; then
    echo "FAIL rclone is not installed"
    return 1
  fi

  rclone version | head -1
  rclone config file 2>/dev/null | sed -n '1,2p' || true

  if rclone_remote_exists "$RCLONE_R2_REMOTE_NAME"; then
    echo "PASS plain remote exists: ${RCLONE_R2_REMOTE_NAME}:"
  else
    echo "WARN plain remote was not listed by rclone listremotes: ${RCLONE_R2_REMOTE_NAME}:"
  fi

  if rclone_remote_exists "$RCLONE_R2_CRYPT_REMOTE_NAME"; then
    echo "PASS encrypted remote exists: ${RCLONE_R2_CRYPT_REMOTE_NAME}:"
  else
    echo "WARN encrypted remote was not listed by rclone listremotes: ${RCLONE_R2_CRYPT_REMOTE_NAME}:"
  fi

  if [[ -f "$RCLONE_CRYPT_RECOVERY_FILE" ]]; then
    echo "PASS crypt recovery file exists: ${RCLONE_CRYPT_RECOVERY_FILE} (mode $(file_mode "$RCLONE_CRYPT_RECOVERY_FILE"))"
  else
    echo "FAIL crypt recovery file missing: ${RCLONE_CRYPT_RECOVERY_FILE}"
    status_failed=1
  fi

  if rclone lsd "${RCLONE_R2_REMOTE_NAME}:" >/dev/null 2>&1; then
    echo "PASS R2 account listing succeeded"
  else
    echo "WARN R2 account listing failed; bucket-scoped credentials usually cannot list all buckets"
  fi

  if rclone lsf "${RCLONE_R2_REMOTE_NAME}:${CLOUDFLARE_R2_BUCKET}" >/dev/null 2>&1; then
    echo "PASS R2 bucket is reachable: ${CLOUDFLARE_R2_BUCKET}"
  else
    echo "FAIL R2 bucket is not reachable: ${CLOUDFLARE_R2_BUCKET}"
    status_failed=1
  fi

  if rclone lsf "$target" >/dev/null 2>&1; then
    echo "PASS encrypted offsite target is reachable: ${target}"
  else
    echo "FAIL encrypted offsite target is not reachable: ${target}"
    status_failed=1
  fi

  return "$status_failed"
}

run_smoke() {
  local smoke_file
  local smoke_name
  local target="${OFFSITE_BACKUP_RCLONE_TARGET%/}"

  smoke_file="$(mktemp)"
  smoke_name="__rclone_smoke/smoke-$(date -u +%Y%m%dT%H%M%SZ)-$$.txt"
  printf 'wondertales-r2-smoke %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$smoke_file"
  rclone copyto "$smoke_file" "${target}/${smoke_name}"
  rclone cat "${target}/${smoke_name}" >/dev/null
  rclone deletefile "${target}/${smoke_name}"
  rclone rmdir "${target}/__rclone_smoke" 2>/dev/null || true
  rm -f "$smoke_file"
  echo "PASS encrypted R2 smoke write/read/delete succeeded"
}

if [[ "$RUN_STATUS" == "1" && "$RUN_APPLY" != "1" ]]; then
  print_rclone_status
  if [[ "$RUN_SMOKE" == "1" ]]; then
    run_smoke
  fi
  exit 0
fi

if [[ "$RUN_APPLY" != "1" ]]; then
  echo
  echo "Dry-run complete. Re-run with --apply on the machine where backups will run."
  exit 0
fi

command -v rclone >/dev/null 2>&1 || {
  echo "rclone is not installed. Install it before applying this configuration." >&2
  exit 1
}

mkdir -p "$(dirname "$RCLONE_CRYPT_RECOVERY_FILE")"
chmod 700 "$(dirname "$RCLONE_CRYPT_RECOVERY_FILE")"

if [[ -f "$RCLONE_CRYPT_RECOVERY_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$RCLONE_CRYPT_RECOVERY_FILE"
fi

if [[ -z "${RCLONE_CRYPT_PASSWORD:-}" ]]; then
  RCLONE_CRYPT_PASSWORD="$(openssl rand -base64 48)"
fi
if [[ -z "${RCLONE_CRYPT_PASSWORD2:-}" ]]; then
  RCLONE_CRYPT_PASSWORD2="$(openssl rand -base64 48)"
fi

{
  printf 'RCLONE_CRYPT_PASSWORD=%q\n' "$RCLONE_CRYPT_PASSWORD"
  printf 'RCLONE_CRYPT_PASSWORD2=%q\n' "$RCLONE_CRYPT_PASSWORD2"
} > "$RCLONE_CRYPT_RECOVERY_FILE"
chmod 600 "$RCLONE_CRYPT_RECOVERY_FILE"

crypt_password_obscured="$(rclone obscure "$RCLONE_CRYPT_PASSWORD")"
crypt_password2_obscured="$(rclone obscure "$RCLONE_CRYPT_PASSWORD2")"

rclone config create "${RCLONE_R2_REMOTE_NAME}" s3 \
  provider=Cloudflare \
  access_key_id="${CLOUDFLARE_R2_ACCESS_KEY_ID}" \
  secret_access_key="${CLOUDFLARE_R2_SECRET_ACCESS_KEY}" \
  endpoint="${CLOUDFLARE_R2_ENDPOINT}" \
  acl=private \
  no_check_bucket=true \
  --non-interactive >/dev/null

rclone config create "${RCLONE_R2_CRYPT_REMOTE_NAME}" crypt \
  remote="${RCLONE_R2_REMOTE_NAME}:${CLOUDFLARE_R2_BUCKET}" \
  filename_encryption=standard \
  directory_name_encryption=true \
  password="${crypt_password_obscured}" \
  password2="${crypt_password2_obscured}" \
  --non-interactive >/dev/null

echo "PASS rclone remotes configured"

print_rclone_status

if [[ "$RUN_SMOKE" == "1" ]]; then
  run_smoke
fi

echo "Keep the crypt recovery file private; it is needed to read encrypted backups from a fresh machine."
