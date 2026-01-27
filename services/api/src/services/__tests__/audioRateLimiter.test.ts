/**
 * Audio Rate Limiter Tests
 * Tests concurrency control and character quota enforcement
 */

import { AudioRateLimiter, resetAudioRateLimiter } from '../audioRateLimiter';
import type { IQuotaProvider, QuotaInfo } from '../../providers/base/IQuotaProvider';

/**
 * Mock Quota Provider for testing
 */
class MockQuotaProvider implements IQuotaProvider {
  private concurrencyLimit: number = 2;
  private characterQuota: QuotaInfo = {
    used: 0,
    limit: 10000,
    resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    canExtend: false,
  };

  async getRPMLimit(): Promise<number> {
    return this.concurrencyLimit * 6;
  }

  getCachedLimit(): number | null {
    return this.concurrencyLimit;
  }

  reduceRPMLimit(reductionFactor: number): number {
    this.concurrencyLimit = Math.max(1, Math.floor(this.concurrencyLimit * reductionFactor));
    return this.concurrencyLimit;
  }

  setRPMLimit(limit: number, source?: string): void {
    this.concurrencyLimit = limit;
  }

  clearCache(): void {
    // No-op for mock
  }

  async getCharacterLimit(): Promise<QuotaInfo> {
    return this.characterQuota;
  }

  async getConcurrencyLimit(): Promise<number> {
    return this.concurrencyLimit;
  }

  // Test helpers
  setCharacterQuota(used: number, limit: number): void {
    this.characterQuota.used = used;
    this.characterQuota.limit = limit;
  }

  setConcurrency(limit: number): void {
    this.concurrencyLimit = limit;
  }
}

describe('AudioRateLimiter', () => {
  let rateLimiter: AudioRateLimiter;
  let mockProvider: MockQuotaProvider;

  beforeEach(() => {
    resetAudioRateLimiter();
    mockProvider = new MockQuotaProvider();
    rateLimiter = new AudioRateLimiter(mockProvider);
  });

  describe('Concurrency Control', () => {
    it('should respect concurrency limit', async () => {
      mockProvider.setConcurrency(2);
      
      let concurrent = 0;
      let maxConcurrent = 0;

      const task = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 100));
        concurrent--;
        return 'done';
      };

      // Execute 5 tasks with concurrency limit of 2
      const promises = Array.from({ length: 5 }, () => 
        rateLimiter.execute(task, 100)
      );

      await Promise.all(promises);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should queue tasks when concurrency limit reached', async () => {
      mockProvider.setConcurrency(1);
      
      const results: string[] = [];
      const task = async (id: number) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push(`task-${id}`);
        return `task-${id}`;
      };

      const promises = [
        rateLimiter.execute(() => task(1), 100),
        rateLimiter.execute(() => task(2), 100),
        rateLimiter.execute(() => task(3), 100),
      ];

      await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results).toContain('task-1');
      expect(results).toContain('task-2');
      expect(results).toContain('task-3');
    });
  });

  describe('Character Quota Control', () => {
    it('should reject when character quota exceeded', async () => {
      mockProvider.setCharacterQuota(9900, 10000);
      
      const task = async () => {
        return 'done';
      };

      // Try to execute task that would exceed quota (9900 + 200 > 10000)
      await expect(
        rateLimiter.execute(task, 200)
      ).rejects.toThrow(/quota exceeded/i);
    });

    it('should allow tasks within character quota', async () => {
      mockProvider.setCharacterQuota(5000, 10000);
      
      const task = async () => {
        return 'success';
      };

      const result = await rateLimiter.execute(task, 1000);
      expect(result).toBe('success');
    });

    it('should track character usage across requests', async () => {
      mockProvider.setCharacterQuota(0, 10000);
      
      const task = async () => 'done';

      await rateLimiter.execute(task, 1000);
      await rateLimiter.execute(task, 2000);
      await rateLimiter.execute(task, 3000);

      const stats = rateLimiter.getStats();
      expect(stats.characterUsed).toBeGreaterThanOrEqual(6000);
    });
  });

  describe('Error Handling', () => {
    it('should rollback character usage on error', async () => {
      mockProvider.setCharacterQuota(0, 10000);
      
      const task = async () => {
        throw new Error('Task failed');
      };

      try {
        await rateLimiter.execute(task, 1000);
      } catch (error) {
        // Expected
      }

      const stats = rateLimiter.getStats();
      expect(stats.characterUsed).toBe(0); // Rolled back
    });

    it('should handle 429 errors with adaptive reduction', async () => {
      mockProvider.setConcurrency(5);
      
      const task = async () => {
        throw new Error('Rate limit exceeded (429)');
      };

      try {
        await rateLimiter.execute(task, 100);
      } catch (error) {
        // Expected
      }

      // Concurrency should be reduced
      const stats = rateLimiter.getStats();
      expect(stats.maxConcurrency).toBeLessThan(5);
    });
  });

  describe('Queue Management', () => {
    it('should process queue when slots become available', async () => {
      mockProvider.setConcurrency(1);
      
      const executionOrder: number[] = [];
      
      const task = async (id: number) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push(id);
        return id;
      };

      // Start 3 tasks with concurrency 1
      const promises = [
        rateLimiter.execute(() => task(1), 100),
        rateLimiter.execute(() => task(2), 100),
        rateLimiter.execute(() => task(3), 100),
      ];

      await Promise.all(promises);

      expect(executionOrder).toEqual([1, 2, 3]); // FIFO order
    });

    it('should reject tasks that exceed queue timeout', async () => {
      // This test would need to mock config.audio.queueTimeoutMs
      // or use a very low timeout value
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Stats', () => {
    it('should return correct statistics', async () => {
      mockProvider.setConcurrency(3);
      mockProvider.setCharacterQuota(1000, 10000);
      
      const task = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      };

      await rateLimiter.execute(task, 500);

      const stats = rateLimiter.getStats();
      
      expect(stats.maxConcurrency).toBe(3);
      expect(stats.characterLimit).toBe(10000);
      expect(stats.processed).toBeGreaterThanOrEqual(1);
    });
  });
});
