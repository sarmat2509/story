# Ops Alert Telegram Format

Date: 2026-05-03

## Scope

- Reworked `scripts/monitor-production-ops.sh` alert payloads so Telegram receives a compact operational summary instead of the full ops report tail.
- The script still prints the full `check-production-ops.sh` report to stdout, so cron keeps detailed logs in `logs/production-ops-monitor.log`.
- Telegram/webhook text now includes:
  - severity and counts;
  - only active `WARN` and `FAIL` lines;
  - service, disk, backup, log-scan, payment-mode, offsite, and alert-destination summaries;
  - a pointer to the full production monitor log.
- Added `OPS_ALERT_INCLUDE_FULL_REPORT=1` as an escape hatch for appending the old full report tail.
- Fixed the no-argument monitor path under `set -u` so the wrapper can run `check-production-ops.sh` without explicit check arguments.

## Verification

- `bash -n scripts/monitor-production-ops.sh`
- `OPS_ALERT_ON_WARNINGS=1 ./scripts/monitor-production-ops.sh --test-alert --dry-run-alert`
- `OPS_ALERT_ON_WARNINGS=1 LOG_SINCE=35m ./scripts/monitor-production-ops.sh --dry-run-alert`
- `pnpm launch:install-production-ops-cron -- --apply --include-admin-alerts`
- Droplet-local dry run with `/etc/wondertales/ops-alert.env` loaded:
  `OPS_ALERT_ON_WARNINGS=1 LOG_SINCE=35m ./scripts/monitor-production-ops.sh --local --dry-run-alert`
- Droplet-local Telegram delivery test:
  `./scripts/monitor-production-ops.sh --local --test-alert`

The real production dry-run produced a short `WARNING` payload with one actionable line:

```text
WonderTales production ops | WARNING
failures 0 | warnings 1 | exit 0

Needs attention
- backup smoke skipped; rerun with --backup-smoke before launch

Current state
- services: postgres healthy, restarts 0; api up, restarts 0; nginx up, restarts 0; webapp up, restarts 0
- disk: root filesystem has 7139MB free (70% used)
- database backups: recent database backup file exists (8 in last 7 days)
- upload backups: recent upload-volume backup archive exists (2 in last 7 days)
- logs: recent api webapp nginx logs have no error/warn/failed/temporary-file lines since 35m
- payments: api Stripe secret key mode is test as expected
- offsite: offsite backup target reference found
- alerts: ops alert destination reference found; admin dashboard alert destination reference found

Full report: /var/www/kazka/logs/production-ops-monitor.log
```
