/**
 * SSR Stories Routes
 * GET /ssr/stories/:slug - Rendered HTML for published story (OG, JSON-LD, __INITIAL_STORY__)
 */

import { Router, Request, Response } from 'express';
import { getPublicStoryBySlug } from '../services/publicStoryService';
import { getCachedHtml, setCachedHtml } from '../ssr/storyCache';
import { renderPublishedStoryHtml } from '../ssr/renderPublishedStoryHtml';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /ssr/stories/:slug
 * Returns full HTML for SSR. Uses Redis cache when available.
 * 404 if story not found or not published.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const story = await getPublicStoryBySlug(slug);

    if (!story) {
      return res.status(404).send('Story not found');
    }

    const publicRenderVersion = story.publicRenderVersion ?? 1;

    // Try cache first
    const cached = await getCachedHtml(slug, publicRenderVersion);
    if (cached) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(cached);
    }

    const html = renderPublishedStoryHtml({ story, useStaticBody: true });
    await setCachedHtml(slug, publicRenderVersion, html, 3600);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error({ err: error, slug: req.params.slug }, 'SSR story failed');
    res.status(500).send('Internal server error');
  }
});

export default router;
