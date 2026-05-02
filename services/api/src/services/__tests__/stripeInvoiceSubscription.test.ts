import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { resolveStripeInvoiceSubscriptionId } from '../billingService';

{
  const invoice = {
    id: 'in_top_level',
    subscription: 'sub_top_level',
  } as Stripe.Invoice;

  assert.equal(resolveStripeInvoiceSubscriptionId(invoice), 'sub_top_level');
}

{
  const invoice = {
    id: 'in_object_ref',
    subscription: { id: 'sub_object_ref' },
  } as unknown as Stripe.Invoice;

  assert.equal(resolveStripeInvoiceSubscriptionId(invoice), 'sub_object_ref');
}

{
  const invoice = {
    id: 'in_parent_details',
    parent: {
      subscription_details: {
        subscription: 'sub_parent_details',
      },
    },
  } as unknown as Stripe.Invoice;

  assert.equal(resolveStripeInvoiceSubscriptionId(invoice), 'sub_parent_details');
}

{
  const invoice = {
    id: 'in_missing_subscription',
  } as Stripe.Invoice;

  assert.equal(resolveStripeInvoiceSubscriptionId(invoice), null);
}

console.log('stripeInvoiceSubscription tests passed');
