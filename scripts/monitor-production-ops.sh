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
OPS_ALERT_TITLE_PREFIX="${OPS_ALERT_TITLE_PREFIX:-WonderTales production ops}"
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
tmp_payload_builder="$(mktemp)"
cleanup() {
  rm -f "$tmp_report" "$tmp_payload_builder"
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

cat > "$tmp_payload_builder" <<'NODE'
const fs = require('fs');

const titlePrefix = process.env.OPS_ALERT_TITLE_PREFIX || 'WonderTales production ops';
const severity = process.env.OPS_ALERT_SEVERITY || 'info';
const checkStatus = process.env.OPS_ALERT_CHECK_STATUS || '0';
const failures = process.env.OPS_ALERT_FAILURES || '0';
const warnings = process.env.OPS_ALERT_WARNINGS || '0';
const reportPath = process.env.OPS_ALERT_REPORT_PATH || '';
const includeFullReport = process.env.OPS_ALERT_INCLUDE_FULL_REPORT === '1';
const tailLines = Number.parseInt(process.env.OPS_ALERT_TAIL_LINES || '80', 10);
const fullReportHint = process.env.OPS_ALERT_FULL_REPORT_HINT || '';

const report = reportPath ? fs.readFileSync(reportPath, 'utf8') : '';
const lines = report.split(/\r?\n/).filter(Boolean);

function findLine(pattern) {
  return lines.find((line) => pattern.test(line)) || '';
}

function summarizeService(line) {
  const match = line.match(/^PASS (wondertales-[a-z-]+) is running \(health=([^,]+), restarts=([^)]+)\)/);
  if (!match) return '';
  const name = match[1]
    .replace(/^wondertales-/, '')
    .replace(/-prod$/, '');
  const health = match[2] === 'none' ? 'up' : match[2];
  return `${name} ${health}, restarts ${match[3]}`;
}

function compact(line) {
  return line
    .replace(/^PASS /, '')
    .replace(/^WARN /, '')
    .replace(/^FAIL /, '')
    .trim();
}

const problemLines = lines
  .filter((line) => /^(FAIL|WARN) /.test(line))
  .map((line) => `- ${compact(line)}`);

const services = lines
  .map(summarizeService)
  .filter(Boolean);

const rootDisk = compact(findLine(/^PASS root filesystem has /));
const dbBackup = compact(findLine(/^PASS recent database backup file exists /));
const uploadBackup = compact(findLine(/^PASS recent upload-volume backup archive exists /));
const logs = compact(findLine(/^PASS recent api webapp nginx logs /));
const stripe = compact(findLine(/^PASS api Stripe secret key mode /));
const offsite = compact(findLine(/^PASS offsite backup target reference found/));
const alertDestination = compact(findLine(/^PASS ops alert destination reference found/));
const adminAlert = compact(findLine(/^PASS admin dashboard alert destination reference found/));

const sections = [];
sections.push(`${titlePrefix} | ${severity.toUpperCase()}`);
sections.push(`failures ${failures} | warnings ${warnings} | exit ${checkStatus}`);

sections.push('');
sections.push('Needs attention');
sections.push(problemLines.length ? problemLines.join('\n') : '- none');

const healthLines = [];
if (services.length) healthLines.push(`- services: ${services.join('; ')}`);
if (rootDisk) healthLines.push(`- disk: ${rootDisk}`);
if (dbBackup) healthLines.push(`- database backups: ${dbBackup}`);
if (uploadBackup) healthLines.push(`- upload backups: ${uploadBackup}`);
if (logs) healthLines.push(`- logs: ${logs}`);
if (stripe) healthLines.push(`- payments: ${stripe}`);
if (offsite) healthLines.push(`- offsite: ${offsite}`);
if (alertDestination || adminAlert) {
  const alertBits = [alertDestination, adminAlert].filter(Boolean);
  healthLines.push(`- alerts: ${alertBits.join('; ')}`);
}

if (healthLines.length) {
  sections.push('');
  sections.push('Current state');
  sections.push(healthLines.join('\n'));
}

if (fullReportHint) {
  sections.push('');
  sections.push(fullReportHint);
}

if (includeFullReport) {
  const tail = lines.slice(Math.max(0, lines.length - tailLines)).join('\n');
  sections.push('');
  sections.push('Report tail');
  sections.push(tail);
}

console.log(JSON.stringify({
  text: sections.join('\n'),
}));
NODE
payload="$(
  OPS_ALERT_TITLE_PREFIX="$OPS_ALERT_TITLE_PREFIX" \
  OPS_ALERT_SEVERITY="$severity" \
  OPS_ALERT_CHECK_STATUS="$check_status" \
  OPS_ALERT_FAILURES="$failures" \
  OPS_ALERT_WARNINGS="$warnings" \
  OPS_ALERT_REPORT_PATH="$tmp_report" \
  OPS_ALERT_TAIL_LINES="$OPS_ALERT_TAIL_LINES" \
  OPS_ALERT_INCLUDE_FULL_REPORT="$OPS_ALERT_INCLUDE_FULL_REPORT" \
  OPS_ALERT_FULL_REPORT_HINT="$OPS_ALERT_FULL_REPORT_HINT" \
  node "$tmp_payload_builder"
)"

if [[ "$DRY_RUN_ALERT" == "1" ]]; then
  echo "Dry-run alert payload:"
  printf '%s\n' "$payload"
  exit "$check_status"
fi

if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
  if [[ -n "$OPS_ALERT_TELEGRAM_BOT_TOKEN" && -n "$OPS_ALERT_TELEGRAM_CHAT_ID" ]]; then
    alert_text="$(
      ALERT_PAYLOAD="$payload" node <<'NODE'
const payload = JSON.parse(process.env.ALERT_PAYLOAD || '{}');
const limit = 3900;
let text = String(payload.text || '');
if (text.length > limit) text = `${text.slice(0, limit)}\n...truncated`;
console.log(text);
NODE
    )"
    curl -fsS \
      --max-time 15 \
      -X POST "https://api.telegram.org/bot${OPS_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${OPS_ALERT_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${alert_text}" >/dev/null

    echo "Telegram alert sent."
    exit "$check_status"
  fi

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
