import { Request, Router } from 'express';
import { z } from 'zod';
import { DEFAULT_LOCALE } from '@wondertales/shared';
import * as planService from '../services/planService';
import { logger } from '../utils/logger';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import config from '../config';
import {
  buildPlansWithFeatures,
  normalizeBillingCurrency,
  normalizePlanLocale,
  SUPPORTED_BILLING_CURRENCIES,
} from '../services/planPresentationService';
import { getUserRepository } from '../repositories';

const router = Router();

function resolvePublicLocale(req: Request): string {
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const headerLocale = typeof req.headers['accept-language'] === 'string'
    ? req.headers['accept-language'].split(',')[0]
    : undefined;
  return normalizePlanLocale(queryLocale || headerLocale);
}

function resolveAuthenticatedLocale(req: Request): string {
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const headerLocale = typeof req.headers['accept-language'] === 'string'
    ? req.headers['accept-language'].split(',')[0]
    : undefined;
  return normalizePlanLocale(queryLocale || req.user?.preferredLocale || headerLocale || null);
}

function resolveRequestedBillingCurrency(req: Request): string | null {
  return typeof req.query.currency === 'string' ? req.query.currency : null;
}

const billingCurrencySchema = z.object({
  currency: z.enum(SUPPORTED_BILLING_CURRENCIES),
});

// GET /api/v1/plans - List all active plans with features (public)
router.get('/', async (req, res) => {
  try {
    const locale = resolvePublicLocale(req);
    const billingCurrency = normalizeBillingCurrency(resolveRequestedBillingCurrency(req));
    const plansWithFeatures = await buildPlansWithFeatures({ locale, billingCurrency });
    
    res.json({
      status: 'success',
      plans: plansWithFeatures,
      enableRealPayments: config.features.enableRealPayments,
      billingCurrency,
      supportedBillingCurrencies: SUPPORTED_BILLING_CURRENCIES,
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
router.get('/with-features', requireAuth, requireParentSession, async (req, res) => {
  try {
    const userId = req.user!.id;
    const locale = resolveAuthenticatedLocale(req);
    const billingCurrency = normalizeBillingCurrency(
      resolveRequestedBillingCurrency(req) || req.user?.preferredBillingCurrency
    );
    
    // Get user's current subscription
    const subscription = await planService.getUserSubscription(userId);
    const currentPlanId = subscription?.planId;
    const plansWithFeatures = await buildPlansWithFeatures({ currentPlanId, locale, billingCurrency });
    
    res.json({
      status: 'success',
      plans: plansWithFeatures,
      enableRealPayments: config.features.enableRealPayments,
      billingCurrency,
      preferredBillingCurrency: normalizeBillingCurrency(req.user?.preferredBillingCurrency),
      supportedBillingCurrencies: SUPPORTED_BILLING_CURRENCIES,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching plans with features');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch plans'
    });
  }
});

// PUT /api/v1/plans/billing-currency - Persist user's preferred billing currency
router.put('/billing-currency', requireAuth, requireParentSession, async (req, res) => {
  try {
    const parsed = billingCurrencySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'currency must be EUR or USD',
      });
    }

    const user = await getUserRepository().update(req.user!.id, {
      preferredBillingCurrency: parsed.data.currency,
    });

    res.json({
      status: 'success',
      preferredBillingCurrency: normalizeBillingCurrency(user.preferredBillingCurrency),
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to update billing currency');
    res.status(500).json({
      status: 'error',
      message: 'Failed to update billing currency',
    });
  }
});

// PUT /api/v1/plans/upgrade - Upgrade user plan (stub when enableRealPayments=false; 501 when true)
router.put('/upgrade', requireAuth, requireParentSession, async (req, res) => {
  try {
    if (config.features.enableRealPayments) {
      return res.status(501).json({
        status: 'error',
        message: 'Use Stripe checkout to upgrade',
        code: 'USE_STRIPE_CHECKOUT',
      });
    }

    const userId = req.user!.id;
    const { planSlug } = req.body;
    
    if (!planSlug) {
      return res.status(400).json({
        status: 'error',
        message: 'Plan slug is required'
      });
    }
    
    // Use existing changePlan function from planService (stub mode)
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
