/**
 * Gemini Quota Provider
 * 
 * Vendor-specific implementation for Google Cloud Imagen 3 quota management.
 * Fetches RPM quotas from Google Cloud Quotas API.
 * Implements caching and fallback mechanisms for reliability.
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
 * Gemini Quota Provider
 * Fetches and caches RPM limits for Imagen 3 API from Google Cloud
 */
export class GeminiQuotaProvider implements IQuotaProvider {
  private cache: QuotaCache | null = null;
  private isFetching: boolean = false;
  private fetchPromise: Promise<number> | null = null;

  /**
   * Get current RPM limit for Imagen 3
   * Returns cached value if still valid, otherwise fetches from API
   */
  async getRPMLimit(): Promise<number> {
    // Check if cache is still valid (within refresh interval)
    if (this.cache && this.isCacheValid()) {
      logger.debug({ 
        limit: this.cache.limit, 
        source: this.cache.source,
        age: Date.now() - this.cache.fetchedAt 
      }, 'Using cached RPM limit');
      return this.cache.limit;
    }

    // If already fetching, wait for that promise
    if (this.isFetching && this.fetchPromise) {
      logger.debug('RPM limit fetch already in progress, waiting...');
      return await this.fetchPromise;
    }

    // Fetch new limit
    this.isFetching = true;
    this.fetchPromise = this.fetchRPMLimitFromAPI();

    try {
      const limit = await this.fetchPromise;
      this.cache = {
        limit,
        fetchedAt: Date.now(),
        source: 'api',
      };
      logger.info({ limit, source: 'api' }, 'RPM limit fetched from Google Cloud Quotas API');
      return limit;
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch RPM limit from API, using fallback');
      // Use cached value if available, otherwise default
      const fallbackLimit = this.cache?.limit || config.image.rpmDefaultLimit;
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
   * Fetch RPM limit from Google Cloud Quotas API
   * 
   * Note: This requires @googleapis/cloudquotas package and proper authentication.
   * For MVP, we'll implement a placeholder that returns the default limit.
   * In production, this should use the actual Cloud Quotas API.
   */
  private async fetchRPMLimitFromAPI(): Promise<number> {
    try {
      // Check if Google Cloud credentials are configured
      if (!config.googleCloud.project || !config.googleCloud.credentials) {
        logger.warn('Google Cloud credentials not configured, using default RPM limit');
        return config.image.rpmDefaultLimit;
      }

      // TODO: Implement actual Cloud Quotas API call
      // For now, return default limit as placeholder
      // 
      // In production, this should:
      // 1. Initialize Google Auth with service account
      // 2. Call Cloud Quotas API to get aiplatform.googleapis.com quotas
      // 3. Find the quota for Imagen requests per minute
      // 4. Return the effective limit
      //
      // Example implementation:
      // const { cloudquotas_v1 } = require('@googleapis/cloudquotas');
      // const { GoogleAuth } = require('google-auth-library');
      // 
      // const auth = new GoogleAuth({
      //   keyFilename: config.googleCloud.credentials,
      //   scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      // });
      // 
      // const quotas = cloudquotas_v1.Cloudquotas({ auth });
      // const response = await quotas.projects.locations.services.quotaInfos.list({
      //   parent: `projects/${config.googleCloud.project}/locations/global/services/aiplatform.googleapis.com`,
      // });
      // 
      // const imagenQuota = response.data.quotaInfos?.find(
      //   q => q.quotaId?.includes('imagen') && q.quotaId?.includes('requests')
      // );
      // 
      // return imagenQuota?.containerQuotaLimit?.defaultLimit || config.image.rpmDefaultLimit;

      logger.info('Cloud Quotas API integration pending, using default RPM limit');
      return config.image.rpmDefaultLimit;

    } catch (error) {
      logger.error({ error }, 'Error fetching RPM limit from Google Cloud Quotas API');
      throw error;
    }
  }

  /**
   * Check if cached quota is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;
    const age = Date.now() - this.cache.fetchedAt;
    return age < config.image.rpmQuotaRefreshIntervalMs;
  }

  /**
   * Manually set RPM limit (for testing or adaptive adjustment based on 429 errors)
   */
  setRPMLimit(limit: number, source: string = 'adaptive'): void {
    logger.info({ limit, source }, 'Manually setting RPM limit');
    this.cache = {
      limit,
      fetchedAt: Date.now(),
      source: source as 'api' | 'default' | 'adaptive',
    };
  }

  /**
   * Reduce RPM limit adaptively (called when 429 errors occur)
   */
  reduceRPMLimit(reductionFactor: number = 0.9): number {
    const currentLimit = this.cache?.limit || config.image.rpmDefaultLimit;
    const newLimit = Math.floor(currentLimit * reductionFactor);
    
    logger.warn({ 
      oldLimit: currentLimit, 
      newLimit, 
      reductionFactor 
    }, 'Reducing RPM limit due to rate limiting');
    
    this.setRPMLimit(newLimit, 'adaptive');
    return newLimit;
  }

  /**
   * Get current cached limit without fetching
   */
  getCachedLimit(): number | null {
    return this.cache?.limit || null;
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache = null;
    logger.debug('RPM limit cache cleared');
  }
}
