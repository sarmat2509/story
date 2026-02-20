/**
 * Audio Rate Limiter
 * 
 * Vendor-agnostic rate limiter for audio generation using concurrency control.
 * Controls concurrent requests and character usage to stay within ElevenLabs quotas.
 * Works with any IQuotaProvider implementation (ElevenLabs, Google TTS, AWS Polly, etc.)
 */

import { config } from '../config';
import { logger } from '../utils/logger';
import type { IQuotaProvider, QuotaInfo } from '../providers/base/IQuotaProvider';

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  estimatedChars: number;
}

interface RateLimiterStats {
  activeConcurrent: number;
  maxConcurrency: number;
  characterUsed: number;
  characterLimit: number;
  queued: number;
  processed: number;
}

/**
 * Audio Rate Limiter using Concurrency Control + Character Tracking
 * 
 * Vendor-agnostic rate limiter that controls audio generation concurrency and character usage.
 * Implements FIFO queue for requests that exceed concurrency limit.
 * Uses dependency injection with IQuotaProvider for vendor-specific quota management.
 */
export class AudioRateLimiter {
  private activeRequests: number = 0; // Current concurrent requests
  private queue: QueuedTask<any>[] = []; // FIFO queue for waiting tasks
  private maxConcurrency: number = config.audio.maxConcurrency;
  private characterUsage: number = 0; // Tracked locally (reset periodically from API)
  private characterLimit: number = config.audio.defaultCharacterLimit;
  private characterResetAt: Date = new Date();
  private safetyMargin: number = config.audio.safetyMargin;
  private processedCount: number = 0;
  private isProcessingQueue: boolean = false;
  private quotaProvider: IQuotaProvider;
  private quotaRefreshIntervalId: NodeJS.Timeout | null = null;

  constructor(quotaProvider: IQuotaProvider) {
    this.quotaProvider = quotaProvider;
    
    // Periodically fetch updated quota
    this.startQuotaRefresh();
    
    logger.info({ 
      defaultConcurrency: this.maxConcurrency,
      defaultCharLimit: this.characterLimit,
      safetyMargin: this.safetyMargin 
    }, 'AudioRateLimiter initialized (vendor-agnostic)');
  }

  /**
   * Execute a function with rate limiting
   * Enforces concurrency limit and character quota
   * 
   * @param fn - Function to execute
   * @param estimatedChars - Estimated character count for this request
   * @returns Promise with function result
   */
  async execute<T>(fn: () => Promise<T>, estimatedChars: number): Promise<T> {
    // Check if we can execute immediately
    if (this.canExecuteImmediately(estimatedChars)) {
      return await this.executeImmediately(fn, estimatedChars);
    }

    // Need to queue
    return await this.enqueue(fn, estimatedChars);
  }

  /**
   * Check if request can execute immediately
   */
  private canExecuteImmediately(estimatedChars: number): boolean {
    // Check concurrency
    if (this.activeRequests >= this.maxConcurrency) {
      return false;
    }

    // Check character quota (with safety margin)
    const effectiveCharLimit = Math.floor(this.characterLimit * this.safetyMargin);
    if (this.characterUsage + estimatedChars > effectiveCharLimit) {
      return false;
    }

    return true;
  }

  /**
   * Execute function immediately (no queueing)
   */
  private async executeImmediately<T>(fn: () => Promise<T>, estimatedChars: number): Promise<T> {
    this.activeRequests++;
    this.characterUsage += estimatedChars;
    this.processedCount++;

    const stats = this.getStats();
    logger.debug({ 
      concurrent: stats.activeConcurrent,
      maxConcurrency: stats.maxConcurrency,
      charUsed: stats.characterUsed,
      charLimit: stats.characterLimit,
      queued: stats.queued
    }, 'Executing audio generation immediately');

    try {
      const result = await fn();
      
      // Start processing queue if there are waiting tasks
      if (this.queue.length > 0 && !this.isProcessingQueue) {
        setImmediate(() => this.processQueue());
      }
      
      return result;
    } catch (error: any) {
      // Rollback character usage on error
      this.characterUsage = Math.max(0, this.characterUsage - estimatedChars);
      
      // Check if it's a 429 error (rate limit)
      if (this.is429Error(error)) {
        logger.warn({ error: error.message }, 'Received 429 rate limit error, reducing limits');
        this.handleRateLimitError();
      }
      
      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Enqueue a task when limits are reached
   */
  private async enqueue<T>(fn: () => Promise<T>, estimatedChars: number): Promise<T> {
    const now = Date.now();
    
    // Check queue size limit
    const MAX_QUEUE_SIZE = 1000;
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      logger.error({ queueSize: this.queue.length }, 'Audio generation queue is full, rejecting request');
      throw new Error('System overload: Audio generation queue is full. Please try again later.');
    }

    // Check character quota before queueing
    if (this.quotaProvider.getCharacterLimit) {
      try {
        const quota = await this.quotaProvider.getCharacterLimit();
        
        if (quota.used + estimatedChars > quota.limit) {
          throw new Error(
            `Character quota exceeded: ${quota.used}/${quota.limit} characters used. ` +
            `Resets at: ${quota.resetAt.toISOString()}`
          );
        }
      } catch (error: any) {
        if (error.message.includes('quota exceeded')) {
          throw error;
        }
        // Continue if quota check fails (fallback to local tracking)
        logger.warn({ error: error.message }, 'Failed to check character quota, continuing');
      }
    }

    logger.info({ 
      queuePosition: this.queue.length + 1,
      activeConcurrent: this.activeRequests,
      maxConcurrency: this.maxConcurrency,
      estimatedChars
    }, 'Audio generation queued, waiting for available slot');

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        enqueuedAt: now,
        estimatedChars,
      };

      this.queue.push(task);

      // Start processing queue if not already processing
      if (!this.isProcessingQueue) {
        setImmediate(() => this.processQueue());
      }
    });
  }

  /**
   * Process queued tasks
   * Continuously checks for available slots and executes waiting tasks
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        // Check if we have available slots
        if (this.activeRequests >= this.maxConcurrency) {
          // No concurrency slots, wait a bit
          await this.sleep(100);
          continue;
        }

        // Get next task from queue
        const task = this.queue.shift();
        if (!task) break;

        // Check timeout
        const waitTime = Date.now() - task.enqueuedAt;
        if (waitTime > config.audio.queueTimeoutMs) {
          logger.warn({ 
            waitTime,
            timeout: config.audio.queueTimeoutMs 
          }, 'Task exceeded queue timeout, rejecting');
          
          task.reject(new Error('Audio generation timeout: Request waited too long in queue'));
          continue;
        }

        // Check character quota
        const effectiveCharLimit = Math.floor(this.characterLimit * this.safetyMargin);
        if (this.characterUsage + task.estimatedChars > effectiveCharLimit) {
          // Quota exceeded, wait for reset or reject
          logger.warn({
            charUsed: this.characterUsage,
            charLimit: effectiveCharLimit,
            needed: task.estimatedChars,
            resetAt: this.characterResetAt
          }, 'Character quota reached, checking API for reset');
          
          // Refresh quota to check if it reset
          await this.refreshQuota();
          
          // Still over limit? Reject task
          if (this.characterUsage + task.estimatedChars > effectiveCharLimit) {
            task.reject(new Error(
              `Character quota exceeded: ${this.characterUsage}/${this.characterLimit}. ` +
              `Resets at: ${this.characterResetAt.toISOString()}`
            ));
            continue;
          }
        }

        // Execute task
        try {
          this.activeRequests++;
          this.characterUsage += task.estimatedChars;
          this.processedCount++;

          logger.debug({ 
            concurrent: this.activeRequests,
            queueSize: this.queue.length,
            waitedMs: waitTime,
            charUsed: this.characterUsage
          }, 'Executing queued audio generation task');

          const result = await task.fn();
          task.resolve(result);
        } catch (error: any) {
          // Rollback character usage
          this.characterUsage = Math.max(0, this.characterUsage - task.estimatedChars);
          
          // Check if it's a 429 error
          if (this.is429Error(error)) {
            logger.warn('Received 429 error while processing queue, reducing limits');
            this.handleRateLimitError();
          }
          
          task.reject(error);
        } finally {
          this.activeRequests--;
        }
      }
    } finally {
      this.isProcessingQueue = false;
      
      // If there are still tasks in queue, schedule another processing cycle
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }

  /**
   * Get current rate limiter statistics
   */
  getStats(): RateLimiterStats {
    return {
      activeConcurrent: this.activeRequests,
      maxConcurrency: this.maxConcurrency,
      characterUsed: this.characterUsage,
      characterLimit: this.characterLimit,
      queued: this.queue.length,
      processed: this.processedCount,
    };
  }

  /**
   * Get current concurrency limit
   */
  getCurrentLimit(): number {
    return this.maxConcurrency;
  }

  /**
   * Manually set concurrency limit (for testing or adaptive adjustment)
   */
  setLimit(concurrency: number): void {
    const oldLimit = this.maxConcurrency;
    this.maxConcurrency = concurrency;
    logger.info({ oldLimit, newLimit: concurrency }, 'Concurrency limit updated manually');
  }

  /**
   * Handle 429 rate limit error
   * Adaptively reduce the effective limits
   */
  private handleRateLimitError(): void {
    // Reduce safety margin to be more conservative
    const oldMargin = this.safetyMargin;
    this.safetyMargin = Math.max(0.7, this.safetyMargin * 0.9); // Reduce by 10%, min 70%
    
    // Also try to reduce concurrency via provider
    this.quotaProvider.reduceRPMLimit(0.9);
    
    logger.warn({ 
      oldMargin, 
      newMargin: this.safetyMargin,
      effectiveConcurrency: Math.floor(this.maxConcurrency * this.safetyMargin)
    }, 'Adapted safety margin due to 429 errors');
  }

  /**
   * Check if error is a 429 rate limit error
   */
  private is429Error(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('429') || 
           message.includes('rate limit') || 
           message.includes('quota exceeded') ||
           message.includes('too many requests') ||
           message.includes('too_many_concurrent_requests');
  }

  /**
   * Start periodic quota refresh
   */
  /**
   * Stop the rate limiter: clear intervals and reject pending tasks
   */
  stop(): void {
    if (this.quotaRefreshIntervalId) {
      clearInterval(this.quotaRefreshIntervalId);
      this.quotaRefreshIntervalId = null;
    }
    // Reject all pending queue tasks
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        task.reject(new Error('AudioRateLimiter shutting down'));
      }
    }
    logger.info('AudioRateLimiter stopped');
  }

  private startQuotaRefresh(): void {
    // Initial fetch
    this.refreshQuota();

    // Periodic refresh
    this.quotaRefreshIntervalId = setInterval(() => {
      this.refreshQuota();
    }, config.audio.quotaRefreshIntervalMs);
  }

  /**
   * Refresh quota from quota provider
   */
  private async refreshQuota(): Promise<void> {
    try {
      // Fetch concurrency limit
      if (this.quotaProvider.getConcurrencyLimit) {
        const newConcurrency = await this.quotaProvider.getConcurrencyLimit();
        
        if (newConcurrency !== this.maxConcurrency) {
          const oldLimit = this.maxConcurrency;
          this.maxConcurrency = newConcurrency;
          
          logger.info({ 
            oldLimit, 
            newLimit: newConcurrency, 
            source: 'Quota Provider' 
          }, 'Concurrency limit updated from quota provider');
        }
      }

      // Fetch character quota
      if (this.quotaProvider.getCharacterLimit) {
        const quota = await this.quotaProvider.getCharacterLimit();
        
        // Check if quota was reset (new period)
        if (quota.resetAt > this.characterResetAt) {
          logger.info({
            oldResetAt: this.characterResetAt.toISOString(),
            newResetAt: quota.resetAt.toISOString(),
          }, 'Character quota reset detected, resetting local usage');
          
          this.characterUsage = 0; // Reset local tracking
        }
        
        // Update limits
        this.characterLimit = quota.limit;
        this.characterResetAt = quota.resetAt;
        
        // Sync local usage with API
        this.characterUsage = quota.used;
        
        logger.info({
          charUsed: quota.used,
          charLimit: quota.limit,
          percentUsed: Math.round((quota.used / quota.limit) * 100),
          resetAt: quota.resetAt.toISOString(),
        }, 'Character quota updated from API');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to refresh audio quota, keeping current limits');
    }
  }

  /**
   * Get cached quota limit from provider
   * Useful for monitoring endpoints
   */
  getCachedQuotaLimit(): number | null {
    return this.quotaProvider.getCachedLimit();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance
 */
let audioRateLimiterInstance: AudioRateLimiter | null = null;

/**
 * Get AudioRateLimiter singleton
 * Lazy initialization with ElevenLabsQuotaProvider
 */
export function getAudioRateLimiter(): AudioRateLimiter {
  if (!audioRateLimiterInstance) {
    const { ElevenLabsQuotaProvider } = require('../providers/audio/elevenlabs/ElevenLabsQuotaProvider');
    
    const quotaProvider = new ElevenLabsQuotaProvider(config.audio.elevenlabs.apiKey);
    audioRateLimiterInstance = new AudioRateLimiter(quotaProvider);
  }
  return audioRateLimiterInstance;
}

/**
 * Stop audio rate limiter: clear intervals and reject pending tasks
 */
export function stopAudioRateLimiter(): void {
  if (audioRateLimiterInstance) {
    audioRateLimiterInstance.stop();
  }
}

/**
 * Reset singleton (for testing)
 */
export function resetAudioRateLimiter(): void {
  if (audioRateLimiterInstance) {
    audioRateLimiterInstance.stop();
  }
  audioRateLimiterInstance = null;
}
