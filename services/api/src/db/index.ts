import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import config from '../config';
import { logger } from '../utils/logger';

// Create PostgreSQL connection pool with reconnection logic
const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  
  // Reconnection settings
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Pool event handlers
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
  // Don't exit - pool will attempt to reconnect automatically
});

pool.on('connect', (client) => {
  logger.info('New database connection established');
});

pool.on('remove', (client) => {
  logger.debug('Database connection removed from pool (idle timeout)');
});

pool.on('acquire', (client) => {
  // Connection acquired from pool (for debugging)
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Database connection acquired from pool');
  }
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Health check with retry
export async function checkDatabaseHealth(retries = 3): Promise<boolean> {
  // Check if pool is already closed
  if (pool.ended || isClosing) {
    logger.warn('Database pool is closed or closing, health check skipped');
    return false;
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      // Double-check pool status before query
      if (pool.ended || isClosing) {
        logger.warn('Database pool closed during health check');
        return false;
      }
      
      const startTime = Date.now();
      await pool.query('SELECT 1');
      const duration = Date.now() - startTime;
      
      logger.debug({ duration, attempt: i + 1 }, 'Database health check passed');
      return true;
    } catch (error: any) {
      // Check if error is due to closed pool
      if (error?.message?.includes('pool') && error?.message?.includes('end')) {
        logger.warn('Database pool was closed during health check');
        return false;
      }
      
      logger.error(
        { err: error, attempt: i + 1, maxRetries: retries },
        'Database health check failed'
      );
      
      if (i < retries - 1) {
        // Wait before retry (exponential backoff)
        const backoffMs = Math.pow(2, i) * 1000;
        logger.info({ backoffMs }, 'Retrying database health check');
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  return false;
}

// Get pool statistics
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

// Graceful shutdown
let isClosing = false;
export async function closeDatabaseConnection(): Promise<void> {
  // Prevent multiple calls
  if (isClosing) {
    logger.warn('Database connection already closing, skipping...');
    return;
  }
  
  if (pool.ended) {
    logger.warn('Database pool already ended, skipping...');
    return;
  }
  
  try {
    isClosing = true;
    logger.info('Closing database connections...');
    await pool.end();
    logger.info('Database connection closed');
  } catch (error) {
    isClosing = false;
    logger.error({ err: error }, 'Error closing database connection');
    throw error;
  }
}

// Handle process termination
let shutdownInProgress = false;
let signalHandlersRegistered = false;

async function gracefulShutdown(signal: string) {
  if (shutdownInProgress) {
    logger.warn(`${signal} received but shutdown already in progress`);
    return;
  }
  
  shutdownInProgress = true;
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  try {
    // Close HTTP server first (stop accepting new requests)
    try {
      const { closeServer } = await import('../index');
      await closeServer();
    } catch (err) {
      logger.warn({ err }, 'Failed to close HTTP server during shutdown');
    }

    // Stop job queues (prevents new jobs from starting)
    try {
      const { stopAllQueues } = await import('../jobs/storyJobProcessor');
      stopAllQueues();
      logger.info('All job queues stopped');
    } catch (err) {
      logger.warn({ err }, 'Failed to stop job queues during shutdown');
    }

    // Stop batch image worker
    try {
      const { stopBatchImageWorker } = await import('../jobs/batchImageWorkerJob');
      stopBatchImageWorker();
    } catch (err) {
      logger.warn({ err }, 'Failed to stop batch image worker during shutdown');
    }

    // Stop scheduled continuation scheduler
    try {
      const { stopScheduledContinuationScheduler } = await import('../jobs/scheduledContinuationSchedulerJob');
      stopScheduledContinuationScheduler();
    } catch (err) {
      logger.warn({ err }, 'Failed to stop scheduled continuation scheduler during shutdown');
    }

    // Stop rate limiter intervals
    try {
      const { stopAllRateLimiters } = await import('../services/aiService');
      stopAllRateLimiters();
    } catch (err) {
      logger.warn({ err }, 'Failed to stop rate limiters during shutdown');
    }

    // Stop session cleanup job
    try {
      const { stopSessionCleanupJob } = await import('../services/sessionService');
      stopSessionCleanupJob();
    } catch (err) {
      logger.warn({ err }, 'Failed to stop session cleanup during shutdown');
    }

    await closeDatabaseConnection();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

// Register signal handlers only once (prevent duplicate registration on module reload)
// CLI scripts (e.g. seed:voices) set WT_SKIP_PROCESS_SIGNAL_HANDLERS so local errors are not
// mistaken for server-wide unhandled rejections.
if (!signalHandlersRegistered && process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS !== '1') {
  signalHandlersRegistered = true;
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  // Also handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'Uncaught exception, shutting down...');
    gracefulShutdown('uncaughtException').catch(() => process.exit(1));
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled rejection, shutting down...');
    gracefulShutdown('unhandledRejection').catch(() => process.exit(1));
  });
}

export default db;

