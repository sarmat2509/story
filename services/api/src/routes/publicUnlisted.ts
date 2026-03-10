/**
 * Public Unlisted Stories API
 * GET /api/v1/public/u/:token - Get story by share token (unlisted)
 * POST /api/v1/public/u/:token/rating - Submit rating (same as public)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPublicStoryByShareToken } from '../services/publicStoryService';
import { getStoryRepository } from '../repositories';
import { submitRating } from '../services/storyRatingService';
import { logger } from '../utils/logger';
import { ratingLimiter } from '../middleware/rateLimiter';

const ratingBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  voterId: z.string().min(1).max(64),
});

const router = Router();

/**
 * POST /api/v1/public/u/:token/rating
 * Submit rating for unlisted story. Same logic as public.
 */
router.post('/:token/rating', ratingLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const parsed = ratingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }
    const { rating, voterId } = parsed.data;

    const storyRepo = getStoryRepository();
    const story = await storyRepo.findByShareToken(token);
    if (!story || !story.isPublished) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '0.0.0.0';

    const result = await submitRating(story.id, voterId, rating, ipAddress);

    if (result.ok === false) {
      return res.status(409).json({
        status: 'error',
        message: 'Already voted',
      });
    }

    res.json({
      status: 'success',
      message: 'Thank you, your vote has been accepted',
    });
  } catch (error) {
    logger.error({ err: error, token: req.params.token }, 'Submit unlisted story rating failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit rating',
    });
  }
});

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
