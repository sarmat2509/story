# Web Document Locale Sync

Date: 2026-05-02

## Summary

- Added `syncWebDocumentLocale()` for the universal app.
- Bound it to i18next initialization and `languageChanged` events.
- The web SPA now updates `document.documentElement.lang` and `dir` after URL,
  stored preference, auth response, or settings-driven language changes.

## Why

DevTools showed a production auth route rendering Russian UI while the static
SPA shell still had `<html lang="en">`. App/auth routes are noindex, but the
document language still matters for accessibility tools, browser translation,
and consistent locale QA.

## Verification

- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- Local static build smoke:
  - `npx -y serve@latest -s apps/universal-app/dist -l 8091`
  - DevTools loaded `http://localhost:8091/ru/auth/forgot-password`.
  - DevTools evaluation returned `{"lang":"ru","dir":"ltr"}`.
  - DevTools console had no messages.
- Production deploy and smoke:
  - `./scripts/deploy.sh --web`
  - `curl -fsS https://wondertales.art/health`
  - `pnpm launch:check-production-security-artifacts`
  - `curl -fsS https://wondertales.art/ru/auth/forgot-password` showed the deployed `index-6ecb1204f574ee9647519340e5ba71c3.js` bundle.
  - DevTools loaded `https://wondertales.art/ru/auth/forgot-password?codexLocaleCheck=1`.
  - DevTools evaluation returned `{"lang":"ru","dir":"ltr"}`.
  - DevTools console had no messages.
  - Production webapp/nginx Docker log scan found no application errors; nginx still emitted the known temporary-buffer warning for the large web JS bundle.

## Migration Notes

- No database migration was needed.
- No server changes were needed.
- No destructive operations were performed.
