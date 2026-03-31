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

# 1. Build webapp locally (clear all caches to avoid stale builds)
echo "📦 Building webapp locally..."
cd apps/universal-app
export EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org

# Clear Metro/Expo caches (stale cache can produce old scheme like kazka://)
rm -rf .expo node_modules/.cache 2>/dev/null || true
pnpm build:web:clean

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

mkdir -p apps/universal-app/dist/static/js
cp "$EXPO_BUNDLE" apps/universal-app/dist/static/js/bundle.js
echo "   ✓ Created SSR compatibility bundle at /static/js/bundle.js"

# 3. Create tarball
echo "📦 Creating tarball..."
cd apps/universal-app
tar -czf dist.tar.gz dist/
cd "$PROJECT_ROOT"

# 4. Upload to droplet
echo "⬆️  Uploading to droplet..."
scp apps/universal-app/dist.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/

# 5. Extract on droplet and restart
echo "🔄 Extracting and restarting services..."
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
docker compose -f docker-compose.prod.yml restart webapp
docker compose -f docker-compose.prod.yml restart nginx
docker compose -f docker-compose.prod.yml ps
EOF

# 6. Cleanup
echo "🧹 Cleaning up..."
rm apps/universal-app/dist.tar.gz

echo "✅ Deployment complete!"
echo "🌐 Check: https://magic-sleep-time.duckdns.org"
