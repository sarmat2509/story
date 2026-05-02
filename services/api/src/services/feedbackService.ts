/**
 * Feedback service - handles user feedback and bug reports
 */

import { db } from '../db';
import { userFeedback } from '../db/schema';
import { logger } from '../utils/logger';
import type { FeedbackCategory, FeedbackTopic } from '@wondertales/shared';

export interface CreateFeedbackInput {
  userId?: string;
  category: FeedbackCategory;
  message: string;
  email?: string;
  screenshotUrl?: string;
  context?: {
    platform?: string;
    userAgent?: string;
    url?: string;
    reportedScreen?: string;
    supportTopic?: FeedbackTopic;
  };
}

export async function createFeedback(input: CreateFeedbackInput): Promise<{ id: string }> {
  const [row] = await db
    .insert(userFeedback)
    .values({
      userId: input.userId ?? null,
      category: input.category,
      message: input.message,
      email: input.email ?? null,
      screenshotUrl: input.screenshotUrl ?? null,
      context: input.context ?? {},
    })
    .returning({ id: userFeedback.id });

  if (!row) {
    throw new Error('Failed to create feedback');
  }

  logger.info(
    {
      feedbackId: row.id,
      userId: input.userId,
      category: input.category,
      supportTopic: input.context?.supportTopic,
      hasScreenshot: !!input.screenshotUrl,
    },
    'User feedback submitted'
  );

  return { id: row.id };
}
