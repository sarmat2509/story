/**
 * SSR Stories Routes
 * GET /ssr/stories - Rendered HTML for the published stories catalog
 * GET /ssr/stories/:slug - Rendered HTML for published story (OG, JSON-LD, __INITIAL_STORY__)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { normalizePublicSeoLocale } from '@wondertales/shared';
import { getPublicStoryBySlug, listPublicStoriesForLocaleCatalog } from '../services/publicStoryService';
import { getCachedHtml, setCachedHtml } from '../ssr/storyCache';
import { renderPublishedStoryHtml } from '../ssr/renderPublishedStoryHtml';
import { renderPublicStoriesCatalogHtml } from '../ssr/renderPublicStoriesCatalogHtml';
import { logger } from '../utils/logger';

const router = Router();

export function buildStoriesCatalogEtag(html: string): string {
  return `"stories-catalog-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 12)}"`;
}

async function handleStoriesCatalog(req: Request, res: Response) {
  const locale = normalizePublicSeoLocale(req.params.locale);

  try {
    const { items, total, fallbackStartIndex } = await listPublicStoriesForLocaleCatalog({
      locale,
      limit: 24,
    });
    const html = renderPublicStoriesCatalogHtml({ locale, stories: items, total, fallbackStartIndex });
    const etag = buildStoriesCatalogEtag(html);

    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, no-cache, must-revalidate');
      return res.end();
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, no-cache, must-revalidate');
    res.send(html);
  } catch (error) {
    logger.error({ err: error, locale }, 'SSR stories catalog failed');
    res.status(500).send('Internal server error');
  }
}

router.get('/', handleStoriesCatalog);
router.get('/catalog/:locale', handleStoriesCatalog);

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
      res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
      return res.send(cached);
    }

    const html = renderPublishedStoryHtml({ story, useStaticBody: true });
    await setCachedHtml(slug, publicRenderVersion, html, 10 * 60);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
    res.send(html);
  } catch (error) {
    logger.error({ err: error, slug: req.params.slug }, 'SSR story failed');
    res.status(500).send('Internal server error');
  }
});

export default router;
