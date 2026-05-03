# Tracked migration number gate

Date: 2026-05-03

## What changed

- Tightened `services/api/src/scripts/checkMigrationFiles.ts`.
- The static migration check now requires migrations after `0052_create_schema_migrations.sql` to use unique contiguous numeric prefixes.
- Historical early duplicate migration numbers remain acknowledged, but new tracked migrations cannot add more duplicate/gap drift.

## Why

The roadmap still notes that a full fresh-database replay of the historical migration folder is not clean because early baseline migrations overlap. This does not solve that historical replay in one risky sweep, but it prevents the deploy-era tracked migration sequence from getting worse while production continues to use `runAllMigrations.ts`.

## Verification

- `pnpm exec tsx src/scripts/checkMigrationFiles.ts`
