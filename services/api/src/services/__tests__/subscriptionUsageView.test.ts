import assert from 'node:assert/strict';
import { toChildSafeSubscriptionUsageView, type SubscriptionUsageView } from '../subscriptionUsageView';

const usage: SubscriptionUsageView = {
  stories: {
    used: 2,
    limit: 8,
    remaining: 6,
    plan_limit: 3,
    bundle_bonus: 5,
  },
  graphicNovels: {
    used: 1,
    limit: 4,
    remaining: 3,
    plan_limit: 4,
  },
  mixedStories: {
    used: 2,
    limit: 8,
    remaining: 6,
    plan_limit: 3,
    bundle_bonus: 5,
  },
  audio: {
    used: 1,
    limit: 3,
    remaining: 2,
    plan_limit: 1,
    bundle_bonus: 2,
  },
  resetsAt: new Date('2026-06-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-06-02T00:00:00.000Z'),
  subscriptionStatus: 'active',
  cancelAtPeriodEnd: true,
  paymentProvider: 'stripe',
  enableRealPayments: true,
};

const childSafe = toChildSafeSubscriptionUsageView(usage);

assert.deepEqual(childSafe, {
  stories: {
    used: 2,
    limit: 8,
    remaining: 6,
  },
  graphicNovels: {
    used: 1,
    limit: 4,
    remaining: 3,
  },
  mixedStories: {
    used: 2,
    limit: 8,
    remaining: 6,
  },
  audio: {
    used: 1,
    limit: 3,
    remaining: 2,
  },
  resetsAt: usage.resetsAt,
  currentPeriodEnd: usage.currentPeriodEnd,
});

assert.equal('subscriptionStatus' in childSafe, false);
assert.equal('cancelAtPeriodEnd' in childSafe, false);
assert.equal('paymentProvider' in childSafe, false);
assert.equal('enableRealPayments' in childSafe, false);
assert.equal('plan_limit' in childSafe.stories, false);
assert.equal('bundle_bonus' in childSafe.stories, false);
assert.equal('plan_limit' in childSafe.graphicNovels, false);
assert.equal('bundle_bonus' in childSafe.graphicNovels, false);
assert.equal('plan_limit' in childSafe.mixedStories, false);
assert.equal('bundle_bonus' in childSafe.mixedStories, false);
assert.equal('plan_limit' in childSafe.audio, false);
assert.equal('bundle_bonus' in childSafe.audio, false);

console.log('subscriptionUsageView tests passed');
