import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { normalizePublicSeoLocale, type PublicSeoLocale } from '@wondertales/shared';
import { buildPlansWithFeatures, normalizePlanLocale } from '../services/planPresentationService';
import { renderPricingHtml } from '../ssr/renderPricingHtml';
import config from '../config';
import { logger } from '../utils/logger';

const router = Router();
const PRICING_PLAN_LOAD_TIMEOUT_MS = 900;

export function buildPricingEtag(html: string): string {
  return `"pricing-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 12)}"`;
}

export function resolvePricingRouteLocale(routeLocale?: string | null): PublicSeoLocale {
  return normalizePublicSeoLocale(routeLocale);
}

function resolveLocale(req: Request): string {
  const routeLocale = typeof req.params.locale === 'string' ? req.params.locale : undefined;
  return normalizePlanLocale(resolvePricingRouteLocale(routeLocale));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`pricing plan load timed out after ${ms}ms`)), ms);
    timeout.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

async function handlePricing(req: Request, res: Response) {
  const locale = resolveLocale(req);
  let plans: Awaited<ReturnType<typeof buildPlansWithFeatures>> = [];

  try {
    plans = await withTimeout(
      buildPlansWithFeatures({ locale }),
      PRICING_PLAN_LOAD_TIMEOUT_MS
    );
  } catch (error) {
    logger.warn({ error, locale }, 'Falling back to static pricing plans for SSR pricing page');
  }

  const html = renderPricingHtml({
    locale,
    plans,
    paymentsEnabled: config.features.enableRealPayments,
  });
  const etag = buildPricingEtag(html);
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
