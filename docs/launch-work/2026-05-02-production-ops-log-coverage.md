# Production Ops Docker Log Coverage

Date: 2026-05-02

## Context

The production ops check scanned recent API logs, but launch verification now also relies on nginx and webapp logs after deploys and frontend checks.

## Changes

- `scripts/check-production-ops.sh` now scans recent `api webapp nginx` Docker logs by default.
- Added `LOG_SERVICES` override for focused checks, for example `LOG_SERVICES=api`.
- The log scan now flags `temporary file` nginx warnings alongside `error`, `warn`, `failed`, `panic`, `unhandled`, and `exception`.
- Email redaction remains in place before notable log lines are printed.

## Verification

- `bash -n scripts/check-production-ops.sh`
- `LOG_SINCE=5m EXPECTED_STRIPE_MODE=test pnpm launch:check-production-ops` passed against production with `0` failures and no recent api/webapp/nginx log findings.
