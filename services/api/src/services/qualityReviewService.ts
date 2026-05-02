import type { CostControlStatus } from './costControlService';

export type QualityReviewPriority = 'low' | 'medium' | 'high' | 'critical';

export type QualityReviewThresholds = {
  failedRequestRateWarn: number;
  imageRetryRateWarn: number;
  unsafeReportCritical: number;
  moderationFailureCritical: number;
  generationFeedbackWarn: number;
  publicReportWarn: number;
};

export type QualityReviewInput = {
  totalStories: number;
  totalRequests: number;
  failedRequests: number;
  imageRetryStories: number;
  moderationFailureCount: number;
  unsafeReportCount: number;
  generationFailureReportCount: number;
  publicStoryReportCount: number;
  sampleCandidateCount: number;
  thresholds?: Partial<QualityReviewThresholds>;
};

export type QualityReviewQueueItem = {
  key: string;
  label: string;
  count: number;
  priority: QualityReviewPriority;
  reviewUrl: string;
  helper: string;
};

export type QualityReviewSummary = {
  status: CostControlStatus;
  thresholds: QualityReviewThresholds;
  failedRequestRate: number;
  imageRetryStoryRate: number;
  moderationFailureCount: number;
  unsafeReportCount: number;
  generationFailureReportCount: number;
  publicStoryReportCount: number;
  sampleCandidateCount: number;
  queues: QualityReviewQueueItem[];
};

export const DEFAULT_QUALITY_REVIEW_THRESHOLDS: QualityReviewThresholds = {
  failedRequestRateWarn: 0.1,
  imageRetryRateWarn: 0.25,
  unsafeReportCritical: 1,
  moderationFailureCritical: 1,
  generationFeedbackWarn: 1,
  publicReportWarn: 1,
};

export function normalizeQualityReviewThresholds(
  overrides: Partial<QualityReviewThresholds> = {}
): QualityReviewThresholds {
  return {
    ...DEFAULT_QUALITY_REVIEW_THRESHOLDS,
    ...overrides,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function queuePriority(count: number, activePriority: QualityReviewPriority): QualityReviewPriority {
  return count > 0 ? activePriority : 'low';
}

export function classifyQualityReviewStatus(input: {
  failedRequestRate: number;
  imageRetryStoryRate: number;
  moderationFailureCount: number;
  unsafeReportCount: number;
  generationFailureReportCount: number;
  publicStoryReportCount: number;
  thresholds?: Partial<QualityReviewThresholds>;
}): CostControlStatus {
  const thresholds = normalizeQualityReviewThresholds(input.thresholds);

  if (
    input.unsafeReportCount >= thresholds.unsafeReportCritical ||
    input.moderationFailureCount >= thresholds.moderationFailureCritical
  ) {
    return 'critical';
  }

  if (
    input.failedRequestRate >= thresholds.failedRequestRateWarn ||
    input.imageRetryStoryRate >= thresholds.imageRetryRateWarn ||
    input.generationFailureReportCount >= thresholds.generationFeedbackWarn ||
    input.publicStoryReportCount >= thresholds.publicReportWarn
  ) {
    return 'warning';
  }

  return 'healthy';
}

export function buildQualityReviewSummary(input: QualityReviewInput): QualityReviewSummary {
  const thresholds = normalizeQualityReviewThresholds(input.thresholds);
  const failedRequestRate = ratio(input.failedRequests, input.totalRequests);
  const imageRetryStoryRate = ratio(input.imageRetryStories, input.totalStories);
  const status = classifyQualityReviewStatus({
    failedRequestRate,
    imageRetryStoryRate,
    moderationFailureCount: input.moderationFailureCount,
    unsafeReportCount: input.unsafeReportCount,
    generationFailureReportCount: input.generationFailureReportCount,
    publicStoryReportCount: input.publicStoryReportCount,
    thresholds,
  });

  return {
    status,
    thresholds,
    failedRequestRate,
    imageRetryStoryRate,
    moderationFailureCount: input.moderationFailureCount,
    unsafeReportCount: input.unsafeReportCount,
    generationFailureReportCount: input.generationFailureReportCount,
    publicStoryReportCount: input.publicStoryReportCount,
    sampleCandidateCount: input.sampleCandidateCount,
    queues: [
      {
        key: 'unsafe_reports',
        label: 'Unsafe content reports',
        count: input.unsafeReportCount,
        priority: queuePriority(input.unsafeReportCount, 'critical'),
        reviewUrl: '/admin/feedback?supportTopic=unsafe_content',
        helper: 'Review every unsafe-content report before featuring or promoting stories.',
      },
      {
        key: 'moderation_failures',
        label: 'Moderation failures',
        count: input.moderationFailureCount,
        priority: queuePriority(input.moderationFailureCount, 'critical'),
        reviewUrl: '/admin/dashboard',
        helper: 'Inspect failed policy checks and decide whether prompts/rules need tightening.',
      },
      {
        key: 'generation_reports',
        label: 'Generation failure reports',
        count: input.generationFailureReportCount,
        priority: queuePriority(input.generationFailureReportCount, 'high'),
        reviewUrl: '/admin/feedback?supportTopic=generation_failed',
        helper: 'Review user-reported failures and attach them to prompt or retry improvements.',
      },
      {
        key: 'image_retry_stories',
        label: 'Image retry stories',
        count: input.imageRetryStories,
        priority:
          imageRetryStoryRate >= thresholds.imageRetryRateWarn && input.imageRetryStories > 0
            ? 'medium'
            : 'low',
        reviewUrl: '/admin/image-validations',
        helper: 'Inspect repeated image validation attempts for recurring prompt/style issues.',
      },
      {
        key: 'public_story_reports',
        label: 'Public story reports',
        count: input.publicStoryReportCount,
        priority: queuePriority(input.publicStoryReportCount, 'high'),
        reviewUrl: '/admin/feedback?reportedScreen=published_story',
        helper: 'Triage reports from public/unlisted story pages before keeping examples live.',
      },
      {
        key: 'sample_candidates',
        label: 'Public sample candidates',
        count: input.sampleCandidateCount,
        priority: input.sampleCandidateCount > 0 ? 'medium' : 'low',
        reviewUrl: '/admin/stories?publishedStatus=published',
        helper: 'Curate eligible public stories before adding them to landing-page examples.',
      },
    ],
  };
}
