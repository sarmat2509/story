/**
 * M1 Payment Integration: Stripe webhook route
 * Uses raw body for signature verification - must be mounted before express.json()
 */

import { Router, Request, Response } from 'express';
import config from '../config';
import * as billingService from '../services/billingService';
import { logger } from '../utils/logger';

const router = Router();

// Stripe sends webhook with Stripe-Signature header
router.post('/stripe', async (req: Request, res: Response) => {
  try {
    if (!config.stripe.webhookSecret) {
      logger.warn('Stripe webhook secret not configured');
      return res.status(503).json({ status: 'error', message: 'Webhook not configured' });
    }

    // req.body is raw buffer when using express.raw() for this route
    const rawBody = req.body as Buffer;
    const signature = req.headers['stripe-signature'] as string;

    if (!rawBody || !signature) {
      return res.status(400).json({ status: 'error', message: 'Missing body or signature' });
    }

    await billingService.handleStripeWebhook(rawBody, signature);
    res.json({ received: true });
  } catch (error) {
    logger.error({ err: error }, 'Stripe webhook failed');
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    res.status(400).json({ status: 'error', message });
  }
});

export default router;
