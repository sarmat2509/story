# Nginx Share-Card Buffering

Date: 2026-05-02

## Context

Post-deploy Docker log review found a production nginx warning for `/share-card/taiemnitsya-mors-kogo-spivu`:

- upstream response buffered to `/var/cache/nginx/proxy_temp/...`

This was not user-facing, but it creates noisy warning logs during normal public story sharing checks.

## Changes

- Disabled nginx response buffering for `/share-card/` in production, development, and the shared SSR route include.
- Added `proxy_max_temp_file_size 0` to the same route so dynamic Open Graph image responses cannot spill into proxy temp files.
- Extended `scripts/check-security-headers.sh` to keep the `/share-card/` buffering guard in dev/prod/shared nginx configs.
- Added `./scripts/deploy.sh --nginx` for nginx/compose config-only deploys.
- Moved `deploy.sh --help` handling before SSH bootstrap so help output does not prompt for the droplet key.

## Verification

- `bash -n scripts/deploy.sh scripts/check-security-headers.sh`
- `./scripts/deploy.sh --help`
- `pnpm launch:check-security-headers`
- `./scripts/deploy.sh --nginx`
- Production nginx config validation inside a temporary nginx container passed.
- `curl https://wondertales.art/share-card/taiemnitsya-mors-kogo-spivu` returned `200 image/jpeg`.
- `CHECK_PROD_REMOTE=0 pnpm launch:check-production-smoke` completed with `0` failures.
- `pnpm launch:check-production-security-artifacts` passed.
- Production Docker log scan for api/webapp/nginx after the share-card request found no matching `error|warn|failed|panic|unhandled|exception|temporary file|LIBARCHIVE|xattr` lines.
