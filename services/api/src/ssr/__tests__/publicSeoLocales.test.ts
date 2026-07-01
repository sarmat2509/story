import assert from 'node:assert/strict';
import { buildLandingAlternateLinks, PUBLIC_SEO_LOCALES } from '../landingContent';
import { renderPricingHtml } from '../renderPricingHtml';
import { buildPublicPricingPath } from '@wondertales/shared';
import { resolveLandingRouteLocale } from '../../routes/ssrLanding';
import { resolvePricingRouteLocale } from '../../routes/ssrPricing';
import { resolveLegalRouteLocale } from '../../routes/ssrLegal';
import { resolveSupportRouteLocale } from '../../routes/ssrSupport';

assert.deepEqual(
  [...PUBLIC_SEO_LOCALES],
  ['en', 'uk'],
  'public SEO locales should cover the indexed English and Ukrainian surfaces'
);

const landingAlternates = buildLandingAlternateLinks('https://wondertales.art');
for (const locale of PUBLIC_SEO_LOCALES) {
  assert.match(landingAlternates, new RegExp(`hreflang="${locale}"`));
}
assert.match(landingAlternates, /hreflang="x-default"/);

const pricingHtml = renderPricingHtml({ locale: 'en', plans: [] });
for (const locale of PUBLIC_SEO_LOCALES) {
  assert.match(pricingHtml, new RegExp(buildPublicPricingPath(locale).replace(/\//g, '\\/')));
  assert.match(pricingHtml, new RegExp(`hreflang="${locale}"`));
}
assert.match(pricingHtml, /hreflang="x-default"/);

assert.equal(resolveLandingRouteLocale(undefined), 'en');
assert.equal(resolvePricingRouteLocale(undefined), 'en');
assert.equal(resolveLegalRouteLocale(undefined), 'en');
assert.equal(resolveSupportRouteLocale(undefined), 'en');
assert.equal(resolveLandingRouteLocale('en'), 'en');
assert.equal(resolvePricingRouteLocale('en'), 'en');
assert.equal(resolveLegalRouteLocale('en'), 'en');
assert.equal(resolveSupportRouteLocale('en'), 'en');
for (const locale of ['ru', 'es', 'de', 'fr', 'pl']) {
  assert.equal(resolveLandingRouteLocale(locale), 'en');
  assert.equal(resolvePricingRouteLocale(locale), 'en');
  assert.equal(resolveLegalRouteLocale(locale), 'en');
  assert.equal(resolveSupportRouteLocale(locale), 'en');
}

console.log('publicSeoLocales tests passed');
