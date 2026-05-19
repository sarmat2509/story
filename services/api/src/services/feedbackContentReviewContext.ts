export interface FeedbackContentReviewResult {
  reviewQueued: boolean;
  quarantinedStoryId?: string;
  reason: string;
}

function normalizeFeedbackContext(context: unknown): Record<string, unknown> {
  return context && typeof context === 'object' && !Array.isArray(context)
    ? (context as Record<string, unknown>)
    : {};
}

export function mergeFeedbackContentReviewResult(
  context: unknown,
  review: FeedbackContentReviewResult
): Record<string, unknown> {
  return {
    ...normalizeFeedbackContext(context),
    contentReviewStatus: review.reason,
    contentReviewQueued: review.reviewQueued,
    contentQuarantined: review.reason === 'story_quarantined',
    ...(review.quarantinedStoryId ? { quarantinedStoryId: review.quarantinedStoryId } : {}),
  };
}
