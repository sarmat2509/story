import { eq, and } from 'drizzle-orm';
import db from '../db';
import {
  plans,
  features,
  planFeatures,
  userSubscriptions,
  type Plan,
  type Feature,
  type UserSubscription,
  type NewUserSubscription
} from '../db/schema';
import { logger } from '../utils/logger';

// Plan queries
export async function getActivePlans(): Promise<Plan[]> {
  const activePlans = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(plans.sortOrder);
  
  logger.debug({ count: activePlans.length }, 'Fetched active plans');
  return activePlans;
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.slug, slug), eq(plans.isActive, true)))
    .limit(1);
  
  return plan || null;
}

export async function getPlanById(id: string): Promise<Plan | null> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, id))
    .limit(1);
  
  return plan || null;
}

// Feature queries
export async function getFeatureBySlug(slug: string): Promise<Feature | null> {
  const [feature] = await db
    .select()
    .from(features)
    .where(eq(features.slug, slug))
    .limit(1);
  
  return feature || null;
}

export async function getPlanFeaturesByPlanId(planId: string) {
  const features = await db
    .select()
    .from(planFeatures)
    .where(eq(planFeatures.planId, planId));
  
  return features;
}

export async function getFeatureValue(planId: string, featureSlug: string): Promise<any | null> {
  const [result] = await db
    .select({
      value: planFeatures.value
    })
    .from(planFeatures)
    .innerJoin(features, eq(planFeatures.featureId, features.id))
    .where(and(
      eq(planFeatures.planId, planId),
      eq(features.slug, featureSlug)
    ))
    .limit(1);
  
  return result?.value || null;
}

// User subscription
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const [subscription] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .limit(1);
  
  return subscription || null;
}

export async function initializeUserSubscription(
  userId: string,
  planSlug: string = 'free'
): Promise<UserSubscription> {
  // Get plan by slug
  const plan = await getPlanBySlug(planSlug);
  if (!plan) {
    throw new Error(`Plan with slug '${planSlug}' not found`);
  }
  
  // Check if subscription already exists
  const existing = await getUserSubscription(userId);
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
  
  const [subscription] = await db
    .insert(userSubscriptions)
    .values(newSubscription)
    .returning();
  
  logger.info({ userId, planId: plan.id, planSlug }, 'Initialized user subscription');
  return subscription;
}

// Feature checks (for service layer & UI)
export async function hasFeature(userId: string, featureSlug: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  if (!subscription) {
    return false;
  }
  
  const featureValue = await getFeatureValue(subscription.planId, featureSlug);
  if (!featureValue) {
    return false;
  }
  
  // For boolean features, check enabled property
  if (typeof featureValue === 'object' && 'enabled' in featureValue) {
    return featureValue.enabled === true;
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
  allowGeneratedReferences: boolean;
  storiesPerDay: number;
  audioMinutesPerMonth: number;
}

/**
 * Get all plan features for a user in a convenient format
 * M4: Returns image generation limits and settings
 * 
 * @param userId - User ID to get plan features for
 * @returns Formatted plan features object
 */
export async function getPlanFeatures(userId: string): Promise<PlanFeatures> {
  const subscription = await getUserSubscription(userId);
  
  // Default to free plan features if no subscription
  if (!subscription) {
    const defaultFeatures: PlanFeatures = {
      imagesPerStory: 3,
      imageQuality: 'low',
      imageRegenerationPerDay: 0,
      allowReferencePhotos: false,
      allowGeneratedReferences: false,
      storiesPerDay: 1,
      audioMinutesPerMonth: 0,
    };
    return defaultFeatures;
  }
  
  // Get all features for this plan
  const allFeatures = await db
    .select({
      slug: features.slug,
      value: planFeatures.value,
    })
    .from(planFeatures)
    .innerJoin(features, eq(planFeatures.featureId, features.id))
    .where(eq(planFeatures.planId, subscription.planId));
  
  // Build feature map
  const featureMap = new Map(allFeatures.map(f => [f.slug, f.value]));
  
  // Extract image-related features with defaults
  const result: PlanFeatures = {
    imagesPerStory: getNumericFeature(featureMap, 'images_per_story', 3),
    imageQuality: getEnumFeature(featureMap, 'image_quality', 'low'),
    imageRegenerationPerDay: getNumericFeature(featureMap, 'image_regeneration_per_day', 0),
    allowReferencePhotos: getBooleanFeature(featureMap, 'allow_reference_photos', false),
    allowGeneratedReferences: getBooleanFeature(featureMap, 'allow_generated_references', false),
    storiesPerDay: getNumericFeature(featureMap, 'stories_per_day', 1),
    audioMinutesPerMonth: getNumericFeature(featureMap, 'audio_minutes_per_month', 0),
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
  const subscription = await getUserSubscription(userId);
  if (!subscription) {
    return null;
  }
  
  const featureValue = await getFeatureValue(subscription.planId, featureSlug);
  if (!featureValue || typeof featureValue !== 'object') {
    return null;
  }
  
  // For numeric features, return limit
  if ('limit' in featureValue) {
    return featureValue.limit;
  }
  
  return null;
}

export async function getFeatureEnum(userId: string, featureSlug: string): Promise<string | null> {
  const subscription = await getUserSubscription(userId);
  if (!subscription) {
    return null;
  }
  
  const featureValue = await getFeatureValue(subscription.planId, featureSlug);
  if (!featureValue || typeof featureValue !== 'object') {
    return null;
  }
  
  // For enum features, return selected value
  if ('selected' in featureValue) {
    return featureValue.selected;
  }
  
  return null;
}

// Usage tracking
export async function incrementUsage(
  userId: string,
  resourceType: string,
  quantity: number
): Promise<void> {
  const subscription = await getUserSubscription(userId);
  if (!subscription) {
    logger.warn({ userId }, 'Cannot increment usage: no subscription found');
    return;
  }
  
  // Update usage counters based on resource type
  if (resourceType === 'story') {
    await db
      .update(userSubscriptions)
      .set({ storiesUsed: subscription.storiesUsed + quantity })
      .where(eq(userSubscriptions.userId, userId));
    
    logger.debug({ userId, resourceType, quantity, newTotal: subscription.storiesUsed + quantity }, 'Incremented usage');
  } else if (resourceType === 'audio') {
    await db
      .update(userSubscriptions)
      .set({ audioMinutesUsed: subscription.audioMinutesUsed + quantity })
      .where(eq(userSubscriptions.userId, userId));
    
    logger.debug({ userId, resourceType, quantity, newTotal: subscription.audioMinutesUsed + quantity }, 'Incremented usage');
  }
}

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
  
  // Check current usage against limit
  let currentUsage = 0;
  if (featureSlug === 'stories_per_day') {
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
  
  await db
    .update(userSubscriptions)
    .set({
      storiesUsed: 0,
      audioMinutesUsed: 0,
      resetAt: oneMonthLater
    })
    .where(eq(userSubscriptions.userId, userId));
  
  logger.info({ userId }, 'Reset usage counters');
}

// Admin (stub)
export async function changePlan(userId: string, newPlanSlug: string): Promise<UserSubscription> {
  const newPlan = await getPlanBySlug(newPlanSlug);
  if (!newPlan) {
    throw new Error(`Plan with slug '${newPlanSlug}' not found`);
  }
  
  const [updatedSubscription] = await db
    .update(userSubscriptions)
    .set({ planId: newPlan.id })
    .where(eq(userSubscriptions.userId, userId))
    .returning();
  
  if (!updatedSubscription) {
    throw new Error('Subscription not found');
  }
  
  logger.info({ userId, oldPlanId: updatedSubscription.planId, newPlanId: newPlan.id }, 'Changed user plan');
  return updatedSubscription;
}
