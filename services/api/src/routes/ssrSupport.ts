import { Router, Request, Response } from 'express';
import { renderSupportHtml } from '../ssr/renderSupportHtml';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    const html = renderSupportHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Robots-Tag', 'noindex,follow');
    res.send(html);
  } catch (error) {
    logger.error({ err: error }, 'Error rendering support page');
    res.status(500).send('Internal Server Error');
  }
});

export default router;
