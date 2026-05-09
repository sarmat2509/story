export const FEEDBACK_CATEGORIES = ['bug', 'feature', 'other'] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_TOPICS = [
  'bug',
  'feature',
  'billing',
  'refund',
  'unsafe_content',
  'unsafe_image',
  'unsafe_text',
  'privacy_concern',
  'generation_failed',
  'account_privacy',
  'other',
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export const CONTENT_REPORT_TOPICS = [
  'unsafe_content',
  'unsafe_image',
  'unsafe_text',
  'privacy_concern',
] as const satisfies readonly FeedbackTopic[];

export type ContentReportTopic = (typeof CONTENT_REPORT_TOPICS)[number];

export function isContentReportTopic(topic: string | null | undefined): topic is ContentReportTopic {
  return CONTENT_REPORT_TOPICS.includes(topic as ContentReportTopic);
}

export function getFeedbackCategoryForTopic(topic: FeedbackTopic): FeedbackCategory {
  if (topic === 'feature') {
    return 'feature';
  }

  if (
    topic === 'bug' ||
    topic === 'unsafe_content' ||
    topic === 'unsafe_image' ||
    topic === 'unsafe_text' ||
    topic === 'generation_failed'
  ) {
    return 'bug';
  }

  return 'other';
}
