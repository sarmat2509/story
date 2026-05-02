# Launch UI Locales and I18n Gate

Date: 2026-05-02

## Summary

- Split launch UI locales from broader story/content languages.
- Kept story/content language support broad through `LOCALE_IDS`.
- Limited app interface locales to `uk`, `en`, `ru`, and `pl` through `APP_UI_LOCALES`.
- Language Settings now shows only launch-ready UI locales.
- Web i18n initialization ignores stale saved or URL UI preferences outside the launch UI set.
- Billing checkout and Customer Portal return URLs normalize to launch UI locales, preventing incomplete UI locale return paths such as `/es/profile`.
- Filled missing translation keys for `uk`, `en`, `ru`, and `pl`.
- Added a launch-gate regression test that enforces complete key coverage for every launch UI locale.

## Validation

- `pnpm --filter @wondertales/shared build`
- `cd services/api && pnpm exec tsx src/ssr/__tests__/appUiI18nCoverage.test.ts`
- `cd services/api && pnpm exec tsx src/routes/__tests__/billingReturnUrls.test.ts`
- `cd services/api && pnpm exec tsx src/ssr/__tests__/routeOwnership.test.ts`
- `pnpm --filter wondertales-universal-app type-check`
- `cd services/api && pnpm build`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api --web`
- Production DevTools verified `/ru/settings/language` renders only `uk`, `en`, `ru`, and `pl` language options.
- Production DevTools console check found no console messages on the language settings page.
- `CHECK_PROD_REMOTE=0 ./scripts/check-production-smoke.sh` passed public/route/SSR smoke with `0` failures and the expected unauthenticated/admin skipped-check warnings.
- Production Docker logs showed successful `/ru/settings/language` and smoke-route responses; only known nginx temporary-buffer warnings and unrelated internet scanner `400` lines appeared.

## Migration Notes

- No database migration was needed.
- No destructive operations were performed.

## Follow-Up

- Complete `es`, `de`, and `fr` UI translation coverage before adding them back to the launch UI locale list.
- Continue keeping public SEO locales separate from app UI locales.
