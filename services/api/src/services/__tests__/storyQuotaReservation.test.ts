import assert from 'node:assert';
import { calculateStoryQuota } from '../storyQuotaService';
import {
  getQuotaReservationReleaseQuantity,
  truncateQuotaReleaseErrorMessage,
} from '../quotaReservationReleaseUtils';

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

  assert.strictEqual(
    getQuotaReservationReleaseQuantity(1),
    -1,
    'active reservations are released with one compensating negative usage event'
  );

  assert.strictEqual(
    getQuotaReservationReleaseQuantity(0),
    0,
    'release is idempotent when no active reservation remains'
  );

  assert.strictEqual(
    truncateQuotaReleaseErrorMessage(` ${'x'.repeat(600)} `)?.length,
    500,
    'quota release error metadata is capped for usage_event jsonb'
  );

  console.log('storyQuotaReservation tests passed');
})();
