/**
 * Unit tests for computeValidationScore: configurable kind-mismatch penalty, humanWithRef
 * only when both kinds are human, unified nonHumanWithRef branch, leniency coverage for
 * all identity booleans + silhouette, and the hamster regression (animal vs animal must
 * not emit a kind-mismatch penalty).
 *
 * Run: pnpm exec tsx src/services/__tests__/computeValidationScore.test.ts
 */

import assert from 'node:assert/strict';
import type { ImageValidationResult } from '../../ai/types';
import type { SceneVisual } from '../types';
import { computeValidationScore, evaluateGeneratedImageSafety } from '../storyOrchestrationService';
import { config } from '../../config';

type ScoringOverride = typeof config.image.validationScoring;

const baseScoring: ScoringOverride = {
  recognizablePenalty: 20,
  duplicatedPenalty: 15,
  matchesColorsPenalty: 10,
  matchesOutfitPenalty: 10,
  textPenalty: 5,
  unexpectedCharsPenalty: 3,
  artifactsPenalty: 10,
  humanIdentityFlagPenalty: 8,
  humanLowRecognizableThreshold: 0.75,
  humanLowRecognizableExtraPenalty: 5,
  kindMismatchPenalty: 45,
};

function makeResult(
  overrides: Partial<ImageValidationResult['characters'][0]> = {},
  top: Partial<ImageValidationResult> = {}
): ImageValidationResult {
  const character: ImageValidationResult['characters'][0] = {
    name: 'Emma',
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
    identityComparisonSummary: 'matches',
    ...overrides,
  };
  return {
    characterCount: 1,
    expectedCharacterCount: 1,
    characters: [character],
    hasUnexpectedCharacters: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    overallFeedback: '',
    ...top,
  };
}

function testBaselineCleanResult() {
  const score = computeValidationScore(makeResult(), {
    expectedCharacters: [{ name: 'Emma', characterKind: 'human' }],
    referenceNamesNormalized: new Set(['emma']),
    validationReferenceImages: [{ characterName: 'Emma', mimeType: 'image/png' }],
    scoringOverride: baseScoring,
  });
  assert.strictEqual(score, 100, 'Clean validation should score 100');
}

function testKindMismatchUsesConfigurablePenalty() {
  const customPenalty: ScoringOverride = { ...baseScoring, kindMismatchPenalty: 30 };
  const result = makeResult({ characterKind: 'human' });
  const score = computeValidationScore(result, {
    expectedCharacters: [{ name: 'Emma', characterKind: 'animal' }],
    scoringOverride: customPenalty,
  });
  // Note: when kinds disagree, humanWithRef and nonHumanWithRef branches are both skipped,
  // so only the kind-mismatch penalty fires.
  assert.strictEqual(score, 100 - 30, 'Score must reflect configured kindMismatchPenalty (30)');
}

function testNoKindMismatchOnEqualKinds() {
  const score = computeValidationScore(makeResult({ characterKind: 'human' }), {
    expectedCharacters: [{ name: 'Emma', characterKind: 'human' }],
    scoringOverride: baseScoring,
  });
  assert.strictEqual(score, 100, 'Equal kinds must not trigger kind-mismatch penalty');
}

function testHumanWithRefOnlyWhenBothHuman() {
  // Both sides human with a reference: each false identity flag costs humanIdentityFlagPenalty=8.
  const human = makeResult({
    faceMatchesReference: false,
    hairMatchesReference: false,
    ageReadMatchesReference: false,
    proportionsMatchReference: false,
  });
  const scoreHuman = computeValidationScore(human, {
    expectedCharacters: [{ name: 'Emma', characterKind: 'human' }],
    referenceNamesNormalized: new Set(['emma']),
    scoringOverride: baseScoring,
  });
  assert.strictEqual(scoreHuman, 100 - 4 * 8, 'Four human identity flags = 4 * 8 = 32');

  // Model says human, but expected is animal → kind mismatch, humanWithRef branch SKIPPED.
  const scoreKindMismatch = computeValidationScore(human, {
    expectedCharacters: [{ name: 'Emma', characterKind: 'animal' }],
    referenceNamesNormalized: new Set(['emma']),
    scoringOverride: baseScoring,
  });
  assert.strictEqual(
    scoreKindMismatch,
    100 - baseScoring.kindMismatchPenalty,
    'Kind mismatch only — no human identity double-penalty'
  );
}

function testNonHumanWithRefAppliesEquallyToAnimalAndImaginary() {
  const makeNonHuman = (kind: 'animal' | 'imaginary') =>
    makeResult({
      name: 'Rex',
      characterKind: kind,
      faceMatchesReference: null,
      hairMatchesReference: null,
      ageReadMatchesReference: null,
      proportionsMatchReference: false,
      sameOverallDesignRead: false,
      silhouetteDriftSeverity: 'severe',
    });

  const animalScore = computeValidationScore(makeNonHuman('animal'), {
    expectedCharacters: [{ name: 'Rex', characterKind: 'animal' }],
    validationReferenceImages: [{ characterName: 'Rex', mimeType: 'image/png' }],
    scoringOverride: baseScoring,
  });
  const imaginaryScore = computeValidationScore(makeNonHuman('imaginary'), {
    expectedCharacters: [{ name: 'Rex', characterKind: 'imaginary' }],
    validationReferenceImages: [{ characterName: 'Rex', mimeType: 'image/png' }],
    scoringOverride: baseScoring,
  });
  // proportions=false => humanIdentityFlagPenalty (8); sameOverallDesignRead=false => 22;
  // silhouette severe => 28. Total 58.
  assert.strictEqual(animalScore, 100 - (8 + 22 + 28), 'Animal non-human penalties (8+22+28)');
  assert.strictEqual(
    imaginaryScore,
    100 - (8 + 22 + 28),
    'Imaginary non-human penalties identical to animal'
  );
}

function testLeniencyCoversIdentityBooleansAndSilhouette() {
  // Scene brief with transient-form keywords + model reports identity drift mentioning
  // transparency. All identity booleans false + silhouette severe — leniency should
  // collapse all of it to zero extra penalty, plus matchesColors is also spared by
  // transient-form leniency.
  const sceneVisual: SceneVisual = {
    setting: 'dusk forest',
    lighting: 'moonlight',
    cameraComposition: {
      shot: 'wide transparent glowing aura',
      characters: [{ name: 'Flash', description: 'shimmering, translucent aura' }],
    },
  };
  const result = makeResult({
    name: 'Flash',
    characterKind: 'imaginary',
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: false,
    sameOverallDesignRead: false,
    silhouetteDriftSeverity: 'severe',
    matchesColors: false,
    issue: 'transparent shimmering outline differs from solid reference',
    identityComparisonSummary: 'model shows translucent glowing form',
  });
  const score = computeValidationScore(result, {
    expectedCharacters: [{ name: 'Flash', characterKind: 'imaginary' }],
    validationReferenceImages: [{ characterName: 'Flash', mimeType: 'image/png' }],
    sceneVisual,
    scoringOverride: baseScoring,
  });
  assert.strictEqual(
    score,
    100,
    'Transient-form leniency must suppress identity + silhouette + color penalties'
  );
}

function testHamsterRegression() {
  // Core scenario from the bug: expected=animal, model responds animal. There MUST be
  // no characterKind penalty, and the human identity slots (face/hair/age) sitting as
  // null must NOT be counted as "false flags" against the hamster.
  const hamster = makeResult({
    name: "КРИХІТНИЙ ХОМ'ЯЧОК",
    characterKind: 'animal',
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
  });
  const score = computeValidationScore(hamster, {
    expectedCharacters: [{ name: "КРИХІТНИЙ ХОМ'ЯЧОК", characterKind: 'animal' }],
    validationReferenceImages: [{ characterName: "КРИХІТНИЙ ХОМ'ЯЧОК", mimeType: 'image/png' }],
    scoringOverride: baseScoring,
  });
  assert.strictEqual(
    score,
    100,
    'Animal vs animal with clean identity must score 100 — no kind-mismatch, no human-identity flags'
  );
}

function testGeneratedImageSafetyAllowsValidatedOrDisabledImages() {
  assert.deepStrictEqual(
    evaluateGeneratedImageSafety({
      imageValidationEnabled: false,
      acceptedByValidationScore: false,
      finalValidationScore: null,
      minAcceptScore: 85,
      attempts: 0,
    }),
    { allowed: true },
    'validation-disabled environments may persist images without a validation score'
  );

  assert.deepStrictEqual(
    evaluateGeneratedImageSafety({
      imageValidationEnabled: true,
      acceptedByValidationScore: true,
      finalValidationScore: 92,
      minAcceptScore: 85,
      attempts: 1,
    }),
    { allowed: true },
    'images accepted by validation score may be persisted'
  );
}

function testGeneratedImageSafetyBlocksFailedOrUnvalidatedImages() {
  assert.deepStrictEqual(
    evaluateGeneratedImageSafety({
      imageValidationEnabled: true,
      acceptedByValidationScore: false,
      finalValidationScore: 84,
      minAcceptScore: 85,
      attempts: 3,
    }),
    {
      allowed: false,
      code: 'IMAGE_VALIDATION_FAILED',
      message: 'Image validation failed after 3 attempt(s). The generated image was not saved.',
      details: { attempts: 3, minAcceptScore: 85, score: 84 },
    },
    'images at or below the threshold must not be persisted as completed assets'
  );

  assert.deepStrictEqual(
    evaluateGeneratedImageSafety({
      imageValidationEnabled: true,
      acceptedByValidationScore: false,
      finalValidationScore: null,
      minAcceptScore: 85,
      attempts: 0,
    }),
    {
      allowed: false,
      code: 'IMAGE_VALIDATION_NOT_COMPLETED',
      message: 'Image validation did not complete. The generated image was not saved.',
      details: { attempts: 0, minAcceptScore: 85, score: null },
    },
    'validation transport failures must fail closed before asset upload'
  );
}

testBaselineCleanResult();
testKindMismatchUsesConfigurablePenalty();
testNoKindMismatchOnEqualKinds();
testHumanWithRefOnlyWhenBothHuman();
testNonHumanWithRefAppliesEquallyToAnimalAndImaginary();
testLeniencyCoversIdentityBooleansAndSilhouette();
testHamsterRegression();
testGeneratedImageSafetyAllowsValidatedOrDisabledImages();
testGeneratedImageSafetyBlocksFailedOrUnvalidatedImages();
console.log('computeValidationScore tests passed');
