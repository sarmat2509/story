/**
 * M1 Payment Integration: Billing routes (Stripe Checkout, Portal, Webhook)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import config from '../config';
import * as billingService from '../services/billingService';
import { logger } from '../utils/logger';
import {
  buildBillingCheckoutReturnUrls,
  buildBillingPortalReturnUrl,
} from './billingReturnUrls';
import { SUPPORTED_BILLING_CURRENCIES } from '../services/planPresentationService';

const checkoutSessionBodySchema = z.object({
  planSlug: z.string().min(1).max(64),
  currency: z.enum(SUPPORTED_BILLING_CURRENCIES).optional(),
});

const bundleCheckoutBodySchema = z.object({
  bundleSlug: z.string().min(1).max(64),
  currency: z.enum(SUPPORTED_BILLING_CURRENCIES).optional(),
});

const router = Router();

// POST /api/v1/billing/checkout-session - Create Stripe Checkout Session (subscription)
router.post('/checkout-session', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    if (!config.features.enableRealPayments) {
      return res.status(501).json({
        status: 'error',
        message: 'Real payments disabled. Use plan upgrade flow.',
        code: 'REAL_PAYMENTS_DISABLED',
      });
    }

    const userId = req.user!.id;
    const email = req.user!.email;
    const parsed = checkoutSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'planSlug is required and currency must be EUR or USD when provided',
      });
    }
    const { planSlug, currency } = parsed.data;

    const { successUrl, cancelUrl } = buildBillingCheckoutReturnUrls(
      config.web?.webAppUrl || '',
      req.user!.preferredLocale,
      'subscription'
    );

    const { sessionId, url } = await billingService.createCheckoutSession(
      userId,
      planSlug,
      email,
      successUrl,
      cancelUrl,
      currency
    );

    res.json({
      status: 'success',
      sessionId,
      url,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Create checkout session failed');
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    res.status(500).json({
      status: 'error',
      message,
    });
  }
});

// POST /api/v1/billing/bundle-checkout — one-time payment for extra story + audio limits (current period)
router.post('/bundle-checkout', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    if (!config.features.enableRealPayments) {
      return res.status(501).json({
        status: 'error',
        message: 'Real payments disabled.',
        code: 'REAL_PAYMENTS_DISABLED',
      });
    }

    const parsed = bundleCheckoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'bundleSlug is required',
      });
    }

    const userId = req.user!.id;
    const email = req.user!.email;
    const { bundleSlug, currency } = parsed.data;

    const { successUrl, cancelUrl } = buildBillingCheckoutReturnUrls(
      config.web?.webAppUrl || '',
      req.user!.preferredLocale,
      'bundle'
    );

    const { sessionId, url } = await billingService.createBundleCheckoutSession(
      userId,
      bundleSlug,
      email,
      successUrl,
      cancelUrl,
      currency
    );

    res.json({
      status: 'success',
      sessionId,
      url,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Create bundle checkout session failed');
    const message =
      error instanceof Error ? error.message : 'Failed to create bundle checkout session';
    const isClient = message.includes('Unknown') || message.includes('inactive bundle');
    res.status(isClient ? 400 : 500).json({
      status: 'error',
      message,
    });
  }
});

// POST /api/v1/billing/portal-session - Create Stripe Customer Portal session
router.post('/portal-session', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    if (!config.features.enableRealPayments) {
      return res.status(501).json({
        status: 'error',
        message: 'Real payments disabled.',
        code: 'REAL_PAYMENTS_DISABLED',
      });
    }

    const userId = req.user!.id;
    const returnUrl = buildBillingPortalReturnUrl(
      config.web?.webAppUrl || '',
      req.user!.preferredLocale
    );

    const url = await billingService.createPortalSession(userId, returnUrl);

    res.json({
      status: 'success',
      url,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Create portal session failed');
    const message = error instanceof Error ? error.message : 'Failed to create portal session';
    res.status(500).json({
      status: 'error',
      message,
    });
  }
});

export default router;
