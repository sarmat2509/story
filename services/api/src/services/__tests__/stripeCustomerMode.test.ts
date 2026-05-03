import assert from 'node:assert/strict';
import { isMissingStripeCustomerForActiveMode } from '../billingService';

assert.equal(
  isMissingStripeCustomerForActiveMode({
    code: 'resource_missing',
    param: 'customer',
    message: "No such customer: 'cus_live'; a similar object exists in live mode, but a test mode key was used to make this request.",
  }),
  true
);

assert.equal(
  isMissingStripeCustomerForActiveMode({
    code: 'resource_missing',
    param: 'price',
    message: "No such price: 'price_missing'",
  }),
  false
);

assert.equal(isMissingStripeCustomerForActiveMode(new Error('network failed')), false);

console.log('stripeCustomerMode tests passed');
