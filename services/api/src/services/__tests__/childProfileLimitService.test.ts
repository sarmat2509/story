import assert from 'node:assert/strict';
import { calculateChildProfileLimit } from '../childProfileLimitService';

assert.deepStrictEqual(
  calculateChildProfileLimit({
    planLimit: 1,
    currentProfiles: 0,
    requestedQty: 1,
  }),
  {
    allowed: true,
    limit: 1,
    remaining: 1,
  },
  'child profile creation is allowed below the plan limit'
);

assert.deepStrictEqual(
  calculateChildProfileLimit({
    planLimit: 1,
    currentProfiles: 1,
    requestedQty: 1,
  }),
  {
    allowed: false,
    limit: 1,
    remaining: 0,
  },
  'child profile creation is denied when the current profile count reaches the plan limit'
);

assert.deepStrictEqual(
  calculateChildProfileLimit({
    planLimit: null,
    currentProfiles: 99,
    requestedQty: 1,
  }),
  {
    allowed: true,
    limit: null,
    remaining: null,
  },
  'missing numeric child profile limit preserves unlimited behavior'
);

console.log('childProfileLimitService tests passed');
