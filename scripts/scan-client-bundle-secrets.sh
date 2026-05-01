#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-${ROOT_DIR}/apps/universal-app/dist}"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "Client bundle directory does not exist: ${DIST_DIR}"
  echo "Run pnpm --filter wondertales-universal-app build:web before scanning."
  exit 1
fi

FORBIDDEN_PATTERN='DATABASE_URL|POSTGRES_PASSWORD|REDIS_URL|JWT_SECRET|SESSION_SECRET|COOKIE_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|RESEND_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_CLIENT_SECRET|GOOGLE_APPLICATION_CREDENTIALS|APPLE_CLIENT_SECRET|AWS_SECRET_ACCESS_KEY|DO_SPACES_SECRET_ACCESS_KEY|S3_SECRET_ACCESS_KEY|ELEVENLABS_API_KEY|-----BEGIN PRIVATE KEY-----|sk_live_|sk_test_|rk_live_|whsec_'

matches="$(
  find "${DIST_DIR}" -type f \
    \( -name '*.html' \
      -o -name '*.js' \
      -o -name '*.css' \
      -o -name '*.json' \
      -o -name '*.map' \
      -o -name '*.txt' \
      -o -name '*.xml' \
      -o -name '*.webmanifest' \) \
    -print0 \
    | xargs -0 rg -n --no-heading -i -e "${FORBIDDEN_PATTERN}" || true
)"

if [[ -n "${matches}" ]]; then
  echo "Client bundle secret scan failed. Forbidden server-side secret markers were found:"
  echo "${matches}"
  exit 1
fi

echo "Client bundle secret scan passed."
