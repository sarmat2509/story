#!/usr/bin/env bash
# Issue Let's Encrypt cert via webroot (HTTP-01). Intended to run ON THE DROPLET
# from /var/www/kazka after: DNS A/AAAA for wondertales.art and www → this host, port 80 open,
# nginx container up (serves /.well-known/acme-challenge/ from certbot/www).
#
# Usage on server:
#   cd /var/www/kazka
#   CERTBOT_EMAIL=you@example.com ./scripts/certbot-webroot-issue.sh
#   CERTBOT_EMAIL=you@example.com ./scripts/certbot-webroot-issue.sh --staging   # test only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_PATH="${DROPLET_PATH:-$(pwd)}"
EMAIL="${CERTBOT_EMAIL:-}"
STAGING_FLAG=()

for arg in "$@"; do
  if [[ "$arg" == "--staging" ]]; then
    STAGING_FLAG=(--staging)
  fi
done

if [[ -z "$EMAIL" ]]; then
  echo "Set CERTBOT_EMAIL, e.g.:"
  echo "  CERTBOT_EMAIL=you@example.com $0"
  exit 1
fi

if [[ ! -d "${DROPLET_PATH}/certbot/conf" || ! -d "${DROPLET_PATH}/certbot/www" ]]; then
  echo "Expected ${DROPLET_PATH}/certbot/{conf,www} — run from project root on the server (e.g. cd /var/www/kazka)."
  exit 1
fi

DOMAINS=( -d wondertales.art -d www.wondertales.art )

echo "Using webroot: ${DROPLET_PATH}/certbot/www"
echo "Using LE config: ${DROPLET_PATH}/certbot/conf"
echo "Domains: ${DOMAINS[*]}"
echo ""

docker run --rm \
  -v "${DROPLET_PATH}/certbot/conf:/etc/letsencrypt" \
  -v "${DROPLET_PATH}/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  "${DOMAINS[@]}" \
  --expand \
  --email "${EMAIL}" \
  --agree-tos \
  -n \
  "${STAGING_FLAG[@]}"

echo ""
echo "Check: ls -la ${DROPLET_PATH}/certbot/conf/live/wondertales.art/"
echo "Then: docker compose -f docker-compose.prod.yml restart nginx"
