export type UsageBucketView = {
  used: number;
  limit: number;
  remaining: number;
  plan_limit?: number;
  bundle_bonus?: number;
};

export type SubscriptionUsageView = {
  stories: UsageBucketView;
  graphicNovels: UsageBucketView;
  audio: UsageBucketView;
  resetsAt: Date | null;
  currentPeriodEnd: Date | null;
  subscriptionStatus?: string;
  cancelAtPeriodEnd?: boolean;
  paymentProvider?: string | null;
  enableRealPayments?: boolean;
};

function childSafeBucket(bucket: UsageBucketView): UsageBucketView {
  return {
    used: bucket.used,
    limit: bucket.limit,
    remaining: bucket.remaining,
  };
}

export function toChildSafeSubscriptionUsageView(data: SubscriptionUsageView): SubscriptionUsageView {
  return {
    stories: childSafeBucket(data.stories),
    graphicNovels: childSafeBucket(data.graphicNovels),
    audio: childSafeBucket(data.audio),
    resetsAt: data.resetsAt,
    currentPeriodEnd: data.currentPeriodEnd,
  };
}
