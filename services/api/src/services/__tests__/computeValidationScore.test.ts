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
import {
  computeValidationScore,
  evaluateGeneratedImageSafety,
  hasBlockingImageValidationIssue,
  hasBlockingSceneCompositionMismatch,
  hasBlockingUnwantedImageText,
} from '../storyOrchestrationService';
import { config } from '../../config';

type ScoringOverride = typeof config.image.validationScoring;

const baseScoring: ScoringOverride = {
  recognizablePenalty: 20,
  missingCharacterPenalty: 32,
  duplicatedPenalty: 15,
  matchesColorsPenalty: 10,
  matchesOutfitPenalty: 20,
  characterCountMismatchPenalty: 16,
  characterCountMismatchMaxPenalty: 35,
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

function testUnwantedTextIsBlockingEvenWhenScoreWouldPass() {
  const result = makeResult({}, { hasTextOrLetters: true });
  const score = computeValidationScore(result, { scoringOverride: baseScoring });

  assert.strictEqual(score, 95, 'Text keeps its configured score penalty');
  assert.strictEqual(
    hasBlockingUnwantedImageText(result),
    true,
    'Visible text/reference labels must force repair even above the normal acceptance threshold'
  );
}

function testSceneCompositionMismatchIsBlockingEvenWhenScoreWouldPass() {
  const result = makeResult({}, { hasSceneCompositionMismatch: true });
  const score = computeValidationScore(result, { scoringOverride: baseScoring });

  assert.strictEqual(score, 90, 'Composition mismatch keeps its configured score penalty');
  assert.strictEqual(
    hasBlockingSceneCompositionMismatch(result),
    true,
    'A duplicate scene anchor must force repair even above the normal acceptance threshold'
  );
  assert.strictEqual(
    hasBlockingImageValidationIssue(result),
    true,
    'Unified hard-blocker must include scene composition mismatches'
  );
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

function testHumanHairDriftTriggersRepairBelowDefaultThreshold() {
  const score = computeValidationScore(
    makeResult({
      recognizableScore: 0.9,
      hairMatchesReference: false,
      issue: 'single thick braid instead of reference braided crown',
    }),
    {
      expectedCharacters: [{ name: 'Emma', characterKind: 'human' }],
      referenceNamesNormalized: new Set(['emma']),
      validationReferenceImages: [{ characterName: 'Emma', mimeType: 'image/png' }],
      scoringOverride: baseScoring,
    }
  );

  assert.ok(
    score <= 85,
    `Hair drift score should not auto-accept at default threshold 85; got ${score}`
  );
}

function testValidatedOutfitMismatchTriggersRepairBelowDefaultThreshold() {
  const score = computeValidationScore(
    makeResult({
      matchesOutfit: false,
      issue: 'floral skirt and missing cross-body bag differ from the reference wardrobe',
    }),
    {
      expectedCharacters: [{ name: 'Emma', characterKind: 'human', validateOutfit: true }],
      referenceNamesNormalized: new Set(['emma']),
      validationReferenceImages: [{ characterName: 'Emma', mimeType: 'image/png' }],
      scoringOverride: baseScoring,
    }
  );

  assert.ok(
    score <= 85,
    `Validated outfit mismatch should trigger repair at default threshold 85; got ${score}`
  );
}

function testOutfitMismatchIgnoredWhenWardrobeCheckDisabled() {
  const score = computeValidationScore(
    makeResult({
      matchesOutfit: false,
      issue: 'outfit differs, but this row does not request wardrobe validation',
    }),
    {
      expectedCharacters: [{ name: 'Emma', characterKind: 'human', validateOutfit: false }],
      referenceNamesNormalized: new Set(['emma']),
      validationReferenceImages: [{ characterName: 'Emma', mimeType: 'image/png' }],
      scoringOverride: baseScoring,
    }
  );

  assert.strictEqual(score, 100, 'Outfit mismatch should not score when wardrobe check is disabled');
}

function testLayoutFailuresUseArtifactsPenalty() {
  const score = computeValidationScore(
    makeResult(
      {},
      {
        hasArtworkOutsidePanelBounds: true,
        hasArtworkOverSpeechBubbles: true,
        hasExtraPanelStructure: true,
      }
    ),
    {
      expectedCharacters: [{ name: 'Emma', characterKind: 'human' }],
      scoringOverride: baseScoring,
    }
  );
  assert.strictEqual(
    score,
    100 - baseScoring.artifactsPenalty * 3,
    'Graphic novel layout failures should use artifacts penalty'
  );
}

function testHumanWithRefOnlyWhenBothHuman() {
  // Both sides human with a reference: each false identity flag costs humanIdentityFlagPenalty=8.
  // Hair also carries a small structural extra penalty so simplified hairstyles trigger repair.
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
  assert.strictEqual(
    scoreHuman,
    100 - 4 * 8 - 6,
    'Four human identity flags plus hair structure extra penalty'
  );

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

function testReportedNonHumanDriftPenalizedWithoutScoringContext() {
  const result: ImageValidationResult = {
    characterCount: 2,
    expectedCharacterCount: 2,
    characters: [
      {
        name: 'Бінбон',
        characterKind: 'imaginary',
        found: true,
        duplicated: false,
        recognizableScore: 0.7,
        faceMatchesReference: null,
        hairMatchesReference: null,
        ageReadMatchesReference: null,
        proportionsMatchReference: false,
        matchesColors: true,
        matchesOutfit: true,
        sameOverallDesignRead: false,
        silhouetteDriftSeverity: 'moderate',
        issue: 'The character design deviates in head anatomy and body structure.',
        identityComparisonSummary:
          'Color palette matches, but the head anatomy and body structure differ.',
      },
      {
        name: 'Стрекориб',
        characterKind: 'imaginary',
        found: true,
        duplicated: false,
        recognizableScore: 0.85,
        faceMatchesReference: null,
        hairMatchesReference: null,
        ageReadMatchesReference: null,
        proportionsMatchReference: true,
        matchesColors: true,
        matchesOutfit: true,
        sameOverallDesignRead: true,
        silhouetteDriftSeverity: 'mild',
        issue: 'Missing third eye and tongue; antennae shape differs from reference.',
        identityComparisonSummary:
          'Overall species design is consistent, but visible biological anchors are missing.',
      },
    ],
    hasUnexpectedCharacters: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    overallFeedback: '',
  };

  const score = computeValidationScore(result, { scoringOverride: baseScoring });

  assert.strictEqual(
    score,
    42,
    'Reported non-human identity drift must not be ignored when admin fallback scoring lacks reference context'
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

function testMissingCharactersStillRankFailedAttempts() {
  const makeImaginary = (
    name: string,
    overrides: Partial<ImageValidationResult['characters'][0]> = {}
  ): ImageValidationResult['characters'][0] => ({
    name,
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
    identityComparisonSummary: 'matches',
    ...overrides,
  });

  const expectedCharacters = ['A', 'B', 'C', 'D', 'E'].map((name) => ({
    name,
    characterKind: 'imaginary' as const,
  }));
  const validationReferenceImages = expectedCharacters.map((character) => ({
    characterName: character.name,
    mimeType: 'image/png',
  }));
  const oneMissing: ImageValidationResult = {
    characterCount: 4,
    expectedCharacterCount: 5,
    characters: [
      makeImaginary('A'),
      makeImaginary('B'),
      makeImaginary('C'),
      makeImaginary('D', { recognizableScore: 0.95 }),
      makeImaginary('E', {
        found: false,
        recognizableScore: 0.2,
        proportionsMatchReference: false,
        matchesColors: false,
        sameOverallDesignRead: false,
        silhouetteDriftSeverity: 'severe',
      }),
    ],
    hasUnexpectedCharacters: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    overallFeedback: '',
  };
  const twoMissing: ImageValidationResult = {
    ...oneMissing,
    characterCount: 3,
    characters: oneMissing.characters.map((character) =>
      character.name === 'B'
        ? {
            ...character,
            found: false,
            recognizableScore: 0.2,
            proportionsMatchReference: false,
            matchesColors: false,
            sameOverallDesignRead: false,
            silhouetteDriftSeverity: 'moderate',
          }
        : character
    ),
  };

  const oneMissingScore = computeValidationScore(oneMissing, {
    expectedCharacters,
    validationReferenceImages,
    scoringOverride: baseScoring,
  });
  const twoMissingScore = computeValidationScore(twoMissing, {
    expectedCharacters,
    validationReferenceImages,
    scoringOverride: baseScoring,
  });

  assert.strictEqual(oneMissingScore, 51, 'One missing character should remain rankable');
  assert.strictEqual(twoMissingScore, 3, 'Two missing characters should score lower');
  assert.ok(
    oneMissingScore > twoMissingScore,
    `One missing character must rank above two missing characters (${oneMissingScore} vs ${twoMissingScore})`
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

function testGeneratedImageSafetyAllowsBestValidatedAttemptBelowThreshold() {
  assert.deepStrictEqual(
    evaluateGeneratedImageSafety({
      imageValidationEnabled: true,
      acceptedByValidationScore: false,
      finalValidationScore: 84,
      minAcceptScore: 85,
      attempts: 3,
    }),
    { allowed: true },
    'below-threshold images with a completed validation should persist the best attempt for user display'
  );
}

function testGeneratedImageSafetyBlocksUnvalidatedImages() {
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

function testGeneratedImageSafetyAllowsProviderBlockedValidation() {
  assert.deepStrictEqual(
    evaluateGeneratedImageSafety({
      imageValidationEnabled: true,
      acceptedByValidationScore: false,
      finalValidationScore: null,
      validationProviderBlocked: true,
      minAcceptScore: 85,
      attempts: 0,
    }),
    { allowed: true },
    'provider safety blocks are inconclusive QA, not a visual failure or transport outage'
  );
}

testBaselineCleanResult();
testUnwantedTextIsBlockingEvenWhenScoreWouldPass();
testSceneCompositionMismatchIsBlockingEvenWhenScoreWouldPass();
testKindMismatchUsesConfigurablePenalty();
testNoKindMismatchOnEqualKinds();
testHumanHairDriftTriggersRepairBelowDefaultThreshold();
testValidatedOutfitMismatchTriggersRepairBelowDefaultThreshold();
testOutfitMismatchIgnoredWhenWardrobeCheckDisabled();
testLayoutFailuresUseArtifactsPenalty();
testHumanWithRefOnlyWhenBothHuman();
testNonHumanWithRefAppliesEquallyToAnimalAndImaginary();
testReportedNonHumanDriftPenalizedWithoutScoringContext();
testLeniencyCoversIdentityBooleansAndSilhouette();
testHamsterRegression();
testMissingCharactersStillRankFailedAttempts();
testGeneratedImageSafetyAllowsValidatedOrDisabledImages();
testGeneratedImageSafetyAllowsBestValidatedAttemptBelowThreshold();
testGeneratedImageSafetyBlocksUnvalidatedImages();
testGeneratedImageSafetyAllowsProviderBlockedValidation();
console.log('computeValidationScore tests passed');
