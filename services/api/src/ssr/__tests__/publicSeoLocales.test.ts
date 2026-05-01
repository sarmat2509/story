import assert from 'node:assert/strict';
import { buildLandingAlternateLinks, PUBLIC_SEO_LOCALES } from '../landingContent';
import { renderPricingHtml } from '../renderPricingHtml';

const unsupportedLocales = ['ru', 'es', 'de', 'fr', 'pl'];

assert.deepEqual(
  [...PUBLIC_SEO_LOCALES],
  ['uk', 'en'],
  'launch public SEO locales stay limited to locales with launch-ready legal/public coverage'
);

const landingAlternates = buildLandingAlternateLinks('https://wondertales.art');
assert.match(landingAlternates, /hreflang="uk"/);
assert.match(landingAlternates, /hreflang="en"/);
assert.match(landingAlternates, /hreflang="x-default"/);
for (const locale of unsupportedLocales) {
  assert.doesNotMatch(landingAlternates, new RegExp(`hreflang="${locale}"`));
}

const pricingHtml = renderPricingHtml({ locale: 'en', plans: [] });
assert.match(pricingHtml, /hreflang="uk"/);
assert.match(pricingHtml, /hreflang="en"/);
assert.match(pricingHtml, /hreflang="x-default"/);
for (const locale of unsupportedLocales) {
  assert.doesNotMatch(pricingHtml, new RegExp(`/${locale}/pricing`));
  assert.doesNotMatch(pricingHtml, new RegExp(`hreflang="${locale}"`));
}

console.log('publicSeoLocales tests passed');
