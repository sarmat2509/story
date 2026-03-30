import assert from 'node:assert/strict';
import {
  buildValidationPrompt,
  buildBatchRegenerationCachedPrefix,
  buildBatchRegenerationRuntimePrompt,
  buildBatchValidationCachedPrefix,
  buildBatchValidationRuntimePrompt,
} from '../text';
import {
  buildImageValidationRuntimePrompt,
  getImageValidationCachedPrefix,
} from '../image/ImageValidationPrompt';

function testTextValidationPromptSplit() {
  const cached = buildBatchValidationCachedPrefix();
  const runtime = buildBatchValidationRuntimePrompt({
    policy: { ageGroup: '4-5' } as any,
    scenes: [
      {
        sceneId: 1,
        text: 'Mia waves to the owl.',
        sceneVisual: {
          cameraComposition: {
            shot: 'wide',
            characters: [
              { name: 'Mia', description: 'foreground center' },
            ],
          },
        },
      } as any,
    ],
  });

  assert.ok(cached.includes('Output contract'));
  assert.ok(!cached.includes('Mia waves to the owl.'));
  assert.ok(runtime.includes('Mia waves to the owl.'));
  assert.ok(runtime.includes('"shot":"wide"'));
  assert.ok(!runtime.includes('Output contract'));
}

function testSingleSceneValidationPrompt() {
  const prompt = buildValidationPrompt({
    policy: { ageGroup: '4-5' } as any,
    isLastScene: false,
    sceneText: {
      sceneId: 2,
      text: 'Mia waves to the owl.',
      sceneVisual: {
        cameraComposition: {
          shot: 'wide',
          characters: [{ name: 'Mia', description: 'foreground center' }],
        },
      },
    } as any,
  });

  assert.ok(prompt.includes('SCENE ID: 2'));
  assert.ok(prompt.includes('Mia waves to the owl.'));
  assert.ok(prompt.includes('CAMERA:'));
  assert.ok(prompt.includes('correctedCameraComposition'));
}

function testTextRegenerationPromptSplit() {
  const cached = buildBatchRegenerationCachedPrefix();
  const runtime = buildBatchRegenerationRuntimePrompt({
    spec: {
      ageGroup: '4-5',
      language: 'uk',
      policyProfile: { readability: { targetWordsRange: [60, 90] } },
    } as any,
    sceneCount: 3,
    vocabLevel: 'simple',
    failedScenes: [
      { sceneId: 2, originalText: 'Old text', feedback: 'Too scary' },
    ],
  });

  assert.ok(cached.includes('Keep plot, characters, location, events, and scene meaning unchanged.'));
  assert.ok(!cached.includes('Old text'));
  assert.ok(runtime.includes('Old text'));
  assert.ok(runtime.includes('Too scary'));
}

function testImageValidationPromptSplit() {
  const cached = getImageValidationCachedPrefix(true);
  const runtime = buildImageValidationRuntimePrompt({
    expectedCharacters: [
      {
        name: 'Mia [ID: 123]',
        isImaginary: false,
        expectedOutfitForScene: 'yellow raincoat',
      },
    ],
    sceneContext: 'forest path at dusk',
    referenceImages: [{ characterName: 'Mia [ID: 123]', mimeType: 'image/png' }],
  });

  assert.ok(cached.content.includes('Scoring guide'));
  assert.ok(!cached.content.includes('forest path at dusk'));
  assert.ok(runtime.includes('forest path at dusk'));
  assert.ok(runtime.includes('yellow raincoat'));
  assert.ok(runtime.includes('Image 2'));
}

testTextValidationPromptSplit();
testSingleSceneValidationPrompt();
testTextRegenerationPromptSplit();
testImageValidationPromptSplit();
console.log('validationPromptCaching tests passed');
