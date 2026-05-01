import { getStoryRepository } from '../repositories';
import { logger } from '../utils/logger';

export type StoryParentReviewStatus = 'approved' | 'rejected';

export type StoryParentReviewErrorCode =
  | 'STORY_NOT_REVIEWABLE'
  | 'STORY_REVIEW_ALREADY_COMPLETED';

export class StoryParentReviewError extends Error {
  readonly code: StoryParentReviewErrorCode;
  readonly statusCode = 409;

  constructor(code: StoryParentReviewErrorCode, message: string) {
    super(message);
    this.name = 'StoryParentReviewError';
    this.code = code;
  }
}

export function assertStoryCanReceiveParentReview(input: {
  createdByMode?: string | null;
  parentReviewStatus?: string | null;
}): void {
  if (input.createdByMode !== 'child' || input.parentReviewStatus === 'not_required') {
    throw new StoryParentReviewError(
      'STORY_NOT_REVIEWABLE',
      'This story does not require parent review'
    );
  }

  if (input.parentReviewStatus !== 'pending') {
    throw new StoryParentReviewError(
      'STORY_REVIEW_ALREADY_COMPLETED',
      'This story has already been reviewed'
    );
  }
}

export async function reviewChildCreatedStory(input: {
  storyId: string;
  userId: string;
  status: StoryParentReviewStatus;
}): Promise<{ id: string; parentReviewStatus: StoryParentReviewStatus } | null> {
  const storyRepo = getStoryRepository();
  const story = await storyRepo.findByIdAndUser(input.storyId, input.userId);
  if (!story) return null;

  assertStoryCanReceiveParentReview({
    createdByMode: story.createdByMode,
    parentReviewStatus: story.parentReviewStatus,
  });

  await storyRepo.updateStory(story.id, {
    parentReviewStatus: input.status,
    updatedAt: new Date(),
  });

  logger.info({
    storyId: story.id,
    userId: input.userId,
    parentReviewStatus: input.status,
  }, 'Child-created story parent review completed');

  return {
    id: story.id,
    parentReviewStatus: input.status,
  };
}
