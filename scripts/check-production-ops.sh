#!/usr/bin/env bash

# Production operational readiness check for the single-droplet launch setup.
#
# Default mode is read-only. Pass --backup-smoke to create a non-destructive
# PostgreSQL custom-format backup in the existing ./backups mount and validate
# that pg_restore can read its table of contents.
#
# Usage:
#   ./scripts/check-production-ops.sh
#   ./scripts/check-production-ops.sh --backup-smoke

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
MIN_ROOT_FREE_MB="${MIN_ROOT_FREE_MB:-2048}"
MIN_DOCKER_FREE_MB="${MIN_DOCKER_FREE_MB:-2048}"
MIN_PROJECT_FREE_MB="${MIN_PROJECT_FREE_MB:-1024}"
LOG_SINCE="${LOG_SINCE:-30m}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
RUN_BACKUP_SMOKE=0

SSH_CONTROL_PATH="/tmp/wondertales-ops-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=120 -o BatchMode=no"

for arg in "$@"; do
  case "$arg" in
    --backup-smoke)
      RUN_BACKUP_SMOKE=1
      ;;
    -h|--help)
      sed -n '1,18p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--backup-smoke]" >&2
      exit 1
      ;;
  esac
done

cleanup() {
  ssh -O exit -o ControlPath="${SSH_CONTROL_PATH}" "${DROPLET_USER}@${DROPLET_IP}" 2>/dev/null || true
}

trap cleanup EXIT

echo "Production ops readiness check"
echo "Target: ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}"
if [[ "$RUN_BACKUP_SMOKE" == "1" ]]; then
  echo "Mode: backup smoke enabled"
else
  echo "Mode: read-only"
fi

ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" true

ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" \
  "DROPLET_PATH='${DROPLET_PATH}' COMPOSE_FILE='${COMPOSE_FILE}' MIN_ROOT_FREE_MB='${MIN_ROOT_FREE_MB}' MIN_DOCKER_FREE_MB='${MIN_DOCKER_FREE_MB}' MIN_PROJECT_FREE_MB='${MIN_PROJECT_FREE_MB}' LOG_SINCE='${LOG_SINCE}' RUN_BACKUP_SMOKE='${RUN_BACKUP_SMOKE}' BACKUP_RETENTION_DAYS='${BACKUP_RETENTION_DAYS}' bash -s" <<'REMOTE'
set -u

failures=0
warnings=0

pass() {
  echo "PASS $*"
}

warn() {
  warnings=$((warnings + 1))
  echo "WARN $*"
}

fail() {
  failures=$((failures + 1))
  echo "FAIL $*"
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

compose_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T "$@" < /dev/null
}

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "command '$1' is available"
  else
    fail "command '$1' is missing"
  fi
}

check_disk() {
  local path="$1"
  local label="$2"
  local min_mb="$3"
  local line
  line="$(df -Pm "$path" 2>/dev/null | awk 'NR == 2 {print $4 " " $5}')"
  if [[ -z "$line" ]]; then
    fail "$label disk check failed for $path"
    return
  fi
  local available_mb used_pct
  available_mb="$(awk '{print $1}' <<<"$line")"
  used_pct="$(awk '{print $2}' <<<"$line")"
  if [[ "$available_mb" =~ ^[0-9]+$ ]] && (( available_mb >= min_mb )); then
    pass "$label has ${available_mb}MB free (${used_pct} used)"
  else
    fail "$label has ${available_mb:-unknown}MB free (${used_pct:-unknown} used), expected at least ${min_mb}MB"
  fi
}

check_container() {
  local name="$1"
  local expected_health="${2:-any}"
  local status health restarts
  status="$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || true)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || true)"
  restarts="$(docker inspect -f '{{.RestartCount}}' "$name" 2>/dev/null || echo unknown)"

  if [[ "$status" == "running" ]]; then
    pass "$name is running (health=${health}, restarts=${restarts})"
  else
    fail "$name status is ${status:-missing}"
    return
  fi

  if [[ "$expected_health" != "any" && "$health" != "$expected_health" ]]; then
    fail "$name health is ${health}, expected ${expected_health}"
  fi
}

check_port_binding() {
  local pattern="$1"
  local label="$2"
  if ss -tln 2>/dev/null | grep -Eq "$pattern"; then
    pass "$label port binding present"
  else
    fail "$label port binding missing"
  fi
}

check_not_public_port() {
  local port="$1"
  local label="$2"
  if ss -tln 2>/dev/null | grep -Eq "(0\.0\.0\.0|\[::\]):${port}\b"; then
    fail "$label is publicly bound on port ${port}"
  else
    pass "$label is not publicly bound on port ${port}"
  fi
}

check_env_key() {
  local key="$1"
  if compose_exec api sh -lc "value=\"\$(printenv '$key' || true)\"; test -n \"\$value\"" >/dev/null 2>&1; then
    pass "api env $key is set"
  else
    fail "api env $key is missing or empty"
  fi
}

check_env_any() {
  local label="$1"
  shift
  local key
  for key in "$@"; do
    if compose_exec api sh -lc "value=\"\$(printenv '$key' || true)\"; test -n \"\$value\"" >/dev/null 2>&1; then
      pass "api env group $label is satisfied by $key"
      return
    fi
  done
  fail "api env group $label has no configured key: $*"
}

echo
echo "== Host tools =="
check_command docker
check_command curl
check_command ss

echo
echo "== Project directory =="
if cd "$DROPLET_PATH"; then
  pass "project directory exists"
else
  fail "project directory missing: $DROPLET_PATH"
fi

if [[ -f "$COMPOSE_FILE" ]]; then
  pass "$COMPOSE_FILE exists"
else
  fail "$COMPOSE_FILE missing"
fi

if [[ -f ".env.production" ]]; then
  pass ".env.production exists"
else
  fail ".env.production missing"
fi

echo
echo "== Docker compose =="
if compose ps >/tmp/wondertales-compose-ps.txt 2>&1; then
  pass "docker compose ps succeeded"
  cat /tmp/wondertales-compose-ps.txt
else
  fail "docker compose ps failed"
  cat /tmp/wondertales-compose-ps.txt || true
fi

check_container wondertales-postgres-prod healthy
check_container wondertales-api-prod any
check_container wondertales-nginx any
check_container wondertales-webapp-prod any

echo
echo "== Ports and health =="
check_port_binding '0\.0\.0\.0:80\b|\[::\]:80\b' "nginx HTTP"
check_port_binding '0\.0\.0\.0:443\b|\[::\]:443\b' "nginx HTTPS"
check_port_binding '127\.0\.0\.1:3000\b' "api localhost"
check_port_binding '127\.0\.0\.1:5432\b' "postgres localhost"
check_not_public_port 3000 "api"
check_not_public_port 5432 "postgres"

if curl -fsS --max-time 10 http://127.0.0.1:3000/health >/tmp/wondertales-api-health.json 2>/tmp/wondertales-api-health.err; then
  pass "local API health endpoint responds"
else
  fail "local API health endpoint failed: $(cat /tmp/wondertales-api-health.err 2>/dev/null)"
fi

if curl -fsS --max-time 15 https://wondertales.art/health >/tmp/wondertales-public-health.txt 2>/tmp/wondertales-public-health.err; then
  pass "public HTTPS health endpoint responds"
else
  fail "public HTTPS health endpoint failed: $(cat /tmp/wondertales-public-health.err 2>/dev/null)"
fi

echo
echo "== Disk and volumes =="
check_disk / "root filesystem" "$MIN_ROOT_FREE_MB"
check_disk /var/lib/docker "docker filesystem" "$MIN_DOCKER_FREE_MB"
check_disk "$DROPLET_PATH" "project filesystem" "$MIN_PROJECT_FREE_MB"

if compose_exec postgres sh -lc 'du -sh /var/lib/postgresql/data /backups 2>/dev/null || true'; then
  pass "postgres data and backup volume sizes are readable"
else
  fail "postgres data and backup volume size check failed"
fi

if compose_exec api sh -lc 'du -sh /app/services/api/uploads /app/services/api/logs 2>/dev/null || true'; then
  pass "api upload and log volume sizes are readable"
else
  fail "api upload/log volume size check failed"
fi

if [[ -d backups ]]; then
  pass "project backups directory exists"
  recent_backup_count="$(find backups -maxdepth 1 -type f \( -name '*.dump' -o -name '*.sql.gz' -o -name '*.backup' \) -mtime -7 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$recent_backup_count" =~ ^[0-9]+$ ]] && (( recent_backup_count > 0 )); then
    pass "recent database backup file exists (${recent_backup_count} in last 7 days)"
  else
    warn "no database backup file found in backups/ from the last 7 days"
  fi

  recent_upload_backup_count="$(find backups -maxdepth 1 -type f -name 'wondertales_production_uploads_*.tar.gz' -mtime -7 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$recent_upload_backup_count" =~ ^[0-9]+$ ]] && (( recent_upload_backup_count > 0 )); then
    pass "recent upload-volume backup archive exists (${recent_upload_backup_count} in last 7 days)"
  else
    warn "no upload-volume backup archive found in backups/ from the last 7 days"
  fi
else
  warn "project backups directory is missing"
fi

if [[ "$RUN_BACKUP_SMOKE" == "1" ]]; then
  echo
  echo "== Backup smoke =="
  mkdir -p backups
  backup_file="/backups/prelaunch_smoke_$(date -u +%Y%m%dT%H%M%SZ).dump"
  if compose_exec -e BACKUP_FILE="$backup_file" postgres sh -lc 'set -e; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$BACKUP_FILE"; pg_restore -l "$BACKUP_FILE" >/dev/null; ls -lh "$BACKUP_FILE"'; then
    pass "pg_dump custom-format backup created and pg_restore can read it"
    find backups -maxdepth 1 -name 'prelaunch_smoke_*.dump' -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true
  else
    fail "backup smoke failed"
  fi
else
  warn "backup smoke skipped; rerun with --backup-smoke before launch"
fi

echo
echo "== Production env presence =="
for key in JWT_SECRET ENCRYPTION_KEY WEB_APP_URL GOOGLE_CALLBACK_URL RESEND_API_KEY FROM_EMAIL STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  check_env_key "$key"
done
check_env_any "cors allowlist" CORS_ALLOWED_ORIGINS WEB_APP_URL
check_env_any "image/text provider" GEMINI_API_KEY GOOGLE_API_KEY OPENAI_API_KEY
check_env_any "tts provider" ELEVENLABS_API_KEY GOOGLE_TTS_MODEL OPENAI_TTS_MODEL

echo
echo "== Schedulers and external targets =="
scheduler_config="$(
  {
    if command -v crontab >/dev/null 2>&1; then
      crontab -l 2>/dev/null || true
    fi
    if [[ -d /etc/cron.d ]]; then
      grep -RhsE 'wondertales|kazka|backup|monitor|alert|OFFSITE_BACKUP_RCLONE_TARGET|OPS_ALERT_WEBHOOK_URL|ADMIN_ALERT_WEBHOOK_URL' /etc/cron.d 2>/dev/null || true
    fi
    if command -v systemctl >/dev/null 2>&1; then
      systemctl list-timers --all --no-pager 2>/dev/null | grep -Ei 'wondertales|kazka|backup|monitor|alert' || true
    fi
    if [[ -d /etc/systemd/system ]]; then
      find /etc/systemd/system -maxdepth 1 -type f \( \
        -name '*wondertales*' -o \
        -name '*kazka*' -o \
        -name '*backup*' -o \
        -name '*monitor*' -o \
        -name '*alert*' \
      \) -print -exec sed -n '1,160p' {} \; 2>/dev/null || true
    fi
    grep -E 'OFFSITE_BACKUP_RCLONE_TARGET|OPS_ALERT_WEBHOOK_URL|ADMIN_ALERT_WEBHOOK_URL' .env.production 2>/dev/null | sed -E 's/(=).+/\1set/' || true
  } | sed -E 's#(https?://)[^[:space:]]+#\1[redacted]#g; s#(TOKEN|PASSWORD|SECRET|KEY|WEBHOOK_URL)=([^[:space:]]+)#\1=[redacted]#g'
)"

if grep -Eq 'run-production-backup-retention\.sh' <<<"$scheduler_config"; then
  pass "backup retention scheduler reference found"
else
  warn "backup retention scheduler reference not found; configure daily run-production-backup-retention.sh before relying on paid data"
fi

if grep -Eq 'OFFSITE_BACKUP_RCLONE_TARGET' <<<"$scheduler_config"; then
  pass "offsite backup target reference found"
else
  warn "offsite backup target reference not found; configure OFFSITE_BACKUP_RCLONE_TARGET before relying on single-droplet media durability"
fi

if grep -Eq 'monitor-production-ops\.sh' <<<"$scheduler_config"; then
  pass "ops monitor scheduler reference found"
else
  warn "ops monitor scheduler reference not found; configure monitor-production-ops.sh with external alerting"
fi

if grep -Eq 'check-production-admin-alerts\.sh' <<<"$scheduler_config"; then
  pass "admin dashboard alert scheduler reference found"
else
  warn "admin dashboard alert scheduler reference not found; configure check-production-admin-alerts.sh with external alerting"
fi

echo
echo "== Recent logs =="
log_matches="$(compose logs api --since "$LOG_SINCE" 2>&1 | grep -i -E 'error|warn|failed|panic|unhandled|exception' | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[email]/g' || true)"
if [[ -n "$log_matches" ]]; then
  warn "recent API logs contain notable lines since $LOG_SINCE"
  printf '%s\n' "$log_matches"
else
  pass "recent API logs have no error/warn/failed lines since $LOG_SINCE"
fi

echo
echo "== Summary =="
echo "Failures: $failures"
echo "Warnings: $warnings"

if (( failures > 0 )); then
  exit 1
fi
REMOTE
