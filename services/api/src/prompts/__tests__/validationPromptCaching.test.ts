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
    policy: {
      ageGroup: '4-5',
      promptGuidelines: '- DB rule: no dangerous tool instructions.',
    } as any,
    scenes: [
      {
        sceneId: 1,
        text: 'Mia waves to the owl.',
        sceneVisual: {
          cameraComposition: {
            shot: 'wide',
            characters: [{ name: 'Mia', description: 'foreground center' }],
          },
        },
      } as any,
    ],
  });

  assert.ok(cached.includes('Output contract'));
  assert.ok(!cached.includes('Mia waves to the owl.'));
  assert.ok(runtime.includes('Mia waves to the owl.'));
  assert.ok(runtime.includes('"shot":"wide"'));
  assert.ok(runtime.includes('DB CONTENT POLICY TO ENFORCE:'));
  assert.ok(runtime.includes('no dangerous tool instructions'));
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
    failedScenes: [{ sceneId: 2, originalText: 'Old text', feedback: 'Too scary' }],
  });

  assert.ok(
    cached.includes('Keep plot, characters, location, events, and scene meaning unchanged.')
  );
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
        characterKind: 'human',
        expectedOutfitForScene: 'yellow raincoat',
      },
    ],
    sceneContext: 'forest path at dusk',
    referenceImages: [{ characterName: 'Mia [ID: 123]', mimeType: 'image/png' }],
  });

  assert.ok(cached.content.includes('Scoring guide'));
  assert.strictEqual(cached.key, 'image_validation_rules_full_v9');
  assert.ok(cached.content.includes('Temporary expression changes alone are NOT identity drift.'));
  assert.ok(
    cached.content.includes(
      'flexible appendages (antennae, ears, whiskers, tail tip, crest tilt, wing angle)'
    )
  );
  assert.ok(
    cached.content.includes('Do not fail faceMatchesReference for temporary emotion alone')
  );
  assert.ok(
    cached.content.includes('HUMAN face and hair booleans must be independent')
  );
  assert.ok(
    cached.content.includes('explicitly mention face/head identity status separately from hairstyle status')
  );
  assert.ok(cached.content.includes('hair color zoning'));
  assert.ok(
    cached.content.includes(
      'If an outfit plate reference is provided for a character, that outfit plate is the strongest clothing ground truth'
    )
  );
  assert.ok(cached.content.includes('validate outfit primarily against that plate'));
  assert.ok(cached.content.includes('identity reference/default clothes are the wardrobe ground truth'));
  assert.ok(
    cached.content.includes('Do NOT list wardrobe differences inside identityComparisonSummary')
  );
  assert.ok(!cached.content.includes('forest path at dusk'));
  assert.ok(runtime.includes('forest path at dusk'));
  assert.ok(runtime.includes('yellow raincoat'));
  assert.ok(runtime.includes('Image 2: identity reference for "Mia [ID: 123]"'));
  assert.ok(
    runtime.includes(
      'For IDENTITY references: use them for identity and default clothing'
    )
  );
  assert.ok(runtime.includes('KIND=HUMAN'));
}

testTextValidationPromptSplit();
testSingleSceneValidationPrompt();
testTextRegenerationPromptSplit();
testImageValidationPromptSplit();
console.log('validationPromptCaching tests passed');
