/**
 * Gemini Text Quota Provider
 * 
 * Vendor-specific implementation for Gemini text generation quota management.
 * Same pattern as GeminiQuotaProvider for images.
 * Uses adaptive defaults with Google Cloud Quotas API placeholder.
 */

import type { IQuotaProvider } from '../../base/IQuotaProvider';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';

interface QuotaCache {
  limit: number;
  fetchedAt: number;
  source: 'api' | 'default' | 'adaptive';
}

/**
 * Gemini Text Quota Provider
 * Manages RPM limits for Gemini text generation API
 */
export class GeminiTextQuotaProvider implements IQuotaProvider {
  private cache: QuotaCache | null = null;
  private isFetching: boolean = false;
  private fetchPromise: Promise<number> | null = null;

  async getRPMLimit(): Promise<number> {
    if (this.cache && this.isCacheValid()) {
      return this.cache.limit;
    }

    if (this.isFetching && this.fetchPromise) {
      return await this.fetchPromise;
    }

    this.isFetching = true;
    this.fetchPromise = this.fetchRPMLimitFromAPI();

    try {
      const limit = await this.fetchPromise;
      this.cache = { limit, fetchedAt: Date.now(), source: 'api' };
      logger.info({ limit, source: 'api' }, 'Text RPM limit fetched');
      return limit;
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch text RPM limit, using fallback');
      const fallbackLimit = this.cache?.limit || config.text.rpmDefaultLimit;
      this.cache = {
        limit: fallbackLimit,
        fetchedAt: Date.now(),
        source: this.cache ? 'api' : 'default',
      };
      return fallbackLimit;
    } finally {
      this.isFetching = false;
      this.fetchPromise = null;
    }
  }

  /**
   * Placeholder for Google Cloud Quotas API integration.
   * Returns default limit for now.
   */
  private async fetchRPMLimitFromAPI(): Promise<number> {
    // TODO: Implement actual Cloud Quotas API call for generativelanguage.googleapis.com
    // Same approach as GeminiQuotaProvider for images
    return config.text.rpmDefaultLimit;
  }

  private isCacheValid(): boolean {
    if (!this.cache) return false;
    return (Date.now() - this.cache.fetchedAt) < config.text.rpmQuotaRefreshIntervalMs;
  }

  setRPMLimit(limit: number, source: string = 'adaptive'): void {
    this.cache = {
      limit,
      fetchedAt: Date.now(),
      source: source as 'api' | 'default' | 'adaptive',
    };
  }

  reduceRPMLimit(reductionFactor: number = 0.9): number {
    const currentLimit = this.cache?.limit || config.text.rpmDefaultLimit;
    const newLimit = Math.floor(currentLimit * reductionFactor);
    logger.warn({ oldLimit: currentLimit, newLimit, reductionFactor }, 'Reducing text RPM limit');
    this.setRPMLimit(newLimit, 'adaptive');
    return newLimit;
  }

  getCachedLimit(): number | null {
    return this.cache?.limit || null;
  }

  clearCache(): void {
    this.cache = null;
  }
}
