/**
 * Quota information for character-based limits (audio providers)
 */
export interface QuotaInfo {
  used: number;
  limit: number;
  resetAt: Date;
  canExtend: boolean;
}

/**
 * Provider-agnostic interface for quota management
 * Abstracts quota fetching from different cloud providers (Google Cloud, AWS, OpenAI, ElevenLabs, etc.)
 * 
 * This interface allows rate limiters to remain vendor-agnostic while supporting
 * different cloud providers with their specific quota APIs.
 * 
 * Image providers typically use RPM (requests per minute).
 * Audio providers typically use character limits + concurrency.
 */
export interface IQuotaProvider {
  /**
   * Get current RPM limit
   * May fetch from API or return cached value depending on cache validity
   * 
   * @returns Promise resolving to current RPM limit
   */
  getRPMLimit(): Promise<number>;
  
  /**
   * Get cached limit without fetching from API
   * Returns null if no cache available
   * 
   * @returns Cached RPM limit or null
   */
  getCachedLimit(): number | null;
  
  /**
   * Reduce RPM limit adaptively (e.g., after 429 rate limit errors)
   * This allows the rate limiter to respond to actual API limits
   * 
   * @param reductionFactor - Factor to multiply current limit (e.g., 0.9 for 10% reduction)
   * @returns New reduced limit
   */
  reduceRPMLimit(reductionFactor: number): number;
  
  /**
   * Manually set RPM limit
   * Useful for testing or manual overrides
   * 
   * @param limit - New RPM limit to set
   * @param source - Optional source label for tracking (e.g., 'adaptive', 'default')
   */
  setRPMLimit(limit: number, source?: string): void;
  
  /**
   * Clear cached quota
   * Forces fresh fetch on next getRPMLimit() call
   */
  clearCache(): void;
  
  /**
   * Get character limit and usage (for audio providers like ElevenLabs)
   * Optional: only audio providers need to implement this
   * 
   * @returns Promise resolving to character quota information
   */
  getCharacterLimit?(): Promise<QuotaInfo>;
  
  /**
   * Get concurrency limit (for audio providers like ElevenLabs)
   * Optional: only audio providers need to implement this
   * 
   * @returns Promise resolving to maximum concurrent requests allowed
   */
  getConcurrencyLimit?(): Promise<number>;
}
