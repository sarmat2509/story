# Production Ops Cron Installer

## Summary

- Added `--local` mode to production ops scripts so they can run directly on the droplet without SSHing back into the same server.
- Added a tracked cron installer that uploads the required scripts to the droplet and installs `/etc/cron.d/wondertales-production-ops`.
- The default cron payload enables daily local backup retention and a 30-minute ops monitor log run.
- Admin dashboard alert cron remains opt-in because it needs real admin alert credentials and a webhook destination.

## Files Changed

- `scripts/check-production-ops.sh`
- `scripts/monitor-production-ops.sh`
- `scripts/run-production-backup-retention.sh`
- `scripts/install-production-ops-cron.sh`
- `package.json`
- `docs/runbooks/production-operations.md`
- `LAUNCH_ROADMAP.md`

## Verification

- `bash -n scripts/check-production-ops.sh scripts/monitor-production-ops.sh scripts/run-production-backup-retention.sh scripts/install-production-ops-cron.sh`
- `./scripts/install-production-ops-cron.sh --dry-run`
- `pnpm launch:install-production-ops-cron -- --dry-run`
- `pnpm launch:monitor-production-ops -- --test-alert --dry-run-alert`
- `pnpm launch:check-production-ops -- --help`
- `pnpm launch:run-production-backup-retention -- --help`
- `pnpm launch:run-production-backup-retention -- --dry-run --skip-offsite`
- `pnpm launch:install-production-ops-cron -- --apply`
- Droplet-local backup dry-run:
  - `ssh root@167.172.102.75 "cd /var/www/kazka && ./scripts/run-production-backup-retention.sh --local --dry-run --skip-offsite"`
- Droplet-local ops check:
  - `ssh root@167.172.102.75 "cd /var/www/kazka && EXPECTED_STRIPE_MODE=test ./scripts/check-production-ops.sh --local"`
- Droplet-local monitor wrapper:
  - `ssh root@167.172.102.75 "cd /var/www/kazka && EXPECTED_STRIPE_MODE=test ./scripts/monitor-production-ops.sh --local"`
- `EXPECTED_STRIPE_MODE=test pnpm launch:check-production-ops`
- `EXPECTED_STRIPE_MODE=test pnpm launch:check-production-ops:backup-smoke`

## Production Result

- `/etc/cron.d/wondertales-production-ops` is installed on the droplet.
- Backup retention scheduler reference now passes in the production ops check.
- Ops monitor scheduler reference now passes in the production ops check.
- Droplet-local `monitor-production-ops.sh --local` runs successfully and prints `No alert sent.` when there are no failures and warning alerts are not enabled.
- Warnings were reduced from `5` to `3`.
- With backup smoke enabled, the production ops check created and validated a `3.0 MB` PostgreSQL custom-format dump and ended with `0` failures and `2` warnings.
- Remaining warning-level work is external/configuration-bound: backup smoke is intentionally skipped during read-only checks, `OFFSITE_BACKUP_RCLONE_TARGET` is not configured, and admin dashboard alert credentials/webhook are not configured.

## Migration Notes

- No database migration was required.
- No destructive operation was used.
