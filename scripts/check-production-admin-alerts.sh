#!/usr/bin/env bash

# Cron-friendly admin dashboard alert check.
#
# Reads the production admin dashboard and sends a compact webhook alert for
# critical cost, queue, or quality-review signals. Warnings can be included with
# ADMIN_ALERT_ON_WARNINGS=1.
#
# Usage:
#   PROD_ADMIN_ALERT_TOKEN=... ADMIN_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/check-production-admin-alerts.sh
#   PROD_ADMIN_ALERT_EMAIL=admin@example.com PROD_ADMIN_ALERT_PASSWORD=... OPS_ALERT_WEBHOOK_URL=... ./scripts/check-production-admin-alerts.sh
#   ./scripts/check-production-admin-alerts.sh --test-alert --dry-run-alert

set -euo pipefail

BASE_URL="${BASE_URL:-https://wondertales.art}"
ADMIN_ALERT_DAYS="${ADMIN_ALERT_DAYS:-7}"
ADMIN_ALERT_WEBHOOK_URL="${ADMIN_ALERT_WEBHOOK_URL:-${OPS_ALERT_WEBHOOK_URL:-}}"
ADMIN_ALERT_ON_WARNINGS="${ADMIN_ALERT_ON_WARNINGS:-0}"
ADMIN_ALERT_TITLE_PREFIX="${ADMIN_ALERT_TITLE_PREFIX:-WonderTales admin dashboard}"
PROD_ADMIN_ALERT_TOKEN="${PROD_ADMIN_ALERT_TOKEN:-${PROD_ADMIN_SMOKE_TOKEN:-}}"
PROD_ADMIN_ALERT_EMAIL="${PROD_ADMIN_ALERT_EMAIL:-${PROD_ADMIN_SMOKE_EMAIL:-}}"
PROD_ADMIN_ALERT_PASSWORD="${PROD_ADMIN_ALERT_PASSWORD:-${PROD_ADMIN_SMOKE_PASSWORD:-}}"

DRY_RUN_ALERT=0
FORCE_ALERT=0
TEST_ALERT=0

usage() {
  sed -n '1,13p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --)
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

tmp_payload="$(mktemp)"
cleanup() {
  rm -f "$tmp_payload"
}
trap cleanup EXIT

set +e
BASE_URL="$BASE_URL" \
ADMIN_ALERT_DAYS="$ADMIN_ALERT_DAYS" \
ADMIN_ALERT_ON_WARNINGS="$ADMIN_ALERT_ON_WARNINGS" \
ADMIN_ALERT_TITLE_PREFIX="$ADMIN_ALERT_TITLE_PREFIX" \
PROD_ADMIN_ALERT_TOKEN="$PROD_ADMIN_ALERT_TOKEN" \
PROD_ADMIN_ALERT_EMAIL="$PROD_ADMIN_ALERT_EMAIL" \
PROD_ADMIN_ALERT_PASSWORD="$PROD_ADMIN_ALERT_PASSWORD" \
FORCE_ALERT="$FORCE_ALERT" \
TEST_ALERT="$TEST_ALERT" \
node > "$tmp_payload" <<'NODE'
const baseUrl = (process.env.BASE_URL || 'https://wondertales.art').replace(/\/$/, '');
const days = Number.parseInt(process.env.ADMIN_ALERT_DAYS || '7', 10);
const includeWarnings = process.env.ADMIN_ALERT_ON_WARNINGS === '1';
const titlePrefix = process.env.ADMIN_ALERT_TITLE_PREFIX || 'WonderTales admin dashboard';
const forceAlert = process.env.FORCE_ALERT === '1';
const testAlert = process.env.TEST_ALERT === '1';

let token = process.env.PROD_ADMIN_ALERT_TOKEN || '';
const email = process.env.PROD_ADMIN_ALERT_EMAIL || '';
const password = process.env.PROD_ADMIN_ALERT_PASSWORD || '';

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

function statusSeverity(status) {
  return status === 'critical' || status === 'warning' ? status : 'info';
}

function shouldInclude(severity) {
  return severity === 'critical' || (includeWarnings && severity === 'warning');
}

async function request(method, path, options = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${baseUrl}${path}`, {
    method,
    headers: options.headers,
    body: options.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Text is included in the thrown preview below.
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} returned ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  return json;
}

async function getToken() {
  if (token) return token;
  if (!email || !password) {
    throw new Error('Set PROD_ADMIN_ALERT_TOKEN, PROD_ADMIN_SMOKE_TOKEN, or PROD_ADMIN_ALERT_EMAIL and PROD_ADMIN_ALERT_PASSWORD');
  }
  const json = await request('POST', '/api/v1/auth/sessions', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!json?.token) {
    throw new Error('Admin login did not return a token');
  }
  token = json.token;
  return token;
}

function summarizeDashboard(data) {
  const findings = [];

  for (const alert of data?.costControls?.alerts || []) {
    const severity = alert.severity === 'critical' ? 'critical' : 'warning';
    if (!shouldInclude(severity)) continue;
    findings.push({
      severity,
      area: 'cost',
      title: alert.title || alert.key || 'Cost control alert',
      detail: alert.detail || '',
      reviewUrl: alert.reviewUrl || '/admin/dashboard',
    });
  }

  const queueStatus = statusSeverity(data?.queueHealth?.status);
  if (shouldInclude(queueStatus)) {
    findings.push({
      severity: queueStatus,
      area: 'queue',
      title: `Queue health is ${data.queueHealth.status}`,
      detail: `${data.queueHealth.totalQueued || 0} queued, ${data.queueHealth.totalProcessing || 0} active, ${data.queueHealth.totalFailed || 0} failed`,
      reviewUrl: '/admin/dashboard',
    });
  } else if ((data?.queueHealth?.totalFailed || 0) > 0 && includeWarnings) {
    findings.push({
      severity: 'warning',
      area: 'queue',
      title: 'Queue has failed jobs',
      detail: `${data.queueHealth.totalFailed} failed jobs in live queue stats`,
      reviewUrl: '/admin/dashboard',
    });
  }

  const qualityStatus = statusSeverity(data?.qualityReview?.status);
  if (shouldInclude(qualityStatus)) {
    const queues = (data.qualityReview.queues || [])
      .filter((item) => item.count > 0)
      .map((item) => `${item.label}: ${item.count}`)
      .join('; ');
    findings.push({
      severity: qualityStatus,
      area: 'quality',
      title: `Quality review is ${data.qualityReview.status}`,
      detail: queues || 'Quality review thresholds are active',
      reviewUrl: '/admin/dashboard',
    });
  }

  return findings;
}

async function main() {
  if (testAlert) {
    const findings = [{
      severity: includeWarnings ? 'warning' : 'critical',
      area: 'test',
      title: 'Admin alert test',
      detail: 'Synthetic admin dashboard alert payload',
      reviewUrl: '/admin/dashboard',
    }];
    return buildResult({ findings, source: 'test' });
  }

  const adminToken = await getToken();
  const dashboard = await request('GET', `/api/v1/admin/dashboard?days=${encodeURIComponent(String(days))}`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const findings = summarizeDashboard(dashboard?.data || {});
  return buildResult({ findings, source: `${baseUrl}/api/v1/admin/dashboard?days=${days}` });
}

function buildResult({ findings, source }) {
  const severity = findings.some((item) => item.severity === 'critical')
    ? 'critical'
    : findings.some((item) => item.severity === 'warning')
      ? 'warning'
      : 'info';
  const shouldAlert = findings.length > 0 || forceAlert;
  const lines = findings.length > 0
    ? findings.map((item) => `- [${item.severity}] ${item.area}: ${item.title}${item.detail ? ` | ${item.detail}` : ''} | ${item.reviewUrl}`)
    : ['No active admin dashboard alerts.'];
  const text = `${titlePrefix}: ${severity}\nsource=${source}\nfindings=${findings.length}\n\n${lines.join('\n')}`;
  return {
    severity,
    shouldAlert,
    findingCount: findings.length,
    text,
  };
}

main()
  .then(printResult)
  .catch((error) => {
    printResult({
      severity: 'critical',
      shouldAlert: true,
      findingCount: 1,
      text: `${titlePrefix}: critical\nAdmin dashboard alert check failed\n\n${error?.message || error}`,
    });
    process.exitCode = 2;
  });
NODE
check_status=$?
set -e

cat "$tmp_payload"

should_alert="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(data.shouldAlert ? '1' : '0')" "$tmp_payload")"
payload="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(JSON.stringify({ text: data.text }))" "$tmp_payload")"

if [[ "$should_alert" != "1" ]]; then
  echo "No alert sent."
  exit "$check_status"
fi

if [[ "$DRY_RUN_ALERT" == "1" ]]; then
  echo "Dry-run alert payload:"
  printf '%s\n' "$payload"
  exit "$check_status"
fi

if [[ -z "$ADMIN_ALERT_WEBHOOK_URL" ]]; then
  echo "WARN alert not sent; ADMIN_ALERT_WEBHOOK_URL/OPS_ALERT_WEBHOOK_URL is not configured" >&2
  exit "$check_status"
fi

curl -fsS \
  --max-time 15 \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  "$ADMIN_ALERT_WEBHOOK_URL" >/dev/null

echo "Alert sent."
exit "$check_status"
