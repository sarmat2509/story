# Production ops readiness check

Date: 2026-05-02

## What changed

- Added `scripts/check-production-ops.sh` for repeatable production operations checks.
- The script verifies container status, localhost-only API/Postgres bindings, HTTPS/API health, disk thresholds, production volume readability, secret presence without printing values, and recent API logs.
- Added an optional `--backup-smoke` mode that creates a PostgreSQL custom-format dump in the existing production backup mount and validates it with `pg_restore -l`.
- Added `docs/runbooks/production-operations.md` with backup, restore, deploy, rollback, log, and incident guidance.

## Production verification

- `bash -n scripts/check-production-ops.sh`
- `./scripts/check-production-ops.sh --backup-smoke`

The production ops check passed with `0` failures and `0` warnings after the script was adjusted to treat `WEB_APP_URL` as the valid fallback for the CORS allowlist.

Verified in production:

- `wondertales-postgres-prod`, `wondertales-api-prod`, `wondertales-nginx`, and `wondertales-webapp-prod` are running.
- Postgres healthcheck is healthy.
- API and Postgres are bound to `127.0.0.1`.
- Public HTTP/HTTPS nginx bindings are present.
- Local API health and public HTTPS health respond.
- Root/Docker/project filesystems have more than the configured launch minimum free space.
- Postgres data, backup mount, API uploads, and API logs are readable.
- `pg_dump -Fc` created a production backup smoke file and `pg_restore -l` could read it.
- Required API env vars and provider key groups are present without printing secret values.
- Recent API logs had no error/warn/failed lines.

## Notes

- No migration was needed.
- The backup smoke proves manual database backup creation and archive readability. Recurring/offsite backup automation for database and uploads remains a paid-launch hardening follow-up.
