import assert from 'node:assert';
import { calculateStoryQuota } from '../storyQuotaService';

void (async function main() {
  assert.deepStrictEqual(
    calculateStoryQuota({
      planLimit: 5,
      bundleBonus: 2,
      currentUsage: 6,
      requestedQty: 1,
    }),
    {
      allowed: true,
      effectiveLimit: 7,
      remaining: 1,
    },
    'bundle bonus increases the effective monthly story limit'
  );

  assert.deepStrictEqual(
    calculateStoryQuota({
      planLimit: 5,
      bundleBonus: 0,
      currentUsage: 5,
      requestedQty: 1,
    }),
    {
      allowed: false,
      effectiveLimit: 5,
      remaining: 0,
    },
    'reservation is denied when current usage reaches the effective limit'
  );

  assert.deepStrictEqual(
    calculateStoryQuota({
      planLimit: null,
      bundleBonus: 0,
      currentUsage: 100,
      requestedQty: 1,
    }),
    {
      allowed: true,
      effectiveLimit: null,
      remaining: null,
    },
    'missing numeric feature limit preserves the existing unlimited behavior'
  );

  console.log('storyQuotaReservation tests passed');
})();
