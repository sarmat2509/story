/**
 * UsageEventsService - Records product usage events for entitlements and analytics.
 * Maps event types to resource types for usage_events table.
 */

import { getUsageEventsRepository } from '../repositories';
import { logger } from '../utils/logger';

export type UsageEventType =
  | 'story_created'
  | 'image_generated'
  | 'audio_synthesized'
  | 'plan_upgraded';

export type UsageResourceType = 'story' | 'image' | 'audio' | 'plan';

const EVENT_TO_RESOURCE: Record<UsageEventType, UsageResourceType> = {
  story_created: 'story',
  image_generated: 'image',
  audio_synthesized: 'audio',
  plan_upgraded: 'plan',
};

/**
 * Record a usage event.
 */
export async function recordUsageEvent(
  userId: string,
  eventType: UsageEventType,
  quantity: number = 1,
  options?: {
    childProfileId?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    const resourceType = EVENT_TO_RESOURCE[eventType];
    const repo = getUsageEventsRepository();

    await repo.create({
      userId,
      childProfileId: options?.childProfileId ?? null,
      eventType,
      resourceType,
      quantity,
      metadata: options?.metadata ?? null,
    });

    logger.info(
      { userId, eventType, resourceType, quantity },
      'Recorded usage event'
    );
  } catch (err) {
    logger.error({ err, userId, eventType }, 'Failed to record usage event');
    throw err;
  }
}

/**
 * Get total usage for a user in a date range, optionally filtered by event type.
 */
export async function getUsageForPeriod(
  userId: string,
  startDate: Date,
  endDate: Date,
  eventType?: UsageEventType
): Promise<number> {
  const repo = getUsageEventsRepository();
  return repo.getUsageForPeriod(userId, startDate, endDate, eventType);
}
