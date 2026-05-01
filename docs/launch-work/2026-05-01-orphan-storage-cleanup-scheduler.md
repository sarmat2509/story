# Orphan storage cleanup scheduler

Date: 2026-05-01

## What changed

- Added an API startup scheduler for orphan storage scans.
- The scheduler is disabled by default and runs dry-run by default when enabled.
- Scheduled deletion requires both `ORPHAN_STORAGE_CLEANUP_ENABLED=true` and `ORPHAN_STORAGE_CLEANUP_APPLY=true`.
- Added a retention-age gate: scheduled cleanup only treats orphan files older than `ORPHAN_STORAGE_CLEANUP_MIN_AGE_HOURS` as delete-eligible.
- Extended the manual scanner with `--min-age-hours` so operators can preview the same retention window before enabling apply mode.
- Added scheduler config tests and included them in `scripts/launch-gate.sh`.

## Operator notes

- Recommended production rollout:
  1. Enable `ORPHAN_STORAGE_CLEANUP_ENABLED=true` with `ORPHAN_STORAGE_CLEANUP_APPLY=false`.
  2. Review dry-run logs for at least one full interval.
  3. Confirm retention/support policy and deletion window.
  4. Enable `ORPHAN_STORAGE_CLEANUP_APPLY=true` with a conservative `ORPHAN_STORAGE_CLEANUP_MAX_DELETE`.
- Keep `ORPHAN_STORAGE_CLEANUP_MIN_AGE_HOURS=168` or higher unless operations explicitly approve a shorter retention window.
- Do not use `--apply` or `ORPHAN_STORAGE_CLEANUP_APPLY=true` until dry-run output has been reviewed in the target environment.

## Configuration

- `ORPHAN_STORAGE_CLEANUP_ENABLED=false`
- `ORPHAN_STORAGE_CLEANUP_APPLY=false`
- `ORPHAN_STORAGE_CLEANUP_INTERVAL_MS=86400000`
- `ORPHAN_STORAGE_CLEANUP_INITIAL_DELAY_MS=300000`
- `ORPHAN_STORAGE_CLEANUP_MAX_DELETE=100`
- `ORPHAN_STORAGE_CLEANUP_MIN_AGE_HOURS=168`

## Verification

- `pnpm exec tsx src/services/__tests__/orphanStorageCleanupService.test.ts`
- `pnpm exec tsx src/jobs/__tests__/orphanStorageCleanupSchedulerJob.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- Docker API logs after hot reload show the scheduler starts disabled by default.

## Follow-up found from Docker logs

- Dev Postgres healthcheck currently calls `pg_isready` without a database name, so it logs repeated `database "kazka" does not exist` messages even though the API is healthy. This is dev-infra log noise and should be fixed separately with a compose healthcheck update.
