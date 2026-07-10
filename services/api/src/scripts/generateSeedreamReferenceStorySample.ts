/**
 * One-off Seedream smoke run:
 * - load local env and require SIMPLE_IMAGE_PROVIDER=seedream
 * - generate a short story with named characters via StoryDomainService
 * - generate character reference images
 * - generate scene images through ImageDomainService.generateSceneWithReference
 * - validate every scene image through the production image validation pipeline
 *
 * Usage:
 *   pnpm --filter wondertales-api generate:seedream-reference-story
 *   pnpm --filter wondertales-api generate:seedream-reference-story -- --scenes=2 --out=./seedream-run
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import type { ImageValidationResult, PolicyProfile, StorySpec } from '../ai/types';
import config from '../config';
import type { GeneratedImage, ReferenceImage } from '../providers/base/IImageProvider';
import { computeValidationScore } from '../services/storyOrchestrationService';
import type { CharacterData, SceneVisual } from '../services/types';
import { logger } from '../utils/logger';

const API_ROOT = path.resolve(__dirname, '../..');

const LUNA_DESCRIPTION =
  'A seven-year-old human girl with warm brown skin, dark curly hair in two puffs, bright hazel eyes, a red raincoat, a yellow scarf, blue trousers, and a small canvas satchel.';
const MIRO_DESCRIPTION =
  'A tiny imaginary moon fox with pearl-white fur, pale blue ear tips, a crescent-shaped tail glow, soft silver paws, and large gentle violet eyes.';

type CliArgs = {
  sceneCount: number;
  outDir: string;
  allowValidationFailures: boolean;
};

type SavedImage = GeneratedImage & {
  path: string;
  base64Data: string;
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const sceneArg = argv.find((a) => a.startsWith('--scenes='));
  const outArg = argv.find((a) => a.startsWith('--out='));
  const sceneCount = Math.max(1, Math.min(6, Number(sceneArg?.slice('--scenes='.length)) || 3));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOutDir = path.join(API_ROOT, 'seedream-reference-story-output', stamp);
  const rawOut = outArg?.slice('--out='.length).trim() || defaultOutDir;

  return {
    sceneCount,
    outDir: path.isAbsolute(rawOut) ? rawOut : path.resolve(process.cwd(), rawOut),
    allowValidationFailures: argv.includes('--allow-validation-failures'),
  };
}

function ensureRunnable(): void {
  if (config.image.simpleProvider !== 'seedream') {
    throw new Error(
      `SIMPLE_IMAGE_PROVIDER must be seedream for this script. Current value: ${config.image.simpleProvider || '(empty)'}`
    );
  }
  if (!config.seedream.apiKey?.trim()) {
    throw new Error('SEEDREAM_API_KEY is required.');
  }
  if (!config.image.enableValidation) {
    throw new Error('ENABLE_IMAGE_VALIDATION must be true so every generated image is checked.');
  }
}

function extensionFor(image: GeneratedImage): 'jpg' | 'png' | 'webp' {
  if (image.format === 'png' || image.mimeType.includes('png')) return 'png';
  if (image.format === 'webp' || image.mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

function saveImage(outDir: string, name: string, image: GeneratedImage): SavedImage {
  const ext = extensionFor(image);
  const filePath = path.join(outDir, `${name}.${ext}`);
  fs.writeFileSync(filePath, image.imageData);
  return {
    ...image,
    path: filePath,
    base64Data: image.imageData.toString('base64'),
  };
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const policyProfile: PolicyProfile = {
  ageGroup: '6-8',
  language: 'ru',
  allowedConflicts: [],
  constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
  readability: {
    maxSentenceLen: 22,
    targetWordsRange: [450, 700],
    dialogRatio: 0.4,
  },
  promptGuidelines: '',
};

const characters: CharacterData[] = [
  {
    id: 'seedream_luna',
    name: 'Луна',
    type: 'child',
    role: 'main',
    description: LUNA_DESCRIPTION,
    appearance: LUNA_DESCRIPTION,
    personality: 'curious, brave, kind, attentive to friends',
    source: 'llm_generated',
  },
  {
    id: 'seedream_miro',
    name: 'Миро',
    type: 'magical_creature',
    role: 'supporting',
    description: MIRO_DESCRIPTION,
    appearance: MIRO_DESCRIPTION,
    personality: 'playful, gentle, loyal, easily amazed by small discoveries',
    source: 'llm_generated',
  },
];

const storySpec: StorySpec = {
  language: 'ru',
  ageGroup: '6-8',
  childName: 'Луна',
  characters,
  imageStyle: 'soft_watercolor',
  policyProfile,
  scenarioCard: {
    id: 'seedream_reference_story',
    name: 'Лунная тропинка',
    description:
      'Уютная сказка о девочке и маленьком лунном лисёнке, которые ищут пропавшие звёздные искры и учатся просить помощи.',
    promptGuidance:
      'История должна быть мягкой, визуальной, с понятными сценами для иллюстраций: сад, мостик, звёздная поляна. Без опасности, без злодеев, финал радостный.',
  },
  userNotes:
    'Сделай короткую сказку с тремя яркими сценами. Луна и Миро должны оставаться узнаваемыми во всех сценах.',
  worldRule: {
    name: 'Свет возвращается через заботу',
    description:
      'Волшебство усиливается, когда герои помогают друг другу и внимательно смотрят на мир вокруг.',
  },
};

function fallbackSceneVisual(sceneId: number): SceneVisual {
  const visuals: SceneVisual[] = [
    {
      setting:
        'A cozy moonlit garden beside a small house, with soft grass, glowing firefly-like star sparks, a low wooden gate, and round flowers lit by silver light.',
      lighting:
        'Gentle blue moonlight mixed with warm golden sparkles, soft shadows, bedtime-story calm.',
      cameraComposition: {
        shot: 'Wide storybook establishing shot, landscape 16:9',
        characters: [
          {
            name: 'Луна',
            description:
              'standing near the garden gate, holding her satchel strap, looking amazed at a tiny trail of star sparks',
            outfitId: 'luna_raincoat',
          },
          {
            name: 'Миро',
            description:
              'sitting on a mossy stone beside her, crescent tail glowing softly, pointing his nose toward the spark trail',
          },
        ],
      },
    },
    {
      setting:
        'A little arched bridge over a shallow silver stream, surrounded by reed lanterns, round stepping stones, and drifting star sparks.',
      lighting:
        'Cool moonlight on the water, small warm reflections from the reed lanterns, clear friendly atmosphere.',
      cameraComposition: {
        shot: 'Medium wide storybook shot from bridge height',
        characters: [
          {
            name: 'Луна',
            description:
              'kneeling on the bridge, gently lowering her scarf so a trapped star spark can climb onto it',
            outfitId: 'luna_raincoat',
          },
          {
            name: 'Миро',
            description:
              'balanced on the bridge rail, carefully lighting the path with his crescent tail, happy and focused',
          },
        ],
      },
    },
    {
      setting:
        'A round meadow under a huge friendly moon, with a small nest of restored star sparks floating above soft flowers and a winding path back home.',
      lighting:
        'Celebratory moon glow, pale blue rim light, warm star sparks around the characters, serene happy ending.',
      cameraComposition: {
        shot: 'Final wide cinematic storybook shot, landscape 16:9',
        characters: [
          {
            name: 'Луна',
            description:
              'standing with one hand raised in a small wave, smiling proudly while her satchel rests at her side',
            outfitId: 'luna_raincoat',
          },
          {
            name: 'Миро',
            description:
              'leaping lightly beside Луна, crescent tail bright but soft, looking delighted at the restored sparks',
          },
        ],
      },
    },
  ];

  return visuals[(sceneId - 1) % visuals.length];
}

function providerReferenceImages(luna: SavedImage, miro: SavedImage): ReferenceImage[] {
  return [
    {
      base64Data: luna.base64Data,
      mimeType: luna.mimeType,
      characterName: 'Луна',
      referenceKind: 'character',
      instructionText:
        'Image 1 is the identity reference for Луна. Preserve her face, hair, age, red raincoat, yellow scarf, blue trousers, and small satchel.',
    },
    {
      base64Data: miro.base64Data,
      mimeType: miro.mimeType,
      characterName: 'Миро',
      referenceKind: 'character',
      instructionText:
        'Image 2 is the identity reference for Миро. Preserve the tiny moon fox design, pearl-white fur, blue ear tips, crescent glowing tail, silver paws, and violet eyes.',
    },
  ];
}

function validationReferenceImages(luna: SavedImage, miro: SavedImage) {
  return [
    {
      characterName: 'Луна',
      imageData: luna.base64Data,
      mimeType: luna.mimeType,
      referenceKind: 'identity' as const,
    },
    {
      characterName: 'Миро',
      imageData: miro.base64Data,
      mimeType: miro.mimeType,
      referenceKind: 'identity' as const,
    },
  ];
}

function expectedCharacters() {
  return [
    {
      name: 'Луна',
      characterKind: 'human' as const,
      description: LUNA_DESCRIPTION,
      validateOutfit: true,
    },
    {
      name: 'Миро',
      characterKind: 'imaginary' as const,
      speciesSubtype: 'moon fox',
      description: MIRO_DESCRIPTION,
    },
  ];
}

function summarizeValidation(
  validation: ImageValidationResult,
  score: number | null,
  minAcceptScore: number
) {
  return {
    status: validation.validationStatus || 'completed',
    score,
    passed:
      validation.validationStatus === 'provider_blocked' ||
      (score !== null && score > minAcceptScore),
    minAcceptScore,
    characterCount: validation.characterCount,
    expectedCharacterCount: validation.expectedCharacterCount,
    hasUnexpectedCharacters: validation.hasUnexpectedCharacters,
    hasTextOrLetters: validation.hasTextOrLetters,
    hasRenderingArtifacts: validation.hasRenderingArtifacts,
    characters: validation.characters.map((character) => ({
      name: character.name,
      characterKind: character.characterKind,
      found: character.found,
      duplicated: character.duplicated,
      recognizableScore: character.recognizableScore,
      matchesColors: character.matchesColors,
      matchesOutfit: character.matchesOutfit,
      sameOverallDesignRead: character.sameOverallDesignRead,
      silhouetteDriftSeverity: character.silhouetteDriftSeverity,
      issue: character.issue,
    })),
    overallFeedback: validation.overallFeedback,
    providerError: validation.providerError,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  ensureRunnable();
  fs.mkdirSync(args.outDir, { recursive: true });

  const { getStoryDomainService, getImageDomainService } = await import('../services/aiService');
  const storyDomain = getStoryDomainService();
  const imageDomain = getImageDomainService();
  const usageEvents: unknown[] = [];
  const onUsage = (usage: unknown) => usageEvents.push(usage);

  console.log('Seedream reference-story run');
  console.log(`provider=${config.image.simpleProvider} model=${config.seedream.model}`);
  console.log(`out=${args.outDir}`);

  logger.info({ outDir: args.outDir }, 'Generating Seedream reference story sample');
  const story = await storyDomain.generateTextPlain(storySpec);
  writeJson(path.join(args.outDir, 'story.json'), story);
  fs.writeFileSync(
    path.join(args.outDir, 'story.txt'),
    [
      story.title,
      '',
      ...story.scenes.map((scene) => `### Scene ${scene.sceneId}\n\n${scene.text}\n`),
      '',
      story.fullText,
      '',
    ].join('\n'),
    'utf8'
  );

  const referenceSystemInstruction =
    'Create a clean children-book character reference image. Plain background, full body visible, no text, no letters, no labels, no watermark. Keep the design simple, consistent, and easy to reuse as an identity reference.';

  const lunaReference = saveImage(
    args.outDir,
    'reference-luna',
    await imageDomain.generateImageWithInstructions({
      prompt: `${LUNA_DESCRIPTION} Full-body character reference sheet pose, three-quarter view, friendly expression, storybook watercolor style, plain warm off-white background.`,
      aspectRatio: '1:1',
      systemInstruction: referenceSystemInstruction,
      onUsage,
      operation: 'image_character_reference',
    })
  );

  const miroReference = saveImage(
    args.outDir,
    'reference-miro',
    await imageDomain.generateImageWithInstructions({
      prompt: `${MIRO_DESCRIPTION} Full-body character reference sheet pose, three-quarter view, friendly expression, storybook watercolor style, plain warm off-white background.`,
      aspectRatio: '1:1',
      systemInstruction: referenceSystemInstruction,
      onUsage,
      operation: 'image_character_reference',
    })
  );

  const providerRefs = providerReferenceImages(lunaReference, miroReference);
  const validatorRefs = validationReferenceImages(lunaReference, miroReference);
  const expected = expectedCharacters();
  const sceneCount = Math.min(args.sceneCount, Math.max(1, story.scenes.length));
  const sceneSummaries = [];
  let hasValidationFailure = false;

  for (const storyScene of story.scenes.slice(0, sceneCount)) {
    const sceneVisual = storyScene.sceneVisual || fallbackSceneVisual(storyScene.sceneId);
    const image = await imageDomain.generateSceneWithReference(
      {
        primaryRead: storyScene.primaryRead || storyScene.text,
        sceneVisual,
        sceneId: storyScene.sceneId,
        sceneText: storyScene.text,
        ageGroup: '6-8',
        style: 'soft_watercolor',
        aspectRatio: '16:9',
        realWorldCharacters: [{ name: 'Луна', description: LUNA_DESCRIPTION }],
        imaginaryCharacters: [{ name: 'Миро', isTurnaround: true }],
        referenceImages: providerRefs,
        imageIndexMap: new Map([
          ['Луна', 1],
          ['Миро', 2],
        ]),
        scenarioCardId: storySpec.scenarioCard?.id,
      },
      { onUsage }
    );
    const saved = saveImage(args.outDir, `scene-${storyScene.sceneId}`, image);

    const validation = await imageDomain.validateGeneratedImageSegmented({
      imageData: saved.imageData,
      mimeType: saved.mimeType,
      expectedCharacters: expected,
      sceneVisual,
      referenceImages: validatorRefs,
      logContext: { storyId: 'seedream-reference-story-sample', sceneId: storyScene.sceneId },
      onUsage,
    });

    const score =
      validation.validationStatus === 'provider_blocked'
        ? null
        : computeValidationScore(validation, {
            referenceNamesNormalized: new Set(['луна', 'миро']),
            expectedCharacters: expected,
            sceneVisual,
            validationReferenceImages: validatorRefs,
          });
    const summary = {
      sceneId: storyScene.sceneId,
      imagePath: saved.path,
      sceneText: storyScene.text,
      sceneVisual,
      validation: summarizeValidation(validation, score, config.image.validationMinAcceptScore),
    };
    writeJson(path.join(args.outDir, `scene-${storyScene.sceneId}-validation.json`), summary);
    sceneSummaries.push(summary);

    if (!summary.validation.passed) {
      hasValidationFailure = true;
    }

    console.log(
      `scene ${storyScene.sceneId}: ${summary.validation.passed ? 'PASS' : 'FAIL'} score=${
        score ?? 'provider_blocked'
      } image=${saved.path}`
    );
  }

  const runSummary = {
    provider: config.image.simpleProvider,
    model: config.seedream.model,
    storyTitle: story.title,
    outDir: args.outDir,
    references: {
      luna: lunaReference.path,
      miro: miroReference.path,
    },
    scenes: sceneSummaries,
    usageEvents,
  };
  writeJson(path.join(args.outDir, 'summary.json'), runSummary);

  console.log(`summary=${path.join(args.outDir, 'summary.json')}`);

  if (hasValidationFailure && !args.allowValidationFailures) {
    throw new Error(
      'One or more Seedream scene images failed validation. Re-run with --allow-validation-failures to keep exit code 0.'
    );
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'generateSeedreamReferenceStorySample failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
