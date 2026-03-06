/**
 * SSR Unlisted Stories Routes
 * GET /ssr/u/:token - Rendered HTML for unlisted story (by share token)
 */

import { Router, Request, Response } from 'express';
import { getPublicStoryByShareToken } from '../services/publicStoryService';
import { renderPublishedStoryHtml } from '../ssr/renderPublishedStoryHtml';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /ssr/u/:token
 * Returns full HTML for unlisted story. No Redis cache (token-based, low volume).
 * 404 if story not found.
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const story = await getPublicStoryByShareToken(token);

    if (!story) {
      return res.status(404).send('Story not found');
    }

    const html = renderPublishedStoryHtml({ story, useStaticBody: true });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error({ err: error, token: req.params.token }, 'SSR unlisted story failed');
    res.status(500).send('Internal server error');
  }
});

export default router;
