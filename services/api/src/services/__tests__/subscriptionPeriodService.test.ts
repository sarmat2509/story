import assert from 'node:assert/strict';
import {
  createMonthlyPeriod,
  resolveActiveSubscriptionPeriod,
} from '../subscriptionPeriodService';

const now = new Date('2026-05-02T12:00:00.000Z');

{
  const period = createMonthlyPeriod(now);
  assert.equal(period.periodStart.toISOString(), '2026-05-02T12:00:00.000Z');
  assert.equal(period.periodEnd.toISOString(), '2026-06-02T12:00:00.000Z');
}

{
  const active = resolveActiveSubscriptionPeriod(
    {
      currentPeriodStart: new Date('2026-05-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
      resetAt: new Date('2026-06-01T00:00:00.000Z'),
      paymentProvider: null,
    },
    now
  );

  assert.equal(active.shouldReset, false);
  assert.equal(active.expiredStripePeriod, false);
  assert.equal(active.periodEnd.toISOString(), '2026-06-01T00:00:00.000Z');
}

{
  const active = resolveActiveSubscriptionPeriod(
    {
      currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
      resetAt: new Date('2026-05-01T00:00:00.000Z'),
      paymentProvider: null,
    },
    now
  );

  assert.equal(active.shouldReset, true);
  assert.equal(active.expiredStripePeriod, false);
  assert.equal(active.periodStart.toISOString(), '2026-05-02T12:00:00.000Z');
  assert.equal(active.periodEnd.toISOString(), '2026-06-02T12:00:00.000Z');
  assert.equal(active.resetPatch?.storiesUsed, 0);
  assert.equal(active.resetPatch?.audioMinutesUsed, 0);
}

{
  const active = resolveActiveSubscriptionPeriod(
    {
      currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
      resetAt: new Date('2026-05-01T00:00:00.000Z'),
      paymentProvider: 'stripe',
    },
    now
  );

  assert.equal(active.shouldReset, false);
  assert.equal(active.expiredStripePeriod, true);
  assert.equal(active.periodEnd.toISOString(), '2026-05-01T00:00:00.000Z');
}

console.log('subscriptionPeriodService tests passed');
