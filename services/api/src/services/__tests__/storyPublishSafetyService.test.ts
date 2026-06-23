import assert from 'node:assert';
import { evaluateStoryPublishSafety } from '../storyPublishSafetyService';

const baseInput = {
  story: {
    hidden: false,
    fullText: 'Once upon a launch.',
    policyChecks: { textValidated: true },
  },
  visibility: 'public' as const,
  imageValidationEnabled: true,
  imageValidationMinAcceptScore: 85,
  completedImageStoragePaths: ['development/user/story/image/scene-1.jpg'],
  imageValidationScores: [
    {
      storagePath: 'development/user/story/image/scene-1.jpg',
      score: 92,
    },
  ],
};

void (async function main() {
  assert.deepStrictEqual(
    evaluateStoryPublishSafety(baseInput),
    { allowed: true },
    'validated stories with passing public image scores can publish'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: { ...baseInput.story, hidden: true },
    }),
    {
      allowed: false,
      code: 'STORY_HIDDEN',
      message: 'Hidden stories cannot be published',
    },
    'hidden stories cannot publish'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: { ...baseInput.story, createdByMode: 'child', parentReviewStatus: 'pending' },
    }),
    {
      allowed: false,
      code: 'PARENT_REVIEW_PENDING',
      message: 'A parent must approve this child-created story before it can be shared',
    },
    'child-created stories pending parent review cannot publish'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: { ...baseInput.story, createdByMode: 'child', parentReviewStatus: 'rejected' },
    }),
    {
      allowed: false,
      code: 'PARENT_REVIEW_REJECTED',
      message: 'Rejected child-created stories cannot be shared',
    },
    'rejected child-created stories cannot publish'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: { ...baseInput.story, createdByMode: 'child', parentReviewStatus: 'approved' },
    }),
    { allowed: true },
    'approved child-created stories can publish'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: { ...baseInput.story, fullText: '' },
    }),
    {
      allowed: false,
      code: 'STORY_INCOMPLETE',
      message: 'Story is not ready to publish',
    },
    'empty story text cannot publish'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: { ...baseInput.story, policyChecks: { textValidated: false } },
    }),
    {
      allowed: false,
      code: 'STORY_TEXT_NOT_VALIDATED',
      message: 'Story text has not passed validation',
    },
    'text validation is required before publishing'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      imageValidationScores: [],
    }),
    {
      allowed: false,
      code: 'IMAGE_VALIDATION_REQUIRED',
      message: 'Story images must pass validation before public publishing',
      details: { missingValidationCount: 1 },
    },
    'public publishing requires validation rows for completed images when image validation is enabled'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      imageValidationScores: [
        {
          storagePath: 'development/user/story/image/scene-1.jpg',
          score: 85,
        },
      ],
    }),
    {
      allowed: false,
      code: 'IMAGE_VALIDATION_FAILED',
      message: 'Story images did not pass validation for public publishing',
      details: { failedImageCount: 1, minAcceptScore: 85 },
    },
    'scores at the acceptance threshold still fail because generation requires score > threshold'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      imageValidationScores: [
        {
          storagePath: 'development/user/story/image/scene-1.jpg',
          score: null,
          validationStatus: 'provider_blocked',
        },
      ],
    }),
    {
      allowed: false,
      code: 'IMAGE_VALIDATION_REQUIRED',
      message: 'Story images must pass validation before public publishing',
      details: { missingValidationCount: 1 },
    },
    'provider-blocked validation rows do not satisfy public publishing validation'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      visibility: 'unlisted',
      imageValidationScores: [],
    }),
    { allowed: true },
    'unlisted links require validated text but do not require catalog image validation'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      imageValidationEnabled: false,
      imageValidationScores: [],
    }),
    { allowed: true },
    'public publishing does not require image validation rows when image validation is disabled'
  );

  console.log('storyPublishSafetyService tests passed');
})();
