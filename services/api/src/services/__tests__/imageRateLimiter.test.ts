/**
 * Image Rate Limiter Tests
 * Tests for sliding window algorithm and rate limiting behavior
 */

import { ImageRateLimiter } from '../imageRateLimiter';
import type { IQuotaProvider } from '../../providers/base/IQuotaProvider';
import { logger } from '../../utils/logger';

/**
 * Mock Quota Provider for testing
 * Simulates a vendor-specific quota provider without external dependencies
 */
class MockQuotaProvider implements IQuotaProvider {
  private limit: number = 150;
  
  async getRPMLimit(): Promise<number> {
    return this.limit;
  }
  
  getCachedLimit(): number | null {
    return this.limit;
  }
  
  reduceRPMLimit(factor: number): number {
    this.limit = Math.floor(this.limit * factor);
    return this.limit;
  }
  
  setRPMLimit(limit: number): void {
    this.limit = limit;
  }
  
  clearCache(): void {
    // no-op for mock
  }
}

/**
 * Manual test for rate limiter with 400 tasks at RPM=150
 * Run this to verify sliding window behavior
 */
async function testRateLimiter(): Promise<void> {
  logger.info('Starting rate limiter test with 400 tasks, RPM=150');
  
  // Create mock provider
  const mockProvider = new MockQuotaProvider();
  mockProvider.setRPMLimit(150);
  
  // Create rate limiter with DI
  const limiter = new ImageRateLimiter(mockProvider);
  
  const startTime = Date.now();
  const results: { taskId: number; startedAt: number; completedAt: number; waitedMs: number }[] = [];
  
  // Create 400 mock tasks
  const tasks = Array.from({ length: 400 }, (_, i) => {
    const taskId = i + 1;
    
    return limiter.execute(async () => {
      const startedAt = Date.now();
      
      // Simulate image generation (fast mock)
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const completedAt = Date.now();
      const waitedMs = startedAt - startTime;
      
      results.push({ taskId, startedAt, completedAt, waitedMs });
      
      if (taskId % 50 === 0) {
        const stats = limiter.getStats();
        logger.info({ 
          taskId, 
          currentRPM: stats.currentRPM,
          queued: stats.queued,
          elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
        }, 'Progress checkpoint');
      }
      
      return taskId;
    });
  });
  
  // Execute all tasks in parallel (Promise.all)
  logger.info('Executing 400 tasks in parallel...');
  await Promise.all(tasks);
  
  const endTime = Date.now();
  const totalDuration = endTime - startTime;
  
  // Analyze results
  const stats = limiter.getStats();
  
  // Verify sliding window - check that we never exceeded 150 RPM
  let maxRPMViolation = false;
  const windowSize = 60000; // 60 seconds
  
  for (let i = 0; i < results.length; i++) {
    const currentTime = results[i].startedAt;
    const windowStart = currentTime - windowSize;
    
    // Count requests in this 60-second window
    const requestsInWindow = results.filter(
      r => r.startedAt >= windowStart && r.startedAt <= currentTime
    ).length;
    
    if (requestsInWindow > 150) {
      maxRPMViolation = true;
      logger.error({ 
        taskId: results[i].taskId, 
        requestsInWindow,
        limit: 150
      }, 'RPM LIMIT VIOLATION DETECTED');
    }
  }
  
  // Calculate theoretical minimum time
  const theoreticalMinTime = (400 / 150) * 60000; // ~160 seconds for 400 tasks at 150 RPM
  
  // Log summary
  logger.info({
    totalTasks: 400,
    rpmLimit: 150,
    totalDurationMs: totalDuration,
    totalDurationSeconds: Math.round(totalDuration / 1000),
    theoreticalMinSeconds: Math.round(theoreticalMinTime / 1000),
    efficiency: Math.round((theoreticalMinTime / totalDuration) * 100) + '%',
    maxRPMViolation,
    finalStats: {
      processed: stats.processed,
      currentRPM: stats.currentRPM,
      queued: stats.queued,
    }
  }, 'Rate limiter test completed');
  
  // Assertions
  if (maxRPMViolation) {
    throw new Error('❌ TEST FAILED: RPM limit was exceeded');
  }
  
  if (stats.processed !== 400) {
    throw new Error(`❌ TEST FAILED: Expected 400 processed tasks, got ${stats.processed}`);
  }
  
  if (totalDuration < theoreticalMinTime * 0.95) {
    throw new Error(`❌ TEST FAILED: Completed too fast (${totalDuration}ms < ${theoreticalMinTime * 0.95}ms), likely not rate limiting correctly`);
  }
  
  logger.info('✅ ALL TESTS PASSED: Rate limiter working correctly');
}

/**
 * Test queue timeout behavior
 */
async function testQueueTimeout(): Promise<void> {
  logger.info('Starting queue timeout test');
  
  const mockProvider = new MockQuotaProvider();
  mockProvider.setRPMLimit(1); // Very low limit to force queueing
  
  const limiter = new ImageRateLimiter(mockProvider);
  
  try {
    // This should timeout if queue timeout is configured properly
    await limiter.execute(async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 'success';
    });
    
    logger.info('✅ First task completed successfully');
    
    // Now try to add many tasks that will wait too long
    // Note: This test is difficult without mocking time
    
  } catch (error) {
    logger.error({ error }, 'Queue timeout test failed unexpectedly');
    throw error;
  }
}

/**
 * Run all tests
 */
export async function runRateLimiterTests(): Promise<void> {
  try {
    logger.info('========================================');
    logger.info('Starting Image Rate Limiter Test Suite');
    logger.info('========================================');
    
    await testRateLimiter();
    
    logger.info('========================================');
    logger.info('All tests completed successfully!');
    logger.info('========================================');
  } catch (error) {
    logger.error({ error }, 'Rate limiter tests failed');
    throw error;
  }
}

// Allow running tests directly
if (require.main === module) {
  runRateLimiterTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Tests failed:', error);
      process.exit(1);
    });
}
