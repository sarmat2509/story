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
  mixedStories: UsageBucketView;
  audio: UsageBucketView;
  imagesPerStory: number;
  storyCharacterSelectionLimit: number;
  resetsAt: Date | null;
  currentPeriodEnd: Date | null;
  subscriptionStatus?: string;
  cancelAtPeriodEnd?: boolean;
  paymentProvider?: string | null;
  enableRealPayments?: boolean;
  storyMix?: {
    budgetPoints: number;
    usedPoints: number;
    remainingPoints: number;
    weights: { story: number; mixedStory: number; graphicNovel: number };
    used: { stories: number; mixedStories: number; graphicNovels: number };
    maximum: { stories: number; mixedStories: number; graphicNovels: number };
    allocation: { mixedStories: number; graphicNovels: number; stories: number };
  };
};

function childSafeBucket(bucket: UsageBucketView): UsageBucketView {
  return {
    used: bucket.used,
    limit: bucket.limit,
    remaining: bucket.remaining,
  };
}

export function toChildSafeSubscriptionUsageView(
  data: SubscriptionUsageView
): SubscriptionUsageView {
  return {
    stories: childSafeBucket(data.stories),
    graphicNovels: childSafeBucket(data.graphicNovels),
    mixedStories: childSafeBucket(data.mixedStories),
    audio: childSafeBucket(data.audio),
    imagesPerStory: data.imagesPerStory,
    storyCharacterSelectionLimit: data.storyCharacterSelectionLimit,
    resetsAt: data.resetsAt,
    currentPeriodEnd: data.currentPeriodEnd,
    ...(data.storyMix ? { storyMix: data.storyMix } : {}),
  };
}
