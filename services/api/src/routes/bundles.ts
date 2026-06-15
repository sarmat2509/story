/**
 * Story + audio bundle catalog (priced per user's current plan).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import * as bundleService from '../services/bundleService';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/v1/bundles — list bundles for current user's plan
router.get('/', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const requestedCurrency =
      typeof req.query.currency === 'string'
        ? req.query.currency
        : req.user?.preferredBillingCurrency;
    const bundles = await bundleService.listBundlesForUser(userId, requestedCurrency);

    res.json({
      status: 'success',
      bundles,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List bundles failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list bundles',
    });
  }
});

export default router;
