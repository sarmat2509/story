/**
 * M1 Payment Integration: Billing routes (Stripe Checkout, Portal, Webhook)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import config from '../config';
import * as billingService from '../services/billingService';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/v1/billing/checkout-session - Create Stripe Checkout Session (subscription)
router.post('/checkout-session', requireAuth, async (req: Request, res: Response) => {
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
    const { planSlug } = req.body;

    if (!planSlug || typeof planSlug !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'planSlug is required',
      });
    }

    const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '');
    const successUrl = `${webAppUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${webAppUrl}/plans`;

    const { sessionId, url } = await billingService.createCheckoutSession(
      userId,
      planSlug,
      email,
      successUrl,
      cancelUrl
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

// POST /api/v1/billing/portal-session - Create Stripe Customer Portal session
router.post('/portal-session', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!config.features.enableRealPayments) {
      return res.status(501).json({
        status: 'error',
        message: 'Real payments disabled.',
        code: 'REAL_PAYMENTS_DISABLED',
      });
    }

    const userId = req.user!.id;
    const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '');
    const returnUrl = `${webAppUrl}/profile`;

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
