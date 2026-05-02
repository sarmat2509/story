import assert from 'node:assert/strict';
import {
  buildBillingCheckoutReturnUrls,
  buildBillingPortalReturnUrl,
} from '../billingReturnUrls';

{
  const urls = buildBillingCheckoutReturnUrls(
    'https://wondertales.art/',
    'ru',
    'subscription'
  );

  assert.deepEqual(urls, {
    successUrl:
      'https://wondertales.art/ru/billing/success?kind=subscription&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://wondertales.art/ru/billing/plans',
  });
}

{
  const urls = buildBillingCheckoutReturnUrls(
    'https://wondertales.art',
    'uk',
    'bundle'
  );

  assert.deepEqual(urls, {
    successUrl:
      'https://wondertales.art/billing/success?kind=bundle&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://wondertales.art/billing/plans',
  });
}

{
  const urls = buildBillingCheckoutReturnUrls('/app', 'pt-BR', 'bundle');

  assert.deepEqual(urls, {
    successUrl: '/app/billing/success?kind=bundle&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: '/app/billing/plans',
  });
}

assert.equal(
  buildBillingPortalReturnUrl('https://wondertales.art/', 'pl'),
  'https://wondertales.art/pl/profile'
);

assert.equal(
  buildBillingPortalReturnUrl('https://wondertales.art/', 'es'),
  'https://wondertales.art/profile'
);

assert.equal(
  buildBillingPortalReturnUrl('https://wondertales.art', null),
  'https://wondertales.art/profile'
);

console.log('billingReturnUrls tests passed');
