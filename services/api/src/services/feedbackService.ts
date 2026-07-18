/**
 * Feedback service - handles user feedback and bug reports
 */

import { logger } from '../utils/logger';
import type { FeedbackCategory, FeedbackTopic } from '@wondertales/shared';
import { getFeedbackRepository } from '../repositories';
import {
  mergeFeedbackContentReviewResult,
  type FeedbackContentReviewResult,
} from './feedbackContentReviewContext';

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
    reportId?: string;
    storyId?: string;
    storySlug?: string;
    shareToken?: string;
    sceneId?: number;
    contentType?: string;
    contentReviewStatus?: string;
    contentReviewQueued?: boolean;
    contentQuarantined?: boolean;
    quarantinedStoryId?: string;
  };
}

export async function createFeedback(input: CreateFeedbackInput): Promise<{ id: string }> {
  const repo = getFeedbackRepository();
  const row = await repo.create({
    userId: input.userId ?? null,
    category: input.category,
    message: input.message,
    email: input.email ?? null,
    screenshotUrl: input.screenshotUrl ?? null,
    context: input.context ?? {},
  });

  logger.info(
    {
      feedbackId: row.id,
      userId: input.userId,
      category: input.category,
      supportTopic: input.context?.supportTopic,
      storyId: input.context?.storyId,
      contentReviewStatus: input.context?.contentReviewStatus,
      hasScreenshot: !!input.screenshotUrl,
    },
    'User feedback submitted'
  );

  return { id: row.id };
}

export async function updateFeedbackContentReviewResult(
  feedbackId: string,
  review: FeedbackContentReviewResult
): Promise<void> {
  const repo = getFeedbackRepository();
  const row = await repo.findContextById(feedbackId);

  if (!row) {
    logger.warn(
      { feedbackId, contentReviewReason: review.reason },
      'Feedback not found for content review result'
    );
    return;
  }

  const context = mergeFeedbackContentReviewResult(row.context, review);
  await repo.updateContext(feedbackId, context);
}
