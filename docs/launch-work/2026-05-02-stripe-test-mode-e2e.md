# Stripe Test-Mode E2E

Date: 2026-05-02

## What changed

- Configured the Stripe test-mode webhook endpoint for the production API URL.
- Synced the new webhook signing secret into local and production `.env.production` without committing it.
- Added `kind=subscription|bundle` to Stripe success URLs so the app can distinguish plan upgrades from bundle purchases.
- Added bundle-specific billing success copy and navigation behavior across app locales.
- Allowed bundle purchase buttons when real web payments are enabled, even when a static Stripe Price ID is absent.
- Added active-period normalization for non-Stripe subscriptions before usage/quota/bundle calculations.
- Kept expired Stripe-backed periods from auto-extending without webhook data.
- Added `subscriptionPeriodService` coverage and included it in `pnpm launch:gate`.
- Added `docs/runbooks/stripe-test-mode.md`.

## Production verification

- DevTools verified bundle checkout cancel returns from Stripe sandbox to `/billing/plans`.
- DevTools completed a Stripe sandbox bundle payment.
- The browser returned to `/billing/success?kind=bundle&session_id=...`.
- The success screen title, header, body, and primary action show bundle-specific copy.
- Production API logs show `checkout.session.completed` and `Recorded user_bundle_grant from Stripe bundle checkout`.
- `/api/v1/me/subscription-usage` showed the expected bundle bonus: `+5` stories and `+2` audio.
- Final production smoke passed with `0` failures and `0` warnings.
- Docker log tail after smoke showed expected checkout/webhook records and no matching error/warn lines.

## Remaining

- Complete subscription payment success/cancel verification.
- Verify customer portal, cancellation, subscription update/delete, payment-failed, and refund/support paths.
- Decide final live-mode Stripe webhook setup before paid launch.
