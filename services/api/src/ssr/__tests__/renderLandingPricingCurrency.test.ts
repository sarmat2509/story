import assert from 'node:assert/strict';
import { renderLandingHtml } from '../renderLandingHtml';

const eurHtml = renderLandingHtml({ locale: 'uk', billingCurrency: 'EUR' });
const usdHtml = renderLandingHtml({ locale: 'uk', billingCurrency: 'USD' });

assert.match(eurHtml, /class="landing-currency-toggle"/);
assert.match(eurHtml, /--wt-page-bg:#fffdfa/);
assert.match(eurHtml, /radial-gradient\(circle at 8% 12%,rgba\(255,121,82,.10\),transparent 26%\)/);
assert.match(eurHtml, /background-size:100% 100vh,100% 100vh,100% 100vh/);
assert.match(eurHtml, /background-repeat:no-repeat,no-repeat,no-repeat/);
assert.match(eurHtml, /\.hero\{[^}]*background:transparent/);
assert.doesNotMatch(eurHtml, /linear-gradient\(180deg,#f1f0f8 0%,#f7f7fc 46%,var\(--wt-page-bg\) 100%\)/);
assert.match(eurHtml, /--wt-header-overlap:65px/);
assert.match(eurHtml, /--wt-feature-sticky-offset:calc\(var\(--wt-header-overlap\) \+ 24px\)/);
assert.match(eurHtml, /margin:calc\(-1 \* var\(--wt-header-overlap\)\) auto 0/);
assert.match(eurHtml, /padding:calc\(var\(--hero-top-pad\) \+ var\(--wt-header-overlap\)\)/);
assert.doesNotMatch(eurHtml, /backgroundPosition/);
assert.match(eurHtml, /class="parent-trust-section"/);
assert.match(eurHtml, /class="parent-trust-inner"/);
assert.match(eurHtml, /\.parent-trust-section\{[^}]*linear-gradient\(135deg,#8068d8 0%,#a86aa6 48%,#d86559 100%\)/);
assert.match(eurHtml, /\.parent-trust-section \.section-subtitle\{[^}]*text-align:center/);
assert.match(eurHtml, /value-card--wide \.value-card-image img\{object-fit:cover\}/);
assert.match(eurHtml, /value-card--wide \.value-card-image\{width:calc\(100% \+ 36px\);max-width:none\}/);
assert.match(eurHtml, /value-card--wide h3\{font-size:18px\}/);
assert.doesNotMatch(eurHtml, /value-card--wide \.value-card-image\{height:auto;aspect-ratio:960 \/ 644\}/);
assert.match(eurHtml, /\.feature-sticky-titles\{position:sticky;top:var\(--wt-feature-sticky-offset\)/);
assert.match(eurHtml, /\.feature-sticky-card\{scroll-margin-top:var\(--wt-feature-sticky-offset\)\}/);
assert.match(eurHtml, /\.feature-sticky-titles\{display:none\}/);
assert.match(eurHtml, /\.cta-purple\{[^}]*transition:transform \.18s ease/);
assert.match(eurHtml, /\.cta-purple-outline\{[^}]*transition:transform \.18s ease/);
assert.match(eurHtml, /\.cta-purple-outline:hover\{[^}]*transform:translateY\(-1px\)/);
assert.match(eurHtml, /\.filter-pill:hover\{[^}]*transform:translateY\(-1px\)/);
assert.match(eurHtml, /\.story-card \.story-card-cta:hover\{[^}]*transform:translateY\(-1px\)/);
assert.match(eurHtml, /\.voice-card \.voice-play:hover\{[^}]*transform:translateY\(-1px\)/);
assert.match(eurHtml, /Створити першу історію безкоштовно →/);
assert.match(eurHtml, /більше історій, озвучення, ілюстрацій, коміксів і способів поділитися/);
assert.match(eurHtml, /До 3 генерацій персонажів на місяць/);
assert.match(eurHtml, /До 10 генерацій персонажів на місяць/);
assert.match(eurHtml, /До 15 генерацій персонажів на місяць/);
assert.match(eurHtml, /До 20 генерацій персонажів на місяць/);
assert.match(eurHtml, /До 5 коміксів у межах ліміту історій/);
assert.match(eurHtml, /До 15 коміксів у межах ліміту історій/);
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
assert.match(enHtml, /Create your first story for free →/);
assert.match(enHtml, /illustrations, comics, and sharing options/);
assert.match(enHtml, /Up to 3 character generations per month/);
assert.match(enHtml, /Up to 20 character generations per month/);
assert.match(enHtml, /Up to 5 comics within the story limit/);
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
