#!/bin/bash

# Deploy webapp to production
# Usage: ./scripts/deploy-webapp.sh

set -e

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"

echo "🚀 Starting webapp deployment..."

# 1. Build webapp locally
echo "📦 Building webapp locally..."
cd apps/universal-app
export EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
pnpm build:web
cd ../..

# 2. Create tarball
echo "📦 Creating tarball..."
cd apps/universal-app
tar -czf dist.tar.gz dist/
cd ../..

# 3. Upload to droplet
echo "⬆️  Uploading to droplet..."
scp apps/universal-app/dist.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/

# 4. Extract on droplet and restart
echo "🔄 Extracting and restarting services..."
ssh ${DROPLET_USER}@${DROPLET_IP} << 'EOF'
cd /var/www/kazka
tar -xzf dist.tar.gz -C apps/universal-app/
rm dist.tar.gz
docker compose -f docker-compose.prod.yml restart webapp
docker compose -f docker-compose.prod.yml restart nginx
docker compose -f docker-compose.prod.yml ps
EOF

# 5. Cleanup
echo "🧹 Cleaning up..."
rm apps/universal-app/dist.tar.gz

echo "✅ Deployment complete!"
echo "🌐 Check: https://magic-sleep-time.duckdns.org"
