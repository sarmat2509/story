# Shared Pricing Presenter

## What Changed

- Added shared pricing presentation helpers in `@wondertales/shared`.
- Moved feature ordering, hidden-feature rules, feature availability, localized feature labels, price formatting, and combined story/audio usage highlight logic out of duplicated SSR/React code paths.
- Updated public pricing SSR to use the shared presenter.
- Updated authenticated billing/plans UI to use the same presenter while keeping checkout, upgrade, current-plan, and bundle controls UI-specific.
- Added launch-gate coverage for pricing presentation behavior.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/pricingPresentation.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`

## Remaining Follow-Up

- Run a live browser pass on `/pricing` and `/billing/plans` after the dev bundle refreshes.
- Production `wondertales.art/pricing` still needs post-deploy verification.
