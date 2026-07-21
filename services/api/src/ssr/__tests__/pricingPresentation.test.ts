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
    'features.monthly_usage_with_comics': 'Up to {{stories}} and up to {{comics}} comics per month',
    'features.monthly_usage_with_comics_and_mixed': 'Up to {{stories}}, up to {{comics}} comics, and up to {{mixed}} comic-to-text stories per month',
    'features.monthly_usage_with_comics_and_audio': 'Up to {{stories}}, up to {{comics}} comics, and {{audio}} per month',
    'features.graphic_novels_per_month': 'Up to {{value}} comics per month',
    'features.graphic_novels_locked': 'Comics',
    'features.mixed_stories_per_month': 'Up to {{value}} comic-to-text stories per month',
    'features.mixed_stories_locked': 'Comic-to-text story',
    'features.images_per_story_one': '{{value}} illustration in story',
    'features.images_per_story_other': '{{value}} illustrations in story',
    'features.images_per_story': '{{value}} illustrations in story',
    'features.characters_per_month': 'Up to {{value}} character generations per month',
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
  mixed_stories_per_month: { name: 'Comic-to-text story', value: { limit: 10 }, category: 'usage' },
  story_from_drawing: { name: 'Story from drawing', value: { enabled: true }, category: 'creation' },
  image_quality: { name: 'Image quality', value: { selected: 'standard' }, category: 'media' },
  images_per_story: { name: 'Images per story', value: { limit: 3 }, category: 'usage' },
  characters_per_month: { name: 'Characters per month', value: { limit: 10 }, category: 'usage' },
  child_profiles_limit: { name: 'Child profiles', value: { limit: null }, category: 'family' },
  premium_voices: { name: 'Premium voices', value: { enabled: false }, category: 'audio' },
};

function extractJsonLd(html: string): any[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (match) => {
      const value = JSON.parse(match[1]);
      return Array.isArray(value['@graph']) ? value['@graph'] : [value];
    }
  );
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
    'Up to 10 stories, up to 5 comics, and up to 10 comic-to-text stories per month',
    'pricing usage highlight should present every story type maximum'
  );

  assert.deepStrictEqual(
    sortPricingFeatureEntries(features).map(([slug]) => slug),
    [
      'images_per_story',
      'characters_per_month',
      'audio_stories_per_month',
      'child_profiles_limit',
      'premium_voices',
    ],
    'audio should be a regular feature while story-mix quotas remain in the highlight'
  );

  assert.deepStrictEqual(
    sortPricingFeatureEntries({
      ...features,
      story_mix_budget_points: {
        name: 'Flexible story mix budget',
        value: { limit: 0 },
        category: 'limits',
      },
      graphic_novels_per_month: {
        name: 'Comics per month',
        value: { limit: 0 },
        category: 'usage',
      },
      mixed_stories_per_month: {
        name: 'Comic-to-text story',
        value: { limit: 0 },
        category: 'usage',
      },
    }).map(([slug]) => slug),
    ['images_per_story', 'characters_per_month', 'audio_stories_per_month', 'child_profiles_limit', 'premium_voices'],
    'disabled story-mix configuration and its component quotas should not appear as plan features'
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

  assert.match(html, /Up to 10 stories, up to 5 comics, and up to 10 comic-to-text stories per month/);
  assert.match(html, /3 personalized illustrations per story/);
  assert.match(html, /2 audio stories per month/);
  assert.doesNotMatch(html, /Up to 5 comics per month/);
  assert.strictEqual((html.match(/comic-to-text stories per month/g) ?? []).length, 1);
  assert.doesNotMatch(html, /pages per comic/);
  assert.match(html, /Unlimited child profiles/);
  assert.doesNotMatch(html, /Story from drawing/);
  assert.doesNotMatch(html, /Image quality/);
  assert.match(html, /Pricing, plans &amp; bundles/);
  assert.match(html, /background:#fffdfa/);
  assert.match(html, /radial-gradient\(circle at 8% 12%,rgba\(255,121,82,.10\),transparent 26%\)/);
  assert.match(html, /background-size:100% 100vh,100% 100vh,100% 100vh/);
  assert.match(html, /background-repeat:no-repeat,no-repeat,no-repeat/);
  assert.match(html, /\.btn\{[^}]*transition:transform \.18s ease/);
  assert.match(html, /\.btn:hover\{[^}]*transform:translateY\(-1px\)/);
  assert.doesNotMatch(html, /sparkles-overlay\.webp/);
  assert.doesNotMatch(html, /Billing details/);
  assert.match(html, /Bundles are available with an active paid subscription/);
  assert.match(html, /Can I buy more than one bundle/);
  assert.match(html, /Paid subscriptions renew monthly until canceled/);
  assert.match(html, /They apply until the end of your current billing period and do not roll over/);
  assert.match(html, /<select aria-label="Language"/);
  assert.match(html, /<option value="https:\/\/app\.wondertales\.com\/pricing" selected>English<\/option>/);
  assert.match(html, /<option value="https:\/\/app\.wondertales\.com\/uk\/pricing">Українська<\/option>/);
  assert.doesNotMatch(html, /onchange=/);
  assert.ok(html.includes('href="https://app.wondertales.com/wizard?locale=en"'));
  assert.doesNotMatch(html, /href="[^"]*\/welcome"/);

  const pricingJsonLd = extractJsonLd(html);
  const software = pricingJsonLd.find((entry) => entry['@type'] === 'SoftwareApplication');
  assert.ok(software, 'pricing page should expose SoftwareApplication structured data');
  assert.strictEqual(software.name, 'WonderTales');
  assert.strictEqual(software.url, 'https://app.wondertales.com/pricing');
  assert.ok(Array.isArray(software.offers));
  assert.strictEqual(software.offers[0]['@type'], 'Offer');
  assert.strictEqual(software.offers[0].name, 'Family');
  assert.strictEqual(software.offers[0].price, '5.00');
  assert.strictEqual(software.offers[0].priceCurrency, 'USD');

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
    100,
    'static pricing fallback should show the maximum ordinary-story capacity'
  );
  assert.deepStrictEqual(
    fallbackPlans.map((plan) => [
      plan.slug,
      (plan.features.characters_per_month.value as { limit: number }).limit,
    ]),
    [
      ['free', 3],
      ['silver', 10],
      ['golden', 15],
      ['fairyworld', 20],
    ],
    'static pricing fallback should expose character generation limits'
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
  const goldenCardStart = fallbackHtml.indexOf('<article class="card card-featured">');
  const goldenCard = fallbackHtml.slice(goldenCardStart, fallbackHtml.indexOf('</article>', goldenCardStart));
  assert.match(fallbackHtml, /<div class="name">Free<\/div>/);
  assert.match(fallbackHtml, /<div class="name">Silver Dreams<\/div>/);
  assert.match(fallbackHtml, /<div class="name">Golden Stars<\/div>/);
  assert.match(fallbackHtml, /<div class="name">Story World<\/div>/);
  assert.match(goldenCard, /<span class="plan-badge">Most popular<\/span>/);
  assert.match(fallbackHtml, /Up to 50 stories, up to 5 comics, and up to 9 comic-to-text stories per month/);
  assert.match(fallbackHtml, /Up to 100 stories, up to 11 comics, and up to 19 comic-to-text stories per month/);
  assert.match(fallbackHtml, /3 stories per month/);
  assert.match(fallbackHtml, /1 audio story per month/);
  assert.match(fallbackHtml, /10 audio stories per month/);
  assert.match(fallbackHtml, /15 audio stories per month/);

  console.log('pricingPresentation tests passed');
})();
