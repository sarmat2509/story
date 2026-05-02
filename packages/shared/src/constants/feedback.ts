export const FEEDBACK_CATEGORIES = ['bug', 'feature', 'other'] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_TOPICS = [
  'bug',
  'feature',
  'billing',
  'refund',
  'unsafe_content',
  'generation_failed',
  'account_privacy',
  'other',
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export function getFeedbackCategoryForTopic(topic: FeedbackTopic): FeedbackCategory {
  if (topic === 'feature') {
    return 'feature';
  }

  if (topic === 'bug' || topic === 'unsafe_content' || topic === 'generation_failed') {
    return 'bug';
  }

  return 'other';
}
