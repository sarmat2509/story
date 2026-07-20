/**
 * SSR Stories Routes
 * GET /ssr/stories - Rendered HTML for the published stories catalog
 * GET /ssr/stories/:slug - Complete HTML for a published story (OG + JSON-LD)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  STORY_COMPLEXITY_AGE_GROUPS,
  isPublicSeoLocale,
  normalizePublicSeoLocale,
} from '@wondertales/shared';
import { getPublicStoryBySlug, listPublicStoriesForLocaleCatalog } from '../services/publicStoryService';
import { getCachedHtml, setCachedHtml } from '../ssr/storyCache';
import { renderPublishedStoryHtml } from '../ssr/renderPublishedStoryHtml';
import {
  buildPublicStoriesCatalogPath,
  renderPublicStoriesCatalogHtml,
  type PublicStoriesCatalogFilters,
  type PublicStoriesReadingTimeFilter,
} from '../ssr/renderPublicStoriesCatalogHtml';
import { logger } from '../utils/logger';

const router = Router();
const STORIES_PER_PAGE = 24;

const READING_TIME_RANGES: Record<
  PublicStoriesReadingTimeFilter,
  { min?: number; max?: number }
> = {
  short: { max: 5 },
  medium: { min: 6, max: 10 },
  long: { min: 11 },
};

function queryValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function parseCatalogPage(value: unknown): number {
  const parsed = Number.parseInt(queryValue(value) ?? '1', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseCatalogFilters(req: Request): PublicStoriesCatalogFilters {
  const languageValue = queryValue(req.query.language)?.toLowerCase();
  const ageGroupValue = queryValue(req.query.age);
  const readingTimeValue = queryValue(req.query.reading) as
    | PublicStoriesReadingTimeFilter
    | undefined;
  const audioValue = queryValue(req.query.audio)?.toLowerCase();

  return {
    ...(languageValue && isPublicSeoLocale(languageValue) ? { language: languageValue } : {}),
    ...(ageGroupValue && (STORY_COMPLEXITY_AGE_GROUPS as readonly string[]).includes(ageGroupValue)
      ? { ageGroup: ageGroupValue }
      : {}),
    ...(readingTimeValue && readingTimeValue in READING_TIME_RANGES
      ? { readingTime: readingTimeValue }
      : {}),
    ...(audioValue === '1' || audioValue === 'true' ? { hasAudio: true } : {}),
  };
}

function controlledCatalogQuery(req: Request): string {
  const searchParams = new URLSearchParams();
  for (const key of ['language', 'age', 'reading', 'audio', 'page'] as const) {
    const value = queryValue(req.query[key]);
    if (value !== undefined) searchParams.set(key, value);
  }
  return searchParams.toString();
}

export function buildStoriesCatalogEtag(html: string): string {
  return `"stories-catalog-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 12)}"`;
}

async function handleStoriesCatalog(req: Request, res: Response) {
  const locale = normalizePublicSeoLocale(req.params.locale);
  const page = parseCatalogPage(req.query.page);
  const filters = parseCatalogFilters(req);
  const normalizedPublicPath = buildPublicStoriesCatalogPath(locale, filters, page);
  const normalizedQuery = normalizedPublicPath.split('?')[1] ?? '';
  if (controlledCatalogQuery(req) !== normalizedQuery) {
    return res.redirect(302, normalizedPublicPath);
  }
  const readingTimeRange = filters.readingTime
    ? READING_TIME_RANGES[filters.readingTime]
    : {};

  try {
    const { items, total, fallbackStartIndex } = await listPublicStoriesForLocaleCatalog({
      locale,
      limit: STORIES_PER_PAGE,
      offset: (page - 1) * STORIES_PER_PAGE,
      language: filters.language,
      ageGroup: filters.ageGroup,
      hasAudio: filters.hasAudio,
      readingTimeMin: readingTimeRange.min,
      readingTimeMax: readingTimeRange.max,
    });
    const totalPages = Math.max(1, Math.ceil(total / STORIES_PER_PAGE));
    const invalidPage = page > totalPages;
    const html = renderPublicStoriesCatalogHtml({
      locale,
      stories: invalidPage ? [] : items,
      total,
      fallbackStartIndex: invalidPage ? null : fallbackStartIndex,
      page,
      pageSize: STORIES_PER_PAGE,
      filters,
      invalidPage,
    });
    const etag = buildStoriesCatalogEtag(html);

    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, no-cache, must-revalidate');
      return res.end();
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, no-cache, must-revalidate');
    res.status(invalidPage ? 404 : 200).send(html);
  } catch (error) {
    logger.error({ err: error, locale }, 'SSR stories catalog failed');
    res.status(500).send('Internal server error');
  }
}

router.get('/', handleStoriesCatalog);
router.get('/catalog/:locale', handleStoriesCatalog);

/**
 * GET /ssr/stories/:slug
 * Returns full HTML for SSR. Uses Redis cache when available.
 * 404 if story not found or not published.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const story = await getPublicStoryBySlug(slug);

    if (!story) {
      return res.status(404).send('Story not found');
    }

    const publicRenderVersion = story.publicRenderVersion ?? 1;

    // Try cache first
    const cached = await getCachedHtml(slug, publicRenderVersion);
    if (cached) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
      return res.send(cached);
    }

    const html = renderPublishedStoryHtml({ story });
    await setCachedHtml(slug, publicRenderVersion, html, 10 * 60);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
    res.send(html);
  } catch (error) {
    logger.error({ err: error, slug: req.params.slug }, 'SSR story failed');
    res.status(500).send('Internal server error');
  }
});

export default router;
