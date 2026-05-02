# Nginx SPA Proxy Buffering

Date: 2026-05-02

## Summary

- Tuned production SPA proxy buffering for webapp responses served through the
  outer nginx container.
- Added guarded checks in `scripts/check-security-headers.sh` so the production
  SPA proxy include keeps the buffering override.

## Why

After the web document-locale deploy, production nginx logged:

`an upstream response is buffered to a temporary file ... while reading upstream`

for the large exported Expo web JS bundle. The response still succeeded, but the
warning made Docker log scans noisier and could hide more important deploy
warnings.

## Verification

- `pnpm launch:check-security-headers`
- `./scripts/deploy.sh --web`
- `curl -fsS https://wondertales.art/health`
- `pnpm launch:check-production-security-artifacts`
- Fetched the deployed web bundle through production nginx:
  - `/_expo/static/js/web/index-6ecb1204f574ee9647519340e5ba71c3.js`
  - `4719871` bytes downloaded successfully.
- Fresh production webapp/nginx Docker log scan after the large bundle fetch found
  no `error`, `warn`, `failed`, `panic`, `unhandled`, `exception`, or
  `temporary file` lines in the checked window.

## Deployment Notes

- The change only affects nginx proxy buffering for SPA/webapp routes.
- No database migration was needed.
- No destructive operations were performed.
