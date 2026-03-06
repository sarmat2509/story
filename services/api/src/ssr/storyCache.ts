/**
 * Story SSR Cache
 * Redis cache for rendered HTML. Key: ssr:stories:{slug}:b:{WEB_BUILD_ID}:r:{public_render_version}
 */

import { config } from '../config';
import { logger } from '../utils/logger';

type RedisClient = {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, ttl?: number) => Promise<void>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  sismember: (key: string, member: string) => Promise<number>;
};

let redisClient: RedisClient | null = null;

async function getRedis(): Promise<RedisClient | null> {
  if (redisClient) return redisClient;
  try {
    const redis = await import('ioredis');
    const url = process.env.REDIS_URL;
    if (!url) {
      logger.debug('REDIS_URL not set, SSR cache disabled');
      return null;
    }
    const client = new redis.default(url);
    redisClient = {
      get: (k: string) => client.get(k),
      set: async (k: string, v: string, ttl = 3600) => {
        await client.setex(k, ttl, v);
      },
      sadd: (key: string, ...members: string[]) => client.sadd(key, ...members),
      srem: (key: string, ...members: string[]) => client.srem(key, ...members),
      sismember: (key: string, member: string) => client.sismember(key, member),
    };
    return redisClient;
  } catch (err) {
    logger.warn({ err }, 'Redis init failed, SSR cache disabled');
    return null;
  }
}

export function buildCacheKey(slug: string, publicRenderVersion: number): string {
  const buildId = config.web?.webBuildId || 'dev';
  return `ssr:stories:${slug}:b:${buildId}:r:${publicRenderVersion}`;
}

export async function getCachedHtml(slug: string, publicRenderVersion: number): Promise<string | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const key = buildCacheKey(slug, publicRenderVersion);
    const html = await redis.get(key);
    return html;
  } catch (err) {
    logger.warn({ err, slug }, 'Redis get failed');
    return null;
  }
}

export async function setCachedHtml(slug: string, publicRenderVersion: number, html: string, ttlSeconds = 3600): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    const key = buildCacheKey(slug, publicRenderVersion);
    await redis.set(key, html, ttlSeconds);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis set failed');
  }
}

// Phase 2: Published slugs set - quick check without DB
const PUBLISHED_SLUGS_KEY = 'published_slugs';

export async function addPublishedSlug(slug: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.sadd(PUBLISHED_SLUGS_KEY, slug);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis sadd published_slugs failed');
  }
}

export async function removePublishedSlug(slug: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.srem(PUBLISHED_SLUGS_KEY, slug);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis srem published_slugs failed');
  }
}

export async function isPublishedSlugCached(slug: string): Promise<boolean | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const n = await redis.sismember(PUBLISHED_SLUGS_KEY, slug);
    return n === 1;
  } catch (err) {
    logger.warn({ err, slug }, 'Redis sismember failed');
    return null;
  }
}

// Phase 2: Alignment cache - public alignment by slug
const ALIGNMENT_CACHE_PREFIX = 'alignment:slug:';
const ALIGNMENT_CACHE_TTL = 86400; // 24h

export function buildAlignmentCacheKey(slug: string): string {
  return `${ALIGNMENT_CACHE_PREFIX}${slug}`;
}

export async function getCachedAlignment(slug: string): Promise<string | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    return await redis.get(buildAlignmentCacheKey(slug));
  } catch (err) {
    logger.warn({ err, slug }, 'Redis alignment get failed');
    return null;
  }
}

export async function setCachedAlignment(slug: string, alignmentJson: string, ttlSeconds = ALIGNMENT_CACHE_TTL): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.set(buildAlignmentCacheKey(slug), alignmentJson, ttlSeconds);
  } catch (err) {
    logger.warn({ err, slug }, 'Redis alignment set failed');
  }
}
