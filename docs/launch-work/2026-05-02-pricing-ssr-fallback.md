# Pricing SSR Fallback

## Summary

- Added a bounded plan-data load for the public pricing SSR route.
- Added a static launch-plan fallback so `/pricing` and `/en/pricing` still render complete plan cards if database-backed plan presentation is slow or temporarily unavailable.
- Reused the shared pricing presenter for fallback cards, including feature ordering, hidden feature rules, price formatting, and usage highlights.
- Fixed plural-aware story/audio usage highlights across visible app locales, so one-credit limits do not render as plural copy.

## Files Changed

- `services/api/src/routes/ssrPricing.ts`
- `services/api/src/ssr/renderPricingHtml.ts`
- `services/api/src/ssr/__tests__/pricingPresentation.test.ts`
- `packages/shared/src/utils/planPresentation.ts`
- `packages/shared/src/i18n/en.json`
- `packages/shared/src/i18n/uk.json`
- `packages/shared/src/i18n/ru.json`
- `packages/shared/src/i18n/es.json`
- `packages/shared/src/i18n/fr.json`
- `packages/shared/src/i18n/de.json`
- `packages/shared/src/i18n/pl.json`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-api exec tsx src/ssr/__tests__/pricingPresentation.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api --web`
- Production curl checks:
  - `https://wondertales.art/pricing` returned `200`, a pricing ETag, and no `1 audio stories`/`1 аудіоказок` copy.
  - `https://wondertales.art/en/pricing` returned `200` and rendered `3 stories and 1 audio story per month`.
  - an unknown public route returned `404` with `X-Robots-Tag: noindex,nofollow`.
- Production DevTools verified `/en/pricing` renders SSR-only pricing content with no console messages and only the document request in the network log.
- Production docker logs after deploy showed successful `/pricing`, `/en/pricing`, and unknown-route checks with no pricing fallback warnings or API errors.

## Migration Notes

- No database migration was required.
- No destructive operation was used.
- The deploy script ran its post-deploy migration check and reported that all migrations were already applied.
