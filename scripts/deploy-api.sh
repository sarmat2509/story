#!/bin/bash

# Deploy API to production droplet
# Prerequisites: git push origin main (done manually)
# Usage: ./scripts/deploy-api.sh

set -e

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"

echo "🚀 Starting API deployment..."
echo "⚠️  Make sure you've pushed to GitHub first: git push origin main"
echo ""

# Pull on droplet and rebuild
echo "🔄 Pulling and rebuilding on droplet..."
ssh ${DROPLET_USER}@${DROPLET_IP} << 'ENDSSH'
cd /var/www/kazka
echo "📥 Pulling latest code..."
git pull origin main
echo "🔨 Building API..."
docker compose -f docker-compose.prod.yml build api
echo "🚀 Restarting API..."
docker compose -f docker-compose.prod.yml up -d api
echo "📋 Latest logs:"
docker compose -f docker-compose.prod.yml logs api --tail 30
ENDSSH

echo ""
echo "✅ API deployment complete!"
echo "🌐 Check: https://magic-sleep-time.duckdns.org/health"
