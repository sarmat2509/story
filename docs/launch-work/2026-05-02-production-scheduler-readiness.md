# Production Scheduler Readiness

Date: 2026-05-02

## Summary

- Expanded `scripts/check-production-ops.sh` with read-only scheduler and external-target checks.
- The ops check now warns when it cannot find configured references for:
  - `run-production-backup-retention.sh`;
  - `OFFSITE_BACKUP_RCLONE_TARGET`;
  - `monitor-production-ops.sh`;
  - `check-production-admin-alerts.sh`.
- The check looks at user crontab, `/etc/cron.d`, relevant systemd timer/service files, and sanitized `.env.production` references without printing secret values.

## Validation

- `bash -n scripts/check-production-ops.sh`
- `LOG_SINCE=10m ./scripts/check-production-ops.sh`
- Production run passed with `0` failures and `5` warnings:
  - backup smoke skipped in read-only mode;
  - backup retention scheduler reference not found;
  - offsite backup target reference not found;
  - ops monitor scheduler reference not found;
  - admin dashboard alert scheduler reference not found.
- Recent API Docker logs had no error/warn/failed lines during the check window.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.

## Follow-Up

- Configure the real backup retention scheduler before depending on production paid data.
- Configure an offsite rclone target or move generated media to durable object storage.
- Configure external webhook destinations and schedulers for ops and admin dashboard alerts.
