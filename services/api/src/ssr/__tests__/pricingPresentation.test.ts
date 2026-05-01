import assert from 'node:assert';
import {
  getCombinedPricingUsageHighlight,
  sortPricingFeatureEntries,
  type PricingTranslate,
} from '@wondertales/shared';
import { renderPricingHtml } from '../renderPricingHtml';

const translate: PricingTranslate = (key, params = {}, defaultValue = '') => {
  const templates: Record<string, string> = {
    'features.stories_per_month': '{{count}} stories per month',
    audio_stories: '{{count}} audio stories per month',
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
  story_from_drawing: { name: 'Story from drawing', value: { enabled: true }, category: 'creation' },
  image_quality: { name: 'Image quality', value: { selected: 'standard' }, category: 'media' },
  images_per_story: { name: 'Images per story', value: { limit: 3 }, category: 'usage' },
  child_profiles_limit: { name: 'Child profiles', value: { limit: null }, category: 'family' },
  premium_voices: { name: 'Premium voices', value: { enabled: false }, category: 'audio' },
};

void (async function main() {
  assert.strictEqual(
    getCombinedPricingUsageHighlight('en', translate, features),
    '10 stories and 2 audio stories per month',
    'pricing usage highlight should combine story and audio monthly limits'
  );

  assert.deepStrictEqual(
    sortPricingFeatureEntries(features).map(([slug]) => slug),
    ['images_per_story', 'child_profiles_limit', 'premium_voices'],
    'pricing feature order and hidden-feature rules should be shared'
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

  assert.match(html, /10 stories and 2 audio stories per month/);
  assert.match(html, /3 illustrations in story/);
  assert.match(html, /Unlimited child profiles/);
  assert.doesNotMatch(html, /Story from drawing/);
  assert.doesNotMatch(html, /Image quality/);
  assert.match(html, /Billing details/);
  assert.match(html, /Paid subscriptions renew monthly until canceled/);
  assert.match(html, /Unused bundle credits expire at period end and do not roll over/);
  assert.match(html, /<select aria-label="Language"/);
  assert.match(html, /<option value="https:\/\/app\.wondertales\.com\/pricing">Українська<\/option>/);
  assert.match(html, /<option value="https:\/\/app\.wondertales\.com\/en\/pricing" selected>English<\/option>/);
  assert.doesNotMatch(html, /onchange=/);

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

  const paidCard = paymentsDisabledHtml.slice(paymentsDisabledHtml.indexOf('Family'));
  assert.match(paymentsDisabledHtml, /Paid checkout is not enabled yet/);
  assert.match(paidCard, /Payments coming soon/);
  assert.doesNotMatch(paidCard, /href="[^"]*\/welcome"/);

  console.log('pricingPresentation tests passed');
})();
