/**
 * Live regression for duplicate/reflection/anatomy classification.
 *
 * Seedream is NOT called here. The original clean image and deliberately broken
 * Seedream Lite image are checked-in golden fixtures, so every run validates
 * the exact same pixels and covers both false positives and false negatives.
 *
 * Run from the repository root:
 *   RUN_IMAGE_VALIDATION_GOLDEN=1 ALLOW_PAID_AI_TESTS=1 \
 *     pnpm test -- --include-integration --pattern imageValidationGolden
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import '../../../scripts/loadEnvForScripts';
import type { ImageValidationResult } from '../../../ai/types';
import config from '../../../config';
import { hasBlockingCharacterAnatomyArtifact } from '../../../services/storyOrchestrationService';

type GoldenExpectation = {
  mimeType: string;
  expected: {
    visiblePhysicalBodyCount: number;
    minimumVisibleReflectionCount: number;
    duplicated: boolean;
    anatomyArtifactSeverity: Array<'none' | 'mild' | 'moderate' | 'severe'>;
    hasRenderingArtifacts: boolean;
    hasBlockingCharacterAnatomyArtifact: boolean;
    hasSceneCompositionMismatch: boolean;
  };
};

const FIXTURE_NAMES = [
  'reflection-clean.original.png',
  'duplicate-reflection-anatomy.seedream-lite.jpg',
] as const;

function selectedFixtureNames(): ReadonlyArray<(typeof FIXTURE_NAMES)[number]> {
  const selectedCase = process.env.IMAGE_VALIDATION_GOLDEN_CASE?.trim().toLowerCase() || 'all';
  if (selectedCase === 'all') return FIXTURE_NAMES;
  if (selectedCase === 'clean') return [FIXTURE_NAMES[0]];
  if (selectedCase === 'broken') return [FIXTURE_NAMES[1]];
  throw new Error(
    `Unknown IMAGE_VALIDATION_GOLDEN_CASE=${selectedCase}; expected clean, broken, or all`
  );
}

function assertGoldenVerdict(
  fixtureName: string,
  validation: ImageValidationResult,
  golden: GoldenExpectation
): void {
  const label = `[${fixtureName}]`;
  const fairy = validation.characters.find(
    (character) => character.name.trim().toLowerCase() === 'blue fairy'
  );
  assert.ok(fairy, `${label} validator must return the expected Blue fairy row`);
  assert.equal(fairy.found, true, `${label} the physical Blue fairy must be found`);
  assert.equal(
    fairy.characterBoundingBox?.visiblePhysicalBodyCount,
    golden.expected.visiblePhysicalBodyCount,
    `${label} physical bodies must be counted independently from optical reflections`
  );
  assert.equal(
    fairy.characterBoundingBox?.duplicateCount,
    golden.expected.visiblePhysicalBodyCount,
    `${label} duplicateCount must include physical bodies only`
  );
  assert.equal(
    fairy.duplicated,
    golden.expected.duplicated,
    `${label} duplicated must match the physical-body count`
  );
  assert.ok(
    (fairy.characterBoundingBox?.visibleReflectionCount ?? 0) >=
      golden.expected.minimumVisibleReflectionCount,
    `${label} the upside-down fairy on the ice must be classified as a reflection`
  );
  assert.ok(
    fairy.anatomyArtifactSeverity &&
      golden.expected.anatomyArtifactSeverity.includes(fairy.anatomyArtifactSeverity),
    `${label} unexpected anatomy severity ${fairy.anatomyArtifactSeverity ?? 'unset'}`
  );
  assert.equal(
    validation.hasRenderingArtifacts,
    golden.expected.hasRenderingArtifacts,
    `${label} global rendering-artifact verdict must match the fixture expectation`
  );
  assert.equal(
    hasBlockingCharacterAnatomyArtifact(validation),
    golden.expected.hasBlockingCharacterAnatomyArtifact,
    `${label} story-pipeline blocking verdict must match the fixture expectation`
  );
  assert.equal(
    validation.hasSceneCompositionMismatch,
    golden.expected.hasSceneCompositionMismatch,
    `${label} scene-composition verdict must match the fixture expectation`
  );
  assert.equal(
    validation.characterCount,
    golden.expected.visiblePhysicalBodyCount,
    `${label} characterCount must exclude reflections`
  );
}

async function validateFixture(
  fixtureName: (typeof FIXTURE_NAMES)[number]
): Promise<ImageValidationResult> {
  const fixturePath = path.join(__dirname, 'fixtures', fixtureName);
  const [imageData, goldenRaw] = await Promise.all([
    fs.readFile(fixturePath),
    fs.readFile(`${fixturePath}.json`, 'utf8'),
  ]);
  const golden = JSON.parse(goldenRaw) as GoldenExpectation;
  const { getImageDomainService } = await import('../../../services/aiService');

  const validation = await getImageDomainService().validateGeneratedImageSegmented({
    imageData,
    mimeType: golden.mimeType,
    expectedCharacters: [
      {
        name: 'Blue fairy',
        characterKind: 'imaginary',
        speciesSubtype: 'small blue winged fairy',
        description:
          'Exactly one physical small luminous blue fairy is intended. It has one round head, two antennae, exactly two coherent arms, exactly two coherent legs, and one pair of translucent wings.',
      },
    ],
    sceneVisual: {
      setting:
        'A watercolor icy landscape with a highly reflective ice surface. Exactly one physical blue fairy is intended above the ice; its upside-down optical reflection may be visible on the ice.',
      cameraComposition: {
        shot: 'Wide storybook illustration showing the fairy, the girl, and the reflective ice.',
        characters: [
          {
            name: 'Blue fairy',
            description:
              'One physical blue fairy floats above the ice at the left. A matching upside-down optical reflection may appear below it inside the reflective ice surface.',
          },
        ],
      },
      lighting: 'Soft cool daylight with watercolor texture.',
    },
    includeLayoutChecks: false,
    includeBubbleChecks: false,
    includeWardrobeChecks: false,
    logContext: {
      storyId: `image-validation-golden-${fixtureName}`,
      sceneId: 1,
      attempt: 1,
    },
  });

  assertGoldenVerdict(fixtureName, validation, golden);
  return validation;
}

async function run(): Promise<void> {
  if (process.env.RUN_IMAGE_VALIDATION_GOLDEN !== '1') {
    console.log(
      'imageValidationGolden.integration skipped; set RUN_IMAGE_VALIDATION_GOLDEN=1 to run it'
    );
    return;
  }
  assert.equal(
    process.env.ALLOW_PAID_AI_TESTS,
    '1',
    'live validation is cost-bearing; set ALLOW_PAID_AI_TESTS=1 explicitly'
  );
  assert.equal(
    config.image.enableValidation,
    true,
    'ENABLE_IMAGE_VALIDATION=true is required for the production validation path'
  );
  assert.ok(
    config.ai.geminiApiKey?.trim() || config.ai.openaiApiKey?.trim(),
    'a configured validation-provider API key is required'
  );

  for (const fixtureName of selectedFixtureNames()) {
    const validation = await validateFixture(fixtureName);
    const fairy = validation.characters.find(
      (character) => character.name.trim().toLowerCase() === 'blue fairy'
    );
    console.log('imageValidationGolden fixture passed', {
      fixtureName,
      validationStatus: validation.validationStatus,
      visiblePhysicalBodyCount: fairy?.characterBoundingBox?.visiblePhysicalBodyCount,
      visibleReflectionCount: fairy?.characterBoundingBox?.visibleReflectionCount,
      duplicated: fairy?.duplicated,
      anatomyArtifactSeverity: fairy?.anatomyArtifactSeverity,
      hasRenderingArtifacts: validation.hasRenderingArtifacts,
      hasSceneCompositionMismatch: validation.hasSceneCompositionMismatch,
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
