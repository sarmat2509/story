---
name: wondertales-production-ops
description: Navigate WonderTales production deployment and operations. Use when Codex needs to deploy API/webapp/nginx changes, inspect the DigitalOcean droplet setup, understand where production lives, choose production smoke/ops/backup commands, manage shared proxy/certbot/cron/offsite backups, inspect production logs, or reason about safe production mutations.
---

# WonderTales Production Ops

## Overview

Use this skill for live WonderTales production work. Production is a single-droplet Docker Compose setup fronted by a shared nginx proxy; the main public origin is `https://wondertales.art`.

Safety defaults:

- Treat production commands as live. Prefer read-only checks unless the user explicitly asks to deploy, mutate data, install cron, create backups, or change runtime mode.
- Do not print `.env.production` values. List keys or use existing scripts that redact secret values.
- Prefer tracked scripts over ad hoc SSH commands. If a script is missing a necessary production-path detail, patch the script rather than inventing a one-off live operation.
- Prefer `scripts/deploy.sh` for deploys. Older helpers such as `deploy-api.sh`, `deploy-api-local.sh`, and `hotfix-api.sh` are partial/hotfix paths and should not be the default.

## Quick Facts

- Production host: `root@167.172.102.75`
- Production project path: `/var/www/kazka`
- Compose file: `docker-compose.prod.yml`
- Public app/API origin: `https://wondertales.art`
- Main deploy command: `./scripts/deploy.sh --api --web`
- Main predeploy gate: `pnpm launch:gate`
- Main postdeploy checks: `pnpm launch:check-production-smoke`, `pnpm launch:check-production-ops`

## Reference Routing

- For where production lives, containers, ports, volumes, domain routing, and shared proxy handoff, read `references/topology-runtime.md`.
- For release flow, API/web deploy internals, migrations, drain mode, nginx sync, and partial deploys, read `references/deploy-release.md`.
- For production smoke tests, ops checks, security artifact checks, auth/billing/cleanup checks, and logs, read `references/verification-smoke-ops.md`.
- For backups, offsite R2/rclone, restore drills, cron, and alerts, read `references/backups-cron-alerts.md`.

## Common Workflows

Normal release:

```bash
pnpm launch:gate
./scripts/deploy.sh --api --web
pnpm launch:check-production-smoke
pnpm launch:check-production-ops
```

Release-grade production verification:

```bash
PROD_SMOKE_TOKEN=... PROD_ADMIN_SMOKE_TOKEN=... pnpm launch:check-production-smoke:full
EXPECTED_STRIPE_MODE=test pnpm launch:check-production-ops:backup-smoke
pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-YYYY-MM-DD
```

Focused log inspection:

```bash
./scripts/view-logs.sh -n 200
./scripts/view-logs.sh -e -n 500
```

Production backups:

```bash
pnpm launch:run-production-backup-retention -- --dry-run --skip-offsite
pnpm launch:run-production-backup-retention -- --apply
pnpm launch:run-offsite-restore-drill
```

## Cross-Skill Routing

- Use `wondertales-verification-scripts` for ordinary local tests, image validation diagnostics, migrations, and non-production command selection.
- Use `wondertales-project-map` for code ownership, database schema meaning, provider wiring, and frontend/API boundaries.
- Use this skill when the task involves production topology, droplet access, deployment, live checks, production logs, backup/restore, cron/alerts, or anything under `docker-compose.prod.yml`.
