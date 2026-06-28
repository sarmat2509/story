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
VOICE_SAMPLES_TARBALL="/tmp/wondertales-voice-samples.tar.gz"

sync_voice_samples() {
  local voice_samples_dir="${PROJECT_ROOT}/services/api/uploads/voice-samples"
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

  echo "🔊 Syncing localized voice samples (${voice_sample_count} files)..."
  COPYFILE_DISABLE=1 tar --no-xattrs -czf "${VOICE_SAMPLES_TARBALL}" \
    -C "${PROJECT_ROOT}/services/api/uploads" voice-samples
  scp "${VOICE_SAMPLES_TARBALL}" ${DROPLET_USER}@${DROPLET_IP}:/tmp/wondertales-voice-samples.tar.gz
  rm -f "${VOICE_SAMPLES_TARBALL}"

  ssh ${DROPLET_USER}@${DROPLET_IP} << 'EOF'
docker cp /tmp/wondertales-voice-samples.tar.gz wondertales-api-prod:/tmp/wondertales-voice-samples.tar.gz
docker exec wondertales-api-prod sh -lc '
  mkdir -p /app/services/api/uploads
  tar -xzf /tmp/wondertales-voice-samples.tar.gz -C /app/services/api/uploads
  find /app/services/api/uploads/voice-samples -type f -name "._*.mp3" -delete
  rm -f /tmp/wondertales-voice-samples.tar.gz
'
rm -f /tmp/wondertales-voice-samples.tar.gz
EOF
}

echo "🚀 Deploying API (build on local machine, deploy to droplet)..."
echo "   Project root: $PROJECT_ROOT"
echo ""

# 1. Build image locally for linux/amd64 (droplet platform)
echo "📦 Building API image locally (linux/amd64)..."
docker build --platform linux/amd64 -t ${IMAGE_NAME}:${IMAGE_TAG} \
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
docker compose -f docker-compose.prod.yml restart nginx
docker compose -f docker-compose.prod.yml logs api --tail 20
EOF

sync_voice_samples

# 5. Cleanup local tarball
rm -f /tmp/${IMAGE_NAME}.tar.gz

echo ""
echo "✅ API deployment complete!"
echo "🌐 Check: https://wondertales.art/health"
