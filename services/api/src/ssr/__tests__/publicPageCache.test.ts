import assert from 'node:assert/strict';
import { buildPublicPageCacheKey } from '../publicPageCache';

const pricingKey = buildPublicPageCacheKey('pricing', {
  locale: 'uk',
  billingCurrency: 'EUR',
  payments: 'enabled',
  renderVersion: 2,
});

assert.equal(
  pricingKey,
  buildPublicPageCacheKey('pricing', {
    renderVersion: 2,
    payments: 'enabled',
    billingCurrency: 'EUR',
    locale: 'uk',
  }),
  'public page cache keys should be stable regardless of variant insertion order'
);

assert.notEqual(
  pricingKey,
  buildPublicPageCacheKey('pricing', {
    locale: 'uk',
    billingCurrency: 'USD',
    payments: 'enabled',
    renderVersion: 2,
  }),
  'pricing page cache must keep currency variants separate'
);

assert.match(pricingKey, /^ssr:pages:pricing:b:[^:]+:/);

console.log('publicPageCache tests passed');
