/**
 * Text Rate Limiter
 * 
 * Vendor-agnostic rate limiter for text generation (LLM calls).
 * Same sliding-window RPM pattern as ImageRateLimiter.
 * Controls RPM to stay within provider quotas (Gemini, OpenAI, etc.)
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

export interface TextRateLimiterStats {
  currentRPM: number;
  maxRPM: number;
  requestsLast60s: number;
  queued: number;
  processed: number;
}

/**
 * Text Rate Limiter using Sliding Window Algorithm
 * Same pattern as ImageRateLimiter for consistency.
 */
export class TextRateLimiter {
  private requestTimestamps: number[] = [];
  private queue: QueuedTask<any>[] = [];
  private maxRPM: number = config.text.rpmDefaultLimit;
  private safetyMargin: number = config.text.rpmSafetyMargin;
  private processedCount: number = 0;
  private isProcessingQueue: boolean = false;
  private quotaProvider: IQuotaProvider;
  private quotaRefreshIntervalId: NodeJS.Timeout | null = null;

  constructor(quotaProvider: IQuotaProvider) {
    this.quotaProvider = quotaProvider;
    this.startQuotaRefresh();
    logger.info({
      defaultRPM: this.maxRPM,
      safetyMargin: this.safetyMargin,
    }, 'TextRateLimiter initialized');
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.cleanupOldTimestamps();

    const effectiveLimit = Math.floor(this.maxRPM * this.safetyMargin);

    if (this.requestTimestamps.length < effectiveLimit) {
      return await this.executeImmediately(fn);
    }

    return await this.enqueue(fn);
  }

  private async executeImmediately<T>(fn: () => Promise<T>): Promise<T> {
    this.requestTimestamps.push(Date.now());
    this.processedCount++;

    try {
      const result = await fn();

      if (this.queue.length > 0 && !this.isProcessingQueue) {
        setImmediate(() => this.processQueue());
      }

      return result;
    } catch (error: any) {
      if (this.is429Error(error)) {
        logger.warn({ error: error.message }, 'Text generation 429 error, reducing RPM');
        this.handleRateLimitError();
      }
      throw error;
    }
  }

  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const MAX_QUEUE_SIZE = 500;
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('System overload: Text generation queue is full. Please try again later.');
    }

    logger.info({
      queuePosition: this.queue.length + 1,
      currentRPM: this.getStats().currentRPM,
      maxRPM: this.maxRPM,
    }, 'Text generation queued');

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      });

      if (!this.isProcessingQueue) {
        setImmediate(() => this.processQueue());
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        this.cleanupOldTimestamps();

        const effectiveLimit = Math.floor(this.maxRPM * this.safetyMargin);
        const availableSlots = effectiveLimit - this.requestTimestamps.length;

        if (availableSlots <= 0) {
          const oldestTimestamp = this.requestTimestamps[0];
          const timeUntilSlot = 60000 - (Date.now() - oldestTimestamp);

          if (timeUntilSlot > 0) {
            await this.sleep(Math.min(timeUntilSlot, 1000));
            continue;
          }
        }

        const task = this.queue.shift();
        if (!task) break;

        const waitTime = Date.now() - task.enqueuedAt;
        if (waitTime > config.text.queueTimeoutMs) {
          task.reject(new Error('Text generation timeout: Request waited too long in queue'));
          continue;
        }

        try {
          this.requestTimestamps.push(Date.now());
          this.processedCount++;
          const result = await task.fn();
          task.resolve(result);
        } catch (error: any) {
          if (this.is429Error(error)) {
            this.handleRateLimitError();
          }
          task.reject(error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }

  private cleanupOldTimestamps(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
  }

  getStats(): TextRateLimiterStats {
    this.cleanupOldTimestamps();
    return {
      currentRPM: this.requestTimestamps.length,
      maxRPM: this.maxRPM,
      requestsLast60s: this.requestTimestamps.length,
      queued: this.queue.length,
      processed: this.processedCount,
    };
  }

  getCurrentLimit(): number {
    return this.maxRPM;
  }

  private handleRateLimitError(): void {
    this.safetyMargin = Math.max(0.7, this.safetyMargin * 0.9);
    this.quotaProvider.reduceRPMLimit(0.9);
  }

  private is429Error(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('quota exceeded') ||
      message.includes('too many requests');
  }

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
        task.reject(new Error('TextRateLimiter shutting down'));
      }
    }
    logger.info('TextRateLimiter stopped');
  }

  private startQuotaRefresh(): void {
    this.refreshQuota();
    this.quotaRefreshIntervalId = setInterval(() => this.refreshQuota(), config.text.rpmQuotaRefreshIntervalMs);
  }

  private async refreshQuota(): Promise<void> {
    try {
      const newLimit = await this.quotaProvider.getRPMLimit();
      if (newLimit !== this.maxRPM) {
        this.maxRPM = newLimit;
        logger.info({ newLimit }, 'Text RPM limit updated from quota provider');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to refresh text RPM quota');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
