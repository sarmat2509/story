/**
 * SSR Landing Route
 * GET /ssr/landing - Static HTML landing page for SEO
 * Proxied by nginx at /landing
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { DEFAULT_LOCALE, getReadingTimeMinutes } from '@wondertales/shared';
import { renderLandingHtml } from '../ssr/renderLandingHtml';
import { listPublicStories } from '../services/publicStoryService';
import * as planService from '../services/planService';
import { getVoiceRepository } from '../repositories';
import { getLandingRenderVersion } from '../ssr/storyCache';

const router = Router();

type LandingVoices = Awaited<
  ReturnType<ReturnType<typeof getVoiceRepository>['findActiveByLanguage']>
>;

const AGE_GROUP_LABELS: Record<string, string> = {
  '2-3': '2–3 років',
  '4-5': '4–5 років',
  '6-7': '6–7 років',
  '8-9': '8–9 років',
  '10-12': '10–12 років',
};

function formatAgeGroup(ageGroup: string): string {
  const mapped = AGE_GROUP_LABELS[ageGroup];
  if (mapped) return mapped;

  const normalized = ageGroup.trim();
  if (!normalized) return ageGroup;

  if (/рок/i.test(normalized)) {
    return normalized;
  }

  if (/^\d+\s*[-–]\s*\d+$/.test(normalized)) {
    const [from, to] = normalized.split(/[-–]/).map((part) => part.trim());
    return `${from}–${to} років`;
  }

  if (/^\d+$/.test(normalized)) {
    return `${normalized} років`;
  }

  return normalized;
}

/**
 * Format story duration for display.
 * Prefers audio totalDuration (seconds); falls back to getReadingTimeMinutes when no audio.
 */
function formatStoryTime(
  audioMetadata: { totalDuration?: number } | null | undefined,
  scenes: Array<{ text: string }>
): string {
  if (audioMetadata?.totalDuration != null && typeof audioMetadata.totalDuration === 'number') {
    const min = Math.round(audioMetadata.totalDuration / 60);
    return min <= 0 ? '—' : `${min} хв`;
  }
  const readingMin = getReadingTimeMinutes(scenes);
  return readingMin <= 0 ? '—' : `${readingMin} хв`;
}

/**
 * GET /ssr/landing
 * Returns full static HTML for the landing page.
 * Fetches real published stories for the examples section.
 */
router.get('/', async (_req: Request, res: Response) => {
  const locale = _req.headers['accept-language']?.split(',')[0]?.slice(0, 2) || DEFAULT_LOCALE;
  const landingRenderVersion = await getLandingRenderVersion();
  let exampleStories: Array<{ age: string; title: string; time: string; slug: string; thumbnailUrl: string | null }> = [];

  let plans: Awaited<ReturnType<typeof planService.getPlansWithLimits>> = [];
  let voices: LandingVoices = [];
  try {
    const { items } = await listPublicStories({ limit: 6, showOnHomePage: true });
    exampleStories = items.slice(0, 6).map((s) => ({
      age: formatAgeGroup(s.ageGroup),
      title: s.title,
      time: formatStoryTime(s.audioMetadata as any, s.scenes ?? []),
      slug: s.publishedSlug,
      thumbnailUrl: s.scenes?.[0]?.imageUrl ?? s.scenes?.find((sc) => sc.imageUrl)?.imageUrl ?? null,
    }));
  } catch {
    // Fallback to empty — renderLandingHtml will use hardcoded examples
  }
  try {
    plans = await planService.getPlansWithLimits();
  } catch {
    // Fallback to empty — renderLandingHtml will use hardcoded plans
  }
  try {
    voices = await getVoiceRepository().findActiveByLanguage('uk');
  } catch {
    // Fallback to empty — renderLandingHtml will use hardcoded voices
  }

  const html = renderLandingHtml({ locale, exampleStories, plans, voices });
  const etag = `"landing-${landingRenderVersion}-${crypto.createHash('sha1').update(locale).digest('hex').slice(0, 8)}"`;
  if (_req.headers['if-none-match'] === etag) {
    res.status(304);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, no-cache, must-revalidate');
    return res.end();
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, no-cache, must-revalidate');
  res.send(html);
});

export default router;
