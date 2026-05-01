# Production Deploy and Hardening

Date: 2026-05-02

## What changed

- Ran the full production deploy path for API, webapp, nginx config sync, and migrations.
- Applied 15 pending production migrations, from `0074_add_user_theme_palette.sql` through `0088_story_child_mode_review_fields.sql`.
- Fixed the webapp restart loop by syncing compose/nginx config before recreating the webapp container and using `docker compose up -d --force-recreate webapp` instead of `restart`.
- Bound production API and Postgres ports to `127.0.0.1` so nginx/TLS is the public entry point and Postgres is no longer exposed to the internet.
- Fixed production SSR pricing crash by loading shared i18n JSON through `@wondertales/shared/i18n/*.json` package exports instead of a source-tree filesystem path.
- Fixed production legal pages by copying legal markdown into the API production image.
- Added `scripts/check-api-production-assets.sh` and wired it into `pnpm launch:gate`.
- Expanded the Let's Encrypt certificate to include `www.wondertales.art`.
- Added nginx canonical redirects from `www.wondertales.art` to `wondertales.art`.

## Verification

- `pnpm launch:gate` passed after API/web/type/build/security checks.
- `bash scripts/check-security-headers.sh` passed after nginx changes.
- `bash scripts/check-api-production-assets.sh` passed.
- Production smoke returned expected statuses:
  - `/`, `/en/`, `/pricing`, `/en/pricing`, `/terms`, `/en/terms`, `/privacy`, `/en/privacy`, `/stories`, `/sitemap.xml`, `/health`: `200`
  - unknown public route: `404`
  - sample public story from sitemap: `200`
- `https://www.wondertales.art/` now returns `301` to `https://wondertales.art/`.
- Certificate SAN now includes both `wondertales.art` and `www.wondertales.art`.
- Direct public access to droplet ports `3000` and `5432` timed out after compose hardening.
- DevTools live checks on production `/pricing` and `/privacy` showed document `200`, no console errors, and rendered real page content.
- Docker logs after smoke showed API, nginx, webapp, and Postgres running; no SSR crash after pricing/legal/sitemap requests.

## Notes

- The deploy tar extraction still logs harmless macOS `LIBARCHIVE.xattr.com.apple.provenance` warnings.
- Earlier Postgres logs showed internet login scans while port `5432` was public; compose now binds it to localhost.
- Legal content still contains beta/legal-operator placeholders that must be finalized before paid public launch.
