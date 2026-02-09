import { Router } from 'express';
import * as planService from '../services/planService';
import { logger } from '../utils/logger';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// GET /api/v1/plans - List all active plans with features (public)
router.get('/', async (req, res) => {
  try {
    const plans = await planService.getActivePlans();
    
    // For each plan, get features
    const plansWithFeatures = await Promise.all(
      plans.map(async (plan) => {
        const planFeatures = await planService.getPlanFeaturesByPlanId(plan.id);
        
        // Map features to readable format
        const featuresMap: Record<string, any> = {};
        for (const pf of planFeatures) {
          const feature = await planService.getFeatureById(pf.featureId);
          if (feature) {
            featuresMap[feature.slug] = {
              name: feature.name,
              value: pf.value,
              category: feature.category
            };
          }
        }
        
        return {
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          pricingCurrency: plan.pricingCurrency,
          sortOrder: plan.sortOrder,
          features: featuresMap
        };
      })
    );
    
    // Sort by sort_order
    plansWithFeatures.sort((a, b) => a.sortOrder - b.sortOrder);
    
    res.json({
      status: 'success',
      plans: plansWithFeatures
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching plans');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch plans'
    });
  }
});

// GET /api/v1/plans/with-features - Get all plans with feature details (authenticated)
router.get('/with-features', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Get user's current subscription
    const subscription = await planService.getUserSubscription(userId);
    const currentPlanId = subscription?.planId;
    
    // Get all active plans
    const plans = await planService.getActivePlans();
    
    // For each plan, get features
    const plansWithFeatures = await Promise.all(
      plans.map(async (plan) => {
        const planFeatures = await planService.getPlanFeaturesByPlanId(plan.id);
        
        // Map features to readable format
        const featuresMap: Record<string, any> = {};
        for (const pf of planFeatures) {
          const feature = await planService.getFeatureById(pf.featureId);
          if (feature) {
            featuresMap[feature.slug] = {
              name: feature.name,
              value: pf.value,
              category: feature.category
            };
          }
        }
        
        return {
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          pricingCurrency: plan.pricingCurrency,
          sortOrder: plan.sortOrder,
          features: featuresMap,
          isCurrent: plan.id === currentPlanId
        };
      })
    );
    
    // Sort by sort_order
    plansWithFeatures.sort((a, b) => a.sortOrder - b.sortOrder);
    
    res.json({
      status: 'success',
      plans: plansWithFeatures
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching plans with features');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch plans'
    });
  }
});

// PUT /api/v1/plans/upgrade - Upgrade user plan (test mode, no payment)
router.put('/upgrade', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { planSlug } = req.body;
    
    if (!planSlug) {
      return res.status(400).json({
        status: 'error',
        message: 'Plan slug is required'
      });
    }
    
    // Use existing changePlan function from planService
    const updatedSubscription = await planService.changePlan(userId, planSlug);
    
    // Get plan details
    const newPlan = await planService.getPlanById(updatedSubscription.planId);
    
    logger.info({ userId, newPlanSlug: planSlug }, 'User upgraded plan (test mode)');
    
    res.json({
      status: 'success',
      message: 'Plan upgraded successfully',
      subscription: updatedSubscription,
      plan: newPlan
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Plan upgrade failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to upgrade plan'
    });
  }
});

export default router;
