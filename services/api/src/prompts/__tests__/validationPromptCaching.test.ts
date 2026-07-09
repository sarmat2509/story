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
    reservedCharacters: [
      {
        id: 'char-mia',
        name: 'Mia',
        type: 'person',
        role: 'hero',
        description: 'A young child with short curls and a yellow raincoat.',
        referencePhotos: [{ url: 'mia.png' }],
      } as any,
    ],
  });

  assert.ok(cached.includes('Output contract'));
  assert.ok(!cached.includes('Mia waves to the owl.'));
  assert.ok(runtime.includes('Mia waves to the owl.'));
  assert.ok(runtime.includes('RESERVED CHARACTER IDENTITY VALIDATION'));
  assert.ok(runtime.includes('reserved_name_reused_for_new_entity'));
  assert.ok(!cached.includes('correctedCameraComposition'));
  assert.ok(!cached.includes('camera_composition_incomplete'));
  assert.ok(!runtime.includes('CAMERA:'));
  assert.ok(!runtime.includes('"shot":"wide"'));
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
    reservedCharacters: [
      {
        id: 'char-mia',
        name: 'Mia',
        type: 'person',
        role: 'hero',
        description: 'A young child with short curls and a yellow raincoat.',
        referencePhotos: [{ url: 'mia.png' }],
      } as any,
    ],
  });

  assert.ok(prompt.includes('SCENE ID: 2'));
  assert.ok(prompt.includes('Mia waves to the owl.'));
  assert.ok(prompt.includes('RESERVED CHARACTER IDENTITY VALIDATION'));
  assert.ok(prompt.includes('reserved_character_identity_conflict'));
  assert.ok(prompt.includes('Do not infer, complete, rewrite, or repair illustration character rosters'));
  assert.ok(!prompt.includes('CAMERA:'));
  assert.ok(!prompt.includes('correctedCameraComposition'));
  assert.ok(!prompt.includes('camera_composition_incomplete'));
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
        validateOutfit: true,
      },
    ],
    sceneContext: 'forest path at dusk',
    referenceImages: [{ characterName: 'Mia [ID: 123]', mimeType: 'image/png' }],
  });

  assert.ok(cached.content.includes('Scoring guide'));
  assert.strictEqual(cached.key, 'image_validation_rules_full_v18');
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
    cached.content.includes('set faceMatchesReference=null and say the face check was skipped')
  );
  assert.ok(
    cached.content.includes('HUMAN face and hair fields must be independent')
  );
  assert.ok(
    cached.content.includes('explicitly mention face/head identity status separately from hairstyle status')
  );
  assert.ok(cached.content.includes('hair color zoning'));
  assert.ok(
    cached.content.includes('No separate outfit plate or text outfit description is used for final scene validation.')
  );
  assert.ok(
    cached.content.includes('Validate outfit against the attached full-character visual reference.')
  );
  assert.ok(!cached.content.includes('forest path at dusk'));
  assert.ok(runtime.includes('forest path at dusk'));
  assert.ok(!runtime.includes('yellow raincoat'));
  assert.ok(runtime.includes('Image 2: identity reference for "Mia [ID: 123]"'));
  assert.ok(
    runtime.includes(
      'For IDENTITY references: treat the attached image as the full visual character reference'
    )
  );
  assert.ok(runtime.includes('KIND=HUMAN'));
  assert.ok(runtime.includes('WARDROBE_CHECK=enabled'));
}

testTextValidationPromptSplit();
testSingleSceneValidationPrompt();
testTextRegenerationPromptSplit();
testImageValidationPromptSplit();
console.log('validationPromptCaching tests passed');
