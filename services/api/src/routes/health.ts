/**
 * Health and Monitoring Routes
 * Extended with image rate limiter statistics
 */

import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../db';
import { getImageRateLimiter } from '../services/aiService';
import { logger } from '../utils/logger';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Basic health check
 */
router.get('/', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

/**
 * Detailed health check with all services
 */
router.get('/detailed', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  
  // Get rate limiter stats
  let rateLimiterStats = null;
  try {
    const limiter = getImageRateLimiter();
    rateLimiterStats = limiter.getStats();
  } catch (error) {
    logger.warn({ error }, 'Failed to get rate limiter stats');
  }
  
  // Get quota service info
  let quotaInfo = null;
  try {
    const limiter = getImageRateLimiter();
    const cachedLimit = limiter.getCachedQuotaLimit();
    quotaInfo = {
      cachedLimit,
      hasCachedLimit: cachedLimit !== null,
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to get quota service info');
  }
  
  const overallHealthy = dbHealthy;
  
  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbHealthy ? 'connected' : 'disconnected',
        healthy: dbHealthy,
      },
      imageRateLimiter: {
        status: rateLimiterStats ? 'active' : 'unavailable',
        healthy: true,
        stats: rateLimiterStats,
      },
      quotaService: {
        status: quotaInfo?.hasCachedLimit ? 'cached' : 'not_cached',
        healthy: true,
        info: quotaInfo,
      },
    },
  });
});

/**
 * Job queue statistics (text, image, audio)
 * Useful for debugging freezes and stuck jobs
 */
router.get('/queues', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { textQueue, imageQueue, audioQueue, storyJobQueue } = await import('../jobs/storyJobProcessor');
    const textStats = textQueue.getStats();
    const imageStats = imageQueue.getStats();
    const audioStats = audioQueue.getStats();
    const legacyStats = storyJobQueue.getStats();

    res.json({
      timestamp: new Date().toISOString(),
      queues: {
        text: textStats,
        image: imageStats,
        audio: audioStats,
        legacy: legacyStats,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get queue stats');
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve queue statistics',
    });
  }
});

/**
 * Image generation rate limiter statistics
 * Useful for monitoring and debugging
 */
router.get('/image-rate-limiter', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limiter = getImageRateLimiter();
    const stats = limiter.getStats();
    const currentLimit = limiter.getCurrentLimit();
    const cachedLimit = limiter.getCachedQuotaLimit();
    
    // Calculate utilization percentage
    const utilization = stats.maxRPM > 0 
      ? Math.round((stats.currentRPM / stats.maxRPM) * 100) 
      : 0;
    
    // Determine status
    let status = 'healthy';
    if (utilization > 90) {
      status = 'critical';
    } else if (utilization > 75) {
      status = 'warning';
    }
    
    res.json({
      status,
      timestamp: new Date().toISOString(),
      rateLimiter: {
        currentRPM: stats.currentRPM,
        maxRPM: stats.maxRPM,
        effectiveLimit: Math.floor(stats.maxRPM * 0.9), // with safety margin
        requestsLast60s: stats.requestsLast60s,
        queuedTasks: stats.queued,
        processedTotal: stats.processed,
        utilizationPercent: utilization,
      },
      quotaProvider: {
        cachedLimit,
        currentConfiguredLimit: currentLimit,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get rate limiter stats');
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve rate limiter statistics',
    });
  }
});

export default router;
