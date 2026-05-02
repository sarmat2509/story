import assert from 'node:assert/strict';
import { buildPresentedPlans, type PlanFeaturePresentationRow } from '../planPresentationService';
import type { Plan } from '../../db/schema';

const plans = [
  {
    id: 'silver-plan',
    slug: 'silver',
    name: 'Silver Dreams',
    description: 'Default silver copy',
    priceMonthly: 599,
    pricingCurrency: 'USD',
    sortOrder: 2,
  },
  {
    id: 'free-plan',
    slug: 'free',
    name: 'Free',
    description: null,
    priceMonthly: 0,
    pricingCurrency: 'USD',
    sortOrder: 1,
  },
] as Plan[];

const translations = new Map<string, Map<string, string>>([
  ['silver', new Map([
    ['name', 'Localized Silver'],
    ['description', 'Localized silver copy'],
  ])],
]);

const featureRows: PlanFeaturePresentationRow[] = [
  {
    planId: 'silver-plan',
    slug: 'audio_stories_per_month',
    name: 'Audio stories',
    value: { limit: 2 },
    category: 'usage',
  },
  {
    planId: 'free-plan',
    slug: 'stories_per_month',
    name: 'Stories',
    value: { limit: 3 },
    category: 'usage',
  },
];

const presentedPlans = buildPresentedPlans(plans, translations, featureRows, 'silver-plan');

assert.deepEqual(
  presentedPlans.map((plan) => plan.slug),
  ['free', 'silver'],
  'presented plans should keep launch sort order'
);
assert.equal(presentedPlans[0].features.stories_per_month.name, 'Stories');
assert.equal(presentedPlans[0].features.audio_stories_per_month, undefined);
assert.equal(presentedPlans[1].name, 'Localized Silver');
assert.equal(presentedPlans[1].description, 'Localized silver copy');
assert.equal(presentedPlans[1].features.audio_stories_per_month.category, 'usage');
assert.equal(presentedPlans[1].isCurrent, true);

console.log('planPresentationService tests passed');
