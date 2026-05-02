# Production Ops Monitor Alerts

Date: 2026-05-02

## Summary

- Added `scripts/monitor-production-ops.sh`, a cron-friendly wrapper around `scripts/check-production-ops.sh`.
- The monitor prints the full ops report and sends a compact JSON webhook alert when failures are present.
- `OPS_ALERT_ON_WARNINGS=1` can also alert on warnings, which is useful for disk-space and backup-retention drift.
- Added dry-run/test-alert mode so the payload can be verified without sending network traffic.
- Documented webhook usage and cron setup in the production operations runbook.

## Validation

- `bash -n scripts/monitor-production-ops.sh`
- `./scripts/monitor-production-ops.sh --test-alert --dry-run-alert`

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.

## Follow-Up

- Configure a real external webhook before public beta traffic.
- Decide whether warnings should page immediately or only create lower-priority notifications.
