#!/bin/bash

# Deploy API to production by building locally (avoids OOM on 1GB droplet)
# Usage: ./scripts/deploy-api-local.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"
IMAGE_NAME="kazka-api"
IMAGE_TAG="latest"

echo "🚀 Deploying API (build on local machine, deploy to droplet)..."
echo "   Project root: $PROJECT_ROOT"
echo ""

# 1. Build image locally
echo "📦 Building API image locally..."
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} \
  -f services/api/Dockerfile \
  --target production \
  .

# 2. Save to tarball
echo "📦 Saving image to tarball..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > /tmp/${IMAGE_NAME}.tar.gz

# 3. Upload to droplet
echo "⬆️  Uploading to droplet..."
scp /tmp/${IMAGE_NAME}.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/

# 4. Load and restart on droplet
echo "🔄 Loading image and restarting on droplet..."
ssh ${DROPLET_USER}@${DROPLET_IP} << EOF
cd ${DROPLET_PATH}
docker load < ${IMAGE_NAME}.tar.gz
rm -f ${IMAGE_NAME}.tar.gz
docker compose -f docker-compose.prod.yml up -d api
docker compose -f docker-compose.prod.yml logs api --tail 20
EOF

# 5. Cleanup local tarball
rm -f /tmp/${IMAGE_NAME}.tar.gz

echo ""
echo "✅ API deployment complete!"
echo "🌐 Check: https://magic-sleep-time.duckdns.org/health"
