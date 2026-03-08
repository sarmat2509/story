/**
 * Sitemap route
 * GET /sitemap.xml — returns sitemap for all public stories
 */

import { Router, Request, Response } from 'express';
import { getOrGenerateSitemap } from '../services/sitemapService';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const xml = await getOrGenerateSitemap();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (error) {
    logger.error({ err: error }, 'Sitemap generation failed');
    res.status(500).send('Internal server error');
  }
});

export default router;
