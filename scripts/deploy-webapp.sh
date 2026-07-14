#!/bin/bash

# Deploy webapp to production
# Usage: ./scripts/deploy-webapp.sh

set -e

# Always run from project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"

echo "🚀 Starting webapp deployment..."
echo "   Project root: $PROJECT_ROOT"

create_deploy_tarball() {
  local output="$1"
  shift

  COPYFILE_DISABLE=1 tar --no-xattrs -czf "$output" "$@"
}

export_expo_public_env_vars() {
  local env_file="$1"

  [ -f "$env_file" ] || return 0

  while IFS='=' read -r key value; do
    case "$key" in
      EXPO_PUBLIC_*) ;;
      *) continue ;;
    esac

    value="${value%$'\r'}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:-1}"
    fi

    export "${key}=${value}"
  done < <(grep -E '^EXPO_PUBLIC_[A-Za-z0-9_]+=' "$env_file" || true)
}

upsert_remote_env_var() {
  local env_file="$1"
  local key="$2"
  local value="$3"

  ssh ${DROPLET_USER}@${DROPLET_IP} "if grep -q '^${key}=' '${env_file}'; then perl -0pi -e 's/^${key}=.*\$/${key}=${value}/m' '${env_file}'; else printf '\n${key}=${value}\n' >> '${env_file}'; fi"
}

sync_nginx_config() {
  echo "🔧 Syncing nginx and compose config..."
  local nginx_tarball="/tmp/kazka-nginx-config.tar.gz"

  create_deploy_tarball "$nginx_tarball" \
    docker-compose.prod.yml \
    nginx/nginx.conf \
    nginx/conf.d \
    nginx/includes \
    apps/universal-app/nginx.conf

  ssh ${DROPLET_USER}@${DROPLET_IP} "mkdir -p ${DROPLET_PATH}/nginx/conf.d ${DROPLET_PATH}/nginx/includes ${DROPLET_PATH}/apps/universal-app"
  scp "$nginx_tarball" ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  rm -f "$nginx_tarball"

  ssh ${DROPLET_USER}@${DROPLET_IP} << EOF
cd ${DROPLET_PATH}
tar -xzf kazka-nginx-config.tar.gz
rm -f kazka-nginx-config.tar.gz
find nginx -name '._*' -delete
docker run --rm \
  --add-host api:127.0.0.1 \
  --add-host webapp:127.0.0.1 \
  -v ${DROPLET_PATH}/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v ${DROPLET_PATH}/nginx/conf.d:/etc/nginx/conf.d:ro \
  -v ${DROPLET_PATH}/nginx/includes:/etc/nginx/includes:ro \
  -v ${DROPLET_PATH}/certbot/conf:/etc/letsencrypt:ro \
  -v ${DROPLET_PATH}/certbot/www:/var/www/certbot:ro \
  nginx:alpine nginx -t
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
EOF
}

restart_shared_proxy_if_present() {
  echo "🔄 Refreshing shared public proxy upstreams..."
  ssh ${DROPLET_USER}@${DROPLET_IP} "docker ps --format '{{.Names}}' | grep -qx 'shared-nginx-proxy' && docker restart shared-nginx-proxy >/dev/null || true"
}

# 1. Build webapp locally (clear all caches to avoid stale builds)
echo "📦 Building webapp locally..."
cd apps/universal-app
export EXPO_PUBLIC_API_BASE_URL=https://wondertales.art
export_expo_public_env_vars "$PROJECT_ROOT/.env.production"

# Clear Metro/Expo caches (stale cache can produce old scheme like kazka://)
rm -rf .expo node_modules/.cache 2>/dev/null || true
pnpm build:web:clean
mkdir -p dist/.well-known
cp public/.well-known/security.txt dist/.well-known/security.txt

cd "$PROJECT_ROOT"

# 2. Verify build has correct scheme (wondertales://, not kazka://)
echo "🔍 Verifying build..."
if grep -rq "kazka://" apps/universal-app/dist/ 2>/dev/null; then
  echo "❌ ERROR: Build contains kazka:// - stale cache? Run: cd apps/universal-app && rm -rf .expo node_modules/.cache && pnpm build:web:clean"
  exit 1
fi
if ! grep -rq "wondertales://" apps/universal-app/dist/ 2>/dev/null; then
  echo "❌ ERROR: Build missing wondertales:// - check linking config in App.tsx"
  exit 1
fi
echo "   ✓ Build verified (wondertales://)"

EXPO_BUNDLE=$(find apps/universal-app/dist/_expo/static/js/web -maxdepth 1 -type f -name '*.js' | head -n 1)
if [ -z "$EXPO_BUNDLE" ]; then
  echo "❌ ERROR: Could not find Expo web bundle in apps/universal-app/dist/_expo/static/js/web"
  exit 1
fi

EXPO_BUNDLE_HASH=$(shasum -a 256 "$EXPO_BUNDLE" | awk '{print substr($1, 1, 12)}')

if ! grep -q '__WT_WEB_BUILD_ID__' apps/universal-app/dist/index.html; then
  echo "❌ ERROR: Web build is missing the build version placeholder"
  exit 1
fi
perl -0pi -e "s/__WT_WEB_BUILD_ID__/${EXPO_BUNDLE_HASH}/g" \
  apps/universal-app/dist/index.html \
  apps/universal-app/dist/build-version.json \
  apps/universal-app/dist/manifest.json
echo "   ✓ Embedded web build version: ${EXPO_BUNDLE_HASH}"

mkdir -p apps/universal-app/dist/static/js
cp "$EXPO_BUNDLE" apps/universal-app/dist/static/js/bundle.js
echo "   ✓ Created SSR compatibility bundle at /static/js/bundle.js"

# 3. Create tarball
echo "📦 Creating tarball..."
cd apps/universal-app
create_deploy_tarball dist.tar.gz dist/
cd "$PROJECT_ROOT"

# 4. Upload to droplet
echo "⬆️  Uploading to droplet..."
scp apps/universal-app/dist.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/

# 5. Sync nginx/compose before recreating webapp, so new volume mounts apply
sync_nginx_config

echo "🔖 Updating WEB_BUILD_ID for SSR..."
upsert_remote_env_var "${DROPLET_PATH}/.env.production" "WEB_BUILD_ID" "${EXPO_BUNDLE_HASH}"
echo "   ✓ WEB_BUILD_ID=${EXPO_BUNDLE_HASH}"

# 6. Extract on droplet and recreate
echo "🔄 Extracting and recreating services..."
ssh ${DROPLET_USER}@${DROPLET_IP} << 'EOF'
cd /var/www/kazka
mkdir -p apps/universal-app
rm -rf apps/universal-app/dist
tar -xzf dist.tar.gz -C apps/universal-app/
rm -f dist.tar.gz
# Sync /var/www/kazka/dist if it exists (grep found old files there - may be used by nginx)
if [ -e dist ]; then
  rm -rf dist
  ln -sfn apps/universal-app/dist dist
fi
docker compose -f docker-compose.prod.yml up -d --force-recreate api webapp
docker compose -f docker-compose.prod.yml ps
EOF

restart_shared_proxy_if_present

# 7. Cleanup
echo "🧹 Cleaning up..."
rm apps/universal-app/dist.tar.gz

echo "✅ Deployment complete!"
echo "🌐 Check: https://wondertales.art"
