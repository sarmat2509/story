import { Router, Request, Response } from 'express';
import { normalizePublicSeoLocale, type PublicSeoLocale } from '@wondertales/shared';
import { renderSupportHtml } from '../ssr/renderSupportHtml';
import { logger } from '../utils/logger';

const router = Router();

export function resolveSupportRouteLocale(locale?: string | null): PublicSeoLocale {
  return normalizePublicSeoLocale(locale);
}

function renderSupportRoute(req: Request, res: Response) {
  try {
    const locale = resolveSupportRouteLocale(req.params.locale);
    const html = renderSupportHtml({ locale });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  } catch (error) {
    logger.error({ err: error }, 'Error rendering support page');
    res.status(500).send('Internal Server Error');
  }
}

router.get('/', renderSupportRoute);
router.get('/:locale', renderSupportRoute);

export default router;
