#!/bin/bash

# Hot-fix API on droplet (rebuild locally and copy)
# Usage: ./scripts/hotfix-api.sh

set -e

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
LOCAL_DIST="services/api/dist/index.js"

echo "🔨 Building API locally..."
cd "$(dirname "$0")/.."
pnpm --filter api run build:fast

echo "📤 Uploading to droplet..."
scp ${LOCAL_DIST} ${DROPLET_USER}@${DROPLET_IP}:/tmp/api-index.js

echo "🚀 Deploying on droplet..."
ssh ${DROPLET_USER}@${DROPLET_IP} << 'EOF'
cd /var/www/kazka
docker cp /tmp/api-index.js wondertales-api-prod:/app/services/api/dist/index.js
docker compose -f docker-compose.prod.yml restart api
echo "📋 Latest logs:"
docker compose -f docker-compose.prod.yml logs api --tail 20
EOF

echo ""
echo "✅ Hot-fix deployed!"
echo "🌐 Check: https://wondertales.art/health"
