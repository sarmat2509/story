import assert from 'node:assert/strict';
import {
  getActivatedConditionalQuotaExtension,
  readConditionalQuotaExtension,
} from '../conditionalQuotaExtensionService';

const periodStart = new Date('2026-07-18T22:27:41.620Z');
const periodEnd = new Date('2026-08-18T22:27:41.620Z');
const metadata = {
  conditionalQuotaExtensions: {
    stories_per_month: {
      extra: 1,
      activatesAtUsage: 20,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      reason: 'presentation_catalog',
    },
    graphic_novels_per_month: {
      extra: 2,
      activatesAtUsage: 5,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  },
};

assert.equal(
  getActivatedConditionalQuotaExtension({
    metadata,
    featureSlug: 'stories_per_month',
    currentUsage: 19,
    periodStart,
    periodEnd,
  }),
  0,
  'the standard story limit remains unchanged before it is exhausted'
);

assert.equal(
  getActivatedConditionalQuotaExtension({
    metadata,
    featureSlug: 'stories_per_month',
    currentUsage: 20,
    periodStart,
    periodEnd,
  }),
  1,
  'one extra story activates at the configured threshold'
);

assert.equal(
  getActivatedConditionalQuotaExtension({
    metadata,
    featureSlug: 'graphic_novels_per_month',
    currentUsage: 5,
    periodStart,
    periodEnd,
  }),
  2,
  'two extra comics activate after the normal five-comic sublimit is exhausted'
);

assert.equal(
  getActivatedConditionalQuotaExtension({
    metadata,
    featureSlug: 'stories_per_month',
    currentUsage: 20,
    periodStart: new Date('2026-08-18T22:27:41.620Z'),
    periodEnd: new Date('2026-09-18T22:27:41.620Z'),
  }),
  0,
  'an extension cannot leak into another billing period'
);

assert.equal(
  readConditionalQuotaExtension(
    { conditionalQuotaExtensions: { stories_per_month: { extra: -1 } } },
    'stories_per_month'
  ),
  null,
  'invalid metadata is ignored'
);

console.log('conditional quota extension tests passed');
