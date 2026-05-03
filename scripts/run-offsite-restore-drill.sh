#!/usr/bin/env bash

# Restore the latest encrypted offsite backup into disposable local targets.
#
# Usage:
#   ./scripts/run-offsite-restore-drill.sh
#   ENV_FILE=.env.production ./scripts/run-offsite-restore-drill.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
OFFSITE_BACKUP_RCLONE_TARGET="${OFFSITE_BACKUP_RCLONE_TARGET:-}"
RESTORE_DRILL_POSTGRES_IMAGE="${RESTORE_DRILL_POSTGRES_IMAGE:-postgres:15-alpine}"

usage() {
  sed -n '1,8p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --|-h|--help)
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

if [[ -z "$OFFSITE_BACKUP_RCLONE_TARGET" ]]; then
  echo "OFFSITE_BACKUP_RCLONE_TARGET is required" >&2
  exit 1
fi

command -v rclone >/dev/null 2>&1 || {
  echo "rclone is required" >&2
  exit 1
}
command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
  exit 1
}
command -v pg_restore >/dev/null 2>&1 || {
  echo "pg_restore is required on the host" >&2
  exit 1
}

target="${OFFSITE_BACKUP_RCLONE_TARGET%/}"
tmp_dir="$(mktemp -d /tmp/wondertales-restore-drill-XXXXXX)"
container="wondertales_restore_drill_$(date -u +%Y%m%dT%H%M%SZ)_$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

latest_db="$(rclone lsf "$target" --files-only | grep -E '^wondertales_production_db_.*[.]dump$' | sort | tail -1)"
latest_uploads="$(rclone lsf "$target" --files-only | grep -E '^wondertales_production_uploads_.*[.]tar[.]gz$' | sort | tail -1)"

if [[ -z "$latest_db" || -z "$latest_uploads" ]]; then
  echo "could not resolve latest DB/uploads artifacts from $target" >&2
  exit 1
fi

echo "Offsite restore drill"
echo "Target: $target"
echo "Temp: $tmp_dir"
echo "DB artifact: $latest_db"
echo "Uploads artifact: $latest_uploads"

for artifact in "$latest_db" "$latest_db.sha256" "$latest_uploads" "$latest_uploads.sha256"; do
  echo "Downloading $artifact"
  rclone copyto "$target/$artifact" "$tmp_dir/$artifact"
done

check_sha() {
  local artifact="$1"
  local expected actual

  expected="$(sed -E 's/[[:space:]].*$//' "$tmp_dir/$artifact.sha256")"
  actual="$(sha256sum "$tmp_dir/$artifact")"
  actual="${actual%% *}"

  if [[ "$expected" != "$actual" ]]; then
    echo "sha256 mismatch for $artifact" >&2
    exit 1
  fi

  echo "PASS sha256 verified for $artifact"
}

check_sha "$latest_db"
check_sha "$latest_uploads"

pg_restore -l "$tmp_dir/$latest_db" >/dev/null
echo "PASS pg_restore can list DB dump"

docker run -d \
  --name "$container" \
  -e POSTGRES_PASSWORD=restore \
  -e POSTGRES_DB=restore \
  "$RESTORE_DRILL_POSTGRES_IMAGE" >/dev/null

for i in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" == "30" ]]; then
    echo "temporary Postgres did not become ready" >&2
    exit 1
  fi
done

docker cp "$tmp_dir/$latest_db" "$container:/tmp/restore.dump" >/dev/null
docker exec "$container" pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  -U postgres \
  -d restore \
  /tmp/restore.dump >/dev/null

public_tables="$(
  docker exec "$container" psql -U postgres -d restore -tAc \
    'select count(*) from information_schema.tables where table_schema = current_schema();' \
    | tr -d '[:space:]'
)"

if [[ -z "$public_tables" || ! "$public_tables" =~ ^[0-9]+$ || "$public_tables" == "0" ]]; then
  echo "restored database has no public tables" >&2
  exit 1
fi

echo "PASS restored DB into disposable Postgres; public_tables=$public_tables"

tar -tzf "$tmp_dir/$latest_uploads" >/tmp/wondertales-restore-uploads-list.txt
upload_entries="$(wc -l < /tmp/wondertales-restore-uploads-list.txt | tr -d '[:space:]')"

if [[ -z "$upload_entries" || ! "$upload_entries" =~ ^[0-9]+$ || "$upload_entries" == "0" ]]; then
  echo "uploads archive listing is empty" >&2
  exit 1
fi

echo "PASS uploads archive listing succeeded; entries=$upload_entries"
echo "Sample upload paths:"
sed -n '1,8p' /tmp/wondertales-restore-uploads-list.txt
rm -f /tmp/wondertales-restore-uploads-list.txt

echo "Restore drill completed successfully."
