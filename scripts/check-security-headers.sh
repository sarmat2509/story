#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "Security header check failed: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "${ROOT_DIR}/${path}" ]] || fail "missing ${path}"
}

require_text() {
  local path="$1"
  local text="$2"
  grep -Fq -- "${text}" "${ROOT_DIR}/${path}" || fail "${path} is missing: ${text}"
}

require_regex() {
  local path="$1"
  local pattern="$2"
  grep -Eq -- "${pattern}" "${ROOT_DIR}/${path}" || fail "${path} does not match: ${pattern}"
}

WEBAPP_HEADERS="nginx/includes/webapp-security-headers.conf"
SPA_PROXY_PROD="nginx/includes/spa-proxy-prod.conf"
WEBAPP_NGINX="apps/universal-app/nginx.conf"
WEBAPP_DOCKERFILE="apps/universal-app/Dockerfile"
PROD_COMPOSE="docker-compose.prod.yml"
API_INDEX="services/api/src/index.ts"

require_file "${WEBAPP_HEADERS}"
require_file "${SPA_PROXY_PROD}"
require_file "${WEBAPP_NGINX}"
require_file "${WEBAPP_DOCKERFILE}"
require_file "${PROD_COMPOSE}"
require_file "${API_INDEX}"

for directive in \
  "Content-Security-Policy" \
  "default-src 'self'" \
  "base-uri 'self'" \
  "object-src 'none'" \
  "frame-ancestors 'self'" \
  "script-src 'self'" \
  "style-src 'self' 'unsafe-inline'" \
  "img-src 'self' data: blob: https:" \
  "font-src 'self' data:" \
  "connect-src 'self'" \
  "media-src 'self' blob: https:" \
  "manifest-src 'self'" \
  "worker-src 'self' blob:" \
  "form-action 'self'" \
  "upgrade-insecure-requests" \
  "X-Frame-Options" \
  "X-Content-Type-Options" \
  "Strict-Transport-Security" \
  "Referrer-Policy" \
  "Permissions-Policy" \
  "Cross-Origin-Opener-Policy"
do
  require_text "${WEBAPP_HEADERS}" "${directive}"
done

for source in "https://*.i.posthog.com" "https://*.posthog.com"; do
  require_text "${WEBAPP_HEADERS}" "${source}"
done

require_text "${WEBAPP_HEADERS}" "Stripe Checkout/Portal, Google OAuth, and Apple OAuth use top-level redirects"
require_text "${WEBAPP_NGINX}" "include /etc/nginx/includes/webapp-security-headers.conf;"
require_text "${WEBAPP_DOCKERFILE}" "COPY nginx/includes/webapp-security-headers.conf /etc/nginx/includes/webapp-security-headers.conf"
require_text "${PROD_COMPOSE}" "./nginx/includes:/etc/nginx/includes:ro"
require_text "${SPA_PROXY_PROD}" "proxy_buffer_size 64k;"
require_text "${SPA_PROXY_PROD}" "proxy_buffers 32 256k;"
require_text "${SPA_PROXY_PROD}" "proxy_busy_buffers_size 512k;"
require_text "${SPA_PROXY_PROD}" "proxy_max_temp_file_size 0;"

include_count="$(grep -Fc "include /etc/nginx/includes/webapp-security-headers.conf;" "${ROOT_DIR}/${WEBAPP_NGINX}")"
if [[ "${include_count}" -lt 4 ]]; then
  fail "${WEBAPP_NGINX} should include security headers at server level and add_header locations"
fi

require_text "${API_INDEX}" "const posthogSources = ['https://*.i.posthog.com', 'https://*.posthog.com'];"
require_text "${API_INDEX}" "const apiConnectSources = ["
require_regex "${API_INDEX}" "connectSrc:[[:space:]]*apiConnectSources"

if grep -Eq "connectSrc:[^\\n]*'https:'" "${ROOT_DIR}/${API_INDEX}"; then
  fail "${API_INDEX} still allows broad https: in connect-src"
fi

echo "Security header check passed."
