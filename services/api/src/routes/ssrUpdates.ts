import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { normalizePublicSeoLocale } from '@wondertales/shared';
import { listPublishedAppReleases } from '../services/appReleaseService';
import { renderAppUpdatesHtml } from '../ssr/renderAppUpdatesHtml';
import { logger } from '../utils/logger';

const router = Router();

async function renderUpdates(req: Request, res: Response) {
  try {
    const locale = normalizePublicSeoLocale(req.params.locale);
    const releases = await listPublishedAppReleases(locale);
    const html = renderAppUpdatesHtml({ locale, releases });
    const etag = `"updates-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 12)}"`;
    res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.type('html').send(html);
  } catch (error) {
    logger.error({ err: error, locale: req.params.locale }, 'Error rendering app updates page');
    return res.status(500).send('Internal Server Error');
  }
}

router.get('/', renderUpdates);
router.get('/:locale', renderUpdates);

export default router;
