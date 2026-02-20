import { getPlanRepository } from '../repositories';
import type {
  Plan,
  Feature,
  UserSubscription,
  NewUserSubscription
} from '../db/schema';
import { logger } from '../utils/logger';

// Plan queries
export async function getActivePlans(): Promise<Plan[]> {
  const activePlans = await getPlanRepository().findActivePlans();
  logger.debug({ count: activePlans.length }, 'Fetched active plans');
  return activePlans;
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

export async function getFeatureValue(planId: string, featureSlug: string): Promise<any | null> {
  return getPlanRepository().findFeatureValue(planId, featureSlug);
}

// User subscription
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  return getPlanRepository().findSubscriptionByUserId(userId);
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
  
  // Extract image-related features with defaults
  const result: PlanFeatures = {
    imagesPerStory: getNumericFeature(featureMap, 'images_per_story', 3),
    imageQuality: getEnumFeature(featureMap, 'image_quality', 'low'),
    imageRegenerationPerDay: getNumericFeature(featureMap, 'image_regeneration_per_day', 0),
    allowReferencePhotos: getBooleanFeature(featureMap, 'allow_reference_photos', false),
    storiesPerMonth: getNumericFeature(featureMap, 'stories_per_month', 5),
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

export async function checkUsageLimit(
  userId: string,
  featureSlug: string,
  requestedQty: number
): Promise<{ allowed: boolean; remaining: number }> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    return { allowed: false, remaining: 0 };
  }
  
  const limit = await getFeatureLimit(userId, featureSlug);
  if (limit === null) {
    // No limit defined, allow
    return { allowed: true, remaining: Infinity };
  }
  
  // Check current usage against limit
  let currentUsage = 0;
  if (featureSlug === 'stories_per_month') {
    currentUsage = subscription.storiesUsed;
  } else if (featureSlug === 'audio_minutes_per_month') {
    currentUsage = subscription.audioMinutesUsed;
  }
  
  const remaining = limit - currentUsage;
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
  
  const updatedSubscription = await planRepo.updateSubscription(userId, { planId: newPlan.id });
  
  if (!updatedSubscription) {
    throw new Error('Subscription not found');
  }
  
  logger.info({ userId, newPlanId: newPlan.id }, 'Changed user plan');
  return updatedSubscription;
}
