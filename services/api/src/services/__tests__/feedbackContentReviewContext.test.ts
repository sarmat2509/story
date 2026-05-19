import assert from 'node:assert/strict';
import { mergeFeedbackContentReviewResult } from '../feedbackContentReviewContext';

const quarantined = mergeFeedbackContentReviewResult(
  {
    reportedScreen: 'story_viewer',
    supportTopic: 'unsafe_content',
    storyId: 'story-1',
    contentReviewStatus: 'queued',
  },
  {
    reviewQueued: true,
    quarantinedStoryId: 'story-1',
    reason: 'story_quarantined',
  }
);

assert.equal(quarantined.reportedScreen, 'story_viewer');
assert.equal(quarantined.supportTopic, 'unsafe_content');
assert.equal(quarantined.storyId, 'story-1');
assert.equal(quarantined.contentReviewStatus, 'story_quarantined');
assert.equal(quarantined.contentReviewQueued, true);
assert.equal(quarantined.contentQuarantined, true);
assert.equal(quarantined.quarantinedStoryId, 'story-1');

const unresolved = mergeFeedbackContentReviewResult(null, {
  reviewQueued: false,
  reason: 'target_not_found',
});

assert.equal(unresolved.contentReviewStatus, 'target_not_found');
assert.equal(unresolved.contentReviewQueued, false);
assert.equal(unresolved.contentQuarantined, false);
assert.equal('quarantinedStoryId' in unresolved, false);

console.log('feedbackContentReviewContext tests passed');
