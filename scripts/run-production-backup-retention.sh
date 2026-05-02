#!/usr/bin/env bash

# Production backup retention runner for the single-droplet launch setup.
#
# Default mode is a remote dry-run. Pass --apply to create a PostgreSQL
# custom-format dump, archive the API uploads volume, validate both artifacts,
# apply scoped local retention, and optionally copy artifacts to an rclone target.
#
# Usage:
#   ./scripts/run-production-backup-retention.sh
#   ./scripts/run-production-backup-retention.sh --apply --skip-offsite
#   OFFSITE_BACKUP_RCLONE_TARGET=remote:wondertales/prod ./scripts/run-production-backup-retention.sh --apply

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_PREFIX="${BACKUP_PREFIX:-wondertales_production}"
BACKUP_LOCAL_RETENTION_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-1}"
BACKUP_OFFSITE_RETENTION_DAYS="${BACKUP_OFFSITE_RETENTION_DAYS:-90}"
OFFSITE_BACKUP_RCLONE_TARGET="${OFFSITE_BACKUP_RCLONE_TARGET:-}"
BACKUP_ARCHIVE_IMAGE="${BACKUP_ARCHIVE_IMAGE:-alpine:3.20}"

RUN_APPLY=0
INCLUDE_DB=1
INCLUDE_UPLOADS=1
SKIP_OFFSITE=0

SSH_CONTROL_PATH="/tmp/wondertales-backup-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=120 -o BatchMode=no"

usage() {
  sed -n '1,15p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
    --apply)
      RUN_APPLY=1
      ;;
    --dry-run)
      RUN_APPLY=0
      ;;
    --db-only)
      INCLUDE_DB=1
      INCLUDE_UPLOADS=0
      ;;
    --uploads-only)
      INCLUDE_DB=0
      INCLUDE_UPLOADS=1
      ;;
    --skip-offsite)
      SKIP_OFFSITE=1
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

if [[ "$INCLUDE_DB" != "1" && "$INCLUDE_UPLOADS" != "1" ]]; then
  echo "At least one backup target must be enabled." >&2
  exit 1
fi

cleanup() {
  ssh -O exit -o ControlPath="${SSH_CONTROL_PATH}" "${DROPLET_USER}@${DROPLET_IP}" 2>/dev/null || true
}

trap cleanup EXIT

echo "Production backup retention"
echo "Target: ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}"
if [[ "$RUN_APPLY" == "1" ]]; then
  echo "Mode: apply"
else
  echo "Mode: dry-run"
fi

ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" true

ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" \
  "DROPLET_PATH='${DROPLET_PATH}' COMPOSE_FILE='${COMPOSE_FILE}' RUN_APPLY='${RUN_APPLY}' INCLUDE_DB='${INCLUDE_DB}' INCLUDE_UPLOADS='${INCLUDE_UPLOADS}' SKIP_OFFSITE='${SKIP_OFFSITE}' BACKUP_PREFIX='${BACKUP_PREFIX}' BACKUP_LOCAL_RETENTION_DAYS='${BACKUP_LOCAL_RETENTION_DAYS}' BACKUP_OFFSITE_RETENTION_DAYS='${BACKUP_OFFSITE_RETENTION_DAYS}' OFFSITE_BACKUP_RCLONE_TARGET='${OFFSITE_BACKUP_RCLONE_TARGET}' BACKUP_ARCHIVE_IMAGE='${BACKUP_ARCHIVE_IMAGE}' bash -s" <<'REMOTE'
set -euo pipefail

pass() {
  echo "PASS $*"
}

warn() {
  echo "WARN $*"
}

fail() {
  echo "FAIL $*" >&2
  exit 1
}

compose_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T "$@" < /dev/null
}

is_positive_integer() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( "$1" > 0 ))
}

require_project() {
  cd "$DROPLET_PATH" || fail "project directory missing: $DROPLET_PATH"
  [[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE is missing"
  [[ -d backups ]] || mkdir -p backups
}

resolve_upload_volume() {
  docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/services/api/uploads"}}{{.Name}}{{end}}{{end}}' wondertales-api-prod 2>/dev/null || true
}

apply_local_retention() {
  if ! is_positive_integer "$BACKUP_LOCAL_RETENTION_DAYS"; then
    warn "local retention skipped; BACKUP_LOCAL_RETENTION_DAYS is not a positive integer"
    return
  fi

  local retention_minutes
  retention_minutes=$((BACKUP_LOCAL_RETENTION_DAYS * 1440))

  find backups -maxdepth 1 -type f \
    \( -name "${BACKUP_PREFIX}_db_*.dump" \
       -o -name "${BACKUP_PREFIX}_uploads_*.tar.gz" \
       -o -name "${BACKUP_PREFIX}_db_*.dump.sha256" \
       -o -name "${BACKUP_PREFIX}_uploads_*.tar.gz.sha256" \) \
    -mmin +"$retention_minutes" -print -delete 2>/dev/null || true
  pass "local retention applied to ${BACKUP_PREFIX} artifacts older than ${BACKUP_LOCAL_RETENTION_DAYS} days"
}

copy_offsite() {
  local artifacts=("$@")

  if [[ "$SKIP_OFFSITE" == "1" ]]; then
    warn "offsite copy skipped by --skip-offsite"
    return
  fi

  if [[ -z "$OFFSITE_BACKUP_RCLONE_TARGET" ]]; then
    warn "offsite copy skipped; OFFSITE_BACKUP_RCLONE_TARGET is not configured"
    return
  fi

  command -v rclone >/dev/null 2>&1 || fail "OFFSITE_BACKUP_RCLONE_TARGET is set but rclone is not installed on the droplet"

  local target="${OFFSITE_BACKUP_RCLONE_TARGET%/}"
  local artifact
  for artifact in "${artifacts[@]}"; do
    rclone copyto "backups/$artifact" "$target/$artifact"
    if [[ -f "backups/$artifact.sha256" ]]; then
      rclone copyto "backups/$artifact.sha256" "$target/$artifact.sha256"
    fi
  done

  if is_positive_integer "$BACKUP_OFFSITE_RETENTION_DAYS"; then
    rclone delete "$target" \
      --min-age "${BACKUP_OFFSITE_RETENTION_DAYS}d" \
      --include "${BACKUP_PREFIX}_db_*.dump" \
      --include "${BACKUP_PREFIX}_uploads_*.tar.gz" \
      --include "${BACKUP_PREFIX}_db_*.dump.sha256" \
      --include "${BACKUP_PREFIX}_uploads_*.tar.gz.sha256" \
      --exclude "*" || true
    pass "offsite retention applied to ${BACKUP_PREFIX} artifacts older than ${BACKUP_OFFSITE_RETENTION_DAYS} days"
  else
    warn "offsite retention skipped; BACKUP_OFFSITE_RETENTION_DAYS is not a positive integer"
  fi

  pass "offsite copy completed"
}

require_project

echo
echo "== Remote backup shape =="
command -v docker >/dev/null 2>&1 || fail "docker is missing"
docker compose -f "$COMPOSE_FILE" ps >/tmp/wondertales-backup-compose-ps.txt
pass "docker compose is reachable"

if [[ "$INCLUDE_DB" == "1" ]]; then
  compose_exec postgres sh -lc 'command -v pg_dump >/dev/null && command -v pg_restore >/dev/null'
  pass "postgres backup tools are available"
fi

if [[ "$INCLUDE_UPLOADS" == "1" ]]; then
  upload_volume="$(resolve_upload_volume)"
  [[ -n "$upload_volume" ]] || fail "could not resolve API uploads Docker volume"
  pass "api uploads volume resolved: $upload_volume"
fi

if [[ "$RUN_APPLY" != "1" ]]; then
  echo
  echo "Dry-run complete. Re-run with --apply to create and validate artifacts."
  if [[ -z "$OFFSITE_BACKUP_RCLONE_TARGET" && "$SKIP_OFFSITE" != "1" ]]; then
    warn "offsite target is not configured"
  fi
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
artifacts=()

echo
echo "== Create artifacts =="
if [[ "$INCLUDE_DB" == "1" ]]; then
  db_artifact="${BACKUP_PREFIX}_db_${timestamp}.dump"
  compose_exec -e BACKUP_FILE="/backups/$db_artifact" postgres sh -lc 'set -e; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$BACKUP_FILE"; pg_restore -l "$BACKUP_FILE" >/dev/null'
  sha256sum "backups/$db_artifact" > "backups/$db_artifact.sha256"
  ls -lh "backups/$db_artifact" "backups/$db_artifact.sha256"
  pass "database backup created and validated"
  artifacts+=("$db_artifact")
fi

if [[ "$INCLUDE_UPLOADS" == "1" ]]; then
  upload_volume="$(resolve_upload_volume)"
  [[ -n "$upload_volume" ]] || fail "could not resolve API uploads Docker volume"
  uploads_artifact="${BACKUP_PREFIX}_uploads_${timestamp}.tar.gz"
  docker run --rm \
    -e ARCHIVE="/backups/$uploads_artifact" \
    -v "${upload_volume}:/data:ro" \
    -v "$(pwd)/backups:/backups" \
    "$BACKUP_ARCHIVE_IMAGE" \
    sh -lc 'set -e; cd /data; tar -czf "$ARCHIVE" .; tar -tzf "$ARCHIVE" >/dev/null'
  sha256sum "backups/$uploads_artifact" > "backups/$uploads_artifact.sha256"
  ls -lh "backups/$uploads_artifact" "backups/$uploads_artifact.sha256"
  pass "uploads archive created and validated"
  artifacts+=("$uploads_artifact")
fi

echo
echo "== Retention and offsite copy =="
apply_local_retention
copy_offsite "${artifacts[@]}"

echo
echo "Backup retention run completed."
REMOTE
