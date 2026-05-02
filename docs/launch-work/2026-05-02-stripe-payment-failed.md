# Stripe Payment-Failed Handling

Date: 2026-05-02

## What changed

- `invoice.payment_failed` now resolves the Stripe subscription id from both legacy invoice fields and newer `parent.subscription_details` fields.
- The webhook marks the local subscription `past_due` for support and UI visibility.
- `/api/v1/me/subscription-usage` now returns `subscriptionStatus`.
- The profile shows payment-issue copy for `past_due`, `unpaid`, `incomplete`, and `incomplete_expired`.
- Added regression coverage for invoice subscription id extraction and included it in `pnpm launch:gate`.

## Production verification

- Deployed API and web to production.
- Sent a signed production `invoice.payment_failed` test webhook to the Stripe webhook endpoint.
- API returned `{"received":true}`.
- Production logs showed `invoice.payment_failed` and `Marked subscription past_due after Stripe invoice payment failed`.
- `/api/v1/me/subscription-usage` returned `subscriptionStatus: "past_due"`.
- DevTools verified the profile displayed payment-issue copy.
- Triggered fresh Stripe `customer.subscription.updated` events to restore the QA subscription to `active` with `cancelAtPeriodEnd: true`.
- DevTools verified the profile returned to cancellation-pending copy.
- Production smoke passed with `0` failures and `0` warnings after deploy.

## Remaining

- Record the refund/support policy path and operator-facing support templates.
