import {
  deliverPendingDiscountAssignmentNotifications,
  runBillingReminderSweep,
} from '../services/discountService';
import { logger } from '../utils/logger';

const BILLING_REMINDER_INTERVAL_MS = 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;
let running = false;

async function runSweep(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await deliverPendingDiscountAssignmentNotifications();
    await runBillingReminderSweep();
  } finally {
    running = false;
  }
}

export function startBillingReminderScheduler(): void {
  if (intervalId) clearInterval(intervalId);
  void runSweep().catch((error) => {
    logger.error({ err: error }, 'Initial billing reminder sweep failed');
  });
  intervalId = setInterval(() => {
    void runSweep().catch((error) => {
      logger.error({ err: error }, 'Billing reminder sweep failed');
    });
  }, BILLING_REMINDER_INTERVAL_MS);
  intervalId.unref?.();
  logger.info('Billing reminder scheduler started (hourly)');
}

export function stopBillingReminderScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  logger.info('Billing reminder scheduler stopped');
}
