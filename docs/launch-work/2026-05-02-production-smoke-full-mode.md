# Production Smoke Full Mode

Date: 2026-05-02

## Context

`scripts/check-production-smoke.sh` already covered the temporary Child Mode live fixture, but that branch required a separate `PROD_SMOKE_CHILD_MODE=1` flag. That made it easy to run a broad smoke and accidentally skip the release-grade authenticated checks.

## Changes

- Added `--full` to `scripts/check-production-smoke.sh`.
- Added smaller convenience flags:
  - `--checkout`;
  - `--child-mode`;
  - `--require-auth`;
  - `--require-admin`;
  - `--skip-hosted-checkout`;
  - `--no-remote`.
- Full mode enables Stripe checkout creation, hosted checkout loading, and the temporary Child Mode fixture.
- Full mode requires both smoke user and admin auth; the script now fails instead of warning when a requested authenticated branch cannot run.
- Added package scripts:
  - `pnpm launch:check-production-smoke`;
  - `pnpm launch:check-production-smoke:full`.

## Verification

- `bash -n scripts/check-production-smoke.sh`
- `./scripts/check-production-smoke.sh --help`
- `pnpm launch:check-production-smoke -- --help`
- `CHECK_PROD_REMOTE=0 PROD_SMOKE_LOAD_CHECKOUT=0 ./scripts/check-production-smoke.sh --full` was intentionally run without smoke credentials and failed after public checks with the expected auth/admin requirement failures.

## Result

Release-grade production smoke now has one obvious entrypoint for authenticated, admin, Stripe, and Child Mode verification, while the default read-only smoke remains available for fast public checks.
