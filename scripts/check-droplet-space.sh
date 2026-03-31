#!/bin/bash

# Droplet disk / Docker diagnostics with a single SSH session.
# Usage:
#   ./scripts/check-droplet-space.sh                # read-only diagnostics
#   ./scripts/check-droplet-space.sh --prune-images # prune images + build cache
#   ./scripts/check-droplet-space.sh --full-prune   # aggressive prune incl. volumes

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"

SSH_CONTROL_PATH="/tmp/droplet-space-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=120 -o BatchMode=no"

RUN_PRUNE_IMAGES=false
RUN_FULL_PRUNE=false

for arg in "$@"; do
  case "$arg" in
    --prune-images) RUN_PRUNE_IMAGES=true ;;
    --full-prune) RUN_FULL_PRUNE=true ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--prune-images] [--full-prune]"
      exit 1
      ;;
  esac
done

cleanup() {
  ssh -O exit -o ControlPath="${SSH_CONTROL_PATH}" "${DROPLET_USER}@${DROPLET_IP}" 2>/dev/null || true
}

trap cleanup EXIT

print_step() {
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════"
}

print_mode() {
  echo ""
  echo "Mode: $1"
}

ssh_droplet() {
  ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" "$@"
}

ssh_droplet_timeout() {
  local seconds="$1"
  shift
  ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" "timeout ${seconds}s $*"
}

print_snapshot() {
  local label="$1"
  print_step "${label}: Disk usage"
  ssh_droplet '
  set -e
  df -h
  echo
  echo "--- Inodes ---"
  df -ih
  '

  print_step "${label}: Docker usage"
  ssh_droplet_timeout 30 "bash -lc \"set -e
    docker system df
    echo
    echo '--- Containers ---'
    docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Size}}'
    echo
    echo '--- Images (largest first) ---'
    docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}' | sort -h -k3
  \"" || echo 'Docker usage command failed or timed out after 30s.'
}

echo "🔍 Droplet disk and Docker diagnostics"
echo "   Target: ${DROPLET_USER}@${DROPLET_IP}"
echo "   Project: ${DROPLET_PATH}"

# Open master connection once. This is the only point where SSH asks for password/passphrase.
ssh ${SSH_OPTS} "${DROPLET_USER}@${DROPLET_IP}" true

if [[ "${RUN_FULL_PRUNE}" == "true" ]]; then
  print_mode "FULL PRUNE"
elif [[ "${RUN_PRUNE_IMAGES}" == "true" ]]; then
  print_mode "PRUNE IMAGES"
else
  print_mode "READ-ONLY"
fi

print_snapshot "Before"

print_step "Heavy directories"
ssh_droplet '
set -e
echo "--- /var/lib ---"
du -xh --max-depth=1 /var/lib 2>/dev/null | sort -h | tail -n 20
echo
echo "--- Docker/containerd ---"
du -xh --max-depth=2 /var/lib/docker /var/lib/containerd 2>/dev/null | sort -h | tail -n 30 || true
echo
echo "--- Project dir ---"
du -xh --max-depth=2 '"${DROPLET_PATH}"' 2>/dev/null | sort -h | tail -n 20 || true
'

print_step "Dangling / reclaimable candidates"
ssh_droplet '
set -e
echo "--- Dangling images ---"
docker images -f dangling=true
echo
echo "--- Build cache summary ---"
docker builder prune --all --dry-run 2>/dev/null || echo "Build cache dry-run is not supported on this Docker version."
'

if [[ "${RUN_PRUNE_IMAGES}" == "true" ]]; then
  print_step "Pruning unused images and build cache"
  ssh_droplet '
  set -e
  echo "+ docker image prune -a -f"
  docker image prune -a -f
  echo
  echo "+ docker builder prune -a -f"
  docker builder prune -a -f
  '
  print_snapshot "After"
fi

if [[ "${RUN_FULL_PRUNE}" == "true" ]]; then
  print_step "Full prune (containers, images, networks, volumes)"
  ssh_droplet '
  set -e
  echo "+ docker system prune -a --volumes -f"
  docker system prune -a --volumes -f
  '
  print_snapshot "After"
fi

print_step "Done"
if [[ "${RUN_FULL_PRUNE}" == "true" ]]; then
  echo "Full prune completed."
elif [[ "${RUN_PRUNE_IMAGES}" == "true" ]]; then
  echo "Image/cache prune completed."
else
  echo "No cleanup commands were executed."
fi
echo "SSH master connection was reused for the full run."
