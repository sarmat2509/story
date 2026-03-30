import { Request, Router } from 'express';
import * as planService from '../services/planService';
import { getDictionaryRepository } from '../repositories';
import { logger } from '../utils/logger';
import { requireAuth } from '../middleware/authMiddleware';
import config from '../config';

const router = Router();
const SUPPORTED_LOCALES = new Set(['uk', 'ru', 'en', 'es', 'fr', 'de']);

function normalizeLocale(input?: string | null): string {
  const normalized = input?.slice(0, 2).toLowerCase() || 'uk';
  return SUPPORTED_LOCALES.has(normalized) ? normalized : 'uk';
}

function resolvePublicLocale(req: Request): string {
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const headerLocale = typeof req.headers['accept-language'] === 'string'
    ? req.headers['accept-language'].split(',')[0]
    : undefined;
  return normalizeLocale(queryLocale || headerLocale);
}

function resolveAuthenticatedLocale(req: Request): string {
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const headerLocale = typeof req.headers['accept-language'] === 'string'
    ? req.headers['accept-language'].split(',')[0]
    : undefined;
  return normalizeLocale(queryLocale || req.user?.preferredLocale || headerLocale || null);
}

async function getPlanTranslations(planSlugs: string[], locale: string): Promise<Map<string, Map<string, string>>> {
  const dictionaryRepo = getDictionaryRepository();
  const translationsData = await dictionaryRepo.findTranslations('plan', planSlugs, locale);
  const translationsMap = new Map<string, Map<string, string>>();

  translationsData.forEach((translation) => {
    if (!translationsMap.has(translation.entityId)) {
      translationsMap.set(translation.entityId, new Map());
    }
    translationsMap.get(translation.entityId)!.set(translation.fieldName, translation.value);
  });

  return translationsMap;
}

async function buildPlansWithFeatures(options?: { currentPlanId?: string; locale?: string }) {
  const plans = await planService.getActivePlans();
  const locale = normalizeLocale(options?.locale || 'uk');
  const translations = await getPlanTranslations(plans.map((plan) => plan.slug), locale);

  const plansWithFeatures = await Promise.all(
    plans.map(async (plan) => {
      const planFeatures = await planService.getPlanFeaturesByPlanId(plan.id);
      const featuresMap: Record<string, any> = {};

      for (const pf of planFeatures) {
        const feature = await planService.getFeatureById(pf.featureId);
        if (feature) {
          featuresMap[feature.slug] = {
            name: feature.name,
            value: pf.value,
            category: feature.category,
          };
        }
      }

      const planTranslations = translations.get(plan.slug);

      return {
        id: plan.id,
        slug: plan.slug,
        name: planTranslations?.get('name') || plan.name,
        description: planTranslations?.get('description') || plan.description,
        priceMonthly: plan.priceMonthly,
        pricingCurrency: plan.pricingCurrency,
        sortOrder: plan.sortOrder,
        features: featuresMap,
        isCurrent: options?.currentPlanId ? plan.id === options.currentPlanId : undefined,
      };
    })
  );

  plansWithFeatures.sort((a, b) => a.sortOrder - b.sortOrder);
  return plansWithFeatures;
}

// GET /api/v1/plans - List all active plans with features (public)
router.get('/', async (req, res) => {
  try {
    const locale = resolvePublicLocale(req);
    const plansWithFeatures = await buildPlansWithFeatures({ locale });
    
    res.json({
      status: 'success',
      plans: plansWithFeatures,
      enableRealPayments: config.features.enableRealPayments,
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
    const locale = resolveAuthenticatedLocale(req);
    
    // Get user's current subscription
    const subscription = await planService.getUserSubscription(userId);
    const currentPlanId = subscription?.planId;
    const plansWithFeatures = await buildPlansWithFeatures({ currentPlanId, locale });
    
    res.json({
      status: 'success',
      plans: plansWithFeatures,
      enableRealPayments: config.features.enableRealPayments,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching plans with features');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch plans'
    });
  }
});

// PUT /api/v1/plans/upgrade - Upgrade user plan (stub when enableRealPayments=false; 501 when true)
router.put('/upgrade', requireAuth, async (req, res) => {
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
