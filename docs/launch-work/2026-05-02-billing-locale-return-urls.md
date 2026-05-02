# Billing Locale Return URLs

## Summary

- Added a shared app-route locale builder that preserves app-supported locale prefixes for SPA paths while keeping the default `uk` route unprefixed.
- Updated Stripe subscription checkout, bundle checkout, and Customer Portal return URLs to use the authenticated user's `preferredLocale`.
- Added launch-gate coverage for localized billing success, cancel, and portal return URLs.

## Files Changed

- `packages/shared/src/utils/routeOwnership.ts`
- `services/api/src/routes/billingReturnUrls.ts`
- `services/api/src/routes/billing.ts`
- `services/api/src/routes/__tests__/billingReturnUrls.test.ts`
- `scripts/launch-gate.sh`
- `LAUNCH_ROADMAP.md`

## Verification

- `pnpm --filter @wondertales/shared build`
- `cd services/api && pnpm exec tsx src/routes/__tests__/billingReturnUrls.test.ts`
- `cd services/api && pnpm build`
- `pnpm launch:gate`
- `./scripts/deploy.sh --api`
- Chrome DevTools production check with the authenticated QA user (`preferredLocale=ru`): bundle checkout session creation returned `200`.
- Production Stripe session retrieval confirmed the new bundle checkout URLs:
  - `success_url=https://wondertales.art/ru/billing/success?kind=bundle&session_id={CHECKOUT_SESSION_ID}`
  - `cancel_url=https://wondertales.art/ru/billing/plans`
- Chrome DevTools opened Stripe Customer Portal and verified both visible return links pointed to `https://wondertales.art/ru/profile`; clicking the return link landed on `/ru/profile`.
- Production docker logs showed expected billing checkout/portal entries and no API errors. The only warning was the known nginx temporary-buffer warning for the large JS bundle.

## Migration Notes

- No database migration was required.
- No destructive operation was used.
