# Paid launch readiness gate

Date: 2026-05-03

## What changed

- Added `scripts/check-paid-launch-readiness.sh` as a focused paid-launch gate for operator-owned launch blockers.
- Added `docs/runbooks/paid-launch-readiness.md` documenting the required environment confirmations for legal operator consistency, owner stage decision, incident ownership, offsite backups, restore drill, and unattended alerting.
- Added the package script `pnpm launch:check-paid-readiness`.

## Why

The remaining P2 launch blockers include decisions and secrets that cannot be filled in by code: legal operator/entity, adviser confirmation, incident owner, offsite backup target, alert webhook, and admin alert credentials. The new check makes those blockers explicit and verifiable without blocking normal public-beta `pnpm launch:gate`.

## Verification

- `bash -n scripts/check-paid-launch-readiness.sh`
- `env WT_LEGAL_OPERATOR_CONFIRMED=1 WT_LEGAL_OPERATOR_NAME=WonderTales WT_OWNER_STAGE_DECISION=free_beta WT_PAYMENT_RECORD_OPERATOR=WonderTales WT_TAX_ADVISER_REVIEW_CONFIRMED=1 WT_INCIDENT_OWNER=owner WT_ESCALATION_CONTACT=support@wondertales.art WT_SUPPORT_EMAIL=support@wondertales.art OFFSITE_BACKUP_RCLONE_TARGET=remote:wondertales/prod WT_OFFSITE_RESTORE_DRILL_CONFIRMED=1 OPS_ALERT_WEBHOOK_URL=https://example.test/webhook ADMIN_ALERT_WEBHOOK_URL=https://example.test/admin PROD_ADMIN_ALERT_TOKEN=test bash scripts/check-paid-launch-readiness.sh`

## Notes

- The check is intentionally separate from `pnpm launch:gate`; public beta can continue while paid-launch-only confirmations are pending.
- Before real paid launch, run it with real operator values from the production secret store or launch shell.
