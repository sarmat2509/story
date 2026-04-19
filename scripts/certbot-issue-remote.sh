#!/usr/bin/env bash
# Run Let's Encrypt certbot (webroot) on the production droplet over SSH.
# Mirrors deploy.sh: SSH multiplexing, first connection uses BatchMode=no so you can enter
# SSH key passphrase or the account password (password auth must be allowed on the server).
#
# Prerequisites: DNS A for wondertales.art → droplet, port 80 reachable from the internet.
#
# Usage:
#   ./scripts/certbot-issue-remote.sh
#   CERTBOT_EMAIL=you@example.com ./scripts/certbot-issue-remote.sh
#   ./scripts/certbot-issue-remote.sh --staging
#
# Override connection (optional):
#   DROPLET_IP=1.2.3.4 DROPLET_USER=root DROPLET_PATH=/var/www/kazka ./scripts/certbot-issue-remote.sh
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"

SSH_CONTROL_PATH="/tmp/certbot-issue-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=120"
CURRENT_STEP="bootstrap"
LAST_REMOTE_COMMAND=""
STAGING=false

for arg in "$@"; do
  case "$arg" in
    --staging) STAGING=true ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/certbot-issue-remote.sh [--staging]

  Runs certbot (webroot) on the droplet over SSH (same SSH session style as deploy.sh).
  First connection prompts for SSH key passphrase or user password.

  CERTBOT_EMAIL=you@example.com ./scripts/certbot-issue-remote.sh
  DROPLET_IP=1.2.3.4 ./scripts/certbot-issue-remote.sh --staging
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --staging or --help)"
      exit 1
      ;;
  esac
done

cleanup() {
  ssh -O exit -o ControlPath="${SSH_CONTROL_PATH}" "${DROPLET_USER}@${DROPLET_IP}" 2>/dev/null || true
}

on_error() {
  local exit_code=$? line_no=$1 command=$2
  echo ""
  echo "❌ certbot-issue-remote failed"
  echo "   step: ${CURRENT_STEP}"
  echo "   line: ${line_no}"
  echo "   command: ${command}"
  [[ -n "${LAST_REMOTE_COMMAND}" ]] && echo "   last remote: ${LAST_REMOTE_COMMAND}"
  echo "   exit code: ${exit_code}"
  echo ""
  exit "${exit_code}"
}

print_step() {
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  $1 ($(date '+%H:%M:%S'))"
  echo "═══════════════════════════════════════════════"
  CURRENT_STEP="$1"
}

ssh_droplet() {
  LAST_REMOTE_COMMAND="$*"
  ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" "$@"
}

CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
if [[ -z "${CERTBOT_EMAIL}" ]]; then
  read -r -p "Certbot / Let's Encrypt email (for expiry notices): " CERTBOT_EMAIL
fi
if [[ -z "${CERTBOT_EMAIL}" ]]; then
  echo "Email is required. Set CERTBOT_EMAIL or enter when prompted."
  exit 1
fi

echo ""
echo "SSH → ${DROPLET_USER}@${DROPLET_IP}"
echo "Project path on server: ${DROPLET_PATH}"
if [[ "${STAGING}" == true ]]; then
  echo "Mode: **staging** (test CA, not a production cert)"
else
  echo "Mode: **production** Let's Encrypt"
fi
echo ""
echo "🔑 First SSH connection: enter your SSH key passphrase, or the server user password"
echo "   (same idea as ./scripts/deploy.sh)."
echo ""

ssh ${SSH_OPTS} -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" true

trap cleanup EXIT
trap 'on_error "${LINENO}" "${BASH_COMMAND}"' ERR

LOCAL_SCRIPT="${SCRIPT_DIR}/certbot-webroot-issue.sh"
[[ -f "${LOCAL_SCRIPT}" ]] || { echo "Missing ${LOCAL_SCRIPT}"; exit 1; }

print_step "Ensure remote dirs exist"
ssh_droplet "mkdir -p '${DROPLET_PATH}/scripts' '${DROPLET_PATH}/certbot/conf' '${DROPLET_PATH}/certbot/www'"

print_step "Upload certbot helper script"
scp -o ControlPath="${SSH_CONTROL_PATH}" "${LOCAL_SCRIPT}" "${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/scripts/certbot-webroot-issue.sh"
ssh_droplet "chmod +x '${DROPLET_PATH}/scripts/certbot-webroot-issue.sh'"

print_step "Start nginx (needed for HTTP-01 webroot)"
ssh_droplet "cd '${DROPLET_PATH}' && docker compose -f docker-compose.prod.yml up -d nginx"

print_step "Run certbot in Docker on droplet"
EMAIL_Q=$(printf '%q' "${CERTBOT_EMAIL}")
STAGING_FLAG=""
[[ "${STAGING}" == true ]] && STAGING_FLAG="--staging"
# shellcheck disable=SC2029
ssh_droplet "cd '${DROPLET_PATH}' && export CERTBOT_EMAIL=${EMAIL_Q} && ./scripts/certbot-webroot-issue.sh ${STAGING_FLAG}"

print_step "Restart nginx to load new certs"
ssh_droplet "cd '${DROPLET_PATH}' && docker compose -f docker-compose.prod.yml restart nginx"

print_step "Verify certificate files"
ssh_droplet "ls -la '${DROPLET_PATH}/certbot/conf/live/wondertales.art/' || true"

echo ""
echo "✅ Done. You can run ./scripts/deploy.sh again from this machine."
