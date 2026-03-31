/**
 * SSR Legal Routes
 * GET /ssr/legal/terms, GET /ssr/legal/privacy
 * Proxied by nginx at /terms and /privacy
 */

import { Router, Request, Response } from 'express';
import { DEFAULT_LOCALE, isValidLocale } from '@wondertales/shared';
import { verifyToken } from '../services/jwtService';
import { getSessionWithUser } from '../services/sessionService';
import { renderLegalHtml } from '../ssr/renderLegalHtml';
import { logger } from '../utils/logger';

const router = Router();

async function getLocaleFromRequest(req: Request): Promise<string> {
  const cookieToken = req.cookies?.wt_session as string | undefined;
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const jwt = cookieToken || bearerToken;

  if (jwt) {
    const decoded = verifyToken(jwt);
    if (decoded) {
      const session = await getSessionWithUser(decoded.sessionId);
      if (session?.user?.preferredLocale) {
        const locale = session.user.preferredLocale.slice(0, 2).toLowerCase();
        if (isValidLocale(locale)) {
          return locale;
        }
      }
    }
  }

  const acceptLang = req.headers['accept-language']?.split(',')[0]?.slice(0, 2)?.toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(acceptLang) ? acceptLang : DEFAULT_LOCALE;
}

router.get('/terms', async (req: Request, res: Response) => {
  try {
    const locale = await getLocaleFromRequest(req);
    const html = await renderLegalHtml({ doc: 'terms', locale });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  } catch (error) {
    logger.error({ err: error }, 'Error rendering terms');
    res.status(500).send('Internal Server Error');
  }
});

router.get('/privacy', async (req: Request, res: Response) => {
  try {
    const locale = await getLocaleFromRequest(req);
    const html = await renderLegalHtml({ doc: 'privacy', locale });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  } catch (error) {
    logger.error({ err: error }, 'Error rendering privacy');
    res.status(500).send('Internal Server Error');
  }
});

export default router;
