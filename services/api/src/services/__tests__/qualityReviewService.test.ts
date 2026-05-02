import assert from 'node:assert/strict';
import {
  buildQualityReviewSummary,
  classifyQualityReviewStatus,
} from '../qualityReviewService';

assert.equal(
  classifyQualityReviewStatus({
    failedRequestRate: 0,
    imageRetryStoryRate: 0,
    moderationFailureCount: 0,
    unsafeReportCount: 0,
    generationFailureReportCount: 0,
    publicStoryReportCount: 0,
  }),
  'healthy',
  'empty quality-review metrics should be healthy'
);

assert.equal(
  classifyQualityReviewStatus({
    failedRequestRate: 0.02,
    imageRetryStoryRate: 0.05,
    moderationFailureCount: 0,
    unsafeReportCount: 1,
    generationFailureReportCount: 0,
    publicStoryReportCount: 0,
  }),
  'critical',
  'unsafe-content reports should force critical review status'
);

assert.equal(
  classifyQualityReviewStatus({
    failedRequestRate: 0.11,
    imageRetryStoryRate: 0.05,
    moderationFailureCount: 0,
    unsafeReportCount: 0,
    generationFailureReportCount: 0,
    publicStoryReportCount: 0,
  }),
  'warning',
  'failed request rate over threshold should warn'
);

const summary = buildQualityReviewSummary({
  totalStories: 10,
  totalRequests: 20,
  failedRequests: 2,
  imageRetryStories: 3,
  moderationFailureCount: 0,
  unsafeReportCount: 0,
  generationFailureReportCount: 1,
  publicStoryReportCount: 0,
  sampleCandidateCount: 4,
});

assert.equal(summary.status, 'warning');
assert.equal(summary.failedRequestRate, 0.1);
assert.equal(summary.imageRetryStoryRate, 0.3);
assert.equal(summary.queues.length, 6);
assert.equal(summary.queues.find((item) => item.key === 'generation_reports')?.priority, 'high');
assert.equal(summary.queues.find((item) => item.key === 'sample_candidates')?.count, 4);

console.log('qualityReviewService tests passed');
