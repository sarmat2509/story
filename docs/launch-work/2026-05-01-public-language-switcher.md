# Public Language Switcher

Date: 2026-05-01

## Scope

- Added a shared public SSR footer language switcher for launch-ready public SEO locales only.
- Wired equivalent localized URL switching for:
  - landing: `/` and `/en/`;
  - pricing: `/pricing` and `/en/pricing`;
  - stories catalog: `/stories` and `/en/stories`;
  - legal pages: `/terms`, `/privacy`, `/en/terms`, and `/en/privacy`.
- Added a hydrated web switcher for the React public stories catalog because React hydration replaces the SSR catalog shell.
- Added a web public SEO locale override so default public routes such as `/stories`, public story detail pages, and public author pages force the default `uk` UI locale instead of inheriting a stale saved app language.
- Left support without a switcher because `/support` is noindex and has no localized equivalent route yet.

## Files changed

- `services/api/src/ssr/publicPageFooter.ts`
- `services/api/src/ssr/renderLandingHtml.ts`
- `services/api/src/ssr/renderPricingHtml.ts`
- `services/api/src/ssr/renderPublicStoriesCatalogHtml.ts`
- `services/api/src/ssr/renderLegalHtml.ts`
- `services/api/src/ssr/__tests__/renderLegalHtml.test.ts`
- `services/api/src/ssr/__tests__/pricingPresentation.test.ts`
- `services/api/src/ssr/__tests__/renderPublicStoriesCatalogHtml.test.ts`
- `apps/universal-app/src/utils/publicSeoLocale.ts`
- `apps/universal-app/src/config/i18n.ts`
- `apps/universal-app/src/App.tsx`
- `apps/universal-app/src/screens/published/PublishedStoriesScreen.tsx`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderLegalHtml.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/pricingPresentation.test.ts`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/renderPublicStoriesCatalogHtml.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm launch:gate`
- DevTools live check:
  - `/en/privacy` renders the SSR language switcher without inline event handlers and switches to `/privacy`.
  - `/pricing` renders the default `uk` switcher without console errors.
  - `/stories` keeps the language switcher after React hydration.
  - `/stories` switches to `/en/stories`, and `/en/stories` switches back to `/stories`.
- Docker log review:
  - `wondertales-api-dev`: expected dev restart from `packages/shared/dist` changes during gate, normal DB pool/debug entries, no new errors.
  - `wondertales-nginx-dev`: expected SSR rewrites, Expo `/hot` websocket traffic, and dev tooling `/message` 404 noise.
  - `wondertales-postgres-dev` and `wondertales-redis-dev`: no new messages in the checked window.
