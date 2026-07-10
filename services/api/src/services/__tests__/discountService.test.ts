import assert from 'node:assert/strict';
import {
  addCalendarMonthsClamped,
  calculateDiscountedAmount,
  generateDiscountCodeValue,
  resolveRenewalReminderPricing,
} from '../discountService';

for (let index = 0; index < 100; index += 1) {
  const code = generateDiscountCodeValue();
  assert.match(code, /^WT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.doesNotMatch(code, /[01IO]/);
}

assert.deepEqual(calculateDiscountedAmount(999, 20), {
  discountAmountMinor: 200,
  finalAmountMinor: 799,
});
assert.deepEqual(calculateDiscountedAmount(1299, 100), {
  discountAmountMinor: 1299,
  finalAmountMinor: 0,
});

assert.equal(
  addCalendarMonthsClamped(new Date('2026-01-31T12:30:00.000Z'), 1).toISOString(),
  '2026-02-28T12:30:00.000Z'
);
assert.equal(
  addCalendarMonthsClamped(new Date('2024-01-31T12:30:00.000Z'), 1).toISOString(),
  '2024-02-29T12:30:00.000Z'
);

const now = new Date('2026-01-29T10:00:00.000Z');
const periodEnd = new Date('2026-01-31T10:00:00.000Z');
const cutoff = new Date('2026-01-31T10:00:01.000Z');

assert.deepEqual(
  resolveRenewalReminderPricing({
    regularAmountMinor: 1000,
    percentOff: 20,
    discountEndsAt: periodEnd,
    periodEnd,
    now,
    cutoff,
  }),
  { discountEnding: true, nextAmountMinor: 1000 }
);

assert.deepEqual(
  resolveRenewalReminderPricing({
    regularAmountMinor: 1000,
    percentOff: 20,
    discountEndsAt: new Date('2026-02-28T10:00:00.000Z'),
    periodEnd,
    now,
    cutoff,
  }),
  { discountEnding: false, nextAmountMinor: 800 }
);

assert.deepEqual(
  resolveRenewalReminderPricing({
    regularAmountMinor: 1000,
    percentOff: 20,
    discountEndsAt: null,
    periodEnd,
    now,
    cutoff,
  }),
  { discountEnding: false, nextAmountMinor: 800 }
);

console.log('discountService tests passed');
