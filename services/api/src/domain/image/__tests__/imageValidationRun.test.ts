/**
 * Focused tests for image validation provider fallback/block handling.
 *
 * Run: pnpm exec tsx src/domain/image/__tests__/imageValidationRun.test.ts
 */

import assert from 'node:assert/strict';
import type { ImageValidationResult } from '../../../ai/types';
import { MockTextProvider } from '../../../testing/ai/MockTextProvider';
import { shouldCheckImageReferenceLabels } from '../../../prompts/image/ImageTextPolicy';
import {
  runGraphicNovelPanelImageValidation,
  runProductImageValidation,
  runSegmentedProductImageValidation,
  deriveExplicitSceneAnchorConstraints,
  normalizeImageValidationResult,
  requiresCelestialSubjectInsideWindow,
  type GraphicNovelPanelImageValidationResult,
} from '../imageValidationRun';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

function validResult(): ImageValidationResult {
  return {
    characterCount: 2,
    expectedCharacterCount: 2,
    characters: [
      {
        name: 'Lera',
        characterKind: 'human',
        found: true,
        duplicated: false,
        recognizableScore: 1,
        faceMatchesReference: true,
        hairMatchesReference: true,
        ageReadMatchesReference: true,
        proportionsMatchReference: true,
        matchesColors: true,
        matchesOutfit: true,
        identityComparisonSummary: 'Matches reference.',
      },
      {
        name: 'Druzhok',
        characterKind: 'imaginary',
        found: true,
        duplicated: false,
        recognizableScore: 1,
        faceMatchesReference: null,
        hairMatchesReference: null,
        ageReadMatchesReference: null,
        proportionsMatchReference: true,
        matchesColors: true,
        matchesOutfit: true,
        sameOverallDesignRead: true,
        silhouetteDriftSeverity: 'none',
        identityComparisonSummary: 'Matches reference.',
      },
    ],
    hasUnexpectedCharacters: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    overallFeedback: 'ok',
  };
}

assert.deepEqual(
  deriveExplicitSceneAnchorConstraints(
    {
      setting: 'A glowing yawn floats beside the window.',
      lighting: 'night',
      cameraComposition: {
        shot: 'Frame the armchair and the Moon in the window together.',
        characters: [],
      },
    },
    'Frame the armchair and the Moon in the window together.'
  ),
  ['window', 'Moon subject'],
  'Singular scene anchors must be promoted into explicit count constraints for scene QA'
);
assert.equal(
  requiresCelestialSubjectInsideWindow(
    {
      setting: 'A glowing yawn rises near the window.',
      lighting: 'night',
      cameraComposition: {
        shot: 'Frame the Moon visible through the window with the armchair.',
        characters: [],
      },
    },
    'Frame the Moon visible through the window with the armchair.'
  ),
  true,
  'Moon-in-window staging must become an explicit celestial placement constraint'
);

function validLayoutResult(): ImageValidationResult {
  return {
    ...validResult(),
    hasArtworkOutsidePanelBounds: false,
    hasArtworkOverSpeechBubbles: false,
    hasExtraPanelStructure: false,
    layoutFeedback: 'ok',
  };
}

const anonymizedVisibleSubject = normalizeImageValidationResult(
  {
    ...validResult(),
    characters: [
      {
        ...validResult().characters[0],
        name: 'Emilia',
        found: false,
        actualVisibleDescription: 'Emilia with a single long braid instead of a high ponytail',
      },
    ],
  },
  [
    {
      name: 'Emilia',
      characterKind: 'human',
      description: 'A cheerful young girl with rainbow hair.',
      validateOutfit: false,
    },
  ],
  undefined
);

assert.equal(
  anonymizedVisibleSubject.characters[0].actualVisibleDescription,
  'young girl with a single long braid',
  'repair descriptions must identify a visible subject visually, never by its roster name'
);
assert.doesNotMatch(
  anonymizedVisibleSubject.characters[0].actualVisibleDescription ?? '',
  /Emilia/i
);

function segmentedLayoutResult() {
  return {
    missingExpectedCharacters: [],
    characterBoundingBoxes: [
      {
        name: 'Lera',
        found: true,
        xMin: 0,
        yMin: 0,
        xMax: 1000,
        yMax: 1000,
        confidence: 100,
        visibility: 'full_body',
        duplicated: false,
        duplicateCount: 1,
        visiblePhysicalBodyCount: 1,
        visibleReflectionCount: 0,
        visibleDepictionCount: 0,
        duplicateNotes: null,
        notes: 'Lera occupies the tiny mock image.',
      },
      {
        name: 'Druzhok',
        found: true,
        xMin: 0,
        yMin: 0,
        xMax: 1000,
        yMax: 1000,
        confidence: 100,
        visibility: 'full_body',
        duplicated: false,
        duplicateCount: 1,
        visiblePhysicalBodyCount: 1,
        visibleReflectionCount: 0,
        visibleDepictionCount: 0,
        duplicateNotes: null,
        notes: 'Druzhok occupies the tiny mock image.',
      },
    ],
    hasArtworkOutsidePanelBounds: false,
    hasArtworkOverSpeechBubbles: false,
    hasExtraPanelStructure: true,
    hasUnexpectedCharacters: false,
    unexpectedCharacterNotes: null,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    layoutFeedback: 'one planned panel is visually split',
    overallFeedback: 'Layout has an extra split panel.',
  };
}

function segmentedLayoutResultWithDruzhokDuplicate() {
  const result = segmentedLayoutResult();
  return {
    ...result,
    characterBoundingBoxes: result.characterBoundingBoxes.map((box) =>
      box.name === 'Druzhok'
        ? {
            ...box,
            // Deliberately inconsistent legacy booleans: the physical-body count is
            // now the authoritative duplicate signal.
            duplicated: false,
            duplicateCount: 1,
            visiblePhysicalBodyCount: 2,
            visibleReflectionCount: 0,
            visibleDepictionCount: 0,
            duplicateNotes: 'One copy is visible near the top and another copy is lower left.',
          }
        : {
            ...box,
            duplicated: false,
            duplicateCount: box.found ? 1 : 0,
            visiblePhysicalBodyCount: box.found ? 1 : 0,
            visibleReflectionCount: 0,
            visibleDepictionCount: 0,
            duplicateNotes: null,
          }
    ),
  };
}

function segmentedLayoutResultWithDruzhokReflection() {
  const result = segmentedLayoutResult();
  return {
    ...result,
    characterBoundingBoxes: result.characterBoundingBoxes.map((box) =>
      box.name === 'Druzhok'
        ? {
            ...box,
            // Deliberately inconsistent provider verdict: a reflection must not
            // become a physical duplicate when the body audit says there is one.
            duplicated: true,
            duplicateCount: 2,
            visiblePhysicalBodyCount: 1,
            visibleReflectionCount: 1,
            visibleDepictionCount: 0,
            duplicateNotes: 'One physical body plus one mirror reflection.',
          }
        : box
    ),
  };
}

function segmentedLayoutResultWithDruzhokNotVisible() {
  const result = segmentedLayoutResult();
  return {
    ...result,
    missingExpectedCharacters: ['Druzhok'],
    characterBoundingBoxes: result.characterBoundingBoxes.map((box) =>
      box.name === 'Druzhok'
        ? {
            ...box,
            found: false,
            xMin: 0,
            yMin: 0,
            xMax: 0,
            yMax: 0,
            confidence: 0,
            visibility: 'not_visible',
            duplicated: false,
            duplicateCount: 0,
            visiblePhysicalBodyCount: 0,
            visibleReflectionCount: 0,
            visibleDepictionCount: 0,
            duplicateNotes: null,
            notes: 'No visible Druzhok candidate exists in the image.',
          }
        : {
            ...box,
            duplicated: false,
            duplicateCount: box.found ? 1 : 0,
            visiblePhysicalBodyCount: box.found ? 1 : 0,
            visibleReflectionCount: 0,
            visibleDepictionCount: 0,
            duplicateNotes: null,
          }
    ),
  };
}

function segmentedCharacterResult(
  character: ImageValidationResult['characters'][number]
): Record<string, unknown> {
  return {
    character: {
      anatomyArtifactSeverity: 'none',
      anatomyArtifactNotes: null,
      ...character,
    },
    hasUnexpectedCharacters: false,
    hasRenderingArtifacts: false,
    notes: character.issue || character.identityComparisonSummary,
  };
}

function validSegmentedLeraResult(): Record<string, unknown> {
  return segmentedCharacterResult({
    name: 'Lera',
    characterKind: 'human',
    found: true,
    duplicated: false,
    recognizableScore: 1,
    faceMatchesReference: true,
    hairMatchesReference: true,
    ageReadMatchesReference: true,
    proportionsMatchReference: true,
    matchesColors: true,
    matchesOutfit: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    identityComparisonSummary: 'Matches the reference child.',
  });
}

function validSegmentedDruzhokResult(duplicated = false): Record<string, unknown> {
  return segmentedCharacterResult({
    name: 'Druzhok',
    characterKind: 'imaginary',
    found: true,
    duplicated,
    recognizableScore: 1,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: true,
    matchesColors: true,
    matchesOutfit: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    identityComparisonSummary: 'The cropped creature matches the reference.',
    ...(duplicated && { issue: 'Two separate physical bodies are visible inside the crop.' }),
  });
}

function malformedSegmentedDruzhokResult(): Record<string, unknown> {
  return segmentedCharacterResult({
    name: 'Druzhok',
    characterKind: 'imaginary',
    found: true,
    duplicated: false,
    recognizableScore: 1,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: true,
    matchesColors: true,
    matchesOutfit: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    anatomyArtifactSeverity: 'severe',
    anatomyArtifactNotes:
      'Human hands replace the expected claws and several load-bearing legs fuse into the torso.',
    identityComparisonSummary:
      'The two heads, central pattern, and colors match, but the visible limbs are malformed.',
  });
}

function validGraphicNovelPanelResult(): GraphicNovelPanelImageValidationResult {
  return {
    pageNumber: 1,
    expectedPanelCount: 1,
    detectedPanelCount: 1,
    hasExtraPanelStructure: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    layoutFeedback: 'One physical panel matches the expected page plan.',
    panels: [
      {
        panelNumber: 1,
        panelId: 'p1-1',
        panelDetected: true,
        matchedVisiblePanelDescription: 'A single visible panel with the starry chest.',
        visualMatchesExpectedMoment: true,
        unexpectedCharactersPresent: false,
        unexpectedNamedCharacters: [],
        renderingArtifacts: false,
        panelIssue: null,
        characters: [
          {
            name: 'Lera',
            characterKind: 'human',
            expectedPresent: true,
            found: false,
            recognizableScore: 0.1,
            faceMatchesReference: false,
            hairMatchesReference: false,
            ageReadMatchesReference: false,
            proportionsMatchReference: false,
            matchesColors: false,
            matchesOutfit: false,
            sameOverallDesignRead: null,
            silhouetteDriftSeverity: null,
            identityComparisonSummary: 'The expected child is not visible in this panel.',
            issue: 'character missing from panel',
          },
        ],
      },
    ],
    overallFeedback: 'Panel validation completed.',
  };
}

const validationInput = {
  imageData: TINY_PNG,
  mimeType: 'image/png',
  expectedCharacters: [
    {
      name: 'Lera',
      characterKind: 'human' as const,
      description: 'Young girl beside the starry chest.',
    },
    {
      name: 'Druzhok',
      characterKind: 'imaginary' as const,
      description: 'Small robo-dog with a light on the chest or forehead area.',
    },
  ],
  sceneVisual: {
    setting: 'The chest lid is closed and the painted stars shine.',
    lighting: 'Soft daylight.',
    cameraComposition: {
      shot: 'Medium shot at child eye level with the chest visible.',
      characters: [
        {
          name: 'Lera',
          description:
            'Foreground left, leaning forward with one hand pressed on the chest lid; determined expression.',
        },
        {
          name: 'Druzhok',
          description:
            'Midground right, standing alert with nose nearly touching the chest surface.',
        },
      ],
    },
  },
  referenceImages: [
    { characterName: 'Lera', imageData: TINY_PNG.toString('base64'), mimeType: 'image/png' },
    { characterName: 'Druzhok', imageData: TINY_PNG.toString('base64'), mimeType: 'image/png' },
  ],
};

const druzhokOnlyValidationInput = {
  ...validationInput,
  expectedCharacters: [validationInput.expectedCharacters[1]],
  sceneVisual: {
    ...validationInput.sceneVisual,
    cameraComposition: {
      ...validationInput.sceneVisual.cameraComposition,
      characters: [validationInput.sceneVisual.cameraComposition.characters[1]],
    },
  },
  referenceImages: [validationInput.referenceImages[1]],
};

function segmentedDruzhokOnlyLayoutResult() {
  const result = segmentedLayoutResult();
  return {
    ...result,
    characterBoundingBoxes: result.characterBoundingBoxes.filter(
      (box) => box.name === 'Druzhok'
    ),
  };
}

async function testFallbackAfterPrimaryBlocked() {
  const primary = new MockTextProvider()
    .queueError(
      'structured',
      'image_validation',
      'Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'
    )
    .queueError(
      'structured',
      'image_validation',
      'Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'
    );
  const fallback = new MockTextProvider().queueStructured('image_validation', validResult());

  const result = await runProductImageValidation(primary, validationInput, {
    visionModel: 'gemini-test',
    fallbackTextProvider: fallback,
    fallbackVisionModel: 'openai-test',
  });

  assert.strictEqual(result.validationStatus, 'completed');
  assert.strictEqual(result.validationAttemptKind, 'fallback_compact');
  assert.strictEqual(result.validationModelUsed, 'openai-test');
  assert.strictEqual(primary.structuredRequests.length, 2);
  assert.strictEqual(fallback.structuredRequests.length, 1);
  assert.match(
    fallback.structuredRequests[0].systemInstruction ?? '',
    /image quality assurance inspector/
  );
  assert.doesNotMatch(fallback.structuredRequests[0].prompt, /chest lid is closed/i);
  assert.doesNotMatch(fallback.structuredRequests[0].prompt, /chest or forehead/i);
  assert.ok(result.requestManifest);
  primary.assertExhausted();
  fallback.assertExhausted();
}

async function testDisabledTextCheckNormalizesProviderVerdictToFalse() {
  if (shouldCheckImageReferenceLabels()) return;

  const providerResult = validResult();
  providerResult.hasTextOrLetters = true;
  const primary = new MockTextProvider().queueStructured('image_validation', providerResult);

  const result = await runProductImageValidation(primary, validationInput, {
    visionModel: 'gemini-test',
    recordModeration: false,
  });

  assert.strictEqual(result.hasTextOrLetters, false);
  primary.assertExhausted();
}

async function testAllBlockedReturnsProviderBlocked() {
  const primary = new MockTextProvider()
    .queueError(
      'structured',
      'image_validation',
      'Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'
    )
    .queueError(
      'structured',
      'image_validation',
      'Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT'
    );

  const result = await runProductImageValidation(primary, validationInput, {
    visionModel: 'gemini-test',
  });

  assert.strictEqual(result.validationStatus, 'provider_blocked');
  assert.strictEqual(result.validationAttemptKind, 'primary_reduced');
  assert.strictEqual(result.validationModelUsed, 'gemini-test');
  assert.strictEqual(primary.structuredRequests.length, 2);
  assert.ok(result.characters.every((c) => c.found));
  assert.ok(result.characters.every((c) => c.matchesOutfit));
  assert.match(result.overallFeedback, /provider-blocked/);
  const manifest = result.requestManifest as { attempts: Array<{ outcome: string }> };
  assert.deepStrictEqual(
    manifest.attempts.map((a) => a.outcome),
    ['provider_blocked', 'provider_blocked']
  );
  primary.assertExhausted();
}

async function testLayoutChecksSchemaAndPromptAreFlagged() {
  const primary = new MockTextProvider().queueStructured('image_validation', validLayoutResult());

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: true,
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(result.hasArtworkOutsidePanelBounds, false);
  assert.strictEqual(result.hasArtworkOverSpeechBubbles, false);
  assert.strictEqual(result.hasExtraPanelStructure, false);
  assert.strictEqual(result.layoutFeedback, 'ok');
  assert.strictEqual(primary.structuredRequests.length, 1);
  assert.match(primary.structuredRequests[0].prompt, /GRAPHIC NOVEL LAYOUT CHECKS/);
  assert.ok(
    (primary.structuredRequests[0].schema.required || []).includes('hasArtworkOutsidePanelBounds')
  );
  assert.ok(
    (primary.structuredRequests[0].schema.required || []).includes('hasArtworkOverSpeechBubbles')
  );
  assert.ok(
    (primary.structuredRequests[0].schema.required || []).includes('hasExtraPanelStructure')
  );
  assert.ok(
    !(primary.structuredRequests[0].schema.required || []).includes('hasTemplateColorResidue')
  );
  assert.ok((primary.structuredRequests[0].schema.required || []).includes('layoutFeedback'));
  primary.assertExhausted();
}

async function testLayoutTemplateReferenceIsIgnoredForValidation() {
  const primary = new MockTextProvider().queueStructured('image_validation', validLayoutResult());

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: true,
      includeBubbleChecks: false,
      referenceImages: [
        {
          characterName: 'Graphic novel page 3 layout template',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'layout_template',
        },
        ...validationInput.referenceImages,
      ],
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(result.validationStatus, 'completed');
  assert.strictEqual(primary.structuredRequests.length, 1);
  assert.doesNotMatch(primary.structuredRequests[0].prompt, /LAYOUT TEMPLATE REFERENCES/);
  assert.doesNotMatch(primary.structuredRequests[0].prompt, /layout template/i);
  assert.match(primary.structuredRequests[0].prompt, /"Lera" -> Image 2 \[HUMAN; IDENTITY\]/);
  assert.ok(
    !primary.structuredRequests[0].prompt.includes('"Graphic novel page 3 layout template" ->')
  );
  assert.doesNotMatch(
    primary.structuredRequests[0].imageData?.[1]?.instructionText ?? '',
    /LAYOUT TEMPLATE/i
  );
  const manifest = result.requestManifest as {
    imageOrder: string[];
    references: Array<{ referenceKind: string; imageIndex: number }>;
  };
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_Lera',
    '3_identity_Druzhok',
  ]);
  assert.strictEqual(manifest.references[0].referenceKind, 'identity');
  assert.strictEqual(manifest.references[0].imageIndex, 2);
  primary.assertExhausted();
}

async function testUnreferencedCharacterKeepsDescriptionAndClearsReferenceFields() {
  const primary = new MockTextProvider().queueStructured('image_validation', validResult());

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      referenceImages: [
        {
          characterName: 'Druzhok',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
        },
      ],
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(primary.structuredRequests.length, 1);
  assert.match(
    primary.structuredRequests[0].prompt,
    /"Lera" \| KIND=HUMAN \| Young girl beside the starry chest\./
  );
  assert.doesNotMatch(primary.structuredRequests[0].prompt, /"Lera" -> Image \d/);
  assert.match(
    primary.structuredRequests[0].prompt,
    /"Druzhok" -> Image 2 \[IMAGINARY_CREATURE; IDENTITY\]/
  );
  assert.doesNotMatch(
    primary.structuredRequests[0].prompt,
    /"Druzhok" \| KIND=IMAGINARY_CREATURE \| Small robo-dog/
  );

  const lera = result.characters.find((c) => c.name === 'Lera');
  assert.ok(lera, 'Lera validation row should be present');
  assert.strictEqual(lera.faceMatchesReference, null);
  assert.strictEqual(lera.hairMatchesReference, null);
  assert.strictEqual(lera.ageReadMatchesReference, null);
  assert.strictEqual(lera.proportionsMatchReference, null);
  assert.strictEqual(lera.sameOverallDesignRead, undefined);
  assert.strictEqual(lera.silhouetteDriftSeverity, undefined);
  assert.match(lera.identityComparisonSummary, /No identity reference was provided/);

  const druzhok = result.characters.find((c) => c.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation row should be present');
  assert.strictEqual(druzhok.proportionsMatchReference, true);
  assert.strictEqual(druzhok.sameOverallDesignRead, true);
  primary.assertExhausted();
}

async function testTurnaroundReferenceIsTracedInPromptAndManifest() {
  const primary = new MockTextProvider().queueStructured('image_validation', validResult());

  const result = await runProductImageValidation(
    primary,
    {
      ...validationInput,
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
      ],
    },
    {
      visionModel: 'gemini-test',
    }
  );

  assert.strictEqual(primary.structuredRequests.length, 1);
  assert.match(
    primary.structuredRequests[0].prompt,
    /"Lera" -> Image 2 \[HUMAN; IDENTITY_TURNAROUND\]/
  );
  assert.match(
    primary.structuredRequests[0].imageData?.[1]?.instructionText ?? '',
    /IDENTITY TURNAROUND reference/
  );

  const manifest = result.requestManifest as {
    imageOrder: string[];
    references: Array<{ referenceKind: string; identitySource?: string; imageIndex: number }>;
  };
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
  ]);
  assert.strictEqual(manifest.references[0].referenceKind, 'identity');
  assert.strictEqual(manifest.references[0].identitySource, 'turnaround');
  assert.strictEqual(manifest.references[0].imageIndex, 2);
  primary.assertExhausted();
}

async function testSegmentedValidationRunsLayoutAndPerCharacterPasses() {
  const leraResponse = segmentedCharacterResult({
    name: 'Lera',
    characterKind: 'human',
    found: false,
    duplicated: false,
    recognizableScore: 0.3,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: true,
    matchesColors: false,
    matchesOutfit: false,
    sameOverallDesignRead: false,
    silhouetteDriftSeverity: 'severe',
    identityComparisonSummary: 'The expected character design is not recognizable in the crop.',
    issue: 'different character design',
  });
  const druzhokResponse = segmentedCharacterResult({
    name: 'Druzhok',
    characterKind: 'imaginary',
    found: false,
    duplicated: false,
    recognizableScore: 0.3,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: true,
    matchesColors: false,
    matchesOutfit: false,
    sameOverallDesignRead: false,
    silhouetteDriftSeverity: 'severe',
    identityComparisonSummary: 'The expected character design is not recognizable in the crop.',
    issue: 'different character design',
  });
  const primary = new MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', segmentedLayoutResult())
    .queueStructured('image_validation_segmented_character_identity', leraResponse)
    .queueStructured('image_validation_segmented_character_identity', druzhokResponse);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: true,
      includeBubbleChecks: false,
      referenceImages: [
        {
          characterName: 'Graphic novel page 3 layout template',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'layout_template',
        },
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
        {
          characterName: 'Druzhok',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
      ],
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(result.validationAttemptKind, 'segmented_parallel');
  assert.strictEqual(result.validationModelUsed, 'gemini-test');
  assert.strictEqual(result.characterCount, 0);
  assert.strictEqual(result.expectedCharacterCount, 2);
  assert.deepStrictEqual(result.missingExpectedCharacters, ['Lera', 'Druzhok']);
  assert.strictEqual(result.hasExtraPanelStructure, true);
  assert.match(result.layoutFeedback ?? '', /visually split/);
  assert.strictEqual(result.characters.find((c) => c.name === 'Lera')?.found, false);
  assert.strictEqual(result.characters.find((c) => c.name === 'Druzhok')?.found, false);
  assert.deepStrictEqual(result.characters.find((c) => c.name === 'Lera')?.characterBoundingBox, {
    found: true,
    xMin: 0,
    yMin: 0,
    xMax: 1000,
    yMax: 1000,
    confidence: 100,
    visibility: 'full_body',
    duplicated: false,
    duplicateCount: 1,
    visiblePhysicalBodyCount: 1,
    visibleReflectionCount: 0,
    visibleDepictionCount: 0,
    duplicateNotes: null,
    notes: 'Lera occupies the tiny mock image.',
  });
  assert.deepStrictEqual(result.characters.find((c) => c.name === 'Lera')?.characterCropRect, {
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  });

  assert.strictEqual(primary.structuredRequests.length, 3);
  const layoutCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('validate expected cast and global image quality')
  );
  const leraCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Lera"')
  );
  const druzhokCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Druzhok"')
  );
  assert.ok(layoutCall, 'layout pass should run');
  assert.ok(leraCall, 'Lera character pass should run');
  assert.ok(druzhokCall, 'Druzhok character pass should run');
  assert.strictEqual(layoutCall.imageData?.length, 3);
  assert.match(layoutCall.prompt, /IDENTITY REFERENCES FOR BBOX LABELING/);
  assert.match(layoutCall.prompt, /Image 2: turnaround identity reference for "Lera"/);
  assert.match(layoutCall.prompt, /Image 3: turnaround identity reference for "Druzhok"/);
  assert.match(layoutCall.prompt, /EXPECTED CHARACTER STAGING HINTS/);
  assert.match(layoutCall.prompt, /trust the stable visual identity from the reference image/);
  assert.match(layoutCall.prompt, /scan the whole Image 1 for ALL visible copies/);
  assert.match(layoutCall.prompt, /not evidence for what Image 1 ACTUALLY contains/);
  assert.match(layoutCall.prompt, /Mandatory visual inventory/);
  assert.match(layoutCall.prompt, /Two matching bodies side-by-side/);
  assert.match(layoutCall.prompt, /count physically separate bodies\/torsos/);
  assert.match(layoutCall.prompt, /Multiple heads, faces, arms, tails/);
  assert.match(layoutCall.prompt, /visiblePhysicalBodyCount > 1/);
  assert.match(layoutCall.prompt, /mirror reflections, water reflections/);
  assert.match(layoutCall.prompt, /ordinary scene space with its own body/);
  assert.match(layoutCall.prompt, /upside-down or vertically mirrored copy/);
  assert.match(layoutCall.prompt, /must not be counted as a physical body/);
  if (shouldCheckImageReferenceLabels()) {
    assert.match(
      layoutCall.prompt,
      /Ordinary visible story-world text is allowed/
    );
    assert.match(layoutCall.prompt, /only active meaning is a leaked technical reference identifier/);
    assert.match(layoutCall.prompt, /including REF_CH_, REF_ENV_, or REF_OBJ_/);
  } else {
    assert.match(layoutCall.prompt, /Always set hasTextOrLetters=false/);
    assert.doesNotMatch(layoutCall.prompt, /Explicitly scan for REF_\*/);
  }
  assert.match(layoutCall.prompt, /dog-like fairy as a chicken-like creature/);
  assert.match(layoutCall.prompt, /Lera \(human; identity reference=Image 2\)/);
  assert.match(layoutCall.prompt, /Druzhok \(imaginary; identity reference=Image 3\)/);
  assert.match(leraCall.prompt, /validate exactly ONE expected HUMAN character/);
  assert.match(leraCall.prompt, /Audit duplicates inside this crop too/);
  assert.match(leraCall.prompt, /inventory the visible limbs from pixels/);
  assert.match(leraCall.prompt, /padded crop/);
  assert.match(leraCall.prompt, /nearby disconnected or malformed parts/);
  assert.match(leraCall.prompt, /separate physical bodies/);
  assert.match(leraCall.prompt, /mirror reflection, water reflection/);
  assert.match(leraCall.prompt, /Count bodies\/torsos, not heads/);
  assert.match(leraCall.prompt, /Do not search outside this crop/);
  assert.match(leraCall.prompt, /found=true only when the cropped candidate/);
  assert.doesNotMatch(leraCall.prompt, /Search Image 1/);
  assert.doesNotMatch(leraCall.prompt, /duplicated=true only means/);
  assert.doesNotMatch(leraCall.prompt, /GRAPHIC NOVEL LAYOUT CHECKS/);
  assert.doesNotMatch(leraCall.prompt, /EXPECTED CHARACTER: "Druzhok"/);
  assert.doesNotMatch(leraCall.prompt, /DESCRIPTION:/);
  assert.doesNotMatch(leraCall.prompt, /Young girl beside the starry chest/);
  assert.match(leraCall.prompt, /Compare Image 1 against Image 2 only/);
  assert.match(leraCall.prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  assert.match(leraCall.prompt, /one hand pressed on the chest lid/);
  assert.match(leraCall.prompt, /Human face visibility rule/);
  assert.match(leraCall.prompt, /Human hair rule/);
  assert.match(leraCall.prompt, /Scene prop handling/);
  assert.strictEqual(leraCall.imageData?.length, 2);
  assert.match(druzhokCall.prompt, /validate exactly ONE expected IMAGINARY CREATURE character/);
  assert.match(druzhokCall.prompt, /species\/subtype read/);
  assert.match(
    druzhokCall.prompt,
    /Set faceMatchesReference=null, hairMatchesReference=null, and ageReadMatchesReference=null/
  );
  assert.match(druzhokCall.prompt, /Visible-anchor scoring/);
  assert.match(druzhokCall.prompt, /Biological\/design anchors outrank accessories/);
  assert.match(druzhokCall.prompt, /matching hat\/wing\/prop alone never proves identity/);
  assert.match(druzhokCall.prompt, /cap recognizableScore at 0\.6/);
  assert.match(druzhokCall.prompt, /cap recognizableScore at 0\.55/);
  assert.match(druzhokCall.prompt, /Audit duplicates inside this crop too/);
  assert.match(druzhokCall.prompt, /separate physical bodies/);
  assert.match(druzhokCall.prompt, /single multi-headed creature with one shared body/);
  assert.match(druzhokCall.prompt, /Reflections in mirrors or water/);
  assert.match(druzhokCall.prompt, /separate anatomy-integrity audit/);
  assert.match(druzhokCall.prompt, /human arms\/hands replacing claws or crab legs/);
  assert.match(druzhokCall.prompt, /load-bearing legs/);
  assert.match(druzhokCall.prompt, /recognizable character can still have/);
  assert.match(druzhokCall.prompt, /Do not search outside this crop/);
  assert.match(druzhokCall.prompt, /found=true only when the cropped candidate/);
  assert.doesNotMatch(druzhokCall.prompt, /Search Image 1/);
  assert.doesNotMatch(druzhokCall.prompt, /duplicated=true only means/);
  assert.doesNotMatch(druzhokCall.prompt, /Human face visibility rule/);
  assert.doesNotMatch(druzhokCall.prompt, /Human hair rule/);
  assert.doesNotMatch(druzhokCall.prompt, /For humans use/);
  assert.doesNotMatch(druzhokCall.prompt, /For animals\/imaginary creatures use/);

  const manifest = result.requestManifest as {
    mode: string;
    imageOrder: string[];
    references: Array<{ referenceKind: string }>;
    characterBoundingBoxes: unknown[];
    characterCrops: unknown[];
    passes: Array<{ passKind: string }>;
  };
  assert.strictEqual(manifest.mode, 'segmented_parallel_scene_qa_layout_plus_character_identity');
  assert.strictEqual(manifest.characterBoundingBoxes.length, 2);
  assert.strictEqual(manifest.characterCrops.length, 2);
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
    '3_identity_turnaround_Druzhok',
  ]);
  assert.ok(manifest.references.every((ref) => ref.referenceKind !== 'layout_template'));
  assert.deepStrictEqual(manifest.passes.map((pass) => pass.passKind).sort(), [
    'character_identity',
    'character_identity',
    'scene_qa',
  ]);
  primary.assertExhausted();
}

async function testSegmentedValidationIgnoresLegacyNonStringStagingDescription() {
  const [lera, druzhok] = validResult().characters;
  const primary = new MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', segmentedLayoutResult())
    .queueStructured(
      'image_validation_segmented_character_identity',
      segmentedCharacterResult(lera)
    )
    .queueStructured(
      'image_validation_segmented_character_identity',
      segmentedCharacterResult(druzhok)
    );

  const legacyCameraComposition = {
    ...validationInput.sceneVisual.cameraComposition,
    characters: [
      { name: 'Lera', description: { pose: 'leaning over the chest' } },
      { name: 'Druzhok', description: ['standing alert'] },
    ],
  };

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      expectedCharacters: validationInput.expectedCharacters.map((character, index) => ({
        ...character,
        description: (index === 0
          ? { appearance: 'legacy object description' }
          : ['legacy array description']) as never,
        speciesSubtype: (index === 0
          ? { kind: 'legacy object subtype' }
          : ['legacy array subtype']) as never,
      })),
      sceneVisual: {
        ...validationInput.sceneVisual,
        cameraComposition: legacyCameraComposition as never,
      },
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(result.validationStatus, 'completed');
  assert.strictEqual(primary.structuredRequests.length, 3);
  assert.doesNotMatch(primary.structuredRequests[0].prompt, /leaning over the chest/);
  assert.doesNotMatch(primary.structuredRequests[1].prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  assert.doesNotMatch(primary.structuredRequests[2].prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  primary.assertExhausted();
}

async function testSegmentedValidationNormalizesRosterToUniqueSceneVisualCharacters() {
  const dragonRef = '07207caa-3601-428d-b3d4-71e2a69d454e';
  const sparkyRef = 'c9e5b476-2fd8-4ab6-8148-d336be03821a';
  const offscreenRef = '6684bfd1-efcc-486a-964d-c3b24f516a6e';
  const sceneQa = {
    ...segmentedLayoutResult(),
    characterBoundingBoxes: segmentedLayoutResult().characterBoundingBoxes.map((box) => ({
      ...box,
      name: box.name === 'Lera' ? 'Eyedragon' : 'Sparky',
    })),
  };
  const eyedragonResult = {
    ...validResult().characters[1],
    name: 'Eyedragon',
  };
  const sparkyResult = {
    ...validResult().characters[1],
    name: 'Sparky',
  };
  const primary = new MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', sceneQa)
    .queueStructured(
      'image_validation_segmented_character_identity',
      segmentedCharacterResult(eyedragonResult)
    )
    .queueStructured(
      'image_validation_segmented_character_identity',
      segmentedCharacterResult(sparkyResult)
    );

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      imageData: TINY_PNG,
      mimeType: 'image/png',
      expectedCharacters: [
        {
          characterRef: dragonRef,
          name: 'Айдрагон',
          characterKind: 'imaginary',
        },
        {
          characterRef: dragonRef,
          name: 'Eyedragon',
          characterKind: 'imaginary',
        },
        {
          characterRef: sparkyRef,
          name: 'Sparky',
          characterKind: 'imaginary',
        },
        {
          characterRef: offscreenRef,
          name: 'Offscreen Dragon',
          characterKind: 'imaginary',
        },
      ],
      sceneVisual: {
        setting: 'Eyedragon presents the gift while Sparky shines nearby.',
        lighting: 'Cool starlight.',
        cameraComposition: {
          shot: 'Medium shot with Eyedragon and Sparky.',
          characters: [
            {
              characterRef: dragonRef,
              name: 'Eyedragon',
              description: 'right of center',
            },
            {
              characterRef: sparkyRef,
              name: 'Sparky',
              description: 'hovering at left',
            },
          ],
        },
      },
      referenceImages: [
        {
          characterRef: dragonRef,
          characterName: 'Айдрагон',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
        },
        {
          characterRef: sparkyRef,
          characterName: 'Сяйвик',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
        },
        {
          characterName: 'Offscreen Dragon',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
        },
      ],
    },
    { visionModel: 'gemini-test' }
  );

  assert.equal(result.expectedCharacterCount, 2);
  assert.deepEqual(
    result.characters.map((character) => character.name),
    ['Eyedragon', 'Sparky']
  );
  assert.equal(new Set(result.characters.map((character) => character.name)).size, 2);
  assert.equal(primary.structuredRequests.length, 3);

  const sceneQaRequest = primary.structuredRequests.find((request) =>
    request.prompt.includes('validate expected cast and global image quality')
  );
  assert.ok(sceneQaRequest);
  assert.match(sceneQaRequest.prompt, /- Eyedragon \(imaginary/);
  assert.match(sceneQaRequest.prompt, /- Sparky \(imaginary/);
  assert.doesNotMatch(sceneQaRequest.prompt, /Айдрагон|Offscreen Dragon/);

  const manifest = result.requestManifest as {
    expectedCharacters: Array<{ characterRef?: string; name: string }>;
    references: Array<{ characterRef?: string; characterName: string }>;
  };
  assert.deepEqual(
    manifest.expectedCharacters.map((character) => ({
      characterRef: character.characterRef,
      name: character.name,
    })),
    [
      { characterRef: dragonRef, name: 'Eyedragon' },
      { characterRef: sparkyRef, name: 'Sparky' },
    ]
  );
  assert.deepEqual(
    manifest.references.map((reference) => ({
      characterRef: reference.characterRef,
      characterName: reference.characterName,
    })),
    [
      { characterRef: dragonRef, characterName: 'Eyedragon' },
      { characterRef: sparkyRef, characterName: 'Sparky' },
    ]
  );
  primary.assertExhausted();
}

async function testSceneQaDuplicateEvidenceOverridesSingleCropResult() {
  const leraResponse = segmentedCharacterResult({
    name: 'Lera',
    characterKind: 'human',
    found: true,
    duplicated: false,
    recognizableScore: 1,
    faceMatchesReference: true,
    hairMatchesReference: true,
    ageReadMatchesReference: true,
    proportionsMatchReference: true,
    matchesColors: true,
    matchesOutfit: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    identityComparisonSummary: 'Matches the reference child.',
    issue: null as unknown as string | undefined,
  });
  const druzhokResponse = segmentedCharacterResult({
    name: 'Druzhok',
    characterKind: 'imaginary',
    found: true,
    duplicated: false,
    recognizableScore: 1,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: true,
    matchesColors: true,
    matchesOutfit: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    identityComparisonSummary: 'The cropped creature matches the reference.',
    issue: null as unknown as string | undefined,
  });
  const primary = new MockTextProvider()
    .queueStructured(
      'image_validation_segmented_scene_qa',
      segmentedLayoutResultWithDruzhokDuplicate()
    )
    .queueStructured('image_validation_segmented_character_identity', leraResponse)
    .queueStructured('image_validation_segmented_character_identity', druzhokResponse);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  assert.match(primary.structuredRequests[0].prompt, /duplicateCount/);
  assert.strictEqual(result.characterCount, 3);
  assert.strictEqual(result.expectedCharacterCount, 2);
  const druzhok = result.characters.find((character) => character.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation should be present');
  assert.strictEqual(druzhok.duplicated, true);
  assert.match(druzhok.issue ?? '', /Duplicate visible copies detected \(2\)/);

  const manifest = result.requestManifest as {
    characterBoundingBoxes: Array<{
      name: string;
      duplicated?: boolean;
      duplicateCount?: number;
      visiblePhysicalBodyCount?: number;
    }>;
  };
  const druzhokBox = manifest.characterBoundingBoxes.find((box) => box.name === 'Druzhok');
  assert.strictEqual(druzhokBox?.duplicated, false);
  assert.strictEqual(druzhokBox?.duplicateCount, 1);
  assert.strictEqual(druzhokBox?.visiblePhysicalBodyCount, 2);
  primary.assertExhausted();
}

async function testPhysicalBodyAuditIgnoresReflectionProviderFalsePositive() {
  const primary = new MockTextProvider()
    .queueStructured(
      'image_validation_segmented_scene_qa',
      segmentedLayoutResultWithDruzhokReflection()
    )
    .queueStructured('image_validation_segmented_character_identity', validSegmentedLeraResult())
    .queueStructured(
      'image_validation_segmented_character_identity',
      validSegmentedDruzhokResult()
    );

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  const druzhok = result.characters.find((character) => character.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation should be present');
  assert.strictEqual(
    druzhok.duplicated,
    false,
    'one physical body plus its reflection must not be treated as a duplicate'
  );
  assert.strictEqual(result.characterCount, 2);
  assert.deepStrictEqual(
    {
      duplicated: druzhok.characterBoundingBox?.duplicated,
      duplicateCount: druzhok.characterBoundingBox?.duplicateCount,
      visiblePhysicalBodyCount: druzhok.characterBoundingBox?.visiblePhysicalBodyCount,
      visibleReflectionCount: druzhok.characterBoundingBox?.visibleReflectionCount,
    },
    {
      duplicated: false,
      duplicateCount: 1,
      visiblePhysicalBodyCount: 1,
      visibleReflectionCount: 1,
    }
  );
  primary.assertExhausted();
}

async function testCharacterCropCanRecoverMissedPhysicalDuplicate() {
  const primary = new MockTextProvider()
    .queueStructured(
      'image_validation_segmented_scene_qa',
      segmentedDruzhokOnlyLayoutResult()
    )
    .queueStructured(
      'image_validation_segmented_character_identity',
      validSegmentedDruzhokResult(true)
    );

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...druzhokOnlyValidationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  const druzhok = result.characters.find((character) => character.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation should be present');
  assert.strictEqual(
    druzhok.duplicated,
    true,
    'crop identity pass must be allowed to recover a physical duplicate missed by scene QA'
  );
  assert.strictEqual(result.characterCount, 2);
  assert.strictEqual(druzhok.characterBoundingBox?.visiblePhysicalBodyCount, 2);
  assert.strictEqual(druzhok.characterBoundingBox?.duplicateCount, 2);
  assert.strictEqual(druzhok.characterBoundingBox?.duplicated, true);
  assert.match(druzhok.issue ?? '', /Two separate physical bodies/);
  primary.assertExhausted();
}

async function testCharacterAnatomyArtifactOverridesMatchingIdentityAnchors() {
  const primary = new MockTextProvider()
    .queueStructured(
      'image_validation_segmented_scene_qa',
      segmentedDruzhokOnlyLayoutResult()
    )
    .queueStructured(
      'image_validation_segmented_character_identity',
      malformedSegmentedDruzhokResult()
    );

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...druzhokOnlyValidationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  const druzhok = result.characters.find((character) => character.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation should be present');
  assert.strictEqual(druzhok.recognizableScore, 1, 'identity may still be recognizable');
  assert.strictEqual(druzhok.sameOverallDesignRead, true, 'identity anchors may still match');
  assert.strictEqual(druzhok.anatomyArtifactSeverity, 'severe');
  assert.match(druzhok.anatomyArtifactNotes ?? '', /Human hands replace/);
  assert.match(druzhok.issue ?? '', /Human hands replace/);
  assert.strictEqual(
    result.hasRenderingArtifacts,
    true,
    'moderate/severe crop anatomy defects must propagate to the scene verdict'
  );
  assert.match(result.overallFeedback, /Human hands replace/);
  primary.assertExhausted();
}

async function testSceneQaMissingCharacterSkipsCropValidation() {
  const leraResponse = segmentedCharacterResult({
    name: 'Lera',
    characterKind: 'human',
    found: true,
    duplicated: false,
    recognizableScore: 1,
    faceMatchesReference: true,
    hairMatchesReference: true,
    ageReadMatchesReference: true,
    proportionsMatchReference: true,
    matchesColors: true,
    matchesOutfit: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    identityComparisonSummary: 'Matches the reference child.',
    issue: null as unknown as string | undefined,
  });
  const primary = new MockTextProvider()
    .queueStructured(
      'image_validation_segmented_scene_qa',
      segmentedLayoutResultWithDruzhokNotVisible()
    )
    .queueStructured('image_validation_segmented_character_identity', leraResponse);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(primary.structuredRequests.length, 2);
  assert.ok(
    primary.structuredRequests.some((call) => call.prompt.includes('EXPECTED CHARACTER: "Lera"')),
    'visible character crop should be validated'
  );
  assert.ok(
    !primary.structuredRequests.some((call) =>
      call.prompt.includes('EXPECTED CHARACTER: "Druzhok"')
    ),
    'not-visible character should not run a crop validator'
  );
  const druzhok = result.characters.find((character) => character.name === 'Druzhok');
  assert.ok(druzhok, 'Druzhok validation should be present');
  assert.strictEqual(druzhok.found, false);
  assert.strictEqual(druzhok.characterCropRect, null);
  assert.match(druzhok.issue ?? '', /scene_qa_marked_not_visible/);
  assert.deepStrictEqual(result.missingExpectedCharacters, ['Druzhok']);

  const manifest = result.requestManifest as {
    characterCrops: Array<{
      characterName: string;
      status: string;
      normalizedBox?: Record<string, unknown>;
      cropRect?: Record<string, unknown>;
      cropMimeType?: string;
      inlineBase64Chars?: number;
    }>;
  };
  const leraCrop = manifest.characterCrops.find((crop) => crop.characterName === 'Lera');
  assert.ok(leraCrop, 'Lera crop manifest should exist');
  assert.strictEqual(leraCrop.status, 'cropped');
  assert.deepStrictEqual(leraCrop.normalizedBox, {
    name: 'Lera',
    found: true,
    xMin: 0,
    yMin: 0,
    xMax: 1000,
    yMax: 1000,
    confidence: 100,
    visibility: 'full_body',
    duplicated: false,
    duplicateCount: 1,
    visiblePhysicalBodyCount: 1,
    visibleReflectionCount: 0,
    visibleDepictionCount: 0,
    duplicateNotes: null,
    notes: 'Lera occupies the tiny mock image.',
  });
  assert.deepStrictEqual(leraCrop.cropRect, { left: 0, top: 0, width: 1, height: 1 });
  assert.strictEqual(leraCrop.cropMimeType, 'image/png');
  assert.ok((leraCrop.inlineBase64Chars ?? 0) > 0);

  const druzhokCrop = manifest.characterCrops.find((crop) => crop.characterName === 'Druzhok');
  assert.ok(druzhokCrop, 'Druzhok missing manifest should exist');
  assert.deepStrictEqual(druzhokCrop, {
    characterName: 'Druzhok',
    status: 'scene_qa_marked_not_visible',
    normalizedBox: {
      name: 'Druzhok',
      found: false,
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
      confidence: 0,
      visibility: 'not_visible',
      duplicated: false,
      duplicateCount: 0,
      visiblePhysicalBodyCount: 0,
      visibleReflectionCount: 0,
      visibleDepictionCount: 0,
      duplicateNotes: null,
      notes: 'No visible Druzhok candidate exists in the image.',
    },
  });
  primary.assertExhausted();
}

async function testSegmentedValidationUsesDressedReferenceAsWardrobeGroundTruth() {
  const leraResponse = segmentedCharacterResult({
    name: 'Lera',
    characterKind: 'human',
    found: true,
    duplicated: false,
    recognizableScore: 1,
    faceMatchesReference: true,
    hairMatchesReference: true,
    ageReadMatchesReference: true,
    proportionsMatchReference: true,
    matchesColors: true,
    matchesOutfit: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    identityComparisonSummary: 'Matches the dressed character reference.',
    issue: null as unknown as string | undefined,
  });
  const primary = new MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', segmentedLayoutResult())
    .queueStructured('image_validation_segmented_character_identity', leraResponse);

  const result = await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      expectedCharacters: [{ ...validationInput.expectedCharacters[0], validateOutfit: true }],
      includeLayoutChecks: false,
      includeBubbleChecks: false,
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'dressed_turnaround',
        },
      ],
    },
    { visionModel: 'gemini-test' }
  );

  assert.strictEqual(primary.structuredRequests.length, 2);
  const leraCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Lera"')
  );
  assert.ok(leraCall, 'Lera character pass should run');
  assert.strictEqual(leraCall.imageData?.length, 2);
  assert.match(leraCall.prompt, /Image 2 is this character dressed turnaround reference/);
  assert.doesNotMatch(leraCall.prompt, /outfit plate/i);
  assert.doesNotMatch(leraCall.prompt, /DESCRIPTION:/);
  assert.doesNotMatch(leraCall.prompt, /Young girl beside the starry chest/);
  assert.match(leraCall.prompt, /Compare Image 1 against Image 2 only/);
  assert.match(leraCall.prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  assert.match(leraCall.prompt, /one hand pressed on the chest lid/);
  assert.match(leraCall.prompt, /held\/carried props/);
  assert.match(leraCall.prompt, /Set matchesOutfit=true/);
  assert.match(leraCall.prompt, /evaluate outfit against Image 2 only/);
  assert.deepStrictEqual(
    leraCall.inputParts?.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );
  assert.match(
    leraCall.inputParts?.[0]?.type === 'text' ? leraCall.inputParts[0].text : '',
    /Image 1: GENERATED CHARACTER CROP/
  );
  assert.match(
    leraCall.inputParts?.[2]?.type === 'text' ? leraCall.inputParts[2].text : '',
    /DRESSED TURNAROUND reference for "Lera"/
  );
  assert.match(
    leraCall.inputParts?.[4]?.type === 'text' ? leraCall.inputParts[4].text : '',
    /EXPECTED CHARACTER: "Lera"/
  );

  const manifest = result.requestManifest as {
    imageOrder: string[];
    passes: Array<{
      passKind: string;
      imageOrder: Array<{ imageIndex: number; instructionText: string }>;
      input: Array<{ type: string; text?: string }>;
    }>;
  };
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_dressed_turnaround_Lera',
  ]);
  const leraPass = manifest.passes.find((pass) => pass.passKind === 'character_identity');
  assert.ok(leraPass, 'Lera character pass should be recorded');
  assert.deepStrictEqual(
    leraPass.imageOrder.map((image) => image.imageIndex),
    [1, 2]
  );
  assert.match(leraPass.imageOrder[1].instructionText, /DRESSED TURNAROUND reference for "Lera"/);
  assert.deepStrictEqual(
    leraPass.input.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );
  assert.strictEqual(result.characters[0].matchesOutfit, true);
  primary.assertExhausted();
}

async function testSegmentedCharacterWithoutReferenceKeepsDescriptionFallback() {
  const leraResponse = segmentedCharacterResult({
    name: 'Lera',
    characterKind: 'human',
    found: false,
    duplicated: false,
    recognizableScore: 0.1,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: null,
    matchesColors: false,
    matchesOutfit: true,
    sameOverallDesignRead: null,
    silhouetteDriftSeverity: null,
    actualVisibleDescription: null,
    identityComparisonSummary: 'No matching child candidate is visible.',
    issue: 'missing',
  });
  const druzhokResponse = segmentedCharacterResult({
    name: 'Druzhok',
    characterKind: 'imaginary',
    found: false,
    duplicated: false,
    recognizableScore: 0.1,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: null,
    matchesColors: false,
    matchesOutfit: true,
    sameOverallDesignRead: null,
    silhouetteDriftSeverity: null,
    actualVisibleDescription: null,
    identityComparisonSummary: 'No matching creature candidate is visible.',
    issue: 'missing',
  });
  const primary = new MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', segmentedLayoutResult())
    .queueStructured('image_validation_segmented_character_identity', leraResponse)
    .queueStructured('image_validation_segmented_character_identity', druzhokResponse);

  await runSegmentedProductImageValidation(
    primary,
    {
      ...validationInput,
      includeLayoutChecks: false,
      includeBubbleChecks: false,
      referenceImages: [],
    },
    { visionModel: 'gemini-test' }
  );

  const leraCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Lera"')
  );
  const druzhokCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Druzhok"')
  );
  assert.ok(leraCall, 'Lera character pass should run without reference');
  assert.ok(druzhokCall, 'Druzhok character pass should run without reference');
  assert.match(leraCall.prompt, /No identity reference is attached/);
  assert.match(leraCall.prompt, /validate exactly ONE expected HUMAN character/);
  assert.match(leraCall.prompt, /DESCRIPTION: Young girl beside the starry chest\./);
  assert.match(druzhokCall.prompt, /No identity reference is attached/);
  assert.match(druzhokCall.prompt, /validate exactly ONE expected IMAGINARY CREATURE character/);
  assert.match(
    druzhokCall.prompt,
    /DESCRIPTION: Small robo-dog with a light on the chest or forehead area\./
  );
  assert.doesNotMatch(druzhokCall.prompt, /Human face visibility rule/);
  assert.strictEqual(leraCall.imageData?.length, 1);
  primary.assertExhausted();
}

async function testGraphicNovelSinglePanelValidationUsesSegmentedSceneValidator() {
  const sceneQaResponse = {
    missingExpectedCharacters: [],
    characterBoundingBoxes: [
      {
        name: 'Lera',
        found: true,
        xMin: 0,
        yMin: 0,
        xMax: 1000,
        yMax: 1000,
        confidence: 100,
        visibility: 'full_body',
        notes: 'Lera occupies the tiny mock panel.',
      },
    ],
    hasUnexpectedCharacters: false,
    unexpectedCharacterNotes: null,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    overallFeedback: 'Single panel scene QA passed.',
  };
  const leraResponse = segmentedCharacterResult({
    name: 'Lera',
    characterKind: 'human',
    found: false,
    duplicated: false,
    recognizableScore: 0.1,
    faceMatchesReference: false,
    hairMatchesReference: false,
    ageReadMatchesReference: false,
    proportionsMatchReference: false,
    matchesColors: false,
    matchesOutfit: true,
    sameOverallDesignRead: false,
    silhouetteDriftSeverity: 'severe',
    actualVisibleDescription: 'different child in the panel',
    identityComparisonSummary: 'The expected child is not visible in this panel.',
    issue: 'character missing from panel',
  });
  const primary = new MockTextProvider()
    .queueStructured('test_graphic_novel_panel_validation_scene_qa', sceneQaResponse)
    .queueStructured('test_graphic_novel_panel_validation_character_identity', leraResponse);

  const result = await runGraphicNovelPanelImageValidation(
    primary,
    {
      imageData: TINY_PNG,
      mimeType: 'image/png',
      pageNumber: 1,
      pageCharacters: validationInput.expectedCharacters,
      panels: [
        {
          panelNumber: 1,
          panelId: 'p1-1',
          expectedVisualFocus: 'Lera opens the starry chest.',
          expectedSetting: 'Quiet attic room.',
          expectedCharacters: [validationInput.expectedCharacters[0]],
        },
      ],
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
      ],
    },
    {
      visionModel: 'gemini-test',
      operation: 'test_graphic_novel_panel_validation',
      recordModeration: false,
    }
  );

  assert.strictEqual(result.validationStatus, 'completed');
  assert.strictEqual(result.validationAttemptKind, 'segmented_parallel');
  assert.strictEqual(result.validationModelUsed, 'gemini-test');
  assert.strictEqual(result.expectedPanelCount, 1);
  assert.strictEqual(result.detectedPanelCount, 1);
  assert.strictEqual(result.panels.length, 1);
  assert.strictEqual(result.panels[0].panelId, 'p1-1');
  assert.strictEqual(result.panels[0].characters[0].name, 'Lera');
  assert.strictEqual(result.panels[0].characters[0].found, false);
  assert.match(result.panels[0].panelIssue ?? '', /character missing from panel/);

  assert.strictEqual(primary.structuredRequests.length, 2);
  const sceneQaCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('validate expected cast and global image quality')
  );
  const characterCall = primary.structuredRequests.find((call) =>
    call.prompt.includes('EXPECTED CHARACTER: "Lera"')
  );
  assert.ok(sceneQaCall, 'scene QA pass should run');
  assert.ok(characterCall, 'character identity pass should run');
  assert.strictEqual(sceneQaCall.operation, 'test_graphic_novel_panel_validation_scene_qa');
  assert.strictEqual(
    characterCall.operation,
    'test_graphic_novel_panel_validation_character_identity'
  );
  assert.doesNotMatch(sceneQaCall.prompt, /panel-by-panel in a single response/);
  assert.doesNotMatch(sceneQaCall.prompt, /PAGE CHARACTER ROSTER/);
  assert.doesNotMatch(characterCall.prompt, /Panel 1 \[p1-1\]/);
  assert.ok(!(sceneQaCall.schema.required || []).includes('panels'));
  assert.ok((sceneQaCall.schema.required || []).includes('missingExpectedCharacters'));
  assert.strictEqual(sceneQaCall.imageData?.length, 1);
  assert.strictEqual(characterCall.imageData?.length, 2);
  assert.match(characterCall.imageData?.[0]?.instructionText ?? '', /GENERATED CHARACTER CROP/);
  assert.match(characterCall.imageData?.[1]?.instructionText ?? '', /IDENTITY TURNAROUND/);
  assert.doesNotMatch(characterCall.prompt, /DESCRIPTION:/);
  assert.doesNotMatch(characterCall.prompt, /Young girl beside the starry chest/);
  assert.match(characterCall.prompt, /validate exactly ONE expected HUMAN character/);
  assert.match(characterCall.prompt, /Compare Image 1 against Image 2 only/);
  assert.match(characterCall.prompt, /Human face visibility rule/);
  assert.match(characterCall.prompt, /faceMatchesReference=null/);
  assert.match(characterCall.prompt, /SCENE-SPECIFIC POSE\/PROP CONTEXT/);
  assert.match(characterCall.prompt, /Scene prop handling/);
  assert.deepStrictEqual(
    characterCall.inputParts?.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );

  const manifest = result.requestManifest as {
    mode: string;
    includeWardrobeChecks: boolean;
    imageOrder: string[];
    references: Array<{ characterName: string; imageIndex: number }>;
    passes: Array<{ passKind: string; input: Array<{ type: string }> }>;
    graphicNovelPanelAdapter: {
      mode: string;
      pageNumber: number;
      panelNumber: number;
      panelId: string;
    };
  };
  assert.strictEqual(manifest.mode, 'segmented_parallel_scene_qa_plus_character_identity');
  assert.strictEqual(manifest.includeWardrobeChecks, true);
  assert.deepStrictEqual(manifest.imageOrder, [
    '1_generated_illustration',
    '2_identity_turnaround_Lera',
  ]);
  assert.deepStrictEqual(
    manifest.references.map((ref) => [ref.characterName, ref.imageIndex]),
    [['Lera', 2]]
  );
  assert.deepStrictEqual(
    manifest.passes.map((pass) => pass.passKind),
    ['scene_qa', 'character_identity']
  );
  assert.deepStrictEqual(
    manifest.passes[1].input.map((part) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );
  assert.deepStrictEqual(manifest.graphicNovelPanelAdapter, {
    mode: 'single_panel_segmented',
    pageNumber: 1,
    panelNumber: 1,
    panelId: 'p1-1',
  });
  primary.assertExhausted();
}

async function testGraphicNovelMultiPanelPromptUsesTurnaroundInsteadOfDescription() {
  const primary = new MockTextProvider().queueStructured(
    'test_graphic_novel_panel_validation_comic_panels',
    {
      pageNumber: 1,
      expectedPanelCount: 2,
      detectedPanelCount: 2,
      hasExtraPanelStructure: false,
      hasTextOrLetters: false,
      hasRenderingArtifacts: false,
      layoutFeedback: 'Two visible panels match the expected page plan.',
      panels: [
        {
          ...validGraphicNovelPanelResult().panels[0],
          panelNumber: 1,
          panelId: 'p1-1',
        },
        {
          ...validGraphicNovelPanelResult().panels[0],
          panelNumber: 2,
          panelId: 'p1-2',
        },
      ],
      overallFeedback: 'Panel validation completed.',
    }
  );

  const result = await runGraphicNovelPanelImageValidation(
    primary,
    {
      imageData: TINY_PNG,
      mimeType: 'image/png',
      pageNumber: 1,
      pageCharacters: validationInput.expectedCharacters,
      panels: [
        {
          panelNumber: 1,
          panelId: 'p1-1',
          expectedVisualFocus: 'Lera opens the starry chest.',
          expectedSetting: 'Quiet attic room.',
          expectedCharacters: [validationInput.expectedCharacters[0]],
        },
        {
          panelNumber: 2,
          panelId: 'p1-2',
          expectedVisualFocus: 'Druzhok guards the chest.',
          expectedSetting: 'Quiet attic room.',
          expectedCharacters: [validationInput.expectedCharacters[1]],
        },
      ],
      referenceImages: [
        {
          characterName: 'Lera',
          imageData: TINY_PNG.toString('base64'),
          mimeType: 'image/png',
          referenceKind: 'identity',
          identitySource: 'turnaround',
        },
      ],
    },
    {
      visionModel: 'gemini-test',
      operation: 'test_graphic_novel_panel_validation',
      recordModeration: false,
    }
  );

  assert.strictEqual(primary.structuredRequests.length, 1);
  assert.match(
    primary.structuredRequests[0].prompt,
    /Image 2: turnaround identity reference for "Lera"/
  );
  assert.match(primary.structuredRequests[0].prompt, /- Lera \(human; reference=Image 2\)/);
  if (shouldCheckImageReferenceLabels()) {
    assert.match(primary.structuredRequests[0].prompt, /Ordinary visible story-world text is allowed/);
    assert.match(primary.structuredRequests[0].prompt, /including REF_CH_, REF_ENV_, or REF_OBJ_/);
  } else {
    assert.match(primary.structuredRequests[0].prompt, /Always set hasTextOrLetters=false/);
    assert.doesNotMatch(primary.structuredRequests[0].prompt, /Explicitly scan for REF_\*/);
  }
  assert.doesNotMatch(primary.structuredRequests[0].prompt, /Lera \(human; description=/);
  assert.doesNotMatch(primary.structuredRequests[0].prompt, /Young girl beside the starry chest/);
  assert.match(
    primary.structuredRequests[0].prompt,
    /Druzhok \(imaginary; description=Small robo-dog with a light on the chest or forehead area\./
  );

  const manifest = result.requestManifest as { prompt: string; mode: string };
  assert.strictEqual(manifest.mode, 'single_request_panel_array');
  assert.doesNotMatch(manifest.prompt, /Young girl beside the starry chest/);
  assert.match(manifest.prompt, /Lera \(human; reference=Image 2/);
  primary.assertExhausted();
}

async function main() {
  await testFallbackAfterPrimaryBlocked();
  await testDisabledTextCheckNormalizesProviderVerdictToFalse();
  await testAllBlockedReturnsProviderBlocked();
  await testLayoutChecksSchemaAndPromptAreFlagged();
  await testLayoutTemplateReferenceIsIgnoredForValidation();
  await testUnreferencedCharacterKeepsDescriptionAndClearsReferenceFields();
  await testTurnaroundReferenceIsTracedInPromptAndManifest();
  await testSegmentedValidationRunsLayoutAndPerCharacterPasses();
  await testSegmentedValidationIgnoresLegacyNonStringStagingDescription();
  await testSegmentedValidationNormalizesRosterToUniqueSceneVisualCharacters();
  await testSceneQaDuplicateEvidenceOverridesSingleCropResult();
  await testPhysicalBodyAuditIgnoresReflectionProviderFalsePositive();
  await testCharacterCropCanRecoverMissedPhysicalDuplicate();
  await testCharacterAnatomyArtifactOverridesMatchingIdentityAnchors();
  await testSceneQaMissingCharacterSkipsCropValidation();
  await testSegmentedValidationUsesDressedReferenceAsWardrobeGroundTruth();
  await testSegmentedCharacterWithoutReferenceKeepsDescriptionFallback();
  await testGraphicNovelSinglePanelValidationUsesSegmentedSceneValidator();
  await testGraphicNovelMultiPanelPromptUsesTurnaroundInsteadOfDescription();
  console.log('imageValidationRun tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
