#!/usr/bin/env bash

# Paid launch readiness check for operator-owned decisions and external
# production dependencies that cannot be inferred from the codebase.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

failures=0
warnings=0

pass() {
  echo "PASS $*"
}

warn() {
  warnings=$((warnings + 1))
  echo "WARN $*"
}

fail() {
  failures=$((failures + 1))
  echo "FAIL $*"
}

has_value() {
  local key="$1"
  [[ -n "${!key:-}" ]]
}

check_env() {
  local key="$1"
  local label="$2"
  if has_value "$key"; then
    pass "$label is set ($key)"
  else
    fail "$label is missing ($key)"
  fi
}

check_env_any() {
  local label="$1"
  shift
  local key
  for key in "$@"; do
    if has_value "$key"; then
      pass "$label is set ($key)"
      return
    fi
  done
  fail "$label is missing; set one of: $*"
}

check_flag() {
  local key="$1"
  local label="$2"
  if [[ "${!key:-}" == "1" || "${!key:-}" == "true" ]]; then
    pass "$label is confirmed ($key)"
  else
    fail "$label is not confirmed; set $key=1 after operator review"
  fi
}

check_doc() {
  local file="$1"
  local label="$2"
  if [[ -f "$file" ]]; then
    pass "$label exists ($file)"
  else
    fail "$label is missing ($file)"
    return
  fi

  if grep -Eiq '\b(TBD|TODO|PLACEHOLDER|UNCONFIRMED)\b' "$file"; then
    fail "$label still contains unresolved placeholders"
  else
    pass "$label has no unresolved placeholder markers"
  fi
}

echo "Paid launch readiness check"
echo
echo "== Operator and legal structure =="
check_flag WT_LEGAL_OPERATOR_CONFIRMED "legal operator, address, and merchant-of-record disclosure"
check_env WT_LEGAL_OPERATOR_NAME "current legal operator name"
check_env WT_OWNER_STAGE_DECISION "written owner stage decision"
check_env WT_PAYMENT_RECORD_OPERATOR "payment-provider operator record"
check_flag WT_TAX_ADVISER_REVIEW_CONFIRMED "paid-launch tax/adviser review"

echo
echo "== Support and incident ownership =="
check_env WT_INCIDENT_OWNER "launch incident owner"
check_env WT_ESCALATION_CONTACT "launch escalation contact"
check_env_any "support inbox destination" WT_SUPPORT_EMAIL SUPPORT_EMAIL FROM_EMAIL
check_flag WT_PRIVACY_EXPORT_DELIVERY_CONFIRMED "secure privacy export delivery method"
check_env WT_PRIVACY_EXPORT_DELIVERY_METHOD "privacy export delivery method label"

echo
echo "== Paid production durability =="
check_env OFFSITE_BACKUP_RCLONE_TARGET "offsite backup rclone target"
check_flag WT_OFFSITE_RESTORE_DRILL_CONFIRMED "offsite restore drill"

echo
echo "== Unattended alerts =="
if has_value OPS_ALERT_WEBHOOK_URL; then
  pass "production ops alert destination is set (OPS_ALERT_WEBHOOK_URL)"
elif has_value OPS_ALERT_TELEGRAM_BOT_TOKEN && has_value OPS_ALERT_TELEGRAM_CHAT_ID; then
  pass "production ops alert destination is set (OPS_ALERT_TELEGRAM_BOT_TOKEN/OPS_ALERT_TELEGRAM_CHAT_ID)"
elif has_value TELEGRAM_BOT_TOKEN && has_value TELEGRAM_CHAT_ID; then
  pass "production ops alert destination is set (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)"
else
  fail "production ops alert destination is missing; set OPS_ALERT_WEBHOOK_URL or OPS_ALERT_TELEGRAM_BOT_TOKEN and OPS_ALERT_TELEGRAM_CHAT_ID"
fi

if has_value ADMIN_ALERT_WEBHOOK_URL || has_value OPS_ALERT_WEBHOOK_URL; then
  pass "admin dashboard alert destination is set (webhook)"
elif has_value ADMIN_ALERT_TELEGRAM_BOT_TOKEN && has_value ADMIN_ALERT_TELEGRAM_CHAT_ID; then
  pass "admin dashboard alert destination is set (ADMIN_ALERT_TELEGRAM_BOT_TOKEN/ADMIN_ALERT_TELEGRAM_CHAT_ID)"
elif has_value OPS_ALERT_TELEGRAM_BOT_TOKEN && has_value OPS_ALERT_TELEGRAM_CHAT_ID; then
  pass "admin dashboard alert destination is set (OPS_ALERT_TELEGRAM_BOT_TOKEN/OPS_ALERT_TELEGRAM_CHAT_ID)"
elif has_value TELEGRAM_BOT_TOKEN && has_value TELEGRAM_CHAT_ID; then
  pass "admin dashboard alert destination is set (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)"
else
  fail "admin dashboard alert destination is missing; set ADMIN_ALERT_WEBHOOK_URL, OPS_ALERT_WEBHOOK_URL, or Telegram alert env"
fi
if has_value PROD_ADMIN_ALERT_TOKEN; then
  pass "admin dashboard alert auth is set (PROD_ADMIN_ALERT_TOKEN)"
elif has_value PROD_ADMIN_ALERT_EMAIL && has_value PROD_ADMIN_ALERT_PASSWORD; then
  pass "admin dashboard alert auth is set (PROD_ADMIN_ALERT_EMAIL/PROD_ADMIN_ALERT_PASSWORD)"
else
  fail "admin dashboard alert auth is missing; set PROD_ADMIN_ALERT_TOKEN or PROD_ADMIN_ALERT_EMAIL and PROD_ADMIN_ALERT_PASSWORD"
fi

echo
echo "== Runbooks =="
check_doc docs/runbooks/support-incident-process.md "support and incident runbook"
check_doc docs/runbooks/production-operations.md "production operations runbook"
check_doc docs/runbooks/paid-launch-readiness.md "paid launch readiness runbook"
check_doc docs/runbooks/data-export-delivery.md "data export delivery runbook"

echo
echo "Summary: ${failures} failure(s), ${warnings} warning(s)"
if (( failures > 0 )); then
  exit 1
fi
