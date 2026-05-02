# Production Smoke Remote Tail Handling

Date: 2026-05-02

## Context

The broad production smoke check passed the public HTTP/API checks with `0` failures, but the script exited with SSH status `255` when the optional remote Docker log tail could not open the droplet key in a non-interactive shell.

That made a healthy HTTP/API smoke look failed for the wrong reason.

## Changes

- `scripts/check-production-smoke.sh` now captures the Node smoke exit status before running the optional remote log tail.
- Remote Docker log tail failures are reported as `WARN` instead of replacing the smoke result.
- Real HTTP/API smoke failures still return a non-zero exit code after the optional remote-tail step.

## Verification

- `bash -n scripts/check-production-smoke.sh`
- `CHECK_PROD_REMOTE=0 pnpm launch:check-production-smoke` completed with `0` failures.
- `BASE_URL=http://127.0.0.1:9 CHECK_PROD_REMOTE=0 ./scripts/check-production-smoke.sh` returned exit `1`, preserving real smoke failures.
- `DROPLET_USER=not-a-real-user ./scripts/check-production-smoke.sh` returned exit `0` after successful smoke checks and printed `WARN Remote docker log tail unavailable`.
