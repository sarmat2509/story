# Billing entry and analytics privacy hardening

Date: 2026-05-03

## What changed

- Added a shared billing entry resolver for app-side pricing/billing navigation.
- Guest web pricing links from the welcome/paywall surfaces now route to public SSR pricing instead of the authenticated app billing route.
- Child sessions are routed back through Child Mode/parent gate surfaces instead of opening billing directly from paywall UI.
- Billing success now removes the Stripe `session_id` query parameter from the browser URL after checkout return while keeping the existing plan, bundle, and usage query invalidation.
- Analytics property scrubbing now removes token-like fields such as `session_id`, `checkout_session_id`, `share_token`, `token`, reset tokens, and session tokens.
- PostHog web denylist/personal-data configuration now includes those token-like fields.
- Added focused app tests for billing entry routing and analytics privacy scrubbing.
- Added both tests to `scripts/launch-gate.sh`.

## Why

This closes two roadmap risks:

- Billing/pricing navigation must respect public SEO route ownership, authenticated billing route ownership, and child-session parent gates.
- Analytics must keep expanding its audit/scrubbing when new billing or sharing event conventions introduce token-like fields.

## Verification

- `pnpm exec tsx src/utils/__tests__/billingEntry.test.ts`
- `pnpm exec tsx src/services/analytics/__tests__/privacy.test.ts`
- `pnpm exec tsx src/routes/__tests__/billingReturnUrls.test.ts`
- `node scripts/check-analytics-payloads.js`
- `pnpm type-check`
- `pnpm build:web`

## Notes

- The billing entry resolver intentionally sends guest web users to public SSR `/pricing` while authenticated parents continue to the app-only `/billing/plans` route.
- The Stripe Checkout success route keeps `kind` in the URL for UI copy, but removes `session_id` after mount.
