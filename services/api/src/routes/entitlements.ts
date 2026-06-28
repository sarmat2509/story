import { Router } from 'express';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import * as planService from '../services/planService';
import { getBundleBonusForPeriod } from '../services/bundleService';
import { getUsageForPeriod } from '../services/usageEventsService';
import type { UsageEventType } from '../services/usageEventsService';
import { logger } from '../utils/logger';

const router = Router();

// Types for feature values
type NumericFeatureValue = { limit: number };
type BooleanFeatureValue = { enabled: boolean };
type EnumFeatureValue = { selected: string };
type FeatureValue = NumericFeatureValue | BooleanFeatureValue | EnumFeatureValue;

type FeatureWithUsage = NumericFeatureValue & {
  used: number;
  remaining: number;
  plan_limit?: number;
  bundle_bonus?: number;
};
type FeatureOutput = FeatureWithUsage | BooleanFeatureValue | EnumFeatureValue;

// Map feature slug to usage_events eventType
const FEATURE_SLUG_TO_EVENT_TYPE: Record<string, UsageEventType> = {
  stories_per_month: 'story_created',
  graphic_novels_per_month: 'graphic_novel_created',
  audio_stories_per_month: 'audio_synthesized',
};

// GET /api/v1/entitlements - Get current user's subscription, features, and usage
router.get('/', requireAuth, requireParentSession, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user subscription
    const subscription = await planService.getUserSubscription(userId);
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        error: 'No subscription found',
      });
    }

    // Get plan details
    const plan = await planService.getPlanById(subscription.planId);
    if (!plan) {
      return res.status(500).json({
        status: 'error',
        error: 'Plan not found',
      });
    }

    const allFeatures = await planService.listPlanFeatureSlugsAndValues(subscription.planId);
    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd ?? subscription.resetAt ?? new Date();

    const bundleBonus = await getBundleBonusForPeriod(userId, periodStart, periodEnd);

    // Build features object with usage data from usage_events
    const features: Record<string, FeatureOutput> = {};
    for (const pf of allFeatures) {
      const featureValue = pf.value as FeatureValue;
      const slug = pf.slug;

      if ('limit' in featureValue) {
        const planLimit = featureValue.limit;
        let bundleBonusQty = 0;
        if (slug === 'stories_per_month') {
          bundleBonusQty = bundleBonus.extraStories;
        } else if (slug === 'audio_stories_per_month') {
          bundleBonusQty = bundleBonus.extraAudio;
        }
        const effectiveLimit = planLimit + bundleBonusQty;
        let used = 0;
        const eventType = FEATURE_SLUG_TO_EVENT_TYPE[slug];
        if (eventType) {
          used = await getUsageForPeriod(userId, periodStart, periodEnd, eventType);
        }
        const row: FeatureWithUsage = {
          limit: effectiveLimit,
          used,
          remaining: Math.max(0, effectiveLimit - used),
        };
        if (
          slug === 'stories_per_month' ||
          slug === 'audio_stories_per_month' ||
          slug === 'graphic_novels_per_month'
        ) {
          row.plan_limit = planLimit;
          row.bundle_bonus = bundleBonusQty;
        }
        features[slug] = row;
      } else {
        features[slug] = featureValue;
      }
    }

    res.json({
      status: 'success',
      subscription: {
        plan: {
          slug: plan.slug,
          name: plan.name,
        },
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      features,
      resetAt: subscription.resetAt,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching entitlements');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch entitlements',
    });
  }
});

export default router;
