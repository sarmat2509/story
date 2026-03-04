#!/bin/bash

# Diagnose OAuth 501/502 on droplet
# Usage: ./scripts/check-oauth.sh

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"

echo "🔍 OAuth diagnostic for magic-sleep-time.duckdns.org"
echo ""

echo "1️⃣ API container status:"
ssh ${DROPLET_USER}@${DROPLET_IP} "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml ps api"
echo ""

echo "2️⃣ Google OAuth env vars (GOOGLE_CLIENT_ID, GOOGLE_CALLBACK_URL):"
ssh ${DROPLET_USER}@${DROPLET_IP} "cd ${DROPLET_PATH} && docker exec wondertales-api-prod env | grep -E 'GOOGLE_CLIENT_ID|GOOGLE_CALLBACK_URL' | sed 's/=.*/=***/'"
echo ""

echo "3️⃣ Health check (API reachable):"
curl -s -o /dev/null -w "%{http_code}" https://magic-sleep-time.duckdns.org/health
echo " /health"
echo ""

echo "4️⃣ OAuth start - response (first request, no follow):"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -I "https://magic-sleep-time.duckdns.org/api/v1/auth/google/start"
echo ""

echo "5️⃣ Last API logs (errors):"
ssh ${DROPLET_USER}@${DROPLET_IP} "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml logs api --tail 30 2>&1 | grep -i -E 'error|oauth|google|501|502' || echo 'No matching log lines'"
echo ""
echo "   Full last 20 lines:"
ssh ${DROPLET_USER}@${DROPLET_IP} "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml logs api --tail 20"
