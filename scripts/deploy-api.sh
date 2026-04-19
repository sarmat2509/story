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
echo "🌐 Check: https://wondertales.art/health"
echo ""
echo "📋 Useful commands:"
echo "  View logs:   ssh root@167.172.102.75 \"cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 100\""
echo "  Follow logs: ssh root@167.172.102.75 \"cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f\""
echo "  Find errors: ssh root@167.172.102.75 \"cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 500\" | grep -i error"
echo ""
echo "📖 Deployment and ops: docs/DEPLOYMENT.md"
