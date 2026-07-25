# Production Backups, Cron, Offsite Storage, and Alerts

## Contents

- Backup Runner
- Offsite R2/Rclone
- Restore Drill
- Cron Installer
- Ops and Admin Alerts

## Backup Runner

Script: `scripts/run-production-backup-retention.sh`.

Package command:

```bash
pnpm launch:run-production-backup-retention -- --dry-run --skip-offsite
pnpm launch:run-production-backup-retention -- --apply
```

Defaults:

- remote target: `root@167.172.102.75:/var/www/kazka`
- compose file: `docker-compose.prod.yml`
- prefix: `wondertales_production`
- local retention: `BACKUP_LOCAL_RETENTION_DAYS=1`
- offsite retention: `BACKUP_OFFSITE_RETENTION_DAYS=90`
- dry-run unless `--apply`

Apply mode:

- creates a PostgreSQL custom-format dump through the `postgres` container
- validates the dump with `pg_restore -l`
- archives the API uploads Docker volume
- validates the uploads tarball with `tar -tzf`
- writes SHA-256 sidecars
- deletes only scoped `wondertales_production_*` local artifacts older than local retention
- copies artifacts to `OFFSITE_BACKUP_RCLONE_TARGET` when configured

Useful flags:

- `--apply`
- `--dry-run`
- `--db-only`
- `--uploads-only`
- `--skip-offsite`
- `--local`

The production runbook notes that uploads archives are the disk and transfer bottleneck. Treat `/var/www/kazka/backups` as short-term staging, not durable paid-user storage.

## Offsite R2/Rclone

Script: `scripts/configure-r2-rclone.sh`.

Package command:

```bash
pnpm launch:configure-r2-rclone -- --dry-run
pnpm launch:configure-r2-rclone -- --apply --smoke
pnpm launch:configure-r2-rclone -- --status
```

Required env, usually sourced from `.env.production`:

- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_ENDPOINT`
- `CLOUDFLARE_R2_BUCKET`
- `OFFSITE_BACKUP_RCLONE_TARGET`

Defaults:

- plain remote: `wondertales-r2`
- encrypted remote: `wondertales-r2-crypt`
- crypt recovery file: `${HOME}/.config/rclone/wondertales-r2-crypt.recovery.env`

Do not print R2 credentials or crypt recovery secrets. The recovery file is needed to read encrypted backups from a fresh machine.

## Restore Drill

Script: `scripts/run-offsite-restore-drill.sh`.

Package command:

```bash
pnpm launch:run-offsite-restore-drill
```

Behavior:

- reads `OFFSITE_BACKUP_RCLONE_TARGET`
- downloads the latest DB dump and uploads archive plus SHA-256 sidecars
- verifies checksums
- restores the DB into a disposable local Postgres container
- verifies public table presence
- validates the uploads tarball listing
- removes only its temporary files/container

Never restore over production during a readiness check. Production restore is destructive to newer data and requires explicit operator approval.

## Cron Installer

Script: `scripts/install-production-ops-cron.sh`.

Package command:

```bash
pnpm launch:install-production-ops-cron -- --dry-run
pnpm launch:install-production-ops-cron -- --apply
pnpm launch:install-production-ops-cron -- --apply --include-admin-alerts
```

Defaults:

- cron file: `/etc/cron.d/wondertales-production-ops`
- target: `root@167.172.102.75:/var/www/kazka`
- backup cron: `15 2 * * *`
- ops monitor cron: `*/30 * * * *`
- independent log monitor cron: `*/10 * * * *`
- admin alert cron: `10 * * * *`
- backup env file: `/var/www/kazka/.env.production`
- ops alert env file: `/etc/wondertales/ops-alert.env`
- admin alert env file: `/etc/wondertales/admin-alert.env`

It uploads these tracked scripts to `/var/www/kazka/scripts`:

- `check-production-ops.sh`
- `monitor-production-ops.sh`
- `monitor-production-logs.sh`
- `run-production-backup-retention.sh`
- `run-offsite-restore-drill.sh`
- `configure-r2-rclone.sh`
- `check-production-admin-alerts.sh`

Installed jobs run with `--local`, so cron on the droplet does not SSH back into the same droplet.

## Ops and Admin Alerts

Ops monitor script: `scripts/monitor-production-ops.sh`.

```bash
OPS_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/monitor-production-ops.sh
OPS_ALERT_TELEGRAM_BOT_TOKEN=... OPS_ALERT_TELEGRAM_CHAT_ID=... ./scripts/monitor-production-ops.sh
pnpm launch:monitor-production-ops -- --test-alert --dry-run-alert
```

It wraps `check-production-ops.sh`, prints the full report, and sends compact webhook/Telegram alerts on failures. Set `OPS_ALERT_ON_WARNINGS=1` to alert on warnings too.

Admin dashboard alert script: `scripts/check-production-admin-alerts.sh`.

```bash
PROD_ADMIN_ALERT_TOKEN=... ADMIN_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/check-production-admin-alerts.sh
PROD_ADMIN_ALERT_TOKEN=... pnpm launch:check-production-admin-alerts -- --dry-run-alert
pnpm launch:check-production-admin-alerts -- --test-alert --dry-run-alert
```

It reads `/api/v1/admin/dashboard?days=7` and alerts for cost-control, queue, or quality-review findings. It can authenticate using `PROD_ADMIN_ALERT_TOKEN` or `PROD_ADMIN_ALERT_EMAIL`/`PROD_ADMIN_ALERT_PASSWORD`.

Keep alert secrets in `/etc/wondertales/*.env` or another secret store, not in the repository or committed runbooks.

The independent log monitor (`scripts/monitor-production-logs.sh`) reads Docker
logs directly and sends alerts without calling the WonderTales API. It keeps a
cursor in `logs/production-log-monitor.cursor`, so successful runs do not alert
twice for the same interval. Its default sources are `api`, `worker`, `webapp`,
and `shared-nginx-proxy`.
