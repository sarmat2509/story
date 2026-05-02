# Production Security Artifact Audit

Date: 2026-05-02

## Summary

- Added `scripts/check-production-security-artifacts.js`.
- Added `pnpm launch:check-production-security-artifacts`.
- The checker fetches the live production site, not the local build output.
- It verifies:
  - deployed SSR headers for `/` and `/pricing`;
  - deployed SPA headers for `/welcome` and `/auth/forgot-password`;
  - `www.wondertales.art` redirects to the apex domain;
  - SPA/auth routes keep `X-Robots-Tag: noindex,nofollow`;
  - CSP includes the expected restrictive directives and does not allow broad `connect-src https:`;
  - the exact deployed HTML, manifest, sitemap, JS, CSS, and icon artifacts do not contain server-side secret markers.
- Archived header captures under `docs/launch-work/artifacts/production-security-2026-05-02/`.

## Production Result

`pnpm launch:check-production-security-artifacts` passed against `https://wondertales.art`.

- Header targets checked: `5`.
- Production HTML/assets scanned: `10`.
- Forbidden marker failures: `0`.
- Header target statuses:
  - `/`: `200`.
  - `/pricing`: `200`.
  - `/welcome`: `200`.
  - `/auth/forgot-password`: `200`.
  - `https://www.wondertales.art/`: `301` to apex.
- Deployed web bundle scanned:
  - `/_expo/static/js/web/index-173fbeef2801aca396afad7b78dd01b4.js`.
  - `/_expo/static/css/global-e44409d203184e376794c5cb9d478c25.css`.
  - `/manifest.json`, `/sitemap.xml`, `/favicon.ico`, `/favicon.png`, plus the fetched HTML entrypoints.

## Verification

- `node scripts/check-production-security-artifacts.js --help`
- `pnpm launch:check-production-security-artifacts`
- `pnpm launch:check-production-security-artifacts -- --output-dir docs/launch-work/artifacts/production-security-2026-05-02`

## Migration Notes

- No database migration was needed.
- No production writes were performed.
- No destructive operations were performed.
