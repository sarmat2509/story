#!/usr/bin/env bash

# Install droplet-local production ops cron jobs.
#
# The installed jobs run the same tracked scripts with --local, so cron on the
# droplet does not need to SSH back into the droplet.
#
# Usage:
#   ./scripts/install-production-ops-cron.sh --dry-run
#   ./scripts/install-production-ops-cron.sh --apply
#   ./scripts/install-production-ops-cron.sh --apply --include-admin-alerts
#   BACKUP_ENV_FILE=/var/www/kazka/.env.production ./scripts/install-production-ops-cron.sh --apply
#   OPS_ALERT_ENV_FILE=/etc/wondertales/ops-alert.env ./scripts/install-production-ops-cron.sh --apply

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
CRON_PATH="${CRON_PATH:-/etc/cron.d/wondertales-production-ops}"
BACKUP_CRON_TIME="${BACKUP_CRON_TIME:-15 2 * * *}"
OPS_CRON_TIME="${OPS_CRON_TIME:-*/30 * * * *}"
ADMIN_ALERT_CRON_TIME="${ADMIN_ALERT_CRON_TIME:-10 * * * *}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-${DROPLET_PATH}/.env.production}"
OPS_ALERT_ENV_FILE="${OPS_ALERT_ENV_FILE:-/etc/wondertales/ops-alert.env}"
ADMIN_ALERT_ENV_FILE="${ADMIN_ALERT_ENV_FILE:-/etc/wondertales/admin-alert.env}"
INCLUDE_ADMIN_ALERTS=0
RUN_APPLY=0

SSH_CONTROL_PATH="/tmp/wondertales-install-ops-cron-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=120 -o BatchMode=no"

usage() {
  sed -n '1,14p' "$0"
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
    --include-admin-alerts)
      INCLUDE_ADMIN_ALERTS=1
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

cleanup() {
  ssh -O exit -o ControlPath="${SSH_CONTROL_PATH}" "${DROPLET_USER}@${DROPLET_IP}" 2>/dev/null || true
}

trap cleanup EXIT

tmp_dir="$(mktemp -d)"
cleanup_tmp() {
  rm -rf "$tmp_dir"
}
trap cleanup_tmp RETURN

cron_file="${tmp_dir}/wondertales-production-ops.cron"

cat > "$cron_file" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""

${BACKUP_CRON_TIME} root cd ${DROPLET_PATH} && mkdir -p logs && if [[ -f '${BACKUP_ENV_FILE}' ]]; then set -a; source '${BACKUP_ENV_FILE}'; set +a; fi; BACKUP_LOCAL_RETENTION_DAYS=1 ./scripts/run-production-backup-retention.sh --local --apply >> logs/production-backup-retention.log 2>&1
${OPS_CRON_TIME} root cd ${DROPLET_PATH} && mkdir -p logs && if [[ -f '${OPS_ALERT_ENV_FILE}' ]]; then set -a; source '${OPS_ALERT_ENV_FILE}'; set +a; fi; LOG_SINCE=35m ./scripts/monitor-production-ops.sh --local >> logs/production-ops-monitor.log 2>&1
EOF

if [[ "$INCLUDE_ADMIN_ALERTS" == "1" ]]; then
  cat >> "$cron_file" <<EOF
${ADMIN_ALERT_CRON_TIME} root cd ${DROPLET_PATH} && mkdir -p logs && if [[ -f '${OPS_ALERT_ENV_FILE}' ]]; then set -a; source '${OPS_ALERT_ENV_FILE}'; set +a; fi; if [[ -f '${ADMIN_ALERT_ENV_FILE}' ]]; then set -a; source '${ADMIN_ALERT_ENV_FILE}'; set +a; ./scripts/check-production-admin-alerts.sh >> logs/production-admin-alerts.log 2>&1; fi
EOF
fi

echo "Production ops cron installer"
echo "Target: ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}"
if [[ "$RUN_APPLY" == "1" ]]; then
  echo "Mode: apply"
else
  echo "Mode: dry-run"
fi
echo
echo "Cron preview:"
cat "$cron_file"

if [[ "$RUN_APPLY" != "1" ]]; then
  echo
  echo "Dry-run only. Re-run with --apply to upload scripts and install cron."
  exit 0
fi

ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" true

ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" "mkdir -p '${DROPLET_PATH}/scripts' '${DROPLET_PATH}/logs'"
scp -o ControlPath="${SSH_CONTROL_PATH}" \
  scripts/check-production-ops.sh \
  scripts/monitor-production-ops.sh \
  scripts/run-production-backup-retention.sh \
  scripts/configure-r2-rclone.sh \
  scripts/check-production-admin-alerts.sh \
  "${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/scripts/"
scp -o ControlPath="${SSH_CONTROL_PATH}" "$cron_file" "${DROPLET_USER}@${DROPLET_IP}:${CRON_PATH}"

ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" \
  "chmod 755 '${DROPLET_PATH}/scripts/check-production-ops.sh' '${DROPLET_PATH}/scripts/monitor-production-ops.sh' '${DROPLET_PATH}/scripts/run-production-backup-retention.sh' '${DROPLET_PATH}/scripts/configure-r2-rclone.sh' '${DROPLET_PATH}/scripts/check-production-admin-alerts.sh' && chmod 644 '${CRON_PATH}' && sed -n '1,120p' '${CRON_PATH}'"

echo
echo "Installed production ops cron."
