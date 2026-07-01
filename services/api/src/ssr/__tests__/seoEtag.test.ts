import assert from 'node:assert/strict';
import { buildLandingEtag } from '../../routes/ssrLanding';
import { buildPricingEtag } from '../../routes/ssrPricing';

const oldPricing = '<html><link rel="alternate" hreflang="ru" href="/ru/pricing"></html>';
const newPricing = '<html><link rel="alternate" hreflang="en" href="/pricing"></html>';
const oldLanding = '<html><link rel="canonical" href="/ru/"></html>';
const newLanding = '<html><link rel="canonical" href="/"></html>';

assert.match(buildPricingEtag(oldPricing), /^"pricing-[a-f0-9]{12}"$/);
assert.match(buildLandingEtag(oldLanding), /^"landing-[a-f0-9]{12}"$/);
assert.notEqual(
  buildPricingEtag(oldPricing),
  buildPricingEtag(newPricing),
  'pricing ETag must change when rendered SEO HTML changes'
);
assert.notEqual(
  buildLandingEtag(oldLanding),
  buildLandingEtag(newLanding),
  'landing ETag must change when rendered SEO HTML changes'
);

console.log('seoEtag tests passed');
