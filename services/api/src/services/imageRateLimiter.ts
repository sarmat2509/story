/**
 * Image Rate Limiter
 * 
 * Vendor-agnostic rate limiter for image generation using sliding window algorithm.
 * Controls RPM (requests per minute) to stay within cloud provider quotas.
 * Works with any IQuotaProvider implementation (Gemini, OpenAI, AWS, etc.)
 */

import { config } from '../config';
import { logger } from '../utils/logger';
import type { IQuotaProvider } from '../providers/base/IQuotaProvider';

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

interface RateLimiterStats {
  currentRPM: number;
  maxRPM: number;
  requestsLast60s: number;
  queued: number;
  processed: number;
}

/**
 * Image Rate Limiter using Sliding Window Algorithm
 * 
 * Vendor-agnostic rate limiter that controls image generation RPM.
 * Implements FIFO queue for requests that exceed the limit.
 * Uses dependency injection with IQuotaProvider for vendor-specific quota management.
 */
export class ImageRateLimiter {
  private requestTimestamps: number[] = []; // Timestamps of requests in last 60 seconds
  private queue: QueuedTask<any>[] = []; // FIFO queue for waiting tasks
  private maxRPM: number = config.image.rpmDefaultLimit;
  private safetyMargin: number = config.image.rpmSafetyMargin;
  private processedCount: number = 0;
  private isProcessingQueue: boolean = false;
  private quotaProvider: IQuotaProvider;
  private quotaRefreshIntervalId: NodeJS.Timeout | null = null;

  constructor(quotaProvider: IQuotaProvider) {
    this.quotaProvider = quotaProvider;
    
    // Periodically fetch updated RPM limit
    this.startQuotaRefresh();
    logger.info({ 
      defaultRPM: this.maxRPM, 
      safetyMargin: this.safetyMargin 
    }, 'ImageRateLimiter initialized (vendor-agnostic)');
  }

  /**
   * Execute a function with rate limiting
   * If rate limit is reached, the task is queued and executed when slots become available
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Cleanup old timestamps first
    this.cleanupOldTimestamps();

    // Check if we can execute immediately
    const effectiveLimit = Math.floor(this.maxRPM * this.safetyMargin);
    
    if (this.requestTimestamps.length < effectiveLimit) {
      // Can execute immediately
      return await this.executeImmediately(fn);
    }

    // Need to queue
    return await this.enqueue(fn);
  }

  /**
   * Execute function immediately (no queueing)
   */
  private async executeImmediately<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    this.requestTimestamps.push(now);
    this.processedCount++;

    const stats = this.getStats();
    logger.debug({ 
      rpm: stats.currentRPM, 
      maxRPM: stats.maxRPM,
      requestsLast60s: stats.requestsLast60s,
      queued: stats.queued
    }, 'Executing image generation immediately');

    try {
      const result = await fn();
      
      // Start processing queue if there are waiting tasks
      if (this.queue.length > 0 && !this.isProcessingQueue) {
        setImmediate(() => this.processQueue());
      }
      
      return result;
    } catch (error: any) {
      // Check if it's a 429 error (rate limit)
      if (this.is429Error(error)) {
        logger.warn({ error: error.message }, 'Received 429 rate limit error, reducing RPM limit');
        this.handleRateLimitError();
      }
      throw error;
    }
  }

  /**
   * Enqueue a task when rate limit is reached
   */
  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    
    // Check queue size limit
    const MAX_QUEUE_SIZE = 1000;
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      logger.error({ queueSize: this.queue.length }, 'Image generation queue is full, rejecting request');
      throw new Error('System overload: Image generation queue is full. Please try again later.');
    }

    logger.info({ 
      queuePosition: this.queue.length + 1,
      currentRPM: this.getStats().currentRPM,
      maxRPM: this.maxRPM
    }, 'Image generation queued, waiting for available slot');

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        enqueuedAt: now,
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
        // Cleanup old timestamps
        this.cleanupOldTimestamps();

        // Check if we have available slots
        const effectiveLimit = Math.floor(this.maxRPM * this.safetyMargin);
        const availableSlots = effectiveLimit - this.requestTimestamps.length;

        if (availableSlots <= 0) {
          // No slots available, calculate wait time
          const oldestTimestamp = this.requestTimestamps[0];
          const timeUntilSlot = 60000 - (Date.now() - oldestTimestamp);
          
          if (timeUntilSlot > 0) {
            logger.debug({ 
              waitMs: timeUntilSlot,
              queueSize: this.queue.length 
            }, 'No slots available, waiting for window to clear');
            
            await this.sleep(Math.min(timeUntilSlot, 1000)); // Wait max 1 second at a time
            continue;
          }
        }

        // Get next task from queue
        const task = this.queue.shift();
        if (!task) break;

        // Check timeout
        const waitTime = Date.now() - task.enqueuedAt;
        if (waitTime > config.image.queueTimeoutMs) {
          logger.warn({ 
            waitTime,
            timeout: config.image.queueTimeoutMs 
          }, 'Task exceeded queue timeout, rejecting');
          
          task.reject(new Error('Image generation timeout: Request waited too long in queue'));
          continue;
        }

        // Execute task
        try {
          const now = Date.now();
          this.requestTimestamps.push(now);
          this.processedCount++;

          logger.debug({ 
            rpm: this.getStats().currentRPM,
            queueSize: this.queue.length,
            waitedMs: waitTime
          }, 'Executing queued image generation task');

          const result = await task.fn();
          task.resolve(result);
        } catch (error: any) {
          // Check if it's a 429 error
          if (this.is429Error(error)) {
            logger.warn('Received 429 error while processing queue, reducing RPM limit');
            this.handleRateLimitError();
          }
          task.reject(error);
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
   * Cleanup timestamps older than 60 seconds
   */
  private cleanupOldTimestamps(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const beforeCount = this.requestTimestamps.length;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    const cleanedCount = beforeCount - this.requestTimestamps.length;

    if (cleanedCount > 0) {
      logger.debug({ 
        cleaned: cleanedCount, 
        remaining: this.requestTimestamps.length 
      }, 'Cleaned up old timestamps from sliding window');
    }
  }

  /**
   * Get current rate limiter statistics
   */
  getStats(): RateLimiterStats {
    this.cleanupOldTimestamps();
    
    const requestsLast60s = this.requestTimestamps.length;
    const currentRPM = requestsLast60s; // Since we track last 60 seconds
    
    return {
      currentRPM,
      maxRPM: this.maxRPM,
      requestsLast60s,
      queued: this.queue.length,
      processed: this.processedCount,
    };
  }

  /**
   * Get current RPM limit
   */
  getCurrentLimit(): number {
    return this.maxRPM;
  }

  /**
   * Manually set RPM limit (for testing or adaptive adjustment)
   */
  setLimit(rpm: number): void {
    const oldLimit = this.maxRPM;
    this.maxRPM = rpm;
    logger.info({ oldLimit, newLimit: rpm }, 'RPM limit updated manually');
  }

  /**
   * Handle 429 rate limit error
   * Adaptively reduce the effective RPM limit
   */
  private handleRateLimitError(): void {
    // Reduce safety margin to be more conservative
    const oldMargin = this.safetyMargin;
    this.safetyMargin = Math.max(0.7, this.safetyMargin * 0.9); // Reduce by 10%, min 70%
    
    // Also try to get updated quota from provider
    this.quotaProvider.reduceRPMLimit(0.9);
    
    logger.warn({ 
      oldMargin, 
      newMargin: this.safetyMargin,
      effectiveLimit: Math.floor(this.maxRPM * this.safetyMargin)
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
           message.includes('too many requests');
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
        task.reject(new Error('ImageRateLimiter shutting down'));
      }
    }
    logger.info('ImageRateLimiter stopped');
  }

  private startQuotaRefresh(): void {
    // Initial fetch
    this.refreshQuota();

    // Periodic refresh
    this.quotaRefreshIntervalId = setInterval(() => {
      this.refreshQuota();
    }, config.image.rpmQuotaRefreshIntervalMs);
  }

  /**
   * Refresh RPM quota from quota provider
   */
  private async refreshQuota(): Promise<void> {
    try {
      const newLimit = await this.quotaProvider.getRPMLimit();
      
      if (newLimit !== this.maxRPM) {
        const oldLimit = this.maxRPM;
        this.maxRPM = newLimit;
        
        logger.info({ 
          oldLimit, 
          newLimit, 
          source: 'Quota Provider' 
        }, 'RPM limit updated from quota provider');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to refresh RPM quota, keeping current limit');
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
