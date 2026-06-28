import assert from 'node:assert';
import {
  formatPricingPrice,
  getCombinedPricingUsageHighlight,
  sortPricingFeatureEntries,
  type PricingTranslate,
} from '@wondertales/shared';
import { buildFallbackPricingPlans, renderPricingHtml } from '../renderPricingHtml';

const translate: PricingTranslate = (key, params = {}, defaultValue = '') => {
  const templates: Record<string, string> = {
    'features.stories_per_month': '{{count}} stories per month',
    'features.stories_per_month_one': '{{count}} story per month',
    'features.stories_per_month_other': '{{count}} stories per month',
    audio_stories_one: '{{count}} audio story per month',
    audio_stories: '{{count}} audio stories per month',
    audio_stories_other: '{{count}} audio stories per month',
    'features.graphic_novels_per_month': '{{value}} comics per month',
    'features.graphic_novel_pages_per_story': '{{value}} pages per comic',
    'features.graphic_novels_locked': 'Comics',
    'features.images_per_story_one': '{{value}} illustration in story',
    'features.images_per_story_other': '{{value}} illustrations in story',
    'features.images_per_story': '{{value}} illustrations in story',
    'features.child_profiles_limit_unlimited': 'Unlimited child profiles',
    'features.premium_voices': 'Premium voices',
  };
  const template = templates[key] ?? defaultValue;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, paramKey: string) =>
    String(params[paramKey] ?? '')
  );
};

const features = {
  stories_per_month: { name: 'Stories per month', value: { limit: 10 }, category: 'usage' },
  audio_stories_per_month: { name: 'Audio per month', value: { limit: 2 }, category: 'usage' },
  graphic_novels_per_month: { name: 'Comics per month', value: { limit: 5 }, category: 'usage' },
  graphic_novel_pages_per_story: { name: 'Comic pages', value: { limit: 8 }, category: 'usage' },
  story_from_drawing: { name: 'Story from drawing', value: { enabled: true }, category: 'creation' },
  image_quality: { name: 'Image quality', value: { selected: 'standard' }, category: 'media' },
  images_per_story: { name: 'Images per story', value: { limit: 3 }, category: 'usage' },
  child_profiles_limit: { name: 'Child profiles', value: { limit: null }, category: 'family' },
  premium_voices: { name: 'Premium voices', value: { enabled: false }, category: 'audio' },
};

function extractJsonLd(html: string): any[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

void (async function main() {
  assert.match(
    formatPricingPrice('uk', 999, 'EUR', 'Безкоштовно'),
    /9,99/,
    'EUR prices should be rendered from minor units with the locale decimal separator'
  );
  assert.doesNotMatch(
    formatPricingPrice('uk', 999, 'EUR', 'Безкоштовно'),
    /999/,
    'EUR prices should not render raw minor units'
  );
  assert.match(
    formatPricingPrice('en', 2999, 'EUR', 'Free'),
    /29\.99/,
    'English EUR prices should include cents'
  );

  assert.strictEqual(
    getCombinedPricingUsageHighlight('en', translate, features),
    '10 stories, 2 audio stories and 5 comics per month',
    'pricing usage highlight should combine story and audio monthly limits'
  );

  assert.deepStrictEqual(
    sortPricingFeatureEntries(features).map(([slug]) => slug),
    [
      'images_per_story',
      'graphic_novels_per_month',
      'graphic_novel_pages_per_story',
      'child_profiles_limit',
      'premium_voices',
    ],
    'pricing feature order and hidden-feature rules should be shared'
  );

  assert.deepStrictEqual(
    sortPricingFeatureEntries({
      ...features,
      graphic_novels_per_month: {
        name: 'Comics per month',
        value: { limit: 0 },
        category: 'usage',
      },
    }).map(([slug]) => slug),
    ['images_per_story', 'child_profiles_limit', 'graphic_novels_per_month', 'premium_voices'],
    'comic page count should not be shown on plans without comic access'
  );

  const html = renderPricingHtml({
    locale: 'en',
    plans: [
      {
        id: 'plan-1',
        slug: 'family',
        name: 'Family',
        description: 'For launch families',
        priceMonthly: 500,
        pricingCurrency: 'USD',
        sortOrder: 1,
        features,
      },
    ],
  });

  assert.match(html, /10 stories, 2 audio stories and 5 comics per month/);
  assert.match(html, /3 personalized illustrations per story/);
  assert.match(html, /5 comics per month/);
  assert.match(html, /8 pages per comic/);
  assert.match(html, /Unlimited child profiles/);
  assert.doesNotMatch(html, /Story from drawing/);
  assert.doesNotMatch(html, /Image quality/);
  assert.match(html, /Pricing, plans &amp; bundles/);
  assert.doesNotMatch(html, /Billing details/);
  assert.match(html, /Paid subscriptions renew monthly until canceled/);
  assert.match(html, /Unused bundle credits expire at period end and do not roll over/);
  assert.match(html, /<select aria-label="Language"/);
  assert.match(html, /<option value="https:\/\/app\.wondertales\.com\/pricing">Українська<\/option>/);
  assert.match(html, /<option value="https:\/\/app\.wondertales\.com\/en\/pricing" selected>English<\/option>/);
  assert.doesNotMatch(html, /onchange=/);
  assert.ok(html.includes('href="https://app.wondertales.com/en/wizard"'));
  assert.doesNotMatch(html, /href="[^"]*\/welcome"/);

  const pricingJsonLd = extractJsonLd(html);
  const product = pricingJsonLd.find((entry) => entry['@type'] === 'Product');
  assert.ok(product, 'pricing page should expose Product structured data');
  assert.strictEqual(product.name, 'WonderTales');
  assert.strictEqual(product.url, 'https://app.wondertales.com/en/pricing');
  assert.strictEqual(product.offers['@type'], 'OfferCatalog');
  assert.strictEqual(product.offers.itemListElement[0].name, 'Family');
  assert.strictEqual(product.offers.itemListElement[0].price, '5.00');
  assert.strictEqual(product.offers.itemListElement[0].priceCurrency, 'USD');

  const paymentsDisabledHtml = renderPricingHtml({
    locale: 'en',
    paymentsEnabled: false,
    plans: [
      {
        id: 'free',
        slug: 'free',
        name: 'Free',
        description: 'Start here',
        priceMonthly: 0,
        pricingCurrency: 'USD',
        sortOrder: 0,
        features,
      },
      {
        id: 'paid',
        slug: 'family',
        name: 'Family',
        description: 'For launch families',
        priceMonthly: 500,
        pricingCurrency: 'USD',
        sortOrder: 1,
        features,
      },
    ],
  });

  const paidCardStart = paymentsDisabledHtml.indexOf('<div class="name">Family</div>');
  const paidCard = paymentsDisabledHtml.slice(paidCardStart, paymentsDisabledHtml.indexOf('</article>', paidCardStart));
  assert.match(paymentsDisabledHtml, /Paid checkout is not enabled yet/);
  assert.match(paidCard, /Payments coming soon/);
  assert.doesNotMatch(paidCard, /href="[^"]*\/welcome"/);

  const fallbackPlans = buildFallbackPricingPlans('en');
  assert.deepStrictEqual(
    fallbackPlans.map((plan) => [plan.slug, plan.priceMonthly]),
    [
      ['free', 0],
      ['silver', 899],
      ['golden', 2599],
      ['fairyworld', 5999],
    ],
    'static pricing fallback should preserve launch plan order and prices'
  );
  assert.strictEqual(
    (fallbackPlans.find((plan) => plan.slug === 'fairyworld')?.features.stories_per_month.value as { limit: number }).limit,
    30,
    'static pricing fallback should preserve Fairy World story limit'
  );
  assert.deepStrictEqual(
    fallbackPlans.map((plan) => [plan.slug, (plan.features.follow_narrator.value as { enabled: boolean }).enabled]),
    [
      ['free', false],
      ['silver', true],
      ['golden', true],
      ['fairyworld', true],
    ],
    'static pricing fallback should expose narrator-follow from Silver'
  );
  assert.strictEqual(fallbackPlans[0].features.export_pdf, undefined);
  assert.strictEqual(fallbackPlans[0].features.export_video, undefined);

  const fallbackHtml = renderPricingHtml({ locale: 'en', plans: [] });
  assert.match(fallbackHtml, /<div class="name">Free<\/div>/);
  assert.match(fallbackHtml, /<div class="name">Silver Dreams<\/div>/);
  assert.match(fallbackHtml, /<div class="name">Golden Stars<\/div>/);
  assert.match(fallbackHtml, /<div class="name">Fairy World<\/div>/);
  assert.match(fallbackHtml, /3 stories and 1 audio story per month/);
  assert.match(fallbackHtml, /30 stories, 15 audio stories and 15 comics per month/);

  console.log('pricingPresentation tests passed');
})();
