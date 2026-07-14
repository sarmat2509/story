/**
 * SSR Author Routes
 * GET /ssr/authors/:authorId - Rendered HTML for public author pages
 */

import { Router, Request, Response } from 'express';
import { getPublicAuthorById, listPublicStories } from '../services/publicStoryService';
import { renderPublicAuthorHtml } from '../ssr/renderPublicAuthorHtml';
import { logger } from '../utils/logger';

const router = Router();

router.get('/:authorId', async (req: Request, res: Response) => {
  try {
    const { authorId } = req.params;
    const author = await getPublicAuthorById(authorId);

    if (!author) {
      res.setHeader('X-Robots-Tag', 'noindex,nofollow');
      return res.status(404).send('Author not found');
    }

    const { items, total } = await listPublicStories({ limit: 24, offset: 0, authorId });

    if (total === 0) {
      res.setHeader('X-Robots-Tag', 'noindex,nofollow');
      return res.status(404).send('Author not found');
    }

    const html = renderPublicAuthorHtml({
      author,
      stories: items,
      total,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'index,follow');
    res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
    res.send(html);
  } catch (error) {
    logger.error({ err: error, authorId: req.params.authorId }, 'SSR author page failed');
    res.status(500).send('Internal server error');
  }
});

export default router;
