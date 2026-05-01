/**
 * Story + audio bundle catalog (priced per user's current plan).
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as bundleService from '../services/bundleService';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/v1/bundles — list bundles for current user's plan
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const bundles = await bundleService.listBundlesForUser(userId);

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
