#!/usr/bin/env bash

# Cron-friendly production monitor wrapper.
#
# Runs check-production-ops.sh, prints the full report, and sends a compact
# webhook alert when the check fails or, optionally, when warnings are present.
#
# Usage:
#   OPS_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/monitor-production-ops.sh
#   OPS_ALERT_WEBHOOK_URL=https://example.com/webhook OPS_ALERT_ON_WARNINGS=1 ./scripts/monitor-production-ops.sh --backup-smoke
#   ./scripts/monitor-production-ops.sh --test-alert --dry-run-alert

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

OPS_ALERT_WEBHOOK_URL="${OPS_ALERT_WEBHOOK_URL:-}"
OPS_ALERT_ON_WARNINGS="${OPS_ALERT_ON_WARNINGS:-0}"
OPS_ALERT_TAIL_LINES="${OPS_ALERT_TAIL_LINES:-80}"
OPS_ALERT_TITLE_PREFIX="${OPS_ALERT_TITLE_PREFIX:-WonderTales production ops}"

DRY_RUN_ALERT=0
FORCE_ALERT=0
TEST_ALERT=0
CHECK_ARGS=()

usage() {
  sed -n '1,14p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --backup-smoke)
      CHECK_ARGS+=("--backup-smoke")
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
  "${SCRIPT_DIR}/check-production-ops.sh" "${CHECK_ARGS[@]}" > "$tmp_report" 2>&1
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

title="${OPS_ALERT_TITLE_PREFIX}: ${severity}"
summary="status=${check_status} failures=${failures} warnings=${warnings}"
tail_lines="$(tail -n "$OPS_ALERT_TAIL_LINES" "$tmp_report")"

payload="$(
  OPS_ALERT_TITLE="$title" \
  OPS_ALERT_SUMMARY="$summary" \
  OPS_ALERT_BODY="$tail_lines" \
  node <<'NODE'
const title = process.env.OPS_ALERT_TITLE || 'WonderTales production ops';
const summary = process.env.OPS_ALERT_SUMMARY || '';
const body = process.env.OPS_ALERT_BODY || '';
console.log(JSON.stringify({
  text: `${title}\n${summary}\n\n${body}`,
}));
NODE
)"

if [[ "$DRY_RUN_ALERT" == "1" ]]; then
  echo "Dry-run alert payload:"
  printf '%s\n' "$payload"
  exit "$check_status"
fi

if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
  echo "WARN alert not sent; OPS_ALERT_WEBHOOK_URL is not configured" >&2
  exit "$check_status"
fi

curl -fsS \
  --max-time 15 \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  "$OPS_ALERT_WEBHOOK_URL" >/dev/null

echo "Alert sent."
exit "$check_status"
