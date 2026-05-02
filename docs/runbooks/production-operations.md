# Production operations runbook

Date: 2026-05-02

This runbook covers the current single-droplet production topology for the public beta launch.

## Routine readiness check

Run this before launch windows, after production deploys, and after billing or generation changes:

```bash
./scripts/check-production-ops.sh --backup-smoke
```

The check verifies:

- Docker host tools, project directory, compose file, and `.env.production` presence.
- Expected production containers are running.
- Postgres is healthy.
- API and Postgres are bound to localhost only.
- Public nginx ports and API health endpoints respond.
- Root, Docker, and project disk space are above launch thresholds.
- Postgres data, database backup mount, upload volume, and API log volume are readable.
- A custom-format PostgreSQL backup can be created and read by `pg_restore -l`.
- Required production environment variables are present without printing secret values.
- Stripe secret-key mode matches `EXPECTED_STRIPE_MODE` without printing the key value.
- Recent API logs do not contain error, warning, failed, panic, unhandled, or exception lines.

Run the broader HTTP/API smoke separately:

```bash
./scripts/check-production-smoke.sh
```

Set the documented smoke credentials when authenticated, admin, or Stripe checkout checks are needed.

For paid live-mode readiness, make the expected Stripe mode explicit:

```bash
EXPECTED_STRIPE_MODE=live ./scripts/check-production-ops.sh
```

The default remains `EXPECTED_STRIPE_MODE=test` for the current test-mode beta verification path.

After a web or nginx deploy, capture the exact deployed security headers and scan the live client artifact, not only the local build:

```bash
pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-YYYY-MM-DD
```

The checker fetches production SSR and SPA routes, verifies the apex/`www` behavior, confirms auth/app routes stay `noindex,nofollow`, and scans the deployed HTML/JS/CSS/JSON artifacts for server-side secret markers without printing secret values.

## Monitoring alerts

Use the cron-friendly wrapper when the check should notify an external system:

```bash
OPS_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/monitor-production-ops.sh
```

By default it sends an alert when the ops check fails. To also alert on warnings, including disk threshold warnings, run:

```bash
OPS_ALERT_WEBHOOK_URL=https://example.com/webhook OPS_ALERT_ON_WARNINGS=1 ./scripts/monitor-production-ops.sh
```

Dry-run the payload without sending:

```bash
./scripts/monitor-production-ops.sh --test-alert --dry-run-alert
```

Example crontab:

```cron
*/30 * * * * cd /path/to/story && OPS_ALERT_WEBHOOK_URL=https://example.com/webhook OPS_ALERT_ON_WARNINGS=1 ./scripts/monitor-production-ops.sh >> logs/production-ops-monitor.log 2>&1
```

The webhook payload is plain JSON with a `text` field, so it can be used with Slack-style webhooks, Discord-compatible relays, or a small custom endpoint.

## Admin dashboard alerts

Use the admin dashboard checker when cost, queue, or quality-review signals should notify an external system instead of relying only on manual dashboard review:

```bash
PROD_ADMIN_ALERT_TOKEN=... ADMIN_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/check-production-admin-alerts.sh
```

The script reads `/api/v1/admin/dashboard?days=7` and sends a compact JSON webhook with a `text` field when it finds critical dashboard findings. It checks:

- cost-control alerts returned by the admin dashboard API;
- warning or critical queue health status;
- warning or critical quality-review status.

To include warning-level findings in notifications:

```bash
PROD_ADMIN_ALERT_TOKEN=... ADMIN_ALERT_ON_WARNINGS=1 ADMIN_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/check-production-admin-alerts.sh
```

Dry-run the payload without sending:

```bash
PROD_ADMIN_ALERT_TOKEN=... ADMIN_ALERT_ON_WARNINGS=1 ./scripts/check-production-admin-alerts.sh --dry-run-alert
./scripts/check-production-admin-alerts.sh --test-alert --dry-run-alert
```

If a long-lived token is not available, the checker can create an admin session from smoke credentials:

```bash
PROD_ADMIN_ALERT_EMAIL=admin@example.com PROD_ADMIN_ALERT_PASSWORD=... ADMIN_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/check-production-admin-alerts.sh
```

Example crontab:

```cron
*/15 * * * * cd /path/to/story && PROD_ADMIN_ALERT_TOKEN=... ADMIN_ALERT_ON_WARNINGS=1 ADMIN_ALERT_WEBHOOK_URL=https://example.com/webhook ./scripts/check-production-admin-alerts.sh >> logs/admin-dashboard-alerts.log 2>&1
```

Keep the token or credentials in the scheduler secret store. Do not commit them to the repository or write them into runbook notes.

`scripts/check-production-ops.sh` warns when it cannot find droplet-local scheduler references for `monitor-production-ops.sh` and `check-production-admin-alerts.sh`. If those monitors run from a separate ops host, record that location in the launch notes before treating the warnings as acknowledged.

## Database backup

The production compose file mounts `./backups` into the Postgres container at `/backups`.

The ops check creates a non-destructive smoke backup named like:

```text
/var/www/kazka/backups/prelaunch_smoke_YYYYMMDDTHHMMSSZ.dump
```

It uses custom format (`pg_dump -Fc`) and validates the archive with:

```bash
pg_restore -l /backups/<backup-file>.dump
```

Keep launch backups on the droplet only as a short-term safety net. For paid launch, copy backups to an external encrypted storage location.

The repeatable retention runner is:

```bash
./scripts/run-production-backup-retention.sh --apply
```

By default it:

- creates and validates a PostgreSQL custom-format dump;
- archives and validates the API uploads Docker volume;
- writes SHA-256 sidecar files for created artifacts;
- removes only `wondertales_production_*` backup artifacts older than `BACKUP_LOCAL_RETENTION_DAYS` from the droplet backup directory;
- copies artifacts to `OFFSITE_BACKUP_RCLONE_TARGET` when that rclone target is configured.

Useful launch variants:

```bash
./scripts/run-production-backup-retention.sh --dry-run --skip-offsite
./scripts/run-production-backup-retention.sh --apply --skip-offsite
OFFSITE_BACKUP_RCLONE_TARGET=remote:wondertales/prod ./scripts/run-production-backup-retention.sh --apply
```

Recommended beta retention defaults:

- `BACKUP_LOCAL_RETENTION_DAYS=1`
- `BACKUP_OFFSITE_RETENTION_DAYS=90`

Run it from a trusted scheduler once per day. Example crontab on the operator machine or a dedicated ops runner:

```cron
15 2 * * * cd /path/to/story && mkdir -p logs && OFFSITE_BACKUP_RCLONE_TARGET=remote:wondertales/prod ./scripts/run-production-backup-retention.sh --apply >> logs/production-backup-retention.log 2>&1
```

`scripts/check-production-ops.sh` warns when it cannot find a backup retention scheduler reference or an `OFFSITE_BACKUP_RCLONE_TARGET` reference on the droplet. If scheduling runs from a separate ops host, keep that host's scheduler documented in the launch notes and expect the droplet-local check to warn.

The 2026-05-02 production apply-smoke created a 3.1 MB database dump and a 1008 MB uploads archive. The droplet had about 2169 MB free after the run, so the local backup directory should be treated only as a short staging area. Treat the uploads volume as the main backup-time, disk-space, and offsite-transfer bottleneck until media storage moves to S3/CDN or an incremental backup process.

## Restore plan

Do not restore over production casually. A restore is destructive to newer data and requires explicit operator approval.

Preferred restore drill:

1. Copy the selected `.dump` file to a separate machine or a temporary Postgres container.
2. Create an empty database.
3. Run `pg_restore --clean --if-exists --no-owner --dbname <restore_database> <backup-file>.dump` against the non-production target.
4. Verify table counts, recent users, stories, subscriptions, and bundle grants.
5. Only if production recovery is required, stop writes first, preserve current production data, and restore under a written incident timeline.

If a deploy introduces a bad migration, prefer a forward fix migration. Avoid manual `DROP`, forced schema pushes, or resetting production state unless the incident owner explicitly approves a restore.

## Uploads and generated assets

Generated and uploaded assets currently live in the `api_uploads` Docker volume mounted at:

```text
/app/services/api/uploads
```

The ops check verifies the volume is readable and reports its size. For paid launch, add an external copy/backup process for this volume before relying on it as durable user storage.

`scripts/run-production-backup-retention.sh` now archives this Docker volume into `backups/wondertales_production_uploads_YYYYMMDDTHHMMSSZ.tar.gz` and validates the tarball. `scripts/check-production-ops.sh` warns when no recent upload-volume archive exists.

## Logs and incidents

Use the existing log helper for focused API logs:

```bash
./scripts/view-logs.sh -n 200
./scripts/view-logs.sh -e -n 500
```

During incidents, capture:

- production deploy commit;
- affected user/story/subscription ids;
- exact API route or UI screen;
- recent API logs with emails redacted;
- Stripe event ids when billing is involved.

Keep child prompts, story text, uploaded photos, and secrets out of incident notes.

## Deploy and rollback

Normal deploy:

```bash
pnpm launch:gate
./scripts/deploy.sh --api --web
./scripts/check-production-smoke.sh
./scripts/check-production-ops.sh --backup-smoke
```

Rollback for code-only regressions:

1. Identify the last good commit.
2. Check out that commit locally.
3. Run `pnpm launch:gate`.
4. Redeploy with `./scripts/deploy.sh --api --web`.
5. Re-run production smoke and ops checks.

Rollback after migrations:

- Prefer a forward fix.
- Do not run destructive SQL manually.
- If data restore is required, follow the restore plan above and get explicit operator approval first.
