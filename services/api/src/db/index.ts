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
  logger.warn('Database connection removed from pool');
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
    await closeDatabaseConnection();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

// Register signal handlers only once (prevent duplicate registration on module reload)
if (!signalHandlersRegistered) {
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

