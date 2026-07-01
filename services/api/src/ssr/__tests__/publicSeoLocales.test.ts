import assert from 'node:assert/strict';
import { buildLandingAlternateLinks, PUBLIC_SEO_LOCALES } from '../landingContent';
import { renderPricingHtml } from '../renderPricingHtml';
import { PUBLIC_TRANSLATION_LOCALES, buildPublicPricingPath } from '@wondertales/shared';
import { resolveLandingRouteLocale } from '../../routes/ssrLanding';
import { resolvePricingRouteLocale } from '../../routes/ssrPricing';
import { resolveLegalRouteLocale } from '../../routes/ssrLegal';
import { resolveSupportRouteLocale } from '../../routes/ssrSupport';

assert.deepEqual(
  [...PUBLIC_SEO_LOCALES],
  [...PUBLIC_TRANSLATION_LOCALES],
  'public SEO locales should cover every translated public surface'
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
for (const locale of PUBLIC_SEO_LOCALES) {
  assert.equal(resolveLandingRouteLocale(locale), locale);
  assert.equal(resolvePricingRouteLocale(locale), locale);
  assert.equal(resolveLegalRouteLocale(locale), locale);
  assert.equal(resolveSupportRouteLocale(locale), locale);
}

console.log('publicSeoLocales tests passed');
