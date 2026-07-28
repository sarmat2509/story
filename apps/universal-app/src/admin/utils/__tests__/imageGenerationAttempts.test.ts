import assert from 'node:assert/strict';

import type { AdminStoryValidationItem } from '@/admin/api/admin';
import { buildAdminImageGenerationAttempts } from '../imageGenerationAttempts';

const cropRect = { left: 10, top: 20, width: 300, height: 200 };

function validation(
  attempt: number,
  score: number,
  panelRepairRequestManifest: Record<string, unknown>
): AdminStoryValidationItem {
  return {
    id: `validation-${attempt}`,
    storyId: 'story-1',
    sceneIndex: 1,
    imageTargetKind: 'graphic_novel_page',
    subjectType: 'graphic_novel_panel',
    pageNumber: 1,
    panelIndex: 1,
    panelId: 'p1-1',
    cropRect,
    attempt,
    imageStoragePath: `validated-${attempt}.png`,
    imageUrl: `/api/v1/assets/validated-${attempt}.png`,
    validationScore: score,
    validationStatus: 'completed',
    visionModel: 'gemini-3.1-flash-lite',
    requestManifest: {
      operation: 'image_validation_segmented',
      panelRepairRequestManifest,
    },
    providerError: null,
    result: {},
    createdAt: `2026-07-08T10:17:0${attempt}.000Z`,
  };
}

const manifest = {
  pageNumber: 1,
  panelImageGeneration: {
    panels: [
      {
        panelIndex: 1,
        panelId: 'p1-1',
        cropRect,
      },
    ],
  },
  requests: [
    {
      operation: 'graphic_novel_template_panel_generate',
      cropRect,
      panelImageStoragePath: 'generated-panel.png',
      panelImageUrl: '/api/v1/assets/generated-panel.png',
      promptLength: 1000,
      referenceCount: 4,
    },
  ],
};

const originalCropValidation = validation(1, 100, {
  operation: 'graphic_novel_panel_crop_validation_original',
  repairMode: 'original',
  cropRect,
  panelImageStoragePath: 'validated-1.png',
});

const originalAttempts = buildAdminImageGenerationAttempts({
  sceneIndex: 1,
  manifest,
  validations: [originalCropValidation],
});

assert.equal(originalAttempts.length, 1);
assert.equal(originalAttempts[0].label, 'Page 1 · Panel 1 · Generate attempt 1');
assert.equal(originalAttempts[0].validation?.id, 'validation-1');
assert.equal(originalAttempts[0].validationMissingReason, null);

const originalRequestInRootAttempts = buildAdminImageGenerationAttempts({
  sceneIndex: 1,
  manifest: {
    ...manifest,
    requests: [
      ...manifest.requests,
      {
        operation: 'graphic_novel_panel_crop_validation_original',
        repairMode: 'original',
        cropRect,
        panelImageStoragePath: 'validated-1.png',
      },
    ],
  },
  validations: [originalCropValidation],
});

assert.equal(originalRequestInRootAttempts.length, 1);
assert.equal(originalRequestInRootAttempts[0].label, 'Page 1 · Panel 1 · Generate attempt 1');
assert.equal(originalRequestInRootAttempts[0].validation?.id, 'validation-1');

const repairedAttempts = buildAdminImageGenerationAttempts({
  sceneIndex: 1,
  manifest,
  validations: [
    validation(1, 40, {
      operation: 'graphic_novel_panel_crop_validation_original',
      repairMode: 'original',
      cropRect,
      panelImageStoragePath: 'validated-1.png',
    }),
    validation(2, 96, {
      operation: 'graphic_novel_panel_crop_validation_regenerate',
      repairMode: 'generate',
      cropRect,
      panelImageStoragePath: 'validated-2.png',
    }),
  ],
});

assert.equal(repairedAttempts.length, 2);
assert.equal(repairedAttempts[0].label, 'Page 1 · Panel 1 · Generate attempt 1');
assert.equal(repairedAttempts[0].validation?.id, 'validation-1');
assert.equal(repairedAttempts[0].validationMissingReason, null);
assert.equal(repairedAttempts[1].label, 'Page 1 · Panel 1 · Regenerate attempt 2');
assert.equal(repairedAttempts[1].validation?.id, 'validation-2');

const referenceMergeAttempts = buildAdminImageGenerationAttempts({
  sceneIndex: 10,
  manifest: {
    references: [
      {
        index: 1,
        imageIndex: 1,
        characterName: 'Ukraispa',
        storagePath: 'character_turnarounds/ukraispa.png',
        url: '/api/v1/assets/character_turnarounds/ukraispa.png',
      },
    ],
    requests: [
      {
        operation: 'image_generate',
        referenceImages: [
          {
            index: 1,
            imageIndex: 1,
            referenceBindingId: 'REF_CH_UKRAISPA_477B29',
            characterName: 'Ukraispa',
            storagePath: null,
            url: null,
            hasBase64Data: true,
          },
        ],
      },
    ],
  },
  validations: [],
});

const mergedReference = (
  referenceMergeAttempts[0].rawManifest.references as Array<Record<string, unknown>>
)[0];
assert.equal(mergedReference.storagePath, 'character_turnarounds/ukraispa.png');
assert.equal(mergedReference.url, '/api/v1/assets/character_turnarounds/ukraispa.png');
assert.equal(mergedReference.hasBase64Data, true);

console.log('admin image generation attempt grouping guards passed');
