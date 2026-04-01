import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { buildPlansWithFeatures, normalizePlanLocale } from '../services/planPresentationService';
import { renderPricingHtml } from '../ssr/renderPricingHtml';

const router = Router();

function resolveLocale(req: Request): string {
  const routeLocale = typeof req.params.locale === 'string' ? req.params.locale : undefined;
  const headerLocale = typeof req.headers['accept-language'] === 'string'
    ? req.headers['accept-language'].split(',')[0]
    : undefined;
  return normalizePlanLocale(routeLocale || headerLocale);
}

async function handlePricing(req: Request, res: Response) {
  const locale = resolveLocale(req);
  let plans: Awaited<ReturnType<typeof buildPlansWithFeatures>> = [];

  try {
    plans = await buildPlansWithFeatures({ locale });
  } catch {
    // Fallback to static pricing cards in renderPricingHtml
  }

  const html = renderPricingHtml({ locale, plans });
  const etag = `"pricing-${crypto.createHash('sha1').update(locale).digest('hex').slice(0, 8)}"`;
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
}

router.get('/', handlePricing);
router.get('/:locale', handlePricing);

export default router;
