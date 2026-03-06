/**
 * Public Unlisted Stories API
 * GET /api/v1/public/u/:token - Get story by share token (unlisted)
 */

import { Router, Request, Response } from 'express';
import { getPublicStoryByShareToken } from '../services/publicStoryService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/public/u/:token
 * Get an unlisted story by share token. 404 if not found.
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const story = await getPublicStoryByShareToken(token);

    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    res.json({
      status: 'success',
      story,
    });
  } catch (error) {
    logger.error({ err: error, token: req.params.token }, 'Get unlisted story failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get story',
    });
  }
});

export default router;
