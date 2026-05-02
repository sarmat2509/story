# Production Backup Retention Runner

Date: 2026-05-02

## Summary

- Added `scripts/run-production-backup-retention.sh` as a repeatable production backup retention runner.
- The script defaults to remote dry-run and requires `--apply` before creating backup artifacts.
- Apply mode creates and validates a PostgreSQL custom-format dump, archives and validates the API uploads Docker volume, writes SHA-256 sidecars, and applies scoped local retention only to `wondertales_production_*` backup artifacts.
- Local retention defaults to `1` day because the current single-droplet disk budget cannot safely hold many full uploads archives.
- Optional offsite delivery is supported through `OFFSITE_BACKUP_RCLONE_TARGET` when rclone is configured on the droplet.
- `scripts/check-production-ops.sh` now checks for a recent upload-volume archive in addition to recent database backups.
- The production operations runbook now documents daily scheduling, local/offsite retention defaults, and the current uploads-volume size bottleneck.

## Validation

- `bash -n scripts/run-production-backup-retention.sh`
- `bash -n scripts/check-production-ops.sh`
- `./scripts/run-production-backup-retention.sh --dry-run --skip-offsite`
- `./scripts/run-production-backup-retention.sh --apply --skip-offsite`

Production apply-smoke results:

- Database backup created and validated with `pg_restore -l`: `3.1 MB`.
- Upload-volume archive created and validated with `tar -tzf`: `1008 MB`.
- `scripts/check-production-ops.sh --backup-smoke` passed after the backup-retention smoke with `0` failures and `0` warnings; the droplet had about `2169 MB` free, making uploads backups the current storage bottleneck.
- Local retention ran against scoped `wondertales_production_*` artifacts.
- Offsite copy was intentionally skipped for the smoke because no external target was configured in this run.

## Migration Notes

- No database migration was needed.
- No destructive database or storage operations were performed.
- Local retention is scoped to backup artifacts created by this runner.

## Follow-Up

- Configure a real rclone offsite target before relying on paid production data.
- Add a daily scheduler entry on a trusted ops runner.
- Consider incremental media backups or S3/CDN storage before media volume growth makes daily full uploads archives too expensive.
