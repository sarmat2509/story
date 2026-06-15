import { getPlanRepository } from '../repositories';
import type { PlanFeatureWithDetails } from '../repositories/PlanRepository';
import { getBundleBonusForPeriod } from './bundleService';
import type {
  Plan,
  Feature,
  PlanPrice,
  UserSubscription,
  NewUserSubscription
} from '../db/schema';
import { logger } from '../utils/logger';
import { resolveActiveSubscriptionPeriod } from './subscriptionPeriodService';

// Plan queries
export async function getActivePlans(): Promise<Plan[]> {
  const activePlans = await getPlanRepository().findActivePlans();
  logger.debug({ count: activePlans.length }, 'Fetched active plans');
  return activePlans;
}

/** Plans with stories/audio/images limits for landing display */
export interface PlanWithLimits extends Plan {
  storiesPerMonth: number;
  audioStoriesPerMonth: number;
  imagesPerStory: number;
}

export async function getPlansWithLimits(): Promise<PlanWithLimits[]> {
  const plans = await getActivePlans();
  const result = await Promise.all(
    plans.map(async (plan) => {
      const features = await getPlanRepository().findAllFeaturesForPlan(plan.id);
      const map = new Map(features.map((f) => [f.slug, f.value]));
      const getLimit = (slug: string, def: number): number => {
        const v = map.get(slug);
        if (!v || typeof v !== 'object') return def;
        return (v as { limit?: number }).limit ?? def;
      };
      return {
        ...plan,
        storiesPerMonth: getLimit('stories_per_month', 3),
        audioStoriesPerMonth: getLimit('audio_stories_per_month', 1),
        imagesPerStory: getLimit('images_per_story', 3),
      };
    })
  );
  return result;
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  return getPlanRepository().findPlanBySlug(slug);
}

export async function getPlanById(id: string): Promise<Plan | null> {
  return getPlanRepository().findPlanById(id);
}

// Feature queries
export async function getFeatureBySlug(slug: string): Promise<Feature | null> {
  return getPlanRepository().findFeatureBySlug(slug);
}

export async function getFeatureById(id: string): Promise<Feature | null> {
  return getPlanRepository().findFeatureById(id);
}

export async function getPlanFeaturesByPlanId(planId: string) {
  return getPlanRepository().findPlanFeatures(planId);
}

export async function getFeaturesForPlans(planIds: string[]): Promise<PlanFeatureWithDetails[]> {
  return getPlanRepository().findFeaturesForPlans(planIds);
}

export async function getPricesForPlans(planIds: string[]): Promise<PlanPrice[]> {
  return getPlanRepository().findPlanPricesForPlanIds(planIds);
}

/** Slug + value for each feature on a plan (for entitlements API). */
export async function listPlanFeatureSlugsAndValues(
  planId: string
): Promise<Array<{ slug: string; value: unknown }>> {
  return getPlanRepository().findAllFeaturesForPlan(planId);
}

export async function getFeatureValue(planId: string, featureSlug: string): Promise<any | null> {
  return getPlanRepository().findFeatureValue(planId, featureSlug);
}

// User subscription
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    return null;
  }

  const period = resolveActiveSubscriptionPeriod(subscription);
  if (period.shouldReset && period.resetPatch) {
    return planRepo.updateSubscription(userId, period.resetPatch);
  }

  return subscription;
}

export async function initializeUserSubscription(
  userId: string,
  planSlug: string = 'free'
): Promise<UserSubscription> {
  const planRepo = getPlanRepository();

  // Get plan by slug
  const plan = await planRepo.findPlanBySlug(planSlug);
  if (!plan) {
    throw new Error(`Plan with slug '${planSlug}' not found`);
  }
  
  // Check if subscription already exists
  const existing = await planRepo.findSubscriptionByUserId(userId);
  if (existing) {
    logger.debug({ userId, existingPlanId: existing.planId }, 'User subscription already exists');
    return existing;
  }
  
  // Create new subscription
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  
  const newSubscription: NewUserSubscription = {
    userId,
    planId: plan.id,
    status: 'active',
    storiesUsed: 0,
    audioMinutesUsed: 0,
    resetAt: oneMonthLater,
    currentPeriodStart: now,
    currentPeriodEnd: oneMonthLater,
    cancelAtPeriodEnd: false
  };
  
  const subscription = await planRepo.createSubscription(newSubscription);
  logger.info({ userId, planId: plan.id, planSlug }, 'Initialized user subscription');
  return subscription;
}

// Feature checks (for service layer & UI)
export async function hasFeature(userId: string, featureSlug: string): Promise<boolean> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    return false;
  }
  
  const featureValue = await planRepo.findFeatureValue(subscription.planId, featureSlug);
  if (!featureValue) {
    return false;
  }
  
  // For boolean features, check enabled property
  if (typeof featureValue === 'object' && featureValue !== null && 'enabled' in featureValue) {
    return (featureValue as any).enabled === true;
  }
  
  return true;
}

/**
 * Plan features interface
 */
export interface PlanFeatures {
  imagesPerStory: number;
  imageQuality: string;
  imageRegenerationPerDay: number;
  allowReferencePhotos: boolean;
  storiesPerMonth: number;
  audioStoriesPerMonth: number;
}

/**
 * Get all plan features for a user in a convenient format
 * M4: Returns image generation limits and settings
 * 
 * @param userId - User ID to get plan features for
 * @returns Formatted plan features object
 */
export async function getPlanFeatures(userId: string): Promise<PlanFeatures> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  
  // Default to free plan features if no subscription
  if (!subscription) {
    const defaultFeatures: PlanFeatures = {
      imagesPerStory: 3,
      imageQuality: 'low',
      imageRegenerationPerDay: 0,
      allowReferencePhotos: false,
      storiesPerMonth: 5,
      audioStoriesPerMonth: 1,
    };
    return defaultFeatures;
  }
  
  // Get all features for this plan
  const allFeatures = await planRepo.findAllFeaturesForPlan(subscription.planId);
  
  // Build feature map
  const featureMap = new Map(allFeatures.map(f => [f.slug, f.value]));
  
  const storyFromDrawingEnabled = getBooleanFeature(featureMap, 'story_from_drawing', false);

  // Extract image-related features with defaults
  const result: PlanFeatures = {
    imagesPerStory: getNumericFeature(featureMap, 'images_per_story', 3),
    imageQuality: getEnumFeature(featureMap, 'image_quality', 'low'),
    imageRegenerationPerDay: getNumericFeature(featureMap, 'image_regeneration_per_day', 0),
    allowReferencePhotos: getBooleanFeature(
      featureMap,
      'allow_reference_photos',
      storyFromDrawingEnabled
    ),
    storiesPerMonth: getNumericFeature(featureMap, 'stories_per_month', 3),
    audioStoriesPerMonth: getNumericFeature(featureMap, 'audio_stories_per_month', 1),
  };
  
  return result;
}

// Helper functions for feature extraction
function getNumericFeature(map: Map<string, any>, slug: string, defaultValue: number): number {
  const value = map.get(slug);
  if (!value) return defaultValue;
  
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'limit' in value) return value.limit;
  
  return defaultValue;
}

function getBooleanFeature(map: Map<string, any>, slug: string, defaultValue: boolean): boolean {
  const value = map.get(slug);
  if (!value) return defaultValue;
  
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object' && 'enabled' in value) return value.enabled;
  
  return defaultValue;
}

function getEnumFeature(map: Map<string, any>, slug: string, defaultValue: string): string {
  const value = map.get(slug);
  if (!value) return defaultValue;
  
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'selected' in value) return value.selected;
  
  return defaultValue;
}

export async function getFeatureLimit(userId: string, featureSlug: string): Promise<number | null> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    return null;
  }
  
  const featureValue = await planRepo.findFeatureValue(subscription.planId, featureSlug);
  if (!featureValue || typeof featureValue !== 'object') {
    return null;
  }
  
  // For numeric features, return limit
  if ('limit' in (featureValue as any)) {
    return (featureValue as any).limit;
  }
  
  return null;
}

export async function getFeatureEnum(userId: string, featureSlug: string): Promise<string | null> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    return null;
  }
  
  const featureValue = await planRepo.findFeatureValue(subscription.planId, featureSlug);
  if (!featureValue || typeof featureValue !== 'object') {
    return null;
  }
  
  // For enum features, return selected value
  if ('selected' in (featureValue as any)) {
    return (featureValue as any).selected;
  }
  
  return null;
}

// Usage tracking
export async function incrementUsage(
  userId: string,
  resourceType: string,
  quantity: number
): Promise<void> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    logger.warn({ userId }, 'Cannot increment usage: no subscription found');
    return;
  }
  
  // Update usage counters based on resource type
  if (resourceType === 'story') {
    await planRepo.updateSubscription(userId, {
      storiesUsed: subscription.storiesUsed + quantity,
    });
    logger.debug({ userId, resourceType, quantity, newTotal: subscription.storiesUsed + quantity }, 'Incremented usage');
  } else if (resourceType === 'audio') {
    await planRepo.updateSubscription(userId, {
      audioMinutesUsed: subscription.audioMinutesUsed + quantity,
    });
    logger.debug({ userId, resourceType, quantity, newTotal: subscription.audioMinutesUsed + quantity }, 'Incremented usage');
  }
}

const FEATURE_SLUG_TO_EVENT_TYPE: Record<string, 'story_created' | 'audio_synthesized'> = {
  stories_per_month: 'story_created',
  audio_stories_per_month: 'audio_synthesized',
  audio_minutes_per_month: 'audio_synthesized', // legacy slug, same as audio stories
};

export async function checkUsageLimit(
  userId: string,
  featureSlug: string,
  requestedQty: number
): Promise<{ allowed: boolean; remaining: number }> {
  const subscription = await getUserSubscription(userId);
  if (!subscription) {
    return { allowed: false, remaining: 0 };
  }

  const limit = await getFeatureLimit(userId, featureSlug);
  if (limit === null) {
    // No limit defined, allow
    return { allowed: true, remaining: Infinity };
  }

  const periodStart = subscription.currentPeriodStart;
  const periodEnd = subscription.currentPeriodEnd ?? subscription.resetAt ?? new Date();

  let bundleBonus = 0;
  if (featureSlug === 'stories_per_month' || featureSlug === 'audio_stories_per_month') {
    const bonus = await getBundleBonusForPeriod(userId, periodStart, periodEnd);
    bundleBonus =
      featureSlug === 'stories_per_month' ? bonus.extraStories : bonus.extraAudio;
  }

  const effectiveLimit = limit + bundleBonus;

  // Get current usage from usage_events
  let currentUsage = 0;
  const eventType = FEATURE_SLUG_TO_EVENT_TYPE[featureSlug];
  if (eventType) {
    const { getUsageForPeriod } = await import('./usageEventsService');
    currentUsage = await getUsageForPeriod(userId, periodStart, periodEnd, eventType);
  }

  const remaining = effectiveLimit - currentUsage;
  const allowed = remaining >= requestedQty;

  return { allowed, remaining: Math.max(0, remaining) };
}

export async function resetUsageCounters(userId: string): Promise<void> {
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  await getPlanRepository().updateSubscription(userId, {
    storiesUsed: 0,
    audioMinutesUsed: 0,
    resetAt: oneMonthLater,
    currentPeriodStart: now,
    currentPeriodEnd: oneMonthLater,
  });

  logger.info({ userId }, 'Reset usage counters');
}

// Admin (stub)
export async function changePlan(userId: string, newPlanSlug: string): Promise<UserSubscription> {
  const planRepo = getPlanRepository();
  const newPlan = await planRepo.findPlanBySlug(newPlanSlug);
  if (!newPlan) {
    throw new Error(`Plan with slug '${newPlanSlug}' not found`);
  }

  await resetUsageCounters(userId);

  const updatedSubscription = await planRepo.updateSubscription(userId, { planId: newPlan.id });

  if (!updatedSubscription) {
    throw new Error('Subscription not found');
  }

  // Record usage event for analytics
  const { recordUsageEvent } = await import('./usageEventsService');
  await recordUsageEvent(userId, 'plan_upgraded', 1, {
    metadata: { planSlug: newPlanSlug },
  });

  logger.info({ userId, newPlanId: newPlan.id }, 'Changed user plan, reset usage counters');
  return updatedSubscription;
}

/**
 * M1: Update subscription from Stripe webhook (checkout.session.completed, subscription.updated, subscription.deleted).
 * Resets usage when period changes (renewal).
 */
export interface StripeSubscriptionPeriodPayload {
  id: string;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end: boolean;
  status: string;
  items?: {
    data?: Array<{
      id?: string;
      current_period_start?: number | null;
      current_period_end?: number | null;
    }>;
  };
}

export function resolveStripeSubscriptionPeriodSeconds(
  stripeSubscription: StripeSubscriptionPeriodPayload
): { periodStartSeconds: number; periodEndSeconds: number } {
  const itemPeriod = stripeSubscription.items?.data?.find(
    (item) =>
      Number.isFinite(item.current_period_start) &&
      Number.isFinite(item.current_period_end)
  );
  const periodStartSeconds =
    stripeSubscription.current_period_start ?? itemPeriod?.current_period_start;
  const periodEndSeconds =
    stripeSubscription.current_period_end ?? itemPeriod?.current_period_end;

  if (!Number.isFinite(periodStartSeconds) || !Number.isFinite(periodEndSeconds)) {
    throw new Error(
      `Stripe subscription ${stripeSubscription.id} is missing current period timestamps`
    );
  }

  return {
    periodStartSeconds,
    periodEndSeconds,
  };
}

export async function updateSubscriptionFromStripe(
  userId: string,
  stripeSubscription: StripeSubscriptionPeriodPayload,
  planSlug: string
): Promise<UserSubscription | null> {
  const planRepo = getPlanRepository();
  const plan = await planRepo.findPlanBySlug(planSlug);
  if (!plan) {
    logger.warn({ planSlug }, 'Plan not found for Stripe subscription update');
    return null;
  }

  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    logger.warn({ userId }, 'Subscription not found for Stripe update');
    return null;
  }

  const { periodStartSeconds, periodEndSeconds } =
    resolveStripeSubscriptionPeriodSeconds(stripeSubscription);
  const periodStart = new Date(periodStartSeconds * 1000);
  const periodEnd = new Date(periodEndSeconds * 1000);
  const isNewPeriod = periodStart.getTime() > subscription.currentPeriodStart.getTime();

  const updateData: Partial<{
    planId: string;
    stripeSubscriptionId: string;
    paymentProvider: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    resetAt: Date;
    cancelAtPeriodEnd: boolean;
    status: string;
    storiesUsed: number;
    audioMinutesUsed: number;
  }> = {
    planId: plan.id,
    stripeSubscriptionId: stripeSubscription.id,
    paymentProvider: 'stripe',
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    resetAt: periodEnd,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    status: stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing' ? 'active' : stripeSubscription.status,
  };

  if (isNewPeriod) {
    updateData.storiesUsed = 0;
    updateData.audioMinutesUsed = 0;
    logger.info({ userId, planSlug, periodStart }, 'Stripe subscription renewed, reset usage');
  }

  const updated = await planRepo.updateSubscription(userId, updateData);
  logger.info({ userId, planSlug, stripeSubscriptionId: stripeSubscription.id }, 'Updated subscription from Stripe');
  return updated;
}

/**
 * M1: Update subscription from Stripe webhook when subscription is deleted (canceled/expired).
 * Downgrades to free plan and resets usage.
 */
export async function updateSubscriptionDeletedFromStripe(stripeSubscriptionId: string): Promise<boolean> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  if (!subscription) {
    logger.warn({ stripeSubscriptionId }, 'Subscription not found for Stripe deletion');
    return false;
  }

  const freePlan = await planRepo.findPlanBySlug('free');
  if (!freePlan) {
    logger.error('Free plan not found');
    return false;
  }

  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  await planRepo.updateSubscription(subscription.userId, {
    planId: freePlan.id,
    status: 'expired',
    stripeSubscriptionId: null,
    paymentProvider: null,
    storiesUsed: 0,
    audioMinutesUsed: 0,
    resetAt: oneMonthLater,
    currentPeriodStart: now,
    currentPeriodEnd: oneMonthLater,
    cancelAtPeriodEnd: false,
  });
  logger.info({ userId: subscription.userId, stripeSubscriptionId }, 'Subscription downgraded to free from Stripe deletion');
  return true;
}

export async function updateSubscriptionFromRevenueCat(params: {
  userId: string;
  planSlug: string;
  eventType: string;
  productId?: string | null;
  purchasedAtMs?: number | null;
  expirationAtMs?: number | null;
}): Promise<UserSubscription | null> {
  const planRepo = getPlanRepository();
  const plan = await planRepo.findPlanBySlug(params.planSlug);
  if (!plan) {
    logger.warn({ planSlug: params.planSlug }, 'Plan not found for RevenueCat subscription update');
    return null;
  }

  const subscription = await planRepo.findSubscriptionByUserId(params.userId);
  if (!subscription) {
    logger.warn({ userId: params.userId }, 'Subscription not found for RevenueCat update');
    return null;
  }

  const now = new Date();
  const periodStart = Number.isFinite(params.purchasedAtMs)
    ? new Date(Number(params.purchasedAtMs))
    : now;
  const periodEnd = Number.isFinite(params.expirationAtMs)
    ? new Date(Number(params.expirationAtMs))
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isNewPeriod = periodStart.getTime() > subscription.currentPeriodStart.getTime();
  const eventType = params.eventType.toUpperCase();

  const updateData: Partial<{
    planId: string;
    stripeSubscriptionId: string | null;
    paymentProvider: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    resetAt: Date;
    cancelAtPeriodEnd: boolean;
    status: string;
    storiesUsed: number;
    audioMinutesUsed: number;
  }> = {
    planId: plan.id,
    stripeSubscriptionId: null,
    paymentProvider: 'revenuecat',
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    resetAt: periodEnd,
    cancelAtPeriodEnd: eventType === 'CANCELLATION',
    status: 'active',
  };

  if (isNewPeriod) {
    updateData.storiesUsed = 0;
    updateData.audioMinutesUsed = 0;
  }

  const updated = await planRepo.updateSubscription(params.userId, updateData);
  logger.info({
    userId: params.userId,
    planSlug: params.planSlug,
    eventType: params.eventType,
    productId: params.productId ?? null,
  }, 'Updated subscription from RevenueCat');
  return updated;
}

export async function expireSubscriptionFromRevenueCat(userId: string): Promise<boolean> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    logger.warn({ userId }, 'Subscription not found for RevenueCat expiration');
    return false;
  }

  const freePlan = await planRepo.findPlanBySlug('free');
  if (!freePlan) {
    logger.error('Free plan not found');
    return false;
  }

  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  await planRepo.updateSubscription(userId, {
    planId: freePlan.id,
    status: 'expired',
    stripeSubscriptionId: null,
    paymentProvider: null,
    storiesUsed: 0,
    audioMinutesUsed: 0,
    resetAt: oneMonthLater,
    currentPeriodStart: now,
    currentPeriodEnd: oneMonthLater,
    cancelAtPeriodEnd: false,
  });
  logger.info({ userId }, 'Subscription downgraded to free from RevenueCat expiration');
  return true;
}

export async function markStripeSubscriptionPaymentFailed(
  stripeSubscriptionId: string
): Promise<boolean> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  if (!subscription) {
    logger.warn({ stripeSubscriptionId }, 'Subscription not found for Stripe payment failure');
    return false;
  }

  await planRepo.updateSubscription(subscription.userId, {
    status: 'past_due',
  });

  logger.warn(
    { userId: subscription.userId, stripeSubscriptionId },
    'Marked subscription past_due after Stripe invoice payment failed'
  );
  return true;
}
