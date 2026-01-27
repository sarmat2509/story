/**
 * ElevenLabs Quota Provider
 * 
 * Vendor-specific implementation for ElevenLabs TTS quota management.
 * Fetches character quotas and concurrency limits from ElevenLabs Subscription API.
 * Implements caching and fallback mechanisms for reliability.
 */

import type { IQuotaProvider, QuotaInfo } from '../../base/IQuotaProvider';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';

/**
 * ElevenLabs subscription response
 */
interface ElevenLabsSubscription {
  character_count: number;
  character_limit: number;
  next_character_count_reset_unix: number;
  can_extend_character_limit: boolean;
  tier: string;
  status: string;
}

/**
 * Subscription cache with character quota and concurrency limit
 */
interface SubscriptionCache {
  characterQuota: QuotaInfo;
  concurrencyLimit: number;
  fetchedAt: number;
}

/**
 * ElevenLabs Quota Provider
 * Fetches and caches character limits and concurrency from ElevenLabs API
 */
export class ElevenLabsQuotaProvider implements IQuotaProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string = 'https://api.elevenlabs.io/v1';
  private cache: SubscriptionCache | null = null;
  private isFetching: boolean = false;
  private fetchPromise: Promise<void> | null = null;
  private readonly cacheTTL: number = 300000; // 5 minutes

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('ElevenLabs API key is required for quota provider');
    }
    this.apiKey = apiKey;
    
    logger.info('ElevenLabsQuotaProvider initialized');
  }

  /**
   * Get character limit and usage
   * ElevenLabs tracks characters consumed, not requests per minute
   */
  async getCharacterLimit(): Promise<QuotaInfo> {
    await this.ensureFreshCache();
    
    if (!this.cache) {
      throw new Error('Failed to fetch character quota');
    }
    
    return this.cache.characterQuota;
  }

  /**
   * Get concurrency limit based on subscription tier
   * ElevenLabs enforces concurrent request limits per tier
   */
  async getConcurrencyLimit(): Promise<number> {
    await this.ensureFreshCache();
    
    if (!this.cache) {
      throw new Error('Failed to fetch concurrency limit');
    }
    
    return this.cache.concurrencyLimit;
  }

  /**
   * Get RPM limit (for compatibility with IQuotaProvider)
   * Maps concurrency limit to approximate RPM
   * 
   * Note: This is an approximation since ElevenLabs uses concurrency, not RPM
   */
  async getRPMLimit(): Promise<number> {
    const concurrency = await this.getConcurrencyLimit();
    
    // Rough estimate: assume each TTS request takes ~10 seconds
    // So concurrency * 6 = approximate requests per minute
    return concurrency * 6;
  }

  /**
   * Get cached concurrency limit without fetching
   */
  getCachedLimit(): number | null {
    return this.cache?.concurrencyLimit || null;
  }

  /**
   * Reduce concurrency limit adaptively (called when 429 errors occur)
   */
  reduceRPMLimit(reductionFactor: number = 0.9): number {
    const currentLimit = this.cache?.concurrencyLimit || config.audio.maxConcurrency;
    const newLimit = Math.max(1, Math.floor(currentLimit * reductionFactor));
    
    logger.warn({ 
      oldLimit: currentLimit, 
      newLimit, 
      reductionFactor 
    }, 'Reducing concurrency limit due to rate limiting');
    
    this.setRPMLimit(newLimit, 'adaptive');
    return newLimit;
  }

  /**
   * Manually set concurrency limit
   */
  setRPMLimit(limit: number, source: string = 'manual'): void {
    if (!this.cache) {
      this.cache = {
        characterQuota: {
          used: 0,
          limit: config.audio.defaultCharacterLimit,
          resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          canExtend: false,
        },
        concurrencyLimit: limit,
        fetchedAt: Date.now(),
      };
    } else {
      this.cache.concurrencyLimit = limit;
    }
    
    logger.info({ limit, source }, 'Concurrency limit set manually');
  }

  /**
   * Clear cache (for testing or force refresh)
   */
  clearCache(): void {
    this.cache = null;
    logger.debug('ElevenLabs quota cache cleared');
  }

  /**
   * Fetch subscription info from ElevenLabs API
   */
  private async fetchSubscription(): Promise<void> {
    try {
      logger.debug('Fetching ElevenLabs subscription info');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        const response = await fetch(`${this.baseUrl}/user/subscription`, {
          method: 'GET',
          headers: {
            'xi-api-key': this.apiKey,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Invalid ElevenLabs API key');
          }
          throw new Error(`Failed to fetch subscription: ${response.status}`);
        }

        const data: ElevenLabsSubscription = await response.json();
        
        // Parse character quota
        const characterQuota: QuotaInfo = {
          used: data.character_count || 0,
          limit: data.character_limit || config.audio.defaultCharacterLimit,
          resetAt: new Date((data.next_character_count_reset_unix || 0) * 1000),
          canExtend: data.can_extend_character_limit || false,
        };

        // Infer concurrency limit from tier
        const concurrencyLimit = this.inferConcurrencyFromTier(
          data.tier, 
          data.status
        );

        this.cache = {
          characterQuota,
          concurrencyLimit,
          fetchedAt: Date.now(),
        };

        logger.info({
          characterUsed: characterQuota.used,
          characterLimit: characterQuota.limit,
          percentUsed: Math.round((characterQuota.used / characterQuota.limit) * 100),
          concurrency: concurrencyLimit,
          tier: data.tier,
          resetAt: characterQuota.resetAt.toISOString(),
        }, 'ElevenLabs quota fetched successfully');

      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('ElevenLabs API timeout');
        }
        throw fetchError;
      }

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch ElevenLabs subscription');
      
      // Fallback to defaults if no cache exists
      if (!this.cache) {
        logger.warn('Using default quota limits as fallback');
        this.cache = {
          characterQuota: {
            used: 0,
            limit: config.audio.defaultCharacterLimit,
            resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            canExtend: false,
          },
          concurrencyLimit: config.audio.maxConcurrency,
          fetchedAt: Date.now(),
        };
      }
    }
  }

  /**
   * Infer concurrency limit from subscription tier
   * Based on ElevenLabs pricing tiers: https://elevenlabs.io/pricing/api
   * 
   * Actual concurrency limits from Agents section (which uses TTS API):
   * - Free: 4 concurrent
   * - Starter: 6 concurrent
   * - Creator: 10 concurrent
   * - Pro: 20 concurrent
   * - Scale/Business: 30 concurrent
   * - Enterprise: Custom (higher)
   */
  private inferConcurrencyFromTier(tier: string, status: string): number {
    const tierLower = tier?.toLowerCase() || '';
    
    // Concurrency limits by tier (from ElevenLabs pricing page - Jan 2026)
    if (tierLower.includes('enterprise')) return 40; // Conservative estimate for enterprise
    if (tierLower.includes('business')) return 30;
    if (tierLower.includes('scale')) return 30;
    if (tierLower.includes('pro')) return 20;
    if (tierLower.includes('creator')) return 10;
    if (tierLower.includes('starter')) return 6;
    if (status === 'free' || tierLower === 'free') return 4;
    
    logger.debug({ tier, status }, 'Using default concurrency limit');
    return config.audio.maxConcurrency; // Default from config
  }

  /**
   * Ensure cache is fresh, fetch if needed
   */
  private async ensureFreshCache(): Promise<void> {
    if (this.cache && this.isCacheValid()) {
      return;
    }

    // If already fetching, wait for that fetch
    if (this.isFetching && this.fetchPromise) {
      await this.fetchPromise;
      return;
    }

    // Start new fetch
    this.isFetching = true;
    this.fetchPromise = this.fetchSubscription();

    try {
      await this.fetchPromise;
    } finally {
      this.isFetching = false;
      this.fetchPromise = null;
    }
  }

  /**
   * Check if cached quota is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;
    const age = Date.now() - this.cache.fetchedAt;
    return age < this.cacheTTL;
  }
}
