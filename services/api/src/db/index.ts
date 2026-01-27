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
  for (let i = 0; i < retries; i++) {
    try {
      const startTime = Date.now();
      await pool.query('SELECT 1');
      const duration = Date.now() - startTime;
      
      logger.debug({ duration, attempt: i + 1 }, 'Database health check passed');
      return true;
    } catch (error) {
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
export async function closeDatabaseConnection(): Promise<void> {
  try {
    logger.info('Closing database connections...');
    await pool.end();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error({ err: error }, 'Error closing database connection');
    throw error;
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing database...');
  await closeDatabaseConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database...');
  await closeDatabaseConnection();
  process.exit(0);
});

export default db;

export default db;
