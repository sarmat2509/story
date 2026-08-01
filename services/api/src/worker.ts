import config from './config';
import { checkDatabaseHealth } from './db';
import { startAllQueues } from './jobs/storyJobProcessor';
import { startBatchImageWorker } from './jobs/batchImageWorkerJob';
import { startScheduledContinuationScheduler } from './jobs/scheduledContinuationSchedulerJob';
import { startScheduledStoryScheduler } from './jobs/scheduledStorySchedulerJob';
import { startOrphanStorageCleanupScheduler } from './jobs/orphanStorageCleanupSchedulerJob';
import { startBillingReminderScheduler } from './jobs/billingReminderSchedulerJob';
import { startPromoAccountExpiryScheduler } from './jobs/promoAccountExpirySchedulerJob';
import { logger } from './utils/logger';

async function startWorker() {
  logger.info({ env: config.nodeEnv }, 'WonderTales worker starting');

  const dbHealthy = await checkDatabaseHealth();
  if (!dbHealthy) {
    logger.error('Database connection failed during worker startup');
  }

  startAllQueues();
  startBatchImageWorker();
  startScheduledContinuationScheduler();
  startScheduledStoryScheduler();
  startOrphanStorageCleanupScheduler();
  startBillingReminderScheduler();
  startPromoAccountExpiryScheduler();

  logger.info('WonderTales worker started');
}

void startWorker().catch((error) => {
  logger.error({ err: error }, 'Worker startup failed');
  process.exit(1);
});
