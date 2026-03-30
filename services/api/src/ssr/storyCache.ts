/**
 * Story SSR Cache
 * Redis cache for rendered HTML. Key: ssr:stories:{slug}:b:{WEB_BUILD_ID}:r:{public_render_version}
 */

import { config } from '../config';
import { logger } from '../utils/logger';
import { getRedisClient } from '../utils/redisClient';

export { getRedisClient } from '../utils/redisClient';

export function buildCacheKey(slug: string, publicRenderVersion: number): string {
  const buildId = config.web?.webBuildId || 'dev';
  return `ssr:stories:${slug}:b:${buildId}:r:${publicRenderVersion}`;
}

export async function getCachedHtml(slug: string, publicRenderVersion: number): Promise<string | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    return await redis.get(buildCacheKey(slug, publicRenderVersion));
  } catch (err) {
    logger.warn({ err, slug }, 'Redis get failed');
    return null;
  }
}

export async function setCachedHtml(slug: string, publicRenderVersion: number, html: string, ttlSeconds = 3600): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(buildCacheKey(slug, publicRenderVersion), html, ttlSeconds);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis set failed');
  }
}

// Published slugs set - quick check without DB
const PUBLISHED_SLUGS_KEY = 'published_slugs';

export async function addPublishedSlug(slug: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.sadd(PUBLISHED_SLUGS_KEY, slug);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis sadd published_slugs failed');
  }
}

export async function removePublishedSlug(slug: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.srem(PUBLISHED_SLUGS_KEY, slug);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis srem published_slugs failed');
  }
}

export async function isPublishedSlugCached(slug: string): Promise<boolean | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    return (await redis.sismember(PUBLISHED_SLUGS_KEY, slug)) === 1;
  } catch (err) {
    logger.warn({ err, slug }, 'Redis sismember failed');
    return null;
  }
}

// Alignment cache - public alignment by slug
const ALIGNMENT_CACHE_PREFIX = 'alignment:slug:';
const ALIGNMENT_CACHE_TTL = 86400; // 24h

export function buildAlignmentCacheKey(slug: string): string {
  return `${ALIGNMENT_CACHE_PREFIX}${slug}`;
}

export async function getCachedAlignment(slug: string): Promise<string | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    return await redis.get(buildAlignmentCacheKey(slug));
  } catch (err) {
    logger.warn({ err, slug }, 'Redis alignment get failed');
    return null;
  }
}

export async function setCachedAlignment(slug: string, alignmentJson: string, ttlSeconds = ALIGNMENT_CACHE_TTL): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(buildAlignmentCacheKey(slug), alignmentJson, ttlSeconds);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis alignment set failed');
  }
}

// Landing version - used for homepage cache revalidation
const LANDING_RENDER_VERSION_KEY = 'ssr:landing:render_version';

export async function getLandingRenderVersion(): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 1;
  try {
    const value = await redis.get(LANDING_RENDER_VERSION_KEY);
    const parsed = value ? Number.parseInt(value, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch (err) {
    logger.warn({ err }, 'Redis landing version get failed');
    return 1;
  }
}

export async function incrementLandingRenderVersion(): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 1;
  try {
    const current = await getLandingRenderVersion();
    const next = current + 1;
    await redis.set(LANDING_RENDER_VERSION_KEY, String(next), 60 * 60 * 24 * 365);
    return next;
  } catch (err) {
    logger.warn({ err }, 'Redis landing version increment failed');
    return 1;
  }
}
