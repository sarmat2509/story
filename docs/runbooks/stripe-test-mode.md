# Stripe Test-Mode Verification Runbook

Use this runbook before public web beta and after any billing deploy. Do not use live cards or live-mode keys in this flow.

## Preconditions

- `ENABLE_REAL_PAYMENTS=true` in production.
- Production API has `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` configured.
- Stripe test-mode webhook endpoint points to `https://wondertales.art/api/v1/billing/webhook/stripe`.
- Enabled webhook events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- QA parent account can sign in on `https://wondertales.art`.

## Smoke Check

Run the broad non-destructive smoke:

```bash
PROD_SMOKE_CHECKOUT=1 \
PROD_SMOKE_EMAIL='qa.free_user@wondertales.test' \
PROD_SMOKE_PASSWORD='...' \
PROD_ADMIN_SMOKE_EMAIL='qa.admin_user@wondertales.test' \
PROD_ADMIN_SMOKE_PASSWORD='...' \
CHECK_PROD_REMOTE=0 \
./scripts/check-production-smoke.sh
```

Expected result: `Summary: 0 failure(s), 0 warning(s)`.

## Bundle Checkout

1. Open `https://wondertales.art/billing/plans` as a signed-in QA parent.
2. Click a bundle `Buy` button.
3. Confirm Stripe Checkout opens in sandbox mode with the expected bundle line item and QA email.
4. Click `Back to Wondertales`.
5. Confirm the browser returns to `https://wondertales.art/billing/plans`.
6. Start a fresh bundle checkout.
7. Pay with Stripe sandbox card data.
8. Confirm the browser returns to `/billing/success?kind=bundle&session_id=...`.
9. Confirm the success screen says the bundle was added, not that the subscription changed.

After payment, verify usage:

```bash
curl -sS https://wondertales.art/api/v1/me/subscription-usage \
  -H "authorization: Bearer <QA_TOKEN>"
```

Expected result: `bundle_bonus` increases for stories and audio.

Check API logs:

```bash
ssh root@167.172.102.75 \
  "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --since 15m"
```

Expected log sequence:

- `Created Stripe bundle Checkout Session`
- `Processing Stripe webhook` with `checkout.session.completed`
- `Recorded user_bundle_grant from Stripe bundle checkout`

## Subscription Checkout

1. Open `https://wondertales.art/billing/plans` as a signed-in QA parent.
2. Start checkout for a paid subscription plan.
3. Verify hosted Checkout line item and QA email.
4. Verify cancel returns to the authenticated billing screen.
5. Complete a sandbox subscription payment.
6. Verify webhook logs and `/api/v1/me/subscription-usage` reflect the paid plan.
7. Open the customer portal from profile and verify cancellation/management flow.
8. Cancel the subscription in the portal or trigger a test-mode `customer.subscription.updated` event.
9. Confirm `/api/v1/me/subscription-usage` reports `cancelAtPeriodEnd: true` and the profile shows cancellation-pending copy.

## Payment Failed

Use a signed test webhook or Stripe test-mode renewal failure to send `invoice.payment_failed` for an existing test subscription.

Expected result:

- API logs show `invoice.payment_failed`.
- The local subscription status becomes `past_due`.
- `/api/v1/me/subscription-usage` includes `subscriptionStatus: "past_due"`.
- The profile shows payment-issue copy and still leaves the customer portal available.
- A later `customer.subscription.updated` event from Stripe can restore the local status to `active`.

## Failure Signals

- Checkout opens but no webhook log appears: check Stripe endpoint existence and `STRIPE_WEBHOOK_SECRET`.
- Webhook appears but no grant/subscription update is recorded: check event metadata and API logs.
- `customer.subscription.updated` fails with `Invalid time value`: check whether Stripe sent period timestamps on subscription items instead of the top-level subscription object.
- Bundle payment succeeds but `bundle_bonus` is unchanged: check `user_bundle_grants` period overlap and subscription period dates.
- Success page says subscription text after bundle payment: verify `kind=bundle` in the success URL and frontend bundle success copy.
