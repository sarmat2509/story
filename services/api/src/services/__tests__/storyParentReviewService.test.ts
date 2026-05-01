import assert from 'node:assert';
import {
  assertStoryCanReceiveParentReview,
  StoryParentReviewError,
} from '../storyParentReviewService';

void (async function main() {
  assert.doesNotThrow(
    () => assertStoryCanReceiveParentReview({
      createdByMode: 'child',
      parentReviewStatus: 'pending',
    }),
    'pending child-created stories can be reviewed'
  );

  assert.throws(
    () => assertStoryCanReceiveParentReview({
      createdByMode: 'parent',
      parentReviewStatus: 'not_required',
    }),
    (error) =>
      error instanceof StoryParentReviewError &&
      error.code === 'STORY_NOT_REVIEWABLE',
    'parent-created stories do not enter parent review'
  );

  assert.throws(
    () => assertStoryCanReceiveParentReview({
      createdByMode: 'child',
      parentReviewStatus: 'approved',
    }),
    (error) =>
      error instanceof StoryParentReviewError &&
      error.code === 'STORY_REVIEW_ALREADY_COMPLETED',
    'approved child-created stories cannot be reviewed again'
  );

  assert.throws(
    () => assertStoryCanReceiveParentReview({
      createdByMode: 'child',
      parentReviewStatus: 'rejected',
    }),
    (error) =>
      error instanceof StoryParentReviewError &&
      error.code === 'STORY_REVIEW_ALREADY_COMPLETED',
    'rejected child-created stories cannot be reviewed again'
  );

  console.log('storyParentReviewService tests passed');
})();
