# Nginx Asset Buffering

Date: 2026-05-02

## Context

After expanding production ops log coverage to include nginx, the post-web-deploy check found proxy temp-file warnings for large `/api/v1/assets/...png` responses.

## Changes

- Added a dedicated production nginx route for `/api/v1/assets/`.
- Disabled response buffering and proxy temp-file spill for asset responses.
- Mirrored the route in development nginx config.
- Extended `scripts/check-security-headers.sh` to guard the asset route.

## Verification

- `pnpm launch:check-security-headers`
- `bash -n scripts/check-security-headers.sh scripts/deploy.sh`
- `./scripts/deploy.sh --nginx`
- Production nginx config validation inside a temporary nginx container passed.
- `curl https://wondertales.art/api/v1/assets/...png` returned `200 image/png` for a `1.6 MB` production asset.
- `pnpm launch:check-production-security-artifacts` passed.
- `LOG_SINCE=2m EXPECTED_STRIPE_MODE=test pnpm launch:check-production-ops` passed with `0` failures and no recent api/webapp/nginx log findings.
