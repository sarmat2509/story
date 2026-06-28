/**
 * SSR Landing Route
 * GET /ssr/landing - Static HTML landing page for SEO
 * Proxied by nginx at /landing
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  getReadingTimeMinutes,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import { renderLandingHtml } from '../ssr/renderLandingHtml';
import {
  formatLandingAgeGroup,
  formatLandingDuration,
  normalizeLandingLocale,
} from '../ssr/landingContent';
import { listPublicStories } from '../services/publicStoryService';
import {
  buildPlansWithFeatures,
  normalizeBillingCurrency,
} from '../services/planPresentationService';
import { getVoiceRepository } from '../repositories';

const router = Router();

type LandingVoices = Awaited<
  ReturnType<ReturnType<typeof getVoiceRepository>['findActiveByLanguage']>
>;

export function buildLandingEtag(html: string): string {
  return `"landing-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 12)}"`;
}

export function resolveLandingRouteLocale(routeLocale?: string | null): PublicSeoLocale {
  return normalizePublicSeoLocale(routeLocale);
}

/**
 * Format story duration for display.
 * Prefers audio totalDuration (seconds); falls back to getReadingTimeMinutes when no audio.
 */
function formatStoryTime(
  locale: string,
  audioMetadata: { totalDuration?: number } | null | undefined,
  scenes: Array<{ text: string }>
): string {
  if (audioMetadata?.totalDuration != null && typeof audioMetadata.totalDuration === 'number') {
    const min = Math.round(audioMetadata.totalDuration / 60);
    return formatLandingDuration(locale, min);
  }
  const readingMin = getReadingTimeMinutes(scenes);
  return formatLandingDuration(locale, readingMin);
}

function resolveLocale(req: Request): string {
  const routeLocale = typeof req.params.locale === 'string' ? req.params.locale : undefined;
  return normalizeLandingLocale(resolveLandingRouteLocale(routeLocale));
}

function resolveBillingCurrency(req: Request): string {
  return normalizeBillingCurrency(typeof req.query.currency === 'string' ? req.query.currency : null);
}

/**
 * GET /ssr/landing
 * Returns full static HTML for the landing page.
 * Fetches real published stories for the examples section.
 */
async function handleLanding(req: Request, res: Response) {
  const locale = resolveLocale(req);
  const billingCurrency = resolveBillingCurrency(req);
  let exampleStories: Array<{ age: string; title: string; time: string; slug: string; thumbnailUrl: string | null }> = [];

  let plans: Awaited<ReturnType<typeof buildPlansWithFeatures>> = [];
  let voices: LandingVoices = [];
  try {
    const { items } = await listPublicStories({
      limit: 6,
      showOnHomePage: true,
      language: locale,
    });
    exampleStories = items.slice(0, 6).map((s) => ({
      age: formatLandingAgeGroup(locale, s.ageGroup),
      title: s.title,
      time: formatStoryTime(locale, s.audioMetadata as any, s.scenes ?? []),
      slug: s.publishedSlug,
      thumbnailUrl:
        s.coverThumbnailUrl ??
        s.coverImageUrl ??
        s.scenes?.[0]?.imageUrl ??
        s.scenes?.find((sc) => sc.imageUrl)?.imageUrl ??
        null,
    }));
  } catch {
    // Fallback to empty — renderLandingHtml will use hardcoded examples
  }
  try {
    plans = await buildPlansWithFeatures({ locale, billingCurrency });
  } catch {
    // Fallback to empty — renderLandingHtml will use hardcoded plans
  }
  try {
    voices = await getVoiceRepository().findActiveByLanguage(locale);
  } catch {
    // Fallback to empty — renderLandingHtml will use hardcoded voices
  }

  const html = renderLandingHtml({ locale, exampleStories, plans, voices, billingCurrency });
  const etag = buildLandingEtag(html);
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

router.get('/', handleLanding);
router.get('/:locale', handleLanding);

export default router;
