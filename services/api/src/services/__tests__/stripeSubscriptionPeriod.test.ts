import assert from 'node:assert/strict';
import { resolveStripeSubscriptionPeriodSeconds } from '../planService';

{
  const period = resolveStripeSubscriptionPeriodSeconds({
    id: 'sub_top_level',
    current_period_start: 1777684825,
    current_period_end: 1780363225,
    cancel_at_period_end: false,
    status: 'active',
  });

  assert.deepEqual(period, {
    periodStartSeconds: 1777684825,
    periodEndSeconds: 1780363225,
  });
}

{
  const period = resolveStripeSubscriptionPeriodSeconds({
    id: 'sub_item_level',
    cancel_at_period_end: true,
    status: 'active',
    items: {
      data: [
        {
          current_period_start: 1777684825,
          current_period_end: 1780363225,
        },
      ],
    },
  });

  assert.deepEqual(period, {
    periodStartSeconds: 1777684825,
    periodEndSeconds: 1780363225,
  });
}

{
  assert.throws(
    () =>
      resolveStripeSubscriptionPeriodSeconds({
        id: 'sub_missing_period',
        cancel_at_period_end: false,
        status: 'active',
        items: { data: [{}] },
      }),
    /missing current period timestamps/
  );
}

console.log('stripeSubscriptionPeriod tests passed');
