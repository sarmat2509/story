# Production Verification, Smoke Checks, and Logs

## Contents

- Release Gates
- Production Smoke
- Ops Readiness
- Security and Auth Checks
- Cleanup and Abuse Checks
- Logs

## Release Gates

Before production deploy:

```bash
pnpm launch:gate
```

After production deploy:

```bash
pnpm launch:check-production-smoke
pnpm launch:check-production-ops
```

After nginx, SSR, header, or client bundle changes:

```bash
pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-YYYY-MM-DD
```

Production scripts may use live network, SSH, Stripe test/live modes, or real production data. Confirm intent before commands that mutate, create checkouts, install cron, or run apply-mode backup/cleanup.

## Production Smoke

Script: `scripts/check-production-smoke.sh`.

Package commands:

```bash
pnpm launch:check-production-smoke
pnpm launch:check-production-smoke:full
```

Defaults:

- `BASE_URL=https://wondertales.art`
- Runs broad non-destructive public SSR/API checks.
- Tries best-effort remote API log tail unless `--no-remote` or `CHECK_PROD_REMOTE=0`.

Useful flags:

- `--full`: requires authenticated and admin checks, enables checkout and child-mode branches.
- `--checkout`: create Stripe checkout sessions.
- `--child-mode`: run temporary child-mode fixture.
- `--support-feedback`: smoke support/public-report feedback paths.
- `--require-auth`: fail if no authenticated token/credentials are provided.
- `--require-admin`: fail if no admin token/credentials are provided.
- `--skip-hosted-checkout`: create checkout session but do not load hosted checkout URL.
- `--no-remote`: skip SSH log tail.

Credential inputs:

- `PROD_SMOKE_TOKEN` or `PROD_SMOKE_EMAIL`/`PROD_SMOKE_PASSWORD`
- `PROD_ADMIN_SMOKE_TOKEN` or `PROD_ADMIN_SMOKE_EMAIL`/`PROD_ADMIN_SMOKE_PASSWORD`
- `PROD_SMOKE_FEEDBACK_CAPTCHA_TOKEN` if feedback CAPTCHA is enabled

Full mode can create cleanup-safe temporary data and Stripe test-mode Checkout Sessions. Make sure the current Stripe mode is intentional before running checkout branches.

## Ops Readiness

Script: `scripts/check-production-ops.sh`.

Package commands:

```bash
pnpm launch:check-production-ops
pnpm launch:check-production-ops:backup-smoke
```

Defaults:

- remote target: `root@167.172.102.75:/var/www/kazka`
- `EXPECTED_STRIPE_MODE=test`
- read-only unless `--backup-smoke` is passed
- log scan window: `LOG_SINCE=30m`
- checked services in logs: `LOG_SERVICES="api webapp"`

Checks include:

- Docker, curl, `ss`
- project directory, compose file, `.env.production`
- containers: `wondertales-postgres-prod`, `wondertales-api-prod`, `wondertales-webapp-prod`, `shared-nginx-proxy`
- legacy `wondertales-nginx` state
- public `80`/`443`, API localhost `3000`, Postgres localhost `5432`
- public and local health endpoints
- disk thresholds for root, Docker, and project filesystems
- Postgres data and backup mount readability
- API uploads/log volumes readability
- recent DB/upload backups
- required production env key presence without printing secret values
- Stripe key mode
- scheduler/alert/offsite backup references
- recent API/webapp/shared proxy logs

Use `--backup-smoke` before launch windows when backup creation should be verified. It creates a non-destructive custom-format PostgreSQL dump under `/backups` and validates it with `pg_restore -l`.

Set `EXPECTED_STRIPE_MODE=live` before live paid checkout readiness checks.

## Security and Auth Checks

Security artifact checker:

```bash
pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-YYYY-MM-DD
```

It fetches deployed SSR and SPA routes, verifies headers, apex/`www` behavior, noindex on auth/app routes, and scans fetched HTML/JS/CSS/JSON for server-side secret markers.

Auth/recovery check:

```bash
bash scripts/check-production-auth.sh
CHECK_PROD_REMOTE=0 bash scripts/check-production-auth.sh
PROD_AUTH_RESET_EMAIL=parent@example.com bash scripts/check-production-auth.sh
```

It checks health, Google OAuth start/callback shape, forgot/reset-password behavior, CORS, domain email DNS signals, support MX, and remote API env/logs when remote checks are enabled.

API production packaging guard:

```bash
bash scripts/check-api-production-assets.sh
```

It ensures production Docker packaging includes required built/shared/legal/script assets and avoids production-hostile source paths.

## Cleanup and Abuse Checks

Orphan cleanup dry-run:

```bash
bash scripts/check-production-orphan-cleanup.sh
```

It SSHes to production and runs `dist/scripts/scanOrphanStorageFiles.js` in dry-run mode inside the API container. It fails if the scanner did not run dry-run or reports deletions.

Abuse signal log scan:

```bash
bash scripts/check-production-abuse-signals.sh
LOG_SINCE=6h bash scripts/check-production-abuse-signals.sh
ABUSE_SIGNAL_FAIL_ON_MATCHES=1 bash scripts/check-production-abuse-signals.sh
```

It scans production API logs for rate-limit/abuse patterns.

Paid launch gate:

```bash
pnpm launch:check-paid-readiness
```

This checks operator-owned launch confirmations and external production dependencies such as legal operator, incident owner, offsite backup target, restore drill, and alert credentials.

## Logs

Preferred helper:

```bash
./scripts/view-logs.sh
./scripts/view-logs.sh -f
./scripts/view-logs.sh -n 200
./scripts/view-logs.sh -e -n 500
```

Direct pattern:

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 200"
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api webapp --since 30m"
```

When sharing logs in conversation or docs, redact emails, tokens, API keys, child data, uploaded photo references, story text, and payment identifiers unless the user explicitly asks for a controlled forensic extract.
