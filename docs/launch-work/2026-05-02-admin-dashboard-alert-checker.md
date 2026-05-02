# Admin Dashboard Alert Checker

Date: 2026-05-02

## Summary

- Added `scripts/check-production-admin-alerts.sh`, a cron-friendly checker for `/api/v1/admin/dashboard`.
- The checker reports critical cost-control alerts, queue-health alerts, and quality-review alerts to an external webhook.
- Warning-level alerts can be included with `ADMIN_ALERT_ON_WARNINGS=1`.
- The checker supports either an existing admin token or admin email/password smoke credentials.
- Added dry-run and synthetic test-alert modes so webhook payloads can be verified without sending live notifications.
- Documented scheduler usage in `docs/runbooks/production-operations.md`.

## Validation

- `bash -n scripts/check-production-admin-alerts.sh`
- `./scripts/check-production-admin-alerts.sh --test-alert --dry-run-alert`
- Production dry-run with a temporary elevated smoke account and `ADMIN_ALERT_ON_WARNINGS=1` returned `severity: "info"`, `findingCount: 0`, and did not send an alert.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.
- The temporary production smoke account used for validation was deleted after the run.

## Follow-Up

- Configure the real scheduler and `ADMIN_ALERT_WEBHOOK_URL` or `OPS_ALERT_WEBHOOK_URL` before paid public launch.
- Keep the separate email deliverability blocker tracked until Resend domain verification and sender DNS records are fixed.
