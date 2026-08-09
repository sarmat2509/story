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
      readingComplexityAgeGroup: '6-8',
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
  assert.ok(cached.includes('PASS 2 — WHOLE-STORY COHERENCE'));
  assert.ok(cached.includes('causal_link_missing'));
  assert.ok(cached.includes('means_end_mismatch'));
  assert.ok(cached.includes('problem_resolution_gap'));
  assert.ok(cached.includes('intentional internal marker for the required keepsake'));
  assert.ok(cached.includes('needs no earlier setup'));
  assert.ok(cached.includes('entirely inside the top-level repair target sceneId'));
  assert.ok(cached.includes('emphasized as a scene-ending hook'));
  assert.ok(cached.includes("unsupported guess is not a payoff"));
  assert.ok(cached.includes('neutral background ambience'));
  assert.ok(cached.includes('target the later reveal or resolution scene'));
  assert.ok(cached.includes('MANDATORY NARRATIVE-OBLIGATION AUDIT'));
  assert.ok(cached.includes('Inspect every non-final scene ending separately'));
  assert.ok(cached.includes('textual function, not genre or subject matter'));
  assert.ok(cached.includes('"open"'));
  assert.ok(cached.includes('"audit"'));
  assert.ok(cached.includes('AUDIT/FAILURE CONSISTENCY IS REQUIRED'));
  assert.ok(cached.includes('one terse string for every distinct material expectation'));
  assert.ok(cached.includes('Use -1 only for an explicit future-facing anchor'));
  assert.ok(cached.includes('Every setup_payoff_gap must have at least one matching open row'));
  assert.ok(cached.includes('Audit one row per distinct expectation'));
  assert.ok(cached.includes('Never merge different sounds, sights, objects, goals'));
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
  assert.ok(runtime.includes('READING COMPLEXITY GROUP: 6-8'));
  assert.ok(runtime.includes('Themes, conflict, and emotional intensity must match age group 4-5'));
  assert.ok(runtime.includes('Vocabulary, syntax, and sentence complexity must match reading complexity group 6-8'));
  assert.ok(!runtime.includes('Output contract'));
}

function testSingleSceneValidationPrompt() {
  const prompt = buildValidationPrompt({
    policy: { ageGroup: '4-5', readingComplexityAgeGroup: '6-8' } as any,
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
  assert.ok(prompt.includes('READING COMPLEXITY GROUP: 6-8'));
  assert.ok(prompt.includes('Mia waves to the owl.'));
  assert.ok(prompt.includes('RESERVED CHARACTER IDENTITY VALIDATION'));
  assert.ok(prompt.includes('reserved_character_identity_conflict'));
  assert.ok(prompt.includes('Do not infer, complete, rewrite, or repair illustration character rosters'));
  assert.ok(prompt.includes('intentional keepsake marker'));
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
    storyScenes: [
      { sceneId: 1, text: 'Mia found the lantern beside a locked gate.' },
      { sceneId: 2, text: 'Old text' },
    ],
  });

  assert.ok(
    cached.includes('Keep plot, characters, location, events, and scene meaning unchanged.')
  );
  assert.ok(!cached.includes('Old text'));
  assert.ok(runtime.includes('Old text'));
  assert.ok(runtime.includes('Too scary'));
  assert.ok(runtime.includes('FULL STORY CONTEXT'));
  assert.ok(runtime.includes('Mia found the lantern beside a locked gate.'));
  assert.ok(runtime.includes('TARGET SCENES TO FIX'));
  assert.ok(cached.includes('Apply every repair entirely inside its target sceneId'));
  assert.ok(cached.includes('Preserve exactly one such marker'));
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
  assert.strictEqual(cached.key, 'image_validation_rules_full_v26_text_check');
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
