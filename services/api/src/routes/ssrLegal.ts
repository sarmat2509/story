/**
 * SSR Legal Routes
 * GET /ssr/legal/terms, GET /ssr/legal/privacy
 * GET /ssr/legal/terms/:locale, GET /ssr/legal/privacy/:locale
 * Proxied by nginx at /terms, /privacy, and localized public legal routes.
 */

import { Router, Request, Response } from 'express';
import { renderLegalHtml } from '../ssr/renderLegalHtml';
import { logger } from '../utils/logger';

const router = Router();

export function resolveLegalRouteLocale(locale?: string | null): string {
  return locale?.slice(0, 2).toLowerCase() || 'uk';
}

function renderLegalRoute(doc: 'terms' | 'privacy') {
  return async (req: Request, res: Response) => {
    try {
      const locale = resolveLegalRouteLocale(req.params.locale);
      const html = await renderLegalHtml({ doc, locale });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(html);
    } catch (error) {
      logger.error({ err: error }, `Error rendering ${doc}`);
      res.status(500).send('Internal Server Error');
    }
  };
}

router.get('/terms', renderLegalRoute('terms'));
router.get('/terms/:locale', renderLegalRoute('terms'));
router.get('/privacy', renderLegalRoute('privacy'));
router.get('/privacy/:locale', renderLegalRoute('privacy'));

export default router;
