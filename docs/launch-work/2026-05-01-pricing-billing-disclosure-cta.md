# Pricing billing disclosure and disabled paid CTAs

Date: 2026-05-01

## What changed

- Added billing policy copy to public SSR pricing and authenticated billing/plans:
  - subscriptions renew monthly until canceled;
  - bundles apply only to the current billing period and do not roll over;
  - refund requests go through support and are not automatic on cancellation.
- Passed `ENABLE_REAL_PAYMENTS` into SSR pricing rendering.
- When real payments are disabled, paid plan cards render a non-clickable "Payments coming soon" state instead of a paid CTA.
- The app plans screen now reads `enableRealPayments` from the public plans response as well as the authenticated plans response, so unauthenticated app pricing can also suppress paid CTAs.
- Added SSR coverage in `pricingPresentation.test.ts` for billing copy and disabled paid CTA behavior.

## Verification

- `pnpm --filter @wondertales/shared build`
- `pnpm --dir services/api exec tsx src/ssr/__tests__/pricingPresentation.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter wondertales-universal-app type-check`

## Follow-up

- Stripe hosted checkout success/cancel still needs test-mode verification with real Stripe configuration.
- The final legal operator and refund policy language still need operator/legal confirmation before paid launch.
