import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { normalizePublicSeoLocale, type PublicSeoLocale } from '@wondertales/shared';
import {
  buildPlansWithFeatures,
  normalizeBillingCurrency,
  normalizePlanLocale,
} from '../services/planPresentationService';
import { renderPricingHtml } from '../ssr/renderPricingHtml';
import {
  PUBLIC_PAGE_CACHE_TTL_SECONDS,
  buildPublicPageCacheKey,
  getCachedPublicPageHtml,
  getPublicPageRenderVersion,
  setCachedPublicPageHtml,
} from '../ssr/publicPageCache';
import config from '../config';
import { logger } from '../utils/logger';

const router = Router();
const PRICING_PLAN_LOAD_TIMEOUT_MS = 900;
const PRICING_FALLBACK_CACHE_TTL_SECONDS = 60;

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

function resolveBillingCurrency(req: Request): string {
  return normalizeBillingCurrency(typeof req.query.currency === 'string' ? req.query.currency : null);
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

function sendPricingHtml(req: Request, res: Response, html: string) {
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
  return res.send(html);
}

async function handlePricing(req: Request, res: Response) {
  const locale = resolveLocale(req);
  const billingCurrency = resolveBillingCurrency(req);
  const paymentsEnabled = config.features.enableRealPayments;
  const renderVersion = await getPublicPageRenderVersion('pricing');
  const cacheKey = buildPublicPageCacheKey('pricing', {
    locale,
    billingCurrency,
    payments: paymentsEnabled ? 'enabled' : 'disabled',
    renderVersion,
  });
  const cachedHtml = await getCachedPublicPageHtml(cacheKey, {
    page: 'pricing',
    locale,
    billingCurrency,
    renderVersion,
  });

  if (cachedHtml) {
    return sendPricingHtml(req, res, cachedHtml);
  }

  let plans: Awaited<ReturnType<typeof buildPlansWithFeatures>> = [];
  let cacheTtlSeconds = PUBLIC_PAGE_CACHE_TTL_SECONDS;

  try {
    plans = await withTimeout(
      buildPlansWithFeatures({ locale, billingCurrency }),
      PRICING_PLAN_LOAD_TIMEOUT_MS
    );
  } catch (error) {
    cacheTtlSeconds = PRICING_FALLBACK_CACHE_TTL_SECONDS;
    logger.warn({ error, locale }, 'Falling back to static pricing plans for SSR pricing page');
  }

  const html = renderPricingHtml({
    locale,
    plans,
    paymentsEnabled,
    billingCurrency,
  });
  await setCachedPublicPageHtml(cacheKey, html, cacheTtlSeconds, {
    page: 'pricing',
    locale,
    billingCurrency,
    renderVersion,
  });

  return sendPricingHtml(req, res, html);
}

router.get('/', handlePricing);
router.get('/:locale', handlePricing);

export default router;
