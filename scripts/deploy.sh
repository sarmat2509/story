#!/bin/bash

# Full deployment: API + webapp + migrations
# Usage:
#   ./scripts/deploy.sh            # Deploy everything (API + webapp + migrations)
#   ./scripts/deploy.sh --api      # API + migrations only
#   ./scripts/deploy.sh --web      # Webapp only
#   ./scripts/deploy.sh --nginx    # Legacy nginx handoff check only; deploy live proxy from ../proxy
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
DEPLOY_DRAIN_TIMEOUT_MS="${DEPLOY_DRAIN_TIMEOUT_MS:-900000}"
DEPLOY_ACTIVE_REQUEST_TTL_MS="${DEPLOY_ACTIVE_REQUEST_TTL_MS:-600000}"

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

# Parse flags
DEPLOY_API=false
DEPLOY_WEB=false
DEPLOY_MIGRATE=false
DEPLOY_NGINX=false

if [[ $# -eq 0 ]]; then
  DEPLOY_API=true
  DEPLOY_WEB=true
  DEPLOY_MIGRATE=true
fi

for arg in "$@"; do
  case "$arg" in
    --api)     DEPLOY_API=true; DEPLOY_MIGRATE=true ;;
    --web)     DEPLOY_WEB=true ;;
    --nginx)   DEPLOY_NGINX=true ;;
    --migrate) DEPLOY_MIGRATE=true ;;
    -h|--help)
      sed -n '1,9p' "$0"
      exit 0
      ;;
    *) echo "Unknown argument: $arg"; echo "Usage: $0 [--api] [--web] [--nginx] [--migrate]"; exit 1 ;;
  esac
done

# Open master connection once (triggers passphrase prompt if needed)
ssh $SSH_OPTS -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" true

# Cleanup master connection on exit
trap cleanup EXIT
trap 'on_error "${LINENO}" "${BASH_COMMAND}"' ERR

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

export_expo_public_env_vars() {
  local env_file="$1"

  [[ -f "${env_file}" ]] || return 0

  while IFS='=' read -r key value; do
    [[ "${key}" =~ ^EXPO_PUBLIC_[A-Za-z0-9_]+$ ]] || continue

    value="${value%$'\r'}"
    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:-1}"
    fi

    export "${key}=${value}"
  done < <(grep -E '^EXPO_PUBLIC_[A-Za-z0-9_]+=' "${env_file}" || true)
}

ssh_droplet() {
  LAST_REMOTE_COMMAND="$*"
  ssh $SSH_OPTS "${DROPLET_USER}@${DROPLET_IP}" "$@"
}

upsert_remote_env_var() {
  local env_file="$1"
  local key="$2"
  local value="$3"

  ssh_droplet "if grep -q '^${key}=' '${env_file}'; then perl -0pi -e 's/^${key}=.*\$/${key}=${value}/m' '${env_file}'; else printf '\n${key}=${value}\n' >> '${env_file}'; fi"
}

create_deploy_tarball() {
  local output="$1"
  shift

  COPYFILE_DISABLE=1 tar --no-xattrs -czf "${output}" "$@"
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

sync_voice_samples() {
  local voice_samples_dir="${PROJECT_ROOT}/services/api/uploads/voice-samples"
  local voice_samples_tarball="/tmp/wondertales-voice-samples.tar.gz"
  local voice_sample_count

  if [[ ! -d "${voice_samples_dir}" ]]; then
    echo "❌ Local voice samples directory not found: ${voice_samples_dir}"
    exit 1
  fi

  voice_sample_count=$(find "${voice_samples_dir}" -mindepth 2 -maxdepth 2 -type f -name '*.mp3' | wc -l | tr -d ' ')
  if [[ -z "${voice_sample_count}" || "${voice_sample_count}" == "0" ]]; then
    echo "❌ No local voice sample mp3 files found in ${voice_samples_dir}"
    exit 1
  fi

  print_step "Syncing localized voice samples to API upload volume..."
  create_deploy_tarball "${voice_samples_tarball}" -C "${PROJECT_ROOT}/services/api/uploads" voice-samples
  scp -o ControlPath=${SSH_CONTROL_PATH} "${voice_samples_tarball}" \
    ${DROPLET_USER}@${DROPLET_IP}:/tmp/wondertales-voice-samples.tar.gz
  rm -f "${voice_samples_tarball}"

  ssh_droplet << 'EOF'
docker cp /tmp/wondertales-voice-samples.tar.gz wondertales-api-prod:/tmp/wondertales-voice-samples.tar.gz
docker exec wondertales-api-prod sh -lc '
  mkdir -p /app/services/api/uploads
  tar -xzf /tmp/wondertales-voice-samples.tar.gz -C /app/services/api/uploads
  find /app/services/api/uploads/voice-samples -type f -name "._*.mp3" -delete
  rm -f /tmp/wondertales-voice-samples.tar.gz
  for d in /app/services/api/uploads/voice-samples/*; do
    [ -d "$d" ] || continue
    printf "%s " "$(basename "$d")"
    find "$d" -maxdepth 1 -type f -name "*.mp3" | wc -l | tr -d " "
  done
'
rm -f /tmp/wondertales-voice-samples.tar.gz
EOF
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
  print_step "Checking legacy nginx handoff state..."

  # nginx/conf.d references Let's Encrypt paths; nginx -t fails if files are missing.
  local tls_live="${DROPLET_PATH}/certbot/conf/live/wondertales.art"
  if ! ssh_droplet "test -r '${tls_live}/fullchain.pem' && test -r '${tls_live}/privkey.pem'"; then
    echo ""
    echo "❌ TLS files missing on droplet (nginx -t will fail until they exist):"
    echo "     ${tls_live}/fullchain.pem"
    echo "     ${tls_live}/privkey.pem"
    echo ""
    echo "   Issue a certificate (DNS for wondertales.art must point to this server; port 80 reachable):"
    echo "   ssh ${DROPLET_USER}@${DROPLET_IP}"
    echo "   cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml up -d nginx"
    echo "   docker run --rm \\"
    echo "     -v ${DROPLET_PATH}/certbot/conf:/etc/letsencrypt \\"
    echo "     -v ${DROPLET_PATH}/certbot/www:/var/www/certbot \\"
    echo "     certbot/certbot certonly --webroot -w /var/www/certbot -d wondertales.art --email YOUR@EMAIL --agree-tos -n"
    echo ""
    echo "   Temporary workaround: symlink an existing live/... folder to live/wondertales.art (wrong hostname in cert until replaced)."
    echo ""
    return 1
  fi

  local nginx_tarball="/tmp/kazka-nginx-config.tar.gz"

  create_deploy_tarball "${nginx_tarball}" \
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
find nginx -name '._*' -delete
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

  echo "🛑 Stopping legacy story nginx; shared-nginx-proxy owns public ingress now..."
  ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml stop nginx >/dev/null 2>&1 || true"
  echo "✅ Legacy nginx config validates. Deploy live public nginx from /var/www/proxy with the proxy repo."
}

restart_shared_proxy_if_present() {
  echo "🔄 Refreshing shared public proxy upstreams..."
  ssh_droplet "docker ps --format '{{.Names}}' | grep -qx 'shared-nginx-proxy' && docker restart shared-nginx-proxy >/dev/null || true"
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

set_remote_ops_mode() {
  local mode="$1"
  local message="${2:-}"
  local ends_at="${3:-}"

  ssh_droplet "cd ${DROPLET_PATH} && if docker ps --filter name=wondertales-api-prod --filter status=running --format '{{.Names}}' | grep -q wondertales-api-prod; then docker exec wondertales-api-prod sh -lc 'cd /app/services/api && node dist/scripts/setOpsMode.js \"${mode}\" \"${message}\" \"${ends_at}\"'; else echo 'API container is not running; cannot set ops mode'; exit 2; fi"
}

wait_for_generation_drain() {
  print_step "Draining active generation jobs before API deploy"

  local maintenance_end
  maintenance_end="$(date -u -v+15M '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+15 minutes' '+%Y-%m-%dT%H:%M:%SZ')"

  if [[ "${SKIP_DEPLOY_DRAIN:-false}" == "true" ]]; then
    echo "⚠️  SKIP_DEPLOY_DRAIN=true, skipping generation drain"
    set_remote_ops_mode "draining" "WonderTales is being updated. New generations are paused for a few minutes." "${maintenance_end}" || true
    print_step_done
    return 0
  fi

  if ! set_remote_ops_mode "draining" "WonderTales is being updated. New generations are paused for a few minutes." "${maintenance_end}"; then
    echo "⚠️  Could not set draining mode. This is expected on the first deploy that introduces ops mode."
    print_step_done
    return 0
  fi

  ssh_droplet "cd ${DROPLET_PATH} && docker exec wondertales-api-prod sh -lc 'cd /app/services/api && if [ -f dist/scripts/expireStaleStoryRequests.js ]; then node dist/scripts/expireStaleStoryRequests.js --ttl-ms=${DEPLOY_ACTIVE_REQUEST_TTL_MS}; else echo \"expireStaleStoryRequests.js is not present yet; skipping stale cleanup\"; fi'"

  if ! ssh_droplet "cd ${DROPLET_PATH} && docker exec wondertales-api-prod sh -lc 'cd /app/services/api && node dist/scripts/waitForGenerationDrain.js --timeout-ms=${DEPLOY_DRAIN_TIMEOUT_MS} --poll-ms=5000 --active-request-window-ms=${DEPLOY_ACTIVE_REQUEST_TTL_MS}'"; then
    echo "❌ Active generation jobs did not drain within ${DEPLOY_DRAIN_TIMEOUT_MS}ms"
    echo "   Re-run with SKIP_DEPLOY_DRAIN=true only if you intentionally accept recovery/retry behavior."
    exit 1
  fi

  print_step_done
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Build and deploy API
# ─────────────────────────────────────────────────────────────────────────────
deploy_api() {
  wait_for_generation_drain

  local existing_web_build_id local_web_build_id
  existing_web_build_id=$(ssh_droplet "if [ -f '${DROPLET_PATH}/.env.production' ]; then grep -E '^WEB_BUILD_ID=' '${DROPLET_PATH}/.env.production' | tail -n 1 | cut -d= -f2-; fi" || true)
  local_web_build_id=$(read_env_var "${PROJECT_ROOT}/.env.production" "WEB_BUILD_ID" || true)

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
  if [[ -z "${local_web_build_id}" && -n "${existing_web_build_id}" ]]; then
    upsert_remote_env_var "${DROPLET_PATH}/.env.production" "WEB_BUILD_ID" "${existing_web_build_id}"
    echo "   ✓ Preserved WEB_BUILD_ID=${existing_web_build_id}"
  fi
  print_step_done

  upload_google_credentials

  prepare_disk_for_api_deploy

  print_step "Uploading production compose file..."
  scp -o ControlPath=${SSH_CONTROL_PATH} docker-compose.prod.yml ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/docker-compose.prod.yml
  print_step_done

  print_step "Loading API image and restarting on droplet..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
echo "Starting docker load at \$(date '+%H:%M:%S')"
docker load < ${API_IMAGE}.tar.gz
echo "Finished docker load at \$(date '+%H:%M:%S')"
rm -f ${API_IMAGE}.tar.gz
echo "Starting docker compose up api at \$(date '+%H:%M:%S')"
docker compose -f docker-compose.prod.yml up -d api
echo "Finished docker compose up at \$(date '+%H:%M:%S')"
EOF
  print_step_done

  rm -f /tmp/${API_IMAGE}.tar.gz
  sync_voice_samples
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

  print_step "Starting worker container..."
  ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml up -d worker"
  print_step_done

  print_step "Restoring normal ops mode..."
  if set_remote_ops_mode "normal" "" ""; then
    echo "   Ops mode is normal"
  else
    echo "⚠️  Failed to restore normal ops mode automatically; check /api/v1/ops/status"
  fi
  print_step_done

  echo "✅ Migrations done"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Build and deploy webapp
# ─────────────────────────────────────────────────────────────────────────────
deploy_webapp() {
  print_step "Building webapp locally..."
  cd apps/universal-app
  export EXPO_PUBLIC_API_BASE_URL=https://wondertales.art
  export_expo_public_env_vars "${PROJECT_ROOT}/.env.production"

  rm -rf .expo node_modules/.cache 2>/dev/null || true
  pnpm build:web:clean
  mkdir -p dist/.well-known
  cp public/.well-known/security.txt dist/.well-known/security.txt
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

  local expo_bundle
  expo_bundle=$(find apps/universal-app/dist/_expo/static/js/web -maxdepth 1 -type f -name '*.js' | head -n 1)
  if [[ -z "${expo_bundle}" ]]; then
    echo "❌ ERROR: Could not find Expo web bundle in apps/universal-app/dist/_expo/static/js/web"
    exit 1
  fi

  local expo_bundle_hash expo_bundle_dir expo_bundle_name expo_bundle_hashed
  expo_bundle_hash=$(shasum -a 256 "${expo_bundle}" | awk '{print substr($1, 1, 12)}')
  expo_bundle_dir="$(dirname "${expo_bundle}")"
  expo_bundle_name="$(basename "${expo_bundle}" .js)"
  expo_bundle_hashed="${expo_bundle_dir}/${expo_bundle_name}-${expo_bundle_hash}.js"
  if [[ "${expo_bundle}" != "${expo_bundle_hashed}" ]]; then
    mv "${expo_bundle}" "${expo_bundle_hashed}"
    perl -0pi -e "s#/_expo/static/js/web/[^\"']+\\.js#/_expo/static/js/web/$(basename "${expo_bundle_hashed}")#g" apps/universal-app/dist/index.html
    expo_bundle="${expo_bundle_hashed}"
  fi
  echo "   ✓ Fingerprinted web bundle: $(basename "${expo_bundle}")"

  mkdir -p apps/universal-app/dist/static/js
  cp "${expo_bundle}" apps/universal-app/dist/static/js/bundle.js
  echo "   ✓ Created SSR compatibility bundle at /static/js/bundle.js"

  print_step "Uploading webapp to droplet..."
  cd apps/universal-app
  create_deploy_tarball dist.tar.gz dist/
  cd "$PROJECT_ROOT"
  scp -o ControlPath=${SSH_CONTROL_PATH} apps/universal-app/dist.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  rm apps/universal-app/dist.tar.gz

  sync_nginx_config

  print_step "Updating SSR web bundle version..."
  upsert_remote_env_var "${DROPLET_PATH}/.env.production" "WEB_BUILD_ID" "${expo_bundle_hash}"
  echo "   ✓ WEB_BUILD_ID=${expo_bundle_hash}"
  print_step_done

  print_step "Extracting and recreating webapp..."
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
docker compose -f docker-compose.prod.yml up -d --force-recreate api webapp
EOF

  restart_shared_proxy_if_present

  echo "✅ Webapp deployed"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

echo "Deploy started"
echo "   API:      $DEPLOY_API"
echo "   Webapp:   $DEPLOY_WEB"
echo "   Nginx:    $DEPLOY_NGINX"
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

# Validate legacy nginx handoff config without rebuilding API or webapp.
if $DEPLOY_NGINX; then
  sync_nginx_config
fi

# Final status
print_step "Deployment complete!"
ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml ps"

echo ""
echo "🌐 API:    https://wondertales.art/health"
echo "🌐 App:    https://wondertales.art"
