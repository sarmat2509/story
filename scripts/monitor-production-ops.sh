#!/usr/bin/env bash

# Cron-friendly production monitor wrapper.
#
# Runs check-production-ops.sh, prints the full report, and sends a compact
# webhook alert when the check fails or, optionally, when warnings are present.
#
# Usage:
#   OPS_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/monitor-production-ops.sh
#   OPS_ALERT_TELEGRAM_BOT_TOKEN=... OPS_ALERT_TELEGRAM_CHAT_ID=... ./scripts/monitor-production-ops.sh
#   OPS_ALERT_WEBHOOK_URL=https://example.com/webhook OPS_ALERT_ON_WARNINGS=1 ./scripts/monitor-production-ops.sh --backup-smoke
#   ./scripts/monitor-production-ops.sh --local
#   ./scripts/monitor-production-ops.sh --test-alert --dry-run-alert

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

OPS_ALERT_WEBHOOK_URL="${OPS_ALERT_WEBHOOK_URL:-}"
OPS_ALERT_TELEGRAM_BOT_TOKEN="${OPS_ALERT_TELEGRAM_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
OPS_ALERT_TELEGRAM_CHAT_ID="${OPS_ALERT_TELEGRAM_CHAT_ID:-${TELEGRAM_CHAT_ID:-}}"
OPS_ALERT_ON_WARNINGS="${OPS_ALERT_ON_WARNINGS:-0}"
OPS_ALERT_TAIL_LINES="${OPS_ALERT_TAIL_LINES:-80}"
OPS_ALERT_TITLE_PREFIX="${OPS_ALERT_TITLE_PREFIX:-WonderTales · Production}"
OPS_ALERT_INCLUDE_FULL_REPORT="${OPS_ALERT_INCLUDE_FULL_REPORT:-0}"
OPS_ALERT_FULL_REPORT_HINT="${OPS_ALERT_FULL_REPORT_HINT:-Full report: /var/www/kazka/logs/production-ops-monitor.log}"

DRY_RUN_ALERT=0
FORCE_ALERT=0
TEST_ALERT=0
CHECK_ARGS=()

usage() {
  sed -n '1,14p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
    --backup-smoke)
      CHECK_ARGS+=("--backup-smoke")
      ;;
    --local)
      CHECK_ARGS+=("--local")
      ;;
    --dry-run-alert)
      DRY_RUN_ALERT=1
      ;;
    --force-alert)
      FORCE_ALERT=1
      ;;
    --test-alert)
      TEST_ALERT=1
      FORCE_ALERT=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

tmp_report="$(mktemp)"
cleanup() {
  rm -f "$tmp_report"
}
trap cleanup EXIT

if [[ "$TEST_ALERT" == "1" ]]; then
  {
    echo "Production ops readiness check"
    echo "Target: test"
    echo
    echo "== Summary =="
    echo "Failures: 0"
    echo "Warnings: 0"
  } > "$tmp_report"
  check_status=0
else
  set +e
  if ((${#CHECK_ARGS[@]} > 0)); then
    "${SCRIPT_DIR}/check-production-ops.sh" "${CHECK_ARGS[@]}" > "$tmp_report" 2>&1
  else
    "${SCRIPT_DIR}/check-production-ops.sh" > "$tmp_report" 2>&1
  fi
  check_status=$?
  set -e
fi

cat "$tmp_report"

failures="$(awk '/^Failures:/ {print $2}' "$tmp_report" | tail -n 1)"
warnings="$(awk '/^Warnings:/ {print $2}' "$tmp_report" | tail -n 1)"
failures="${failures:-0}"
warnings="${warnings:-0}"

severity="info"
should_alert=0

if [[ "$check_status" != "0" || ! "$failures" =~ ^[0-9]+$ || "$failures" -gt 0 ]]; then
  severity="critical"
  should_alert=1
elif [[ "$warnings" =~ ^[0-9]+$ && "$warnings" -gt 0 && "$OPS_ALERT_ON_WARNINGS" == "1" ]]; then
  severity="warning"
  should_alert=1
elif [[ "$FORCE_ALERT" == "1" ]]; then
  severity="info"
  should_alert=1
fi

if [[ "$should_alert" != "1" ]]; then
  echo "No alert sent."
  exit "$check_status"
fi

alert="$(
  TELEGRAM_ALERT_HELPER="${SCRIPT_DIR}/lib/telegram-alert.js" \
  OPS_ALERT_TITLE_PREFIX="$OPS_ALERT_TITLE_PREFIX" \
  OPS_ALERT_SEVERITY="$severity" \
  OPS_ALERT_CHECK_STATUS="$check_status" \
  OPS_ALERT_FAILURES="$failures" \
  OPS_ALERT_WARNINGS="$warnings" \
  OPS_ALERT_REPORT_PATH="$tmp_report" \
  OPS_ALERT_TAIL_LINES="$OPS_ALERT_TAIL_LINES" \
  OPS_ALERT_INCLUDE_FULL_REPORT="$OPS_ALERT_INCLUDE_FULL_REPORT" \
  OPS_ALERT_FULL_REPORT_HINT="$OPS_ALERT_FULL_REPORT_HINT" \
  node <<'NODE'
const fs = require('node:fs');
const { buildOpsAlert } = require(process.env.TELEGRAM_ALERT_HELPER);

console.log(JSON.stringify(buildOpsAlert({
  titlePrefix: process.env.OPS_ALERT_TITLE_PREFIX,
  severity: process.env.OPS_ALERT_SEVERITY,
  checkStatus: process.env.OPS_ALERT_CHECK_STATUS,
  failures: process.env.OPS_ALERT_FAILURES,
  warnings: process.env.OPS_ALERT_WARNINGS,
  report: fs.readFileSync(process.env.OPS_ALERT_REPORT_PATH, 'utf8'),
  includeFullReport: process.env.OPS_ALERT_INCLUDE_FULL_REPORT === '1',
  tailLines: process.env.OPS_ALERT_TAIL_LINES,
  fullReportHint: process.env.OPS_ALERT_FULL_REPORT_HINT,
})));
NODE
)"
payload="$(ALERT_PAYLOAD="$alert" node -e "const alert=JSON.parse(process.env.ALERT_PAYLOAD); console.log(JSON.stringify({text: alert.text}))")"

if [[ "$DRY_RUN_ALERT" == "1" ]]; then
  echo "Dry-run Telegram rich alert:"
  printf '%s' "$alert" | node "${SCRIPT_DIR}/lib/telegram-alert.js" preview
  echo
  echo "Webhook payload:"
  printf '%s\n' "$payload"
  exit "$check_status"
fi

if [[ -n "$OPS_ALERT_TELEGRAM_BOT_TOKEN" && -n "$OPS_ALERT_TELEGRAM_CHAT_ID" ]]; then
  set +e
  delivery_result="$(
    printf '%s' "$alert" | \
      TELEGRAM_BOT_TOKEN="$OPS_ALERT_TELEGRAM_BOT_TOKEN" \
      TELEGRAM_CHAT_ID="$OPS_ALERT_TELEGRAM_CHAT_ID" \
      node "${SCRIPT_DIR}/lib/telegram-alert.js" deliver
  )"
  delivery_status=$?
  set -e
  if [[ "$delivery_status" == "0" ]]; then
    delivery_summary="$(ALERT_DELIVERY_RESULT="$delivery_result" node -e "const result=JSON.parse(process.env.ALERT_DELIVERY_RESULT); console.log(result.mode + ' ' + result.action)")"
    echo "Telegram alert sent (${delivery_summary})."
    exit "$check_status"
  fi

  echo "WARN rich Telegram alert failed; trying webhook fallback" >&2
  if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
    exit "$delivery_status"
  fi
fi

if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
  echo "WARN alert not sent; OPS_ALERT_WEBHOOK_URL or OPS_ALERT_TELEGRAM_* is not configured" >&2
  exit "$check_status"
fi

curl -fsS \
  --max-time 15 \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  "$OPS_ALERT_WEBHOOK_URL" >/dev/null

echo "Alert sent."
exit "$check_status"
