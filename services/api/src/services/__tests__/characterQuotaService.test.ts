import assert from 'node:assert/strict';
import { calculateCharacterQuota } from '../characterQuotaService';

assert.deepStrictEqual(
  calculateCharacterQuota({
    planLimit: 10,
    currentUsage: 4,
    requestedQty: 1,
  }),
  {
    allowed: true,
    effectiveLimit: 10,
    remaining: 6,
  },
  'manual character generation is allowed below the monthly limit'
);

assert.deepStrictEqual(
  calculateCharacterQuota({
    planLimit: 10,
    currentUsage: 10,
    requestedQty: 1,
  }),
  {
    allowed: false,
    effectiveLimit: 10,
    remaining: 0,
  },
  'manual character generation is denied when the monthly limit is reached'
);

assert.deepStrictEqual(
  calculateCharacterQuota({
    planLimit: -1,
    currentUsage: 0,
    requestedQty: 1,
  }),
  {
    allowed: false,
    effectiveLimit: 0,
    remaining: 0,
  },
  'negative character generation limits are treated as zero'
);

console.log('characterQuotaService tests passed');
