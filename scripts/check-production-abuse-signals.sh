#!/usr/bin/env bash

# Read-only production log scan for rate-limit / abuse signals.
#
# Usage:
#   ./scripts/check-production-abuse-signals.sh
#   LOG_SINCE=6h ./scripts/check-production-abuse-signals.sh
#   ABUSE_SIGNAL_FAIL_ON_MATCHES=1 ./scripts/check-production-abuse-signals.sh

set -euo pipefail

DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
LOG_SINCE="${LOG_SINCE:-2h}"
FAIL_ON_MATCHES="${ABUSE_SIGNAL_FAIL_ON_MATCHES:-0}"

echo "Production abuse-signal log scan"
echo "Target: ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}"
echo "Window: ${LOG_SINCE}"

tmp_output="$(mktemp)"
cleanup() {
  rm -f "$tmp_output"
}
trap cleanup EXIT

ssh -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" \
  "cd ${DROPLET_PATH} && docker compose -f ${COMPOSE_FILE} logs api --since '${LOG_SINCE}'" \
  > "$tmp_output"

matches="$(
  grep -i -E 'abuseSignal|Rate limit exceeded|EXPENSIVE_GENERATION_RATE_LIMITED|Too many .*requests|Too many .*attempts|Received 429|rate limit' "$tmp_output" \
    | sed -E \
      -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[email]/g' \
      -e 's#(https?://)[^[:space:]"]+#\1[redacted]#g' \
      -e 's#(token|code|state|session_id|password)=([^[:space:]&"]+)#\1=[redacted]#gi' \
    || true
)"

count=0
if [[ -n "$matches" ]]; then
  count="$(printf '%s\n' "$matches" | wc -l | tr -d ' ')"
fi

if [[ "$count" == "0" ]]; then
  echo "PASS no rate-limit or abuse-signal log lines found"
  exit 0
fi

echo "WARN found ${count} rate-limit/abuse-signal log line(s)"
printf '%s\n' "$matches"

if [[ "$FAIL_ON_MATCHES" == "1" ]]; then
  exit 1
fi
