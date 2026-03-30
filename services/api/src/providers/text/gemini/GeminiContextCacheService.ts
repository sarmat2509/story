import { GoogleGenAI } from '@google/genai';
import { logger } from '../../../utils/logger';

type CacheEntry = {
  name: string;
  expiresAt: number;
};

type FailedEntry = {
  retryAfterMs: number;
};

export type GeminiContextCacheRequest = {
  model: string;
  key: string;
  content: string;
  ttlSeconds?: number;
  displayName?: string;
};

export type GeminiContextCacheDecision = {
  useCache: boolean;
  reason?: 'too_small' | 'share_too_low';
  estimatedCachedTokens: number;
  estimatedRuntimeTokens: number;
  cachedShare: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const SKEW_MS = 60 * 1000;

export function estimateGeminiTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.ceil(normalized.length / 4);
}

export function shouldUseGeminiContextCache(params: {
  cachedContent: string;
  runtimeContent: string;
  minEstimatedTokens: number;
  minShare: number;
}): GeminiContextCacheDecision {
  const estimatedCachedTokens = estimateGeminiTokens(params.cachedContent);
  const estimatedRuntimeTokens = estimateGeminiTokens(params.runtimeContent);
  const totalEstimatedTokens = estimatedCachedTokens + estimatedRuntimeTokens;
  const cachedShare = totalEstimatedTokens > 0 ? estimatedCachedTokens / totalEstimatedTokens : 0;

  if (estimatedCachedTokens < params.minEstimatedTokens) {
    return {
      useCache: false,
      reason: 'too_small',
      estimatedCachedTokens,
      estimatedRuntimeTokens,
      cachedShare,
    };
  }

  if (cachedShare < params.minShare) {
    return {
      useCache: false,
      reason: 'share_too_low',
      estimatedCachedTokens,
      estimatedRuntimeTokens,
      cachedShare,
    };
  }

  return {
    useCache: true,
    estimatedCachedTokens,
    estimatedRuntimeTokens,
    cachedShare,
  };
}

export class GeminiContextCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly failures = new Map<string, FailedEntry>();

  constructor(private readonly client: GoogleGenAI) {}

  async getOrCreate(request: GeminiContextCacheRequest): Promise<string | null> {
    const cacheMapKey = `${request.model}::${request.key}`;
    const now = Date.now();
    const failed = this.failures.get(cacheMapKey);
    if (failed && failed.retryAfterMs > now) {
      return null;
    }

    const existing = this.entries.get(cacheMapKey);
    if (existing && existing.expiresAt > now + SKEW_MS) {
      try {
        await this.client.caches.get({ name: existing.name });
        return existing.name;
      } catch (err) {
        logger.warn(
          { err, cacheKey: request.key, model: request.model, cacheName: existing.name },
          'Gemini context cache lookup failed; recreating cache',
        );
        this.entries.delete(cacheMapKey);
      }
    }

    try {
      const ttlSeconds = request.ttlSeconds ?? DEFAULT_TTL_SECONDS;
      const created = await this.client.caches.create({
        model: request.model,
        config: {
          contents: request.content,
          displayName: request.displayName ?? request.key,
          ttl: `${ttlSeconds}s`,
        },
      });
      if (!created.name) {
        throw new Error('Gemini cache created without resource name');
      }

      const expiresAt = created.expireTime
        ? Date.parse(created.expireTime)
        : now + ttlSeconds * 1000;

      this.entries.set(cacheMapKey, {
        name: created.name,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + ttlSeconds * 1000,
      });
      this.failures.delete(cacheMapKey);

      logger.info(
        { cacheKey: request.key, model: request.model, cacheName: created.name, ttlSeconds },
        'Gemini context cache created',
      );
      return created.name;
    } catch (err) {
      this.failures.set(cacheMapKey, { retryAfterMs: now + FAILURE_COOLDOWN_MS });
      logger.warn(
        { err, cacheKey: request.key, model: request.model },
        'Failed to create Gemini context cache; falling back to inline prompt',
      );
      return null;
    }
  }
}
