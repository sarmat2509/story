import assert from 'node:assert/strict';
import { renderLandingHtml } from '../renderLandingHtml';

const eurHtml = renderLandingHtml({ locale: 'uk', billingCurrency: 'EUR' });
const usdHtml = renderLandingHtml({ locale: 'uk', billingCurrency: 'USD' });

assert.match(eurHtml, /class="landing-currency-toggle"/);
assert.doesNotMatch(eurHtml, /\?currency=/);
assert.match(eurHtml, /data-landing-currency-toggle/);
assert.match(eurHtml, /data-currency-option="EUR" class="active" aria-pressed="true"/);
assert.match(eurHtml, /data-currency-option="USD" class="" aria-pressed="false"/);
assert.match(eurHtml, /sessionStorage\.getItem\(key\)/);
assert.match(eurHtml, /sessionStorage\.setItem\(key,currency\)/);
assert.match(eurHtml, /8,99 EUR/);
assert.match(eurHtml, /25,99 EUR/);
assert.match(eurHtml, /59,99 EUR/);
assert.match(eurHtml, /data-price-usd="9,99 USD"/);
assert.match(eurHtml, /data-price-usd="29,99 USD"/);
assert.match(eurHtml, /data-price-usd="69,99 USD"/);

assert.match(usdHtml, /class="landing-currency-toggle"/);
assert.doesNotMatch(usdHtml, /\?currency=/);
assert.match(usdHtml, /data-currency-option="EUR" class="" aria-pressed="false"/);
assert.match(usdHtml, /data-currency-option="USD" class="active" aria-pressed="true"/);
assert.match(usdHtml, /9,99 USD/);
assert.match(usdHtml, /29,99 USD/);
assert.match(usdHtml, /69,99 USD/);
assert.match(usdHtml, /data-price-eur="8,99 EUR"/);
assert.match(usdHtml, /data-price-eur="25,99 EUR"/);
assert.match(usdHtml, /data-price-eur="59,99 EUR"/);

const enHtml = renderLandingHtml({ locale: 'en', billingCurrency: 'USD' });
assert.doesNotMatch(enHtml, /\?currency=/);
assert.match(enHtml, /data-currency-option="EUR" class="" aria-pressed="false"/);
assert.match(enHtml, /data-currency-option="USD" class="active" aria-pressed="true"/);

const voiceHtml = renderLandingHtml({
  locale: 'es',
  voices: [{
    id: 'lyra',
    name: 'lyra',
    displayName: 'Lira',
    sampleAudioUrl: 'voice-samples/es/Aoede.mp3',
  }],
});
assert.match(voiceHtml, /data-audio-url="\/api\/v1\/assets\/voice-samples\/es\/Aoede\.mp3\?v=20260629"/);

console.log('renderLandingPricingCurrency tests passed');
