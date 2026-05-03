# Offsite restore drill

Date: 2026-05-03

## Scope

Validated that the encrypted Cloudflare R2 offsite backup can be restored without touching production data.

## Implementation

- Added `scripts/run-offsite-restore-drill.sh`.
- Added `pnpm launch:run-offsite-restore-drill`.
- Updated the ops cron installer to upload the restore drill script to the droplet with the other production ops scripts.
- Updated `docs/runbooks/production-operations.md` so the restore drill is repeatable from the runbook instead of described as manual shell steps.

## Production drill result

Command run on the droplet:

```bash
cd /var/www/kazka && ./scripts/run-offsite-restore-drill.sh
```

Validated backup set:

- `wondertales_production_db_20260503T192313Z.dump`
- `wondertales_production_uploads_20260503T192313Z.tar.gz`

Results:

- DB dump SHA-256 matched its offsite sidecar.
- Uploads archive SHA-256 matched its offsite sidecar.
- `pg_restore -l` could read the DB dump.
- DB restored into a disposable Postgres container.
- Restored DB had `50` public tables.
- Uploads archive listing succeeded with `2854` entries.
- Temporary restore directory and disposable container were removed after the drill.

## Remaining risk

The drill proves the latest offsite backup is restorable into a non-production target. A real incident restore still requires an explicit operator decision, write freeze, preservation of current production data, and an incident timeline before replacing production state.
