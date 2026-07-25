#!/usr/bin/env bash

# Droplet-local, API-independent production log monitor.
#
# Scans only log lines written since the previous successful run (10 minutes on
# the first run) and sends a compact Telegram/webhook alert when notable lines
# are found. The monitor talks to Docker and Telegram directly, so it keeps
# working when the WonderTales API container is unhealthy or stopped.
#
# Usage:
#   ./scripts/monitor-production-logs.sh --local
#   ./scripts/monitor-production-logs.sh --test-alert --dry-run-alert

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
LOG_MONITOR_SERVICES="${LOG_MONITOR_SERVICES:-api worker webapp}"
LOG_MONITOR_INGRESS_CONTAINER="${LOG_MONITOR_INGRESS_CONTAINER:-shared-nginx-proxy}"
LOG_MONITOR_INITIAL_SINCE="${LOG_MONITOR_INITIAL_SINCE:-10m}"
LOG_MONITOR_PATTERN="${LOG_MONITOR_PATTERN:-error|warn|failed|fatal|panic|unhandled|exception|temporary file}"
LOG_MONITOR_CURSOR_FILE="${LOG_MONITOR_CURSOR_FILE:-${PROJECT_ROOT}/logs/production-log-monitor.cursor}"
LOG_MONITOR_LOCK_FILE="${LOG_MONITOR_LOCK_FILE:-${PROJECT_ROOT}/logs/production-log-monitor.lock}"
LOG_MONITOR_REPORT_HINT="${LOG_MONITOR_REPORT_HINT:-Inspect Docker logs on the droplet for the reported interval.}"
LOG_ALERT_TITLE_PREFIX="${LOG_ALERT_TITLE_PREFIX:-WonderTales · Logs}"
LOG_ALERT_TELEGRAM_BOT_TOKEN="${LOG_ALERT_TELEGRAM_BOT_TOKEN:-${OPS_ALERT_TELEGRAM_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}}"
LOG_ALERT_TELEGRAM_CHAT_ID="${LOG_ALERT_TELEGRAM_CHAT_ID:-${OPS_ALERT_TELEGRAM_CHAT_ID:-${TELEGRAM_CHAT_ID:-}}}"
LOG_ALERT_WEBHOOK_URL="${LOG_ALERT_WEBHOOK_URL:-${OPS_ALERT_WEBHOOK_URL:-}}"

DRY_RUN_ALERT=0
TEST_ALERT=0

usage() {
  sed -n '1,13p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
    --local)
      ;;
    --dry-run-alert)
      DRY_RUN_ALERT=1
      ;;
    --test-alert)
      TEST_ALERT=1
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

mkdir -p "$(dirname "$LOG_MONITOR_CURSOR_FILE")" "$(dirname "$LOG_MONITOR_LOCK_FILE")"
exec 9>"$LOG_MONITOR_LOCK_FILE"
if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
  echo "Another production log monitor run is still active; skipping."
  exit 0
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

scan_end="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
scan_since="$LOG_MONITOR_INITIAL_SINCE"
if [[ -f "$LOG_MONITOR_CURSOR_FILE" ]]; then
  cursor="$(tr -d '[:space:]' < "$LOG_MONITOR_CURSOR_FILE")"
  if [[ "$cursor" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    scan_since="$cursor"
  fi
fi

report_file="${tmp_dir}/report.txt"
collection_failures=0
match_total=0
problem_count=0

{
  echo "Production log monitor"
  echo "Interval: ${scan_since} → ${scan_end}"
  echo
} > "$report_file"

scan_source() {
  local label="$1"
  shift
  local raw_file="${tmp_dir}/${label}.log"
  local match_file="${tmp_dir}/${label}.matches"
  local status=0

  set +e
  "$@" > "$raw_file" 2>&1
  status=$?
  set -e

  if [[ "$status" != "0" ]]; then
    echo "FAIL Could not read ${label} logs (exit ${status})" >> "$report_file"
    collection_failures=$((collection_failures + 1))
    problem_count=$((problem_count + 1))
    return
  fi

  grep -i -E -- "$LOG_MONITOR_PATTERN" "$raw_file" > "$match_file" || true
  local count
  count="$(wc -l < "$match_file" | tr -d ' ')"
  count="${count:-0}"

  if (( count > 0 )); then
    echo "WARN ${label} contains ${count} notable log line(s)" >> "$report_file"
    match_total=$((match_total + count))
    problem_count=$((problem_count + 1))
  else
    echo "PASS ${label} contains no notable log lines" >> "$report_file"
  fi
}

if [[ "$TEST_ALERT" == "1" ]]; then
  echo "WARN api contains 2 notable log line(s) (test)" >> "$report_file"
  match_total=2
  problem_count=1
else
  read -r -a services <<<"$LOG_MONITOR_SERVICES"
  for service in "${services[@]}"; do
    [[ -n "$service" ]] || continue
    scan_source "$service" \
      docker compose -f "$COMPOSE_FILE" logs --no-color --timestamps \
      --since "$scan_since" --until "$scan_end" "$service"
  done

  if [[ -n "$LOG_MONITOR_INGRESS_CONTAINER" ]]; then
    scan_source "$LOG_MONITOR_INGRESS_CONTAINER" \
      docker logs --timestamps --since "$scan_since" --until "$scan_end" \
      "$LOG_MONITOR_INGRESS_CONTAINER"
  fi
fi

{
  echo
  echo "Matched lines: $match_total"
  echo "Collection failures: $collection_failures"
  echo
  echo "== Summary =="
  echo "Failures: $collection_failures"
  echo "Warnings: $problem_count"
} >> "$report_file"

cat "$report_file"

write_cursor() {
  local cursor_tmp="${LOG_MONITOR_CURSOR_FILE}.tmp.$$"
  printf '%s\n' "$scan_end" > "$cursor_tmp"
  chmod 600 "$cursor_tmp"
  mv "$cursor_tmp" "$LOG_MONITOR_CURSOR_FILE"
}

if (( problem_count == 0 )); then
  write_cursor
  echo "No alert sent."
  exit 0
fi

severity="warning"
if (( collection_failures > 0 )); then
  severity="critical"
fi

alert="$(
  TELEGRAM_ALERT_HELPER="${SCRIPT_DIR}/lib/telegram-alert.js" \
  LOG_ALERT_TITLE_PREFIX="$LOG_ALERT_TITLE_PREFIX" \
  LOG_ALERT_SEVERITY="$severity" \
  LOG_ALERT_FAILURES="$collection_failures" \
  LOG_ALERT_WARNINGS="$problem_count" \
  LOG_ALERT_REPORT_PATH="$report_file" \
  LOG_MONITOR_REPORT_HINT="$LOG_MONITOR_REPORT_HINT" \
  node <<'NODE'
const fs = require('node:fs');
const { buildOpsAlert } = require(process.env.TELEGRAM_ALERT_HELPER);

console.log(JSON.stringify(buildOpsAlert({
  titlePrefix: process.env.LOG_ALERT_TITLE_PREFIX,
  severity: process.env.LOG_ALERT_SEVERITY,
  checkStatus: Number(process.env.LOG_ALERT_FAILURES || 0) > 0 ? '1' : '0',
  failures: process.env.LOG_ALERT_FAILURES,
  warnings: process.env.LOG_ALERT_WARNINGS,
  report: fs.readFileSync(process.env.LOG_ALERT_REPORT_PATH, 'utf8'),
  fullReportHint: process.env.LOG_MONITOR_REPORT_HINT,
})));
NODE
)"

if [[ "$DRY_RUN_ALERT" == "1" ]]; then
  echo "Dry-run Telegram alert:"
  printf '%s' "$alert" | node "${SCRIPT_DIR}/lib/telegram-alert.js" preview
  exit 0
fi

delivery_status=1
if [[ -n "$LOG_ALERT_TELEGRAM_BOT_TOKEN" && -n "$LOG_ALERT_TELEGRAM_CHAT_ID" ]]; then
  set +e
  printf '%s' "$alert" | \
    TELEGRAM_BOT_TOKEN="$LOG_ALERT_TELEGRAM_BOT_TOKEN" \
    TELEGRAM_CHAT_ID="$LOG_ALERT_TELEGRAM_CHAT_ID" \
    node "${SCRIPT_DIR}/lib/telegram-alert.js" deliver
  delivery_status=$?
  set -e
fi

if [[ "$delivery_status" != "0" && -n "$LOG_ALERT_WEBHOOK_URL" ]]; then
  payload="$(
    ALERT_PAYLOAD="$alert" \
      node -e "const alert=JSON.parse(process.env.ALERT_PAYLOAD); console.log(JSON.stringify({text: alert.text}))"
  )"
  set +e
  curl -fsS --max-time 15 -H 'Content-Type: application/json' \
    -d "$payload" "$LOG_ALERT_WEBHOOK_URL" >/dev/null
  delivery_status=$?
  set -e
fi

if [[ "$delivery_status" != "0" ]]; then
  echo "ERROR log alert delivery failed or no alert destination is configured" >&2
  exit 1
fi

write_cursor
echo "Production log alert sent."

