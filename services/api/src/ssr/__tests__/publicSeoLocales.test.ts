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
  ['uk', 'en', 'ru', 'es', 'de', 'fr', 'pl'],
  'public SEO locales should cover every launch-ready public marketing locale'
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

assert.equal(resolveLandingRouteLocale(undefined), 'uk');
assert.equal(resolvePricingRouteLocale(undefined), 'uk');
assert.equal(resolveLandingRouteLocale('en'), 'en');
assert.equal(resolvePricingRouteLocale('en'), 'en');
assert.equal(resolveLegalRouteLocale('en'), 'en');
assert.equal(resolveSupportRouteLocale('en'), 'en');
for (const locale of ['ru', 'es', 'de', 'fr', 'pl']) {
  assert.equal(resolveLandingRouteLocale(locale), locale);
  assert.equal(resolvePricingRouteLocale(locale), locale);
  assert.equal(resolveLegalRouteLocale(locale), locale);
  assert.equal(resolveSupportRouteLocale(locale), locale);
}

console.log('publicSeoLocales tests passed');
