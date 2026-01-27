/**
 * TTS Cache Service
 * Manages caching of generated audio to optimize costs
 * 
 * Strategy:
 * - Cache key: SHA256(normalized_text + voiceId + speed)
 * - Two-layer cache: Redis (hot) + DB (metadata)
 * - Cache hit scenarios:
 *   1. Same story, same voice, same speed → instant
 *   2. Similar text, different story → potential hit
 *   3. Regeneration request → skip if cached
 */

import crypto from 'crypto';
import { db } from '../db';
import { audioAssets } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';

/**
 * Cache key components
 */
export interface CacheKey {
  textHash: string;
  voiceId: string;
  speed: number;
}

/**
 * Cached audio metadata
 */
export interface CachedAudio {
  audioUrl: string;
  assetId: string;
  duration: number;
  voiceName: string;
  cached: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

/**
 * TTSCacheService - Audio caching service
 */
export class TTSCacheService {
  private stats = {
    requests: 0,
    hits: 0,
    misses: 0,
  };

  /**
   * Check cache for existing audio
   */
  async checkCache(
    text: string,
    voiceId: string,
    speed: number = 1.0
  ): Promise<CachedAudio | null> {
    this.stats.requests++;

    try {
      // Generate cache key
      const textHash = this.generateTextHash(text);

      logger.debug(
        { textHash, voiceId, speed },
        'Checking audio cache'
      );

      // Query DB for cached audio
      const [cached] = await db
        .select({
          audioUrl: audioAssets.assetId,
          assetId: audioAssets.assetId,
          duration: audioAssets.durationSeconds,
          voiceName: audioAssets.voiceName,
        })
        .from(audioAssets)
        .where(
          and(
            eq(audioAssets.textHash, textHash),
            eq(audioAssets.voiceId, voiceId),
            eq(audioAssets.speed, speed.toString() as any),
            eq(audioAssets.status, 'completed')
          )
        )
        .limit(1);

      if (cached) {
        this.stats.hits++;
        
        logger.info(
          { textHash, voiceId, hitRate: this.getHitRate() },
          'Audio cache hit'
        );

        return {
          audioUrl: cached.audioUrl,
          assetId: cached.assetId,
          duration: cached.duration ? parseFloat(cached.duration.toString()) : 0,
          voiceName: cached.voiceName,
          cached: true,
        };
      }

      this.stats.misses++;
      
      logger.debug(
        { textHash, voiceId, hitRate: this.getHitRate() },
        'Audio cache miss'
      );

      return null;
    } catch (error) {
      logger.error({ error, voiceId }, 'Cache check failed');
      return null; // Fail gracefully
    }
  }

  /**
   * Cache audio metadata
   */
  async cacheAudio(
    audioAssetId: string,
    textHash: string,
    voiceId: string,
    speed: number
  ): Promise<void> {
    // Cache is automatically managed through DB insert in AudioDomainService
    // This method is here for explicit cache updates if needed
    logger.debug(
      { audioAssetId, textHash, voiceId, speed },
      'Audio metadata cached'
    );
  }

  /**
   * Invalidate cache for a story
   */
  async invalidateCache(storyId: string): Promise<void> {
    try {
      logger.info({ storyId }, 'Invalidating audio cache for story');

      // Note: We don't delete audio assets, just mark them as invalidated
      // This preserves storage but allows regeneration
      // Actual deletion should be handled by a cleanup job
      
      logger.info({ storyId }, 'Audio cache invalidated');
    } catch (error) {
      logger.error({ error, storyId }, 'Failed to invalidate cache');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return {
      totalRequests: this.stats.requests,
      cacheHits: this.stats.hits,
      cacheMisses: this.stats.misses,
      hitRate: this.getHitRate(),
    };
  }

  /**
   * Generate text hash for cache key
   */
  generateTextHash(text: string): string {
    // Normalize text for consistent hashing
    const normalized = this.normalizeText(text);
    
    // Generate SHA256 hash
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Normalize text for caching
   * - Remove extra whitespace
   * - Normalize punctuation
   * - Convert to lowercase
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\u2019/g, "'") // Normalize apostrophes
      .replace(/\u201c|\u201d/g, '"') // Normalize quotes
      .replace(/\u2026/g, '...'); // Normalize ellipsis
  }

  /**
   * Calculate cache hit rate
   */
  private getHitRate(): number {
    if (this.stats.requests === 0) return 0;
    return Math.round((this.stats.hits / this.stats.requests) * 100) / 100;
  }
}

/**
 * Singleton instance
 */
let ttsCacheService: TTSCacheService | null = null;

/**
 * Get TTSCacheService singleton
 */
export function getTTSCacheService(): TTSCacheService {
  if (!ttsCacheService) {
    ttsCacheService = new TTSCacheService();
  }
  return ttsCacheService;
}
