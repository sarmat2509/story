# Alert scheduler follow-up

Date: 2026-05-03

## Context

After Cloudflare R2 offsite backup setup, the remaining infrastructure blocker is unattended alerting: the production ops monitor and admin dashboard checker need a real external webhook destination.

## Changes prepared

- `scripts/install-production-ops-cron.sh` now loads `/etc/wondertales/ops-alert.env` before the 30-minute ops monitor job.
- When admin alerts are included, the cron job loads `/etc/wondertales/ops-alert.env` first and `/etc/wondertales/admin-alert.env` second, allowing a shared ops webhook with an optional admin-specific override.
- `scripts/check-production-ops.sh` now checks for alert webhook and admin auth references in `/etc/wondertales/*.env` instead of only checking whether scheduler commands exist.
- `docs/runbooks/production-operations.md` documents the droplet alert env-file pattern.

## Remote result

- The updated cron was installed with the admin alert scheduler entry included.
- `/etc/wondertales/admin-alert.env` was created on the droplet with root-only permissions and admin alert auth values.
- A production admin alert dry-run authenticated successfully and returned `severity=info`, `findingCount=0`; no alert was sent because no active findings were present.
- `LOG_SINCE=30m ./scripts/check-production-ops.sh` passed with `0` failures and `3` warnings: backup smoke skipped in read-only mode, ops webhook missing, and admin dashboard webhook missing.
- Telegram alert delivery was added to `scripts/monitor-production-ops.sh` and `scripts/check-production-admin-alerts.sh`.
- `/etc/wondertales/ops-alert.env` now contains Telegram alert destination values with root-only permissions.
- Synthetic production ops and admin dashboard test alerts were sent successfully through Telegram.
- The follow-up `LOG_SINCE=30m ./scripts/check-production-ops.sh` passed with `0` failures and `1` warning: backup smoke skipped in read-only mode.

## Alert destinations

Webhook delivery remains supported. Use either:

- `OPS_ALERT_WEBHOOK_URL` for both ops and admin alerts; or
- `OPS_ALERT_WEBHOOK_URL` plus a separate `ADMIN_ALERT_WEBHOOK_URL`.

The webhook must accept a JSON payload with a `text` field.

Telegram Bot API delivery is also supported directly through `OPS_ALERT_TELEGRAM_BOT_TOKEN`/`OPS_ALERT_TELEGRAM_CHAT_ID`, admin-specific Telegram names, or the shared fallback `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`.
