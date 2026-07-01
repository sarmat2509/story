/**
 * Redis cache for fully rendered public SSR pages.
 * The cache key includes WEB_BUILD_ID plus route variants so deploys and localized pages never mix.
 */

import { config } from '../config';
import { logger } from '../utils/logger';
import { getRedisClient } from '../utils/redisClient';

export const PUBLIC_PAGE_CACHE_TTL_SECONDS = 60 * 60;
const PUBLIC_PAGE_VERSION_TTL_SECONDS = 60 * 60 * 24 * 365;

type CacheVariantValue = string | number | boolean | null | undefined;

function cacheSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
}

export function buildPublicPageCacheKey(
  page: string,
  variants: Record<string, CacheVariantValue> = {}
): string {
  const buildId = cacheSegment(config.web?.webBuildId || 'dev');
  const variantSegments = Object.entries(variants)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${cacheSegment(key)}:${cacheSegment(String(value))}`);

  return ['ssr', 'pages', cacheSegment(page), `b:${buildId}`, ...variantSegments].join(':');
}

function buildPublicPageVersionKey(page: string): string {
  return `ssr:pages:${cacheSegment(page)}:render_version`;
}

export async function getPublicPageRenderVersion(page: string): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 1;

  try {
    const value = await redis.get(buildPublicPageVersionKey(page));
    const parsed = value ? Number.parseInt(value, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch (err) {
    logger.warn({ err, page }, 'Redis public page version get failed');
    return 1;
  }
}

export async function incrementPublicPageRenderVersion(page: string): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 1;

  try {
    const current = await getPublicPageRenderVersion(page);
    const next = current + 1;
    await redis.set(buildPublicPageVersionKey(page), String(next), PUBLIC_PAGE_VERSION_TTL_SECONDS);
    return next;
  } catch (err) {
    logger.warn({ err, page }, 'Redis public page version increment failed');
    return 1;
  }
}

export async function getCachedPublicPageHtml(
  cacheKey: string,
  context?: Record<string, unknown>
): Promise<string | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    return await redis.get(cacheKey);
  } catch (err) {
    logger.warn({ err, cacheKey, ...context }, 'Redis public page HTML get failed');
    return null;
  }
}

export async function setCachedPublicPageHtml(
  cacheKey: string,
  html: string,
  ttlSeconds = PUBLIC_PAGE_CACHE_TTL_SECONDS,
  context?: Record<string, unknown>
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.set(cacheKey, html, ttlSeconds);
  } catch (err) {
    logger.warn({ err, cacheKey, ...context }, 'Redis public page HTML set failed');
  }
}
