import assert from 'node:assert/strict';
import { calculateAudioQuota } from '../audioQuotaReservationService';
import { getQuotaReservationReleaseQuantity } from '../quotaReservationReleaseUtils';

assert.deepStrictEqual(
  calculateAudioQuota({
    planLimit: 1,
    bundleBonus: 0,
    currentUsage: 0,
    requestedQty: 1,
  }),
  {
    allowed: true,
    effectiveLimit: 1,
    remaining: 1,
  },
  'audio quota allows a first reservation within the plan limit'
);

assert.deepStrictEqual(
  calculateAudioQuota({
    planLimit: 1,
    bundleBonus: 0,
    currentUsage: 1,
    requestedQty: 1,
  }),
  {
    allowed: false,
    effectiveLimit: 1,
    remaining: 0,
  },
  'audio quota denies a new story when usage reaches the effective limit'
);

assert.deepStrictEqual(
  calculateAudioQuota({
    planLimit: 1,
    bundleBonus: 0,
    currentUsage: 1,
    alreadyReservedForStory: true,
    requestedQty: 1,
  }),
  {
    allowed: true,
    effectiveLimit: 1,
    remaining: 0,
  },
  'retrying the same already-reserved story does not require another credit'
);

assert.deepStrictEqual(
  calculateAudioQuota({
    planLimit: 1,
    bundleBonus: 2,
    currentUsage: 2,
    requestedQty: 1,
  }),
  {
    allowed: true,
    effectiveLimit: 3,
    remaining: 1,
  },
  'bundle audio grants increase the effective limit'
);

assert.deepStrictEqual(
  calculateAudioQuota({
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
  'missing numeric audio feature limit preserves unlimited behavior'
);

assert.equal(
  getQuotaReservationReleaseQuantity(1),
  -1,
  'audio reservation release uses a compensating negative usage event'
);

assert.equal(
  getQuotaReservationReleaseQuantity(-1),
  0,
  'audio reservation release is idempotent after a prior release'
);

console.log('audioQuotaReservationService tests passed');
