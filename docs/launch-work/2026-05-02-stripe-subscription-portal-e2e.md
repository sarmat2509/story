# Stripe Subscription and Portal E2E

Date: 2026-05-02

## What changed

- Fixed Stripe subscription webhook handling for newer API-version events where period timestamps are present on `items.data[0]` instead of the subscription top level.
- Added `resolveStripeSubscriptionPeriodSeconds` coverage for both timestamp shapes and missing-period failure behavior.
- Added the regression test to `pnpm launch:gate`.

## Production verification

- DevTools opened production subscription checkout for the `silver` plan.
- DevTools verified checkout cancel returns to `/billing/plans`.
- DevTools completed a Stripe sandbox subscription payment.
- The app returned to `/billing/success?kind=subscription&session_id=...`.
- `/api/v1/me/subscription-usage` reflected `silver` plan limits plus the existing bundle bonus.
- DevTools opened Stripe Customer Portal from `/profile`.
- Portal showed the active subscription, payment method, invoice history, and cancellation action.
- Portal cancellation was completed and returned to `/profile`.
- After the API fix was deployed, fresh `customer.subscription.updated` events updated local state without the previous `RangeError`.
- `/api/v1/me/subscription-usage` reported `cancelAtPeriodEnd: true`.
- Profile showed the cancellation-pending subscription state through the current period end.
- Production smoke passed with `0` failures and `0` warnings after the API deploy.

## Remaining

- Exercise a payment-failed event in Stripe test mode and record the support-facing behavior.
- Record the refund/support process path without issuing live-mode refunds.
