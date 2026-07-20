import assert from 'node:assert';
import {
  buildGraphicNovelPagePublishValidationEvidence,
  evaluateStoryPublishSafety,
} from '../storyPublishSafetyService';

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
      story: {
        ...baseInput.story,
        metadata: { storyFormat: 'graphic_novel', graphicNovelGenerationComplete: false },
      },
    }),
    {
      allowed: false,
      code: 'STORY_INCOMPLETE',
      message: 'Comic pages are not ready to publish',
    },
    'graphic novels cannot publish before all pages are ready'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: {
        ...baseInput.story,
        metadata: {
          storyFormat: 'graphic_novel',
          graphicNovelGenerationComplete: true,
          failedGraphicNovelPages: [{ pageNumber: 2, errorMessage: 'generation failed' }],
        },
      },
    }),
    {
      allowed: false,
      code: 'STORY_INCOMPLETE',
      message: 'Failed comic pages must be regenerated before publishing',
      details: { failedPageCount: 1 },
    },
    'graphic novels with failed pages cannot publish'
  );

  assert.deepStrictEqual(
    evaluateStoryPublishSafety({
      ...baseInput,
      story: {
        ...baseInput.story,
        metadata: { storyFormat: 'mixed_story', graphicNovelGenerationComplete: true },
      },
    }),
    { allowed: true },
    'completed mixed stories can publish after text and image validation'
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

  assert.deepStrictEqual(
    buildGraphicNovelPagePublishValidationEvidence({
      status: 'completed',
      layoutJson: { panels: [{}, {}] },
      generationParams: {
        panelRepair: {
          modes: [
            { panelNumber: 1, score: 96 },
            { panelNumber: 2, score: 92 },
          ],
        },
      },
    }),
    {
      panelCount: 2,
      panelScores: { 1: 96, 2: 92 },
      missingPanelNumbers: [],
      failedPanelNumbers: [],
      score: 92,
    },
    'comic page publishing uses the weakest current panel score'
  );

  assert.deepStrictEqual(
    buildGraphicNovelPagePublishValidationEvidence({
      status: 'completed',
      layoutJson: { panels: [{}, {}] },
      generationParams: {
        artValidationRepair: {
          selectedAttempt: 2,
          attempts: [
            {
              attempt: 1,
              panelRepair: { modes: [{ panelNumber: 1, score: 90 }] },
            },
            {
              attempt: 2,
              panelRepair: {
                modes: [
                  { panelNumber: 1, score: 94 },
                  { panelNumber: 2, score: 91 },
                ],
              },
            },
          ],
        },
      },
    }),
    {
      panelCount: 2,
      panelScores: { 1: 94, 2: 91 },
      missingPanelNumbers: [],
      failedPanelNumbers: [],
      score: 91,
    },
    'comic page publishing follows the selected full-page validation attempt'
  );

  assert.deepStrictEqual(
    buildGraphicNovelPagePublishValidationEvidence({
      status: 'completed',
      layoutJson: { panels: [{}, {}] },
      generationParams: {
        panelRepair: {
          modes: [
            { panelNumber: 1, score: 52 },
            { panelNumber: 2, score: 90 },
          ],
        },
        manualPanelRepairs: [
          {
            panels: [
              { panelNumber: 1, accepted: true, score: 97 },
              { panelNumber: 2, accepted: false, score: 40 },
            ],
          },
        ],
      },
    }),
    {
      panelCount: 2,
      panelScores: { 1: 97, 2: 90 },
      missingPanelNumbers: [],
      failedPanelNumbers: [],
      score: 90,
    },
    'accepted panel edits replace their historical score without accepting failed edits'
  );

  assert.deepStrictEqual(
    buildGraphicNovelPagePublishValidationEvidence({
      status: 'completed',
      layoutJson: { panels: [{}, {}] },
      generationParams: {
        panelRepair: {
          modes: [
            { panelNumber: 1, score: 94 },
            { panelNumber: 2, score: 93 },
          ],
          failedPanels: [{ panelNumber: 2 }],
        },
      },
    }),
    {
      panelCount: 2,
      panelScores: { 1: 94, 2: 93 },
      missingPanelNumbers: [],
      failedPanelNumbers: [2],
      score: 0,
    },
    'an unresolved failed panel cannot be hidden by other high scores'
  );

  assert.deepStrictEqual(
    buildGraphicNovelPagePublishValidationEvidence({
      status: 'completed',
      layoutJson: { panels: [{}, {}, {}] },
      generationParams: {
        panelRepair: {
          modes: [
            { panelNumber: 1, score: 96 },
            { panelNumber: 3, score: 95 },
          ],
        },
      },
    }),
    {
      panelCount: 3,
      panelScores: { 1: 96, 3: 95 },
      missingPanelNumbers: [2],
      failedPanelNumbers: [],
      score: null,
    },
    'missing current panel validation remains a publish blocker'
  );

  console.log('storyPublishSafetyService tests passed');
})();
