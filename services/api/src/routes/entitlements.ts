import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as planService from '../services/planService';
import { logger } from '../utils/logger';

const router = Router();

// Types for feature values
type NumericFeatureValue = { limit: number };
type BooleanFeatureValue = { enabled: boolean };
type EnumFeatureValue = { selected: string };
type FeatureValue = NumericFeatureValue | BooleanFeatureValue | EnumFeatureValue;

type FeatureWithUsage = NumericFeatureValue & { used: number; remaining: number };
type FeatureOutput = FeatureWithUsage | BooleanFeatureValue | EnumFeatureValue;

// GET /api/v1/entitlements - Get current user's subscription, features, and usage
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Get user subscription
    const subscription = await planService.getUserSubscription(userId);
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        error: 'No subscription found'
      });
    }
    
    // Get plan details
    const plan = await planService.getPlanById(subscription.planId);
    if (!plan) {
      return res.status(500).json({
        status: 'error',
        error: 'Plan not found'
      });
    }
    
    // Get plan features
    const planFeatures = await planService.getPlanFeaturesByPlanId(subscription.planId);
    
    // Build features object with usage data
    const features: Record<string, FeatureOutput> = {};
    for (const pf of planFeatures) {
      const featureValue = pf.value as FeatureValue;
      
      // Add usage data for tracked features
      if ('limit' in featureValue) {
        features[pf.featureId] = {
          limit: featureValue.limit,
          used: 0, // Will be populated from usage_events in real implementation
          remaining: featureValue.limit
        };
      } else {
        features[pf.featureId] = featureValue;
      }
    }
    
    res.json({
      status: 'success',
      subscription: {
        plan: {
          slug: plan.slug,
          name: plan.name
        },
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd
      },
      features,
      resetAt: subscription.resetAt
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching entitlements');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch entitlements'
    });
  }
});

export default router;
