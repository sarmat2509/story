#!/bin/bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
REMOTE="${DROPLET_USER}@${DROPLET_IP}"

create_deploy_tarball() {
  local output="$1"
  shift

  COPYFILE_DISABLE=1 tar --no-xattrs -czf "${output}" "$@"
}

tarball="/tmp/kazka-shared-proxy-handoff.tar.gz"

echo "Creating handoff bundle from local story repo"
create_deploy_tarball "${tarball}" \
  docker-compose.prod.yml \
  nginx/nginx.conf \
  nginx/conf.d \
  nginx/includes \
  apps/universal-app/nginx.conf

echo "Uploading handoff bundle to ${REMOTE}:${DROPLET_PATH}"
ssh "${REMOTE}" "mkdir -p '${DROPLET_PATH}/nginx/conf.d' '${DROPLET_PATH}/nginx/includes' '${DROPLET_PATH}/apps/universal-app'"
scp "${tarball}" "${REMOTE}:${DROPLET_PATH}/"
rm -f "${tarball}"

ssh "${REMOTE}" << EOF
set -Eeuo pipefail
cd "${DROPLET_PATH}"
tar -xzf kazka-shared-proxy-handoff.tar.gz
rm -f kazka-shared-proxy-handoff.tar.gz
find nginx -name '._*' -delete

docker compose -f docker-compose.prod.yml config >/tmp/kazka-compose-shared-proxy-handoff.yml
if grep -Eq '^[[:space:]]*published:[[:space:]]*"?(80|443)"?$' /tmp/kazka-compose-shared-proxy-handoff.yml; then
  echo "docker-compose.prod.yml still publishes port 80 or 443"
  exit 1
fi

docker run --rm \
  --add-host api:127.0.0.1 \
  --add-host webapp:127.0.0.1 \
  -v "${DROPLET_PATH}/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "${DROPLET_PATH}/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "${DROPLET_PATH}/nginx/includes:/etc/nginx/includes:ro" \
  -v "${DROPLET_PATH}/certbot/conf:/etc/letsencrypt:ro" \
  -v "${DROPLET_PATH}/certbot/www:/var/www/certbot:ro" \
  nginx:alpine nginx -t

echo "Kazka handoff config synced and validated"
EOF
