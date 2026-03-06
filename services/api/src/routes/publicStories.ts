/**
 * Public Stories API
 * GET /api/v1/public/stories - List published stories (catalog)
 * GET /api/v1/public/stories/:slug - Single published story (StoryPublicView)
 * GET /api/v1/public/stories/:slug/alignment - Alignment data (cacheable, public only)
 */

import { Router, Request, Response } from 'express';
import { getPublicStoryBySlug, listPublicStories, getAlignmentForPublicStory } from '../services/publicStoryService';
import { getCachedAlignment, setCachedAlignment } from '../ssr/storyCache';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/public/stories
 * List published stories (catalog). Public, no auth.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    const hasAudio =
      req.query.hasAudio === 'true' || req.query.hasAudio === '1' ||
      req.query.has_audio === 'true' || req.query.has_audio === '1';
    const scenarioCardId =
      (typeof req.query.scenarioCardId === 'string' ? req.query.scenarioCardId : null) ||
      (typeof req.query.scenario_card_id === 'string' ? req.query.scenario_card_id : null) ||
      undefined;

    const { items, total } = await listPublicStories({ limit, offset, hasAudio: hasAudio || undefined, scenarioCardId });

    res.json({
      status: 'success',
      stories: items,
      pagination: { limit, offset, total },
    });
  } catch (error) {
    logger.error({ err: error }, 'List public stories failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list published stories',
    });
  }
});

/**
 * GET /api/v1/public/stories/:slug/alignment
 * Get alignment data for a published story. 404 if not found, not public, or no alignment.
 * Cacheable (Redis).
 */
router.get('/:slug/alignment', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const cached = await getCachedAlignment(slug);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
      return res.json({
        status: 'success',
        alignment: JSON.parse(cached),
      });
    }

    const alignment = await getAlignmentForPublicStory(slug);
    if (!alignment) {
      return res.status(404).json({
        status: 'error',
        message: 'Alignment not found',
      });
    }

    await setCachedAlignment(slug, JSON.stringify(alignment));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json({
      status: 'success',
      alignment,
    });
  } catch (error) {
    logger.error({ err: error, slug: req.params.slug }, 'Get public alignment failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get alignment',
    });
  }
});

/**
 * GET /api/v1/public/stories/:slug
 * Get a published story by slug. 404 if not found or not public.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const story = await getPublicStoryBySlug(slug);

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
    logger.error({ err: error, slug: req.params.slug }, 'Get public story failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get published story',
    });
  }
});

export default router;
