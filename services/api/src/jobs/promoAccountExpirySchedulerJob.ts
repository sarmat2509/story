import { expireDuePromoAccounts } from '../services/promoAccountService';
import { logger } from '../utils/logger';

export const PROMO_ACCOUNT_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;
let running = false;

export async function runPromoAccountExpirySweep(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await expireDuePromoAccounts();
  } finally {
    running = false;
  }
}

function scheduleSweep(): void {
  void runPromoAccountExpirySweep().catch((err) => {
    logger.error({ err }, 'Promo account expiry sweep failed');
  });
}

export function startPromoAccountExpiryScheduler(): void {
  if (intervalId) clearInterval(intervalId);
  scheduleSweep();
  intervalId = setInterval(scheduleSweep, PROMO_ACCOUNT_EXPIRY_INTERVAL_MS);
  intervalId.unref?.();
  logger.info('Promo account expiry scheduler started (hourly)');
}

export function stopPromoAccountExpiryScheduler(): void {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
  logger.info('Promo account expiry scheduler stopped');
}
