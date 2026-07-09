import assert from 'node:assert/strict';
import { resolveBillingEntryTarget } from '../billingEntry';

assert.deepEqual(
  resolveBillingEntryTarget({
    isAuthenticated: false,
    platformOs: 'web',
    pathname: '/welcome',
    locale: 'en',
    preferPublicPricingForGuests: true,
  }),
  {
    kind: 'public-web-pricing',
    href: '/pricing',
  }
);

assert.deepEqual(
  resolveBillingEntryTarget({
    isAuthenticated: false,
    platformOs: 'web',
    pathname: '/welcome',
    locale: 'ru',
    preferPublicPricingForGuests: true,
  }),
  {
    kind: 'public-web-pricing',
    href: '/ru/pricing',
  }
);

assert.deepEqual(
  resolveBillingEntryTarget({
    isAuthenticated: true,
    sessionMode: 'parent',
    platformOs: 'web',
    pathname: '/ru/wizard',
    locale: 'ru',
    preferPublicPricingForGuests: true,
  }),
  { kind: 'app-plans' }
);

assert.deepEqual(
  resolveBillingEntryTarget({
    isAuthenticated: true,
    sessionMode: 'child',
    platformOs: 'web',
    pathname: '/child-mode',
    locale: 'en',
    preferPublicPricingForGuests: true,
  }),
  { kind: 'parent-gate' }
);

console.log('billingEntry tests passed');
