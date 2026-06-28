import assert from 'node:assert/strict';
import { renderLandingHtml } from '../renderLandingHtml';

const eurHtml = renderLandingHtml({ locale: 'uk', billingCurrency: 'EUR' });
const usdHtml = renderLandingHtml({ locale: 'uk', billingCurrency: 'USD' });

assert.match(eurHtml, /class="landing-currency-toggle"/);
assert.match(eurHtml, /href="\/\?currency=EUR" class="active"/);
assert.match(eurHtml, /href="\/\?currency=USD" class=""/);
assert.match(eurHtml, /8,99 EUR/);
assert.match(eurHtml, /25,99 EUR/);
assert.match(eurHtml, /59,99 EUR/);

assert.match(usdHtml, /class="landing-currency-toggle"/);
assert.match(usdHtml, /href="\/\?currency=EUR" class=""/);
assert.match(usdHtml, /href="\/\?currency=USD" class="active"/);
assert.match(usdHtml, /9,99 USD/);
assert.match(usdHtml, /29,99 USD/);
assert.match(usdHtml, /69,99 USD/);

const enHtml = renderLandingHtml({ locale: 'en', billingCurrency: 'USD' });
assert.match(enHtml, /href="\/en\/\?currency=EUR" class=""/);
assert.match(enHtml, /href="\/en\/\?currency=USD" class="active"/);

console.log('renderLandingPricingCurrency tests passed');
