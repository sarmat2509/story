import { Request, Response, NextFunction } from 'express';
import * as planService from '../services/planService';
import { logger } from '../utils/logger';

// Check boolean feature
export function requireFeature(featureSlug: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', error: 'Authentication required' });
        return;
      }
      
      const hasAccess = await planService.hasFeature(req.user.id, featureSlug);
      
      if (!hasAccess) {
        logger.warn({ userId: req.user.id, featureSlug }, 'Feature access denied');
        res.status(403).json({
          status: 'error',
          error: 'Feature not available in your plan',
          featureSlug
        });
        return;
      }
      
      next();
    } catch (error) {
      logger.error({ error, featureSlug }, 'Error checking feature access');
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  };
}

// Check numeric limit
export function requireFeatureLimit(featureSlug: string, requiredQty: number = 1) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', error: 'Authentication required' });
        return;
      }
      
      const { allowed, remaining } = await planService.checkUsageLimit(
        req.user.id,
        featureSlug,
        requiredQty
      );
      
      if (!allowed) {
        logger.warn({ userId: req.user.id, featureSlug, remaining }, 'Usage limit exceeded');
        res.status(429).json({
          status: 'error',
          error: 'Usage limit exceeded',
          featureSlug,
          remaining
        });
        return;
      }
      
      next();
    } catch (error) {
      logger.error({ error, featureSlug }, 'Error checking usage limit');
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  };
}

// Check plan tier
export function requirePlan(minPlanSlug: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', error: 'Authentication required' });
        return;
      }
      
      const subscription = await planService.getUserSubscription(req.user.id);
      if (!subscription) {
        res.status(402).json({
          status: 'error',
          error: 'No active subscription found'
        });
        return;
      }
      
      const currentPlan = await planService.getPlanById(subscription.planId);
      if (!currentPlan) {
        res.status(500).json({ status: 'error', error: 'Plan not found' });
        return;
      }
      
      const requiredPlan = await planService.getPlanBySlug(minPlanSlug);
      if (!requiredPlan) {
        res.status(500).json({ status: 'error', error: 'Required plan not found' });
        return;
      }
      
      // Check if user's plan meets minimum requirement (by sortOrder)
      if (currentPlan.sortOrder < requiredPlan.sortOrder) {
        logger.warn({ userId: req.user.id, currentPlan: currentPlan.slug, requiredPlan: minPlanSlug }, 'Plan tier insufficient');
        res.status(402).json({
          status: 'error',
          error: 'Plan upgrade required',
          currentPlan: currentPlan.slug,
          requiredPlan: minPlanSlug
        });
        return;
      }
      
      next();
    } catch (error) {
      logger.error({ error, minPlanSlug }, 'Error checking plan tier');
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  };
}

// Check enum value
export function requireFeatureValue(featureSlug: string, requiredValue: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', error: 'Authentication required' });
        return;
      }
      
      const currentValue = await planService.getFeatureEnum(req.user.id, featureSlug);
      
      if (currentValue !== requiredValue) {
        logger.warn({ userId: req.user.id, featureSlug, currentValue, requiredValue }, 'Feature value mismatch');
        res.status(403).json({
          status: 'error',
          error: 'Feature value not supported in your plan',
          featureSlug,
          currentValue,
          requiredValue
        });
        return;
      }
      
      next();
    } catch (error) {
      logger.error({ error, featureSlug }, 'Error checking feature value');
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  };
}
