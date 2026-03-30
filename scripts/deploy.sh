#!/bin/bash

# Full deployment: API + webapp + migrations
# Usage:
#   ./scripts/deploy.sh          # Deploy everything (API + webapp + migrations)
#   ./scripts/deploy.sh --api    # API + migrations only
#   ./scripts/deploy.sh --web    # Webapp only
#   ./scripts/deploy.sh --migrate  # Migrations only (no rebuild/redeploy)

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"
API_IMAGE="kazka-api"
API_TAG="latest"

# SSH multiplexing: single connection + passphrase prompt for the whole script
SSH_CONTROL_PATH="/tmp/deploy-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=60"
CURRENT_STEP="bootstrap"
LAST_REMOTE_COMMAND=""

cleanup() {
  ssh -O exit -o ControlPath=${SSH_CONTROL_PATH} ${DROPLET_USER}@${DROPLET_IP} 2>/dev/null || true
}

on_error() {
  local exit_code=$?
  local line_no=$1
  local command=$2

  echo ""
  echo "❌ Deployment failed"
  echo "   step: ${CURRENT_STEP}"
  echo "   line: ${line_no}"
  echo "   command: ${command}"
  if [[ -n "${LAST_REMOTE_COMMAND}" ]]; then
    echo "   last remote command: ${LAST_REMOTE_COMMAND}"
  fi
  echo "   exit code: ${exit_code}"
  echo ""
  echo "💡 Tip: rerun the failing remote command manually over SSH to inspect it in isolation."

  exit "${exit_code}"
}

# Open master connection once (triggers passphrase prompt if needed)
ssh $SSH_OPTS -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" true

# Cleanup master connection on exit
trap cleanup EXIT
trap 'on_error "${LINENO}" "${BASH_COMMAND}"' ERR

# Parse flags
DEPLOY_API=false
DEPLOY_WEB=false
DEPLOY_MIGRATE=false

if [[ $# -eq 0 ]]; then
  DEPLOY_API=true
  DEPLOY_WEB=true
  DEPLOY_MIGRATE=true
fi

for arg in "$@"; do
  case "$arg" in
    --api)     DEPLOY_API=true; DEPLOY_MIGRATE=true ;;
    --web)     DEPLOY_WEB=true ;;
    --migrate) DEPLOY_MIGRATE=true ;;
    *) echo "Unknown argument: $arg"; echo "Usage: $0 [--api] [--web] [--migrate]"; exit 1 ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

print_step() {
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════"
  CURRENT_STEP="$1"
}

ssh_droplet() {
  LAST_REMOTE_COMMAND="$*"
  ssh $SSH_OPTS "${DROPLET_USER}@${DROPLET_IP}" "$@"
}

run_migrations_in_container() {
  local remote_cmd="cd ${DROPLET_PATH} && docker exec wondertales-api-prod sh -c 'cd /app/services/api && npx tsx src/scripts/runAllMigrations.ts'"

  echo "🔄 Running migrations inside API container..."
  if ! ssh_droplet "${remote_cmd}"; then
    echo "❌ Migration command failed. Collecting diagnostics..."
    ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml ps && echo '--- API logs (tail 120) ---' && docker compose -f docker-compose.prod.yml logs api --tail 120" || true
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Run pending migrations on droplet
# ─────────────────────────────────────────────────────────────────────────────
run_migrations() {
  print_step "Running pending migrations on droplet..."

  # Check if api container is running
  if ! ssh_droplet "docker ps --filter name=wondertales-api-prod --filter status=running --format '{{.Names}}'" | grep -q "wondertales-api-prod"; then
    echo "⚠️  API container is not running — skipping migrations (will run after deploy)"
    return 0
  fi

  run_migrations_in_container
  echo "✅ Migrations done"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Build and deploy API
# ─────────────────────────────────────────────────────────────────────────────
deploy_api() {
  print_step "Building API image locally (linux/amd64)..."
  docker build --platform linux/amd64 -t ${API_IMAGE}:${API_TAG} \
    -f services/api/Dockerfile \
    --target production \
    .

  print_step "Saving API image to tarball..."
  docker save ${API_IMAGE}:${API_TAG} | gzip > /tmp/${API_IMAGE}.tar.gz

  print_step "Uploading API image to droplet..."
  scp -o ControlPath=${SSH_CONTROL_PATH} /tmp/${API_IMAGE}.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/

  print_step "Uploading .env.production..."
  scp -o ControlPath=${SSH_CONTROL_PATH} .env.production ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/

  print_step "Loading API image and restarting on droplet..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
docker load < ${API_IMAGE}.tar.gz
rm -f ${API_IMAGE}.tar.gz
docker compose -f docker-compose.prod.yml up -d api
docker compose -f docker-compose.prod.yml restart nginx
EOF

  rm -f /tmp/${API_IMAGE}.tar.gz
  echo "✅ API deployed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Run migrations after API is up (post-deploy)
# ─────────────────────────────────────────────────────────────────────────────
run_migrations_post_deploy() {
  print_step "Running pending migrations (post-deploy)..."

  echo "⏳ Waiting for API container to be healthy..."
  local status=""
  for i in $(seq 1 20); do
    status=$(ssh_droplet "docker inspect --format='{{.State.Health.Status}}' wondertales-api-prod 2>/dev/null || docker inspect --format='{{.State.Status}}' wondertales-api-prod 2>/dev/null || echo unknown" | tr -d '[:space:]')
    echo "   Waiting... ($i/20) status: $status"
    if [[ "$status" == "healthy" ]]; then
      echo "   Container is healthy"
      break
    fi
    if [[ "$status" == "running" && $i -gt 5 ]]; then
      echo "   Container is running (no healthcheck)"
      break
    fi
    sleep 3
  done

  if [[ "$status" != "healthy" && "$status" != "running" ]]; then
    echo "❌ API container is not ready for migrations (status: ${status:-unknown})"
    exit 1
  fi

  run_migrations_in_container
  echo "✅ Migrations done"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Build and deploy webapp
# ─────────────────────────────────────────────────────────────────────────────
deploy_webapp() {
  print_step "Building webapp locally..."
  cd apps/universal-app
  export EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org

  rm -rf .expo node_modules/.cache 2>/dev/null || true
  pnpm build:web:clean
  cd "$PROJECT_ROOT"

  # Verify build scheme
  echo "🔍 Verifying build..."
  if grep -rq "kazka://" apps/universal-app/dist/ 2>/dev/null; then
    echo "❌ ERROR: Build contains kazka:// (stale cache). Run: cd apps/universal-app && rm -rf .expo node_modules/.cache && pnpm build:web:clean"
    exit 1
  fi
  if ! grep -rq "wondertales://" apps/universal-app/dist/ 2>/dev/null; then
    echo "❌ ERROR: Build missing wondertales:// — check linking config in App.tsx"
    exit 1
  fi
  echo "   ✓ Build verified (wondertales://)"

  print_step "Uploading webapp to droplet..."
  cd apps/universal-app
  tar -czf dist.tar.gz dist/
  cd "$PROJECT_ROOT"
  scp -o ControlPath=${SSH_CONTROL_PATH} apps/universal-app/dist.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  rm apps/universal-app/dist.tar.gz

  print_step "Extracting and restarting webapp..."
  ssh_droplet << 'EOF'
cd /var/www/kazka
mkdir -p apps/universal-app
rm -rf apps/universal-app/dist
tar -xzf dist.tar.gz -C apps/universal-app/
rm -f dist.tar.gz
if [ -e dist ]; then
  rm -rf dist
  ln -sfn apps/universal-app/dist dist
fi
docker compose -f docker-compose.prod.yml restart webapp
docker compose -f docker-compose.prod.yml restart nginx
EOF

  echo "✅ Webapp deployed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

echo "🚀 Deploy started"
echo "   API:      $DEPLOY_API"
echo "   Webapp:   $DEPLOY_WEB"
echo "   Migrate:  $DEPLOY_MIGRATE"
echo "   Droplet:  ${DROPLET_USER}@${DROPLET_IP}"

# Pre-deploy: run migrations if API is already running
if $DEPLOY_MIGRATE && ! $DEPLOY_API; then
  run_migrations
fi

# Deploy API (includes image build + upload + restart)
if $DEPLOY_API; then
  deploy_api
  # Post-deploy migrations: after new image is running
  run_migrations_post_deploy
fi

# Deploy webapp
if $DEPLOY_WEB; then
  deploy_webapp
fi

# Final status
print_step "Deployment complete!"
ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml ps"

echo ""
echo "🌐 API:    https://magic-sleep-time.duckdns.org/health"
echo "🌐 App:    https://magic-sleep-time.duckdns.org"
