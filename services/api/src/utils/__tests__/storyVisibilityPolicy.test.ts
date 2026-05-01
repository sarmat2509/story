import assert from 'node:assert';
import {
  hasPublicParentReviewStatus,
  hasStoryTextModerationPassed,
  isPublicCatalogStoryRecord,
  isUnlistedShareStoryRecord,
} from '../storyVisibilityPolicy';

const publicStory = {
  isPublished: true,
  visibility: 'public',
  publishedSlug: 'safe-story',
  shareToken: null,
  hidden: false,
  parentReviewStatus: 'not_required',
  policyChecks: { textValidated: true },
};

void (async function main() {
  assert.strictEqual(
    hasStoryTextModerationPassed(publicStory),
    true,
    'textValidated=true is the public moderation pass signal'
  );

  assert.strictEqual(
    hasStoryTextModerationPassed({ ...publicStory, policyChecks: null }),
    false,
    'missing policy checks fail closed'
  );

  assert.strictEqual(
    hasPublicParentReviewStatus(publicStory),
    true,
    'not_required parent review status is public-safe'
  );

  assert.strictEqual(
    hasPublicParentReviewStatus({ ...publicStory, parentReviewStatus: 'approved' }),
    true,
    'approved parent review status is public-safe'
  );

  assert.strictEqual(
    hasPublicParentReviewStatus({ ...publicStory, parentReviewStatus: 'pending' }),
    false,
    'pending parent review status fails closed'
  );

  assert.strictEqual(
    isPublicCatalogStoryRecord(publicStory),
    true,
    'public catalog predicate accepts published visible validated stories'
  );

  assert.strictEqual(
    isPublicCatalogStoryRecord({ ...publicStory, policyChecks: { textValidated: false } }),
    false,
    'public catalog predicate requires text moderation'
  );

  assert.strictEqual(
    isPublicCatalogStoryRecord({ ...publicStory, parentReviewStatus: 'rejected' }),
    false,
    'public catalog predicate excludes rejected child-review stories'
  );

  const unlistedStory = {
    ...publicStory,
    visibility: 'unlisted',
    publishedSlug: null,
    shareToken: 'share-secret',
  };

  assert.strictEqual(
    isUnlistedShareStoryRecord(unlistedStory, 'share-secret'),
    true,
    'unlisted predicate accepts matching token on a validated story'
  );

  assert.strictEqual(
    isUnlistedShareStoryRecord(unlistedStory, 'wrong-token'),
    false,
    'unlisted predicate requires the exact share token'
  );

  assert.strictEqual(
    isUnlistedShareStoryRecord(
      { ...unlistedStory, policyChecks: { textValidated: false } },
      'share-secret'
    ),
    false,
    'unlisted predicate also requires text moderation'
  );

  console.log('storyVisibilityPolicy tests passed');
})();
