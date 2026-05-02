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
- Recent API logs do not contain error, warning, failed, panic, unhandled, or exception lines.

Run the broader HTTP/API smoke separately:

```bash
./scripts/check-production-smoke.sh
```

Set the documented smoke credentials when authenticated, admin, or Stripe checkout checks are needed.

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

Keep launch backups on the droplet only as a short-term safety net. For paid launch, copy backups to an external encrypted storage location and define retention outside this repo.

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
