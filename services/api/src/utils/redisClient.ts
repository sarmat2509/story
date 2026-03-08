/**
 * Shared Redis client singleton.
 * Used by storyCache, sitemapService, and any other cache consumers.
 * Returns null if REDIS_URL is not set or Redis is unavailable (graceful degradation).
 */

import { logger } from './logger';

export type RedisClient = {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, ttl?: number) => Promise<void>;
  del: (k: string) => Promise<number>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  sismember: (key: string, member: string) => Promise<number>;
};

let client: RedisClient | null = null;
let initAttempted = false;

export async function getRedisClient(): Promise<RedisClient | null> {
  if (client) return client;
  if (initAttempted) return null;

  initAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.debug('REDIS_URL not set, Redis cache disabled');
    return null;
  }

  try {
    const ioredis = await import('ioredis');
    const redis = new ioredis.default(url);

    client = {
      get: (k) => redis.get(k),
      set: async (k, v, ttl = 3600) => { await redis.setex(k, ttl, v); },
      del: (k) => redis.del(k),
      sadd: (key, ...members) => redis.sadd(key, ...members),
      srem: (key, ...members) => redis.srem(key, ...members),
      sismember: (key, member) => redis.sismember(key, member),
    };

    logger.debug('Redis client initialized');
    return client;
  } catch (err) {
    logger.warn({ err }, 'Redis init failed, cache disabled');
    return null;
  }
}
