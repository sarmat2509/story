/**
 * Notification Service
 * Handles push and email notifications.
 * Stub for scheduled continuations — full implementation in separate task.
 */

import { logger } from '../utils/logger';

/**
 * Notify user that a scheduled continuation is ready.
 * Stub: logs only. Push + email implementation in separate task.
 */
export async function notifyNewContinuationReady(userId: string, storyId: string): Promise<void> {
  logger.info({ userId, storyId }, 'notifyNewContinuationReady (stub) — push + email to be implemented');
}
