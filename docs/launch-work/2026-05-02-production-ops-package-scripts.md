# Production Ops Package Scripts

Date: 2026-05-02

## Context

Production smoke and security artifact checks already had `pnpm launch:*` entrypoints, but production ops, backup retention, monitor alerts, and admin-dashboard alerts only existed as direct shell scripts. During verification, `pnpm launch:check-production-ops` failed because the package script did not exist.

## Changes

- Added package scripts for:
  - `pnpm launch:check-production-ops`
  - `pnpm launch:check-production-ops:backup-smoke`
  - `pnpm launch:monitor-production-ops`
  - `pnpm launch:run-production-backup-retention`
  - `pnpm launch:check-production-admin-alerts`
- Updated ops shell scripts to tolerate pnpm's literal `--` separator before script flags.
- Updated the production runbook to show the pnpm entrypoints alongside direct script commands.

## Verification

- `bash -n scripts/check-production-ops.sh scripts/run-production-backup-retention.sh scripts/monitor-production-ops.sh scripts/check-production-admin-alerts.sh`
- `pnpm launch:check-production-ops -- --help`
- `pnpm launch:run-production-backup-retention -- --help`
- `pnpm launch:check-production-admin-alerts -- --help`
- `pnpm launch:monitor-production-ops -- --test-alert --dry-run-alert`
- `EXPECTED_STRIPE_MODE=test pnpm launch:check-production-ops` passed against production with `0` failures and expected scheduler/offsite warnings.
