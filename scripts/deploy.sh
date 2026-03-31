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
API_PRELOAD_MIN_FREE_KB=2097152
API_POST_DEPLOY_CLEANUP_MIN_FREE_KB=1048576

# SSH multiplexing: single connection + passphrase prompt for the whole script
SSH_CONTROL_PATH="/tmp/deploy-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=60"
CURRENT_STEP="bootstrap"
LAST_REMOTE_COMMAND=""
STEP_STARTED_AT=0

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
  STEP_STARTED_AT=$(date +%s)
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  $1 ($(date '+%H:%M:%S'))"
  echo "═══════════════════════════════════════════════"
  CURRENT_STEP="$1"
}

print_step_done() {
  local finished_at duration
  finished_at=$(date +%s)
  duration=$((finished_at - STEP_STARTED_AT))
  echo "✅ ${CURRENT_STEP} finished in ${duration}s ($(date '+%H:%M:%S'))"
}

read_env_var() {
  local env_file="$1"
  local key="$2"
  local line value

  [[ -f "${env_file}" ]] || return 1

  line=$(grep -E "^${key}=" "${env_file}" | tail -n 1 || true)
  [[ -n "${line}" ]] || return 1

  value="${line#*=}"
  value="${value%$'\r'}"

  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:-1}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:-1}"
  fi

  printf '%s\n' "${value}"
}

ssh_droplet() {
  LAST_REMOTE_COMMAND="$*"
  ssh $SSH_OPTS "${DROPLET_USER}@${DROPLET_IP}" "$@"
}

upload_google_credentials() {
  local credentials_target credentials_filename local_credentials_path

  credentials_target=$(read_env_var "${PROJECT_ROOT}/.env.production" "GOOGLE_APPLICATION_CREDENTIALS" || true)
  if [[ -z "${credentials_target}" ]]; then
    echo "ℹ️  GOOGLE_APPLICATION_CREDENTIALS is not set in .env.production — skipping credential upload"
    return 0
  fi

  if [[ "${credentials_target}" != /app/secrets/* ]]; then
    echo "❌ GOOGLE_APPLICATION_CREDENTIALS must point inside /app/secrets in .env.production"
    echo "   current value: ${credentials_target}"
    exit 1
  fi

  credentials_filename="$(basename "${credentials_target}")"
  local_credentials_path="${PROJECT_ROOT}/services/api/${credentials_filename}"

  if [[ ! -f "${local_credentials_path}" ]]; then
    echo "❌ Local Google credentials file not found: ${local_credentials_path}"
    echo "   Expected a local-only file whose basename matches GOOGLE_APPLICATION_CREDENTIALS in .env.production"
    exit 1
  fi

  print_step "Uploading Google service account JSON..."
  ssh_droplet "mkdir -p ${DROPLET_PATH}/secrets && chmod 700 ${DROPLET_PATH}/secrets"
  scp -o ControlPath=${SSH_CONTROL_PATH} "${local_credentials_path}" \
    ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/secrets/${credentials_filename}
  ssh_droplet "chmod 600 ${DROPLET_PATH}/secrets/${credentials_filename}"
  print_step_done
}

cleanup_api_docker_artifacts() {
  local available_kb
  available_kb=$(ssh_droplet "df -Pk / | awk 'NR==2 {print \$4}'" | tr -d '[:space:]')

  if [[ -z "${available_kb}" || ! "${available_kb}" =~ ^[0-9]+$ ]]; then
    echo "⚠️  Could not determine free disk space — skipping Docker cleanup"
    return 0
  fi

  if (( available_kb >= API_POST_DEPLOY_CLEANUP_MIN_FREE_KB )); then
    echo "ℹ️  Free disk space is above 1GB — skipping Docker cleanup"
    return 0
  fi

  print_step "Low disk space detected, cleaning old Docker images and build cache..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
echo "--- Before cleanup ---"
docker system df || true
echo
docker image prune -a -f || true
echo
docker builder prune -a -f || true
echo
echo "--- After cleanup ---"
docker system df || true
EOF
}

prepare_disk_for_api_deploy() {
  local available_kb
  available_kb=$(ssh_droplet "df -Pk / | awk 'NR==2 {print \$4}'" | tr -d '[:space:]')

  if [[ -z "${available_kb}" || ! "${available_kb}" =~ ^[0-9]+$ ]]; then
    echo "⚠️  Could not determine free disk space before API load — continuing without pre-cleanup"
    return 0
  fi

  if (( available_kb >= API_PRELOAD_MIN_FREE_KB )); then
    echo "ℹ️  Free disk space before API load is above 2GB — no pre-cleanup needed"
    return 0
  fi

  print_step "Low disk space before API load, stopping old API and cleaning Docker artifacts..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
echo "--- Before pre-cleanup ---"
df -h
echo
docker system df || true
echo
echo "+ docker compose -f docker-compose.prod.yml stop api"
docker compose -f docker-compose.prod.yml stop api || true
echo
echo "+ docker compose -f docker-compose.prod.yml rm -f api"
docker compose -f docker-compose.prod.yml rm -f api || true
echo
echo "+ docker image rm ${API_IMAGE}:${API_TAG}"
docker image rm ${API_IMAGE}:${API_TAG} || true
echo
echo "+ docker image prune -a -f"
docker image prune -a -f || true
echo
echo "+ docker builder prune -a -f"
docker builder prune -a -f || true
echo
echo "--- After pre-cleanup ---"
df -h
echo
docker system df || true
EOF
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

sync_nginx_config() {
  print_step "Syncing nginx config to droplet..."

  local nginx_tarball="/tmp/kazka-nginx-config.tar.gz"

  COPYFILE_DISABLE=1 tar -czf "${nginx_tarball}" \
    docker-compose.prod.yml \
    nginx/nginx.conf \
    nginx/conf.d \
    nginx/includes \
    apps/universal-app/nginx.conf

  ssh_droplet "mkdir -p ${DROPLET_PATH}/nginx/conf.d ${DROPLET_PATH}/nginx/includes ${DROPLET_PATH}/apps/universal-app"
  scp -o ControlPath=${SSH_CONTROL_PATH} "${nginx_tarball}" ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  rm -f "${nginx_tarball}"

  ssh_droplet << EOF
cd ${DROPLET_PATH}
tar -xzf kazka-nginx-config.tar.gz
rm -f kazka-nginx-config.tar.gz
EOF

  echo "🔍 Validating nginx config in temporary nginx container..."
  ssh_droplet "docker run --rm \
    --add-host api:127.0.0.1 \
    --add-host webapp:127.0.0.1 \
    -v ${DROPLET_PATH}/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
    -v ${DROPLET_PATH}/nginx/conf.d:/etc/nginx/conf.d:ro \
    -v ${DROPLET_PATH}/nginx/includes:/etc/nginx/includes:ro \
    -v ${DROPLET_PATH}/certbot/conf:/etc/letsencrypt:ro \
    -v ${DROPLET_PATH}/certbot/www:/var/www/certbot:ro \
    nginx:alpine nginx -t"

  echo "🔄 Recreating nginx with latest compose + config..."
  ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml up -d --force-recreate nginx"
  echo "✅ Nginx config synced"
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
  print_step_done

  print_step "Saving API image to tarball..."
  docker save ${API_IMAGE}:${API_TAG} | gzip > /tmp/${API_IMAGE}.tar.gz
  print_step_done

  print_step "Uploading API image to droplet..."
  scp -o ControlPath=${SSH_CONTROL_PATH} /tmp/${API_IMAGE}.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  print_step_done

  print_step "Uploading .env.production..."
  scp -o ControlPath=${SSH_CONTROL_PATH} .env.production ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  print_step_done

  upload_google_credentials

  prepare_disk_for_api_deploy

  print_step "Loading API image and restarting on droplet..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
echo "Starting docker load at \$(date '+%H:%M:%S')"
docker load < ${API_IMAGE}.tar.gz
echo "Finished docker load at \$(date '+%H:%M:%S')"
rm -f ${API_IMAGE}.tar.gz
echo "Starting docker compose up at \$(date '+%H:%M:%S')"
docker compose -f docker-compose.prod.yml up -d api
echo "Finished docker compose up at \$(date '+%H:%M:%S')"
EOF
  print_step_done

  rm -f /tmp/${API_IMAGE}.tar.gz
  sync_nginx_config
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
EOF

  sync_nginx_config
  echo "✅ Webapp deployed"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

echo "Deploy started"
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
  cleanup_api_docker_artifacts
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
