import type { NewUserSubscription } from '../db/schema';

export type SubscriptionPeriodRecord = {
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
  resetAt: Date | null;
  paymentProvider?: string | null;
};

export type ActiveSubscriptionPeriod = {
  periodStart: Date;
  periodEnd: Date;
  shouldReset: boolean;
  expiredStripePeriod: boolean;
  resetPatch?: Partial<NewUserSubscription>;
};

export function createMonthlyPeriod(now: Date = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = new Date(now);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return { periodStart, periodEnd };
}

export function resolveActiveSubscriptionPeriod(
  subscription: SubscriptionPeriodRecord,
  now: Date = new Date()
): ActiveSubscriptionPeriod {
  const currentEnd = subscription.currentPeriodEnd ?? subscription.resetAt;
  if (
    currentEnd &&
    subscription.currentPeriodStart < currentEnd &&
    currentEnd > now
  ) {
    return {
      periodStart: subscription.currentPeriodStart,
      periodEnd: currentEnd,
      shouldReset: false,
      expiredStripePeriod: false,
    };
  }

  if (subscription.paymentProvider === 'stripe') {
    return {
      periodStart: subscription.currentPeriodStart,
      periodEnd: currentEnd ?? now,
      shouldReset: false,
      expiredStripePeriod: true,
    };
  }

  const { periodStart, periodEnd } = createMonthlyPeriod(now);
  return {
    periodStart,
    periodEnd,
    shouldReset: true,
    expiredStripePeriod: false,
    resetPatch: {
      storiesUsed: 0,
      audioMinutesUsed: 0,
      resetAt: periodEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  };
}
