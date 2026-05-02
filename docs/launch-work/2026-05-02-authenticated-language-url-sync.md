# Authenticated Language URL Sync

## Summary

- Added a locale preference helper for applying stored user locale preferences consistently.
- Language settings now update i18n, local storage, the server-side `preferredLocale`, and the current web URL locale prefix.
- Email/password login, registration, OAuth login, and parent-gate return now apply `user.preferredLocale` after successful auth responses.
- Default-locale Ukrainian routes remove the locale prefix; non-default app locales keep a `/{locale}` prefix for web navigation consistency.

## Files Changed

- `apps/universal-app/src/utils/localePreference.ts`
- `apps/universal-app/src/api/auth.ts`
- `apps/universal-app/src/screens/profile/LanguageSettingsScreen.tsx`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- `./scripts/deploy.sh --web`
- Production DevTools check on `https://wondertales.art/settings/language`: switched the authenticated admin profile from Russian to English and back to Russian, verified `PATCH /api/v1/me` returned `200`, the web URL changed to `/en/settings/language` and then `/ru/settings/language`, and local/auth storage reflected the selected `preferredLocale`.
- Production DevTools console: no console messages during the language switch flow.
- Production docker logs for `api`, `nginx`, and `webapp` over the verification window: both profile updates logged successfully; no API errors or exceptions were present. The only warning was the known nginx static-asset temporary-buffer warning.

## Migration Notes

- No database migration was required.
- No destructive operation was used.
