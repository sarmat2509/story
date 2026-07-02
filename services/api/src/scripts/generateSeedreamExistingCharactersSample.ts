/**
 * Seedream smoke run with existing local characters:
 * - loads Tik / Snow Spirit / Emily turnarounds from DB + uploads
 * - creates one environment reference image
 * - generates one scene with environment + 3 character turnaround references
 * - validates the generated scene against the same existing identity refs
 *
 * Usage:
 *   pnpm --filter wondertales-api generate:seedream-existing-characters
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import type { ImageValidationResult } from '../ai/types';
import config from '../config';
import type { GeneratedImage, ReferenceImage } from '../providers/base/IImageProvider';
import { computeValidationScore } from '../services/storyOrchestrationService';
import type { SceneVisual } from '../services/types';
import { logger } from '../utils/logger';

const API_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_ROOT = path.join(API_ROOT, 'uploads');
const USER_ID = '23a825d6-d750-4297-bf17-5e2452d112aa';

type ExistingReference = {
  name: string;
  source: 'character' | 'child';
  characterKind: 'human' | 'animal' | 'imaginary';
  speciesSubtype?: string;
  description: string;
  storagePath: string;
  mimeType: string;
  base64Data: string;
};

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureRunnable(): void {
  if (config.image.simpleProvider !== 'seedream') {
    throw new Error(
      `SIMPLE_IMAGE_PROVIDER must be seedream. Current value: ${config.image.simpleProvider || '(empty)'}`
    );
  }
  if (!config.seedream.apiKey?.trim()) {
    throw new Error('SEEDREAM_API_KEY is required.');
  }
  if (!config.image.enableValidation) {
    throw new Error('ENABLE_IMAGE_VALIDATION must be true.');
  }
}

function extractStoragePath(url: string): string {
  const cleanUrl = url.split('?')[0];
  const marker = '/api/v1/assets/';
  const idx = cleanUrl.indexOf(marker);
  if (idx !== -1) return cleanUrl.slice(idx + marker.length);
  return cleanUrl.replace(/^\/+/, '');
}

function resolveUploadPath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) return storagePath;
  return path.join(UPLOADS_ROOT, storagePath);
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function extensionFor(image: GeneratedImage): 'jpg' | 'png' | 'webp' {
  if (image.format === 'png' || image.mimeType.includes('png')) return 'png';
  if (image.format === 'webp' || image.mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

function saveImage(outDir: string, name: string, image: GeneratedImage): string {
  const filePath = path.join(outDir, `${name}.${extensionFor(image)}`);
  fs.writeFileSync(filePath, image.imageData);
  return filePath;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function loadExistingReferences(): Promise<{
  tik: ExistingReference;
  snowSpirit: ExistingReference;
  emily: ExistingReference;
}> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://kazka:devpass@localhost:5432/kazka_dev',
  });

  try {
    const characterResult = await pool.query(
      `
        select name, type, turnaround_sheet
        from characters
        where user_id = $1
          and is_active = true
          and name in ('Тік', 'Snow Spirit')
      `,
      [USER_ID]
    );
    const childResult = await pool.query(
      `
        select name, turnaround_sheet
        from child_profiles
        where user_id = $1
          and is_active = true
          and name = 'Емілія'
      `,
      [USER_ID]
    );

    const byName = new Map<string, any>();
    for (const row of characterResult.rows) byName.set(row.name, row);
    for (const row of childResult.rows) byName.set(row.name, row);

    const makeRef = (params: {
      name: string;
      source: 'character' | 'child';
      characterKind: 'human' | 'animal' | 'imaginary';
      speciesSubtype?: string;
      description: string;
    }): ExistingReference => {
      const row = byName.get(params.name);
      const sheet = row?.turnaround_sheet;
      if (!sheet?.url) {
        throw new Error(`Missing turnaround_sheet.url for ${params.name}`);
      }
      const storagePath = extractStoragePath(sheet.url);
      const filePath = resolveUploadPath(storagePath);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Turnaround file for ${params.name} not found: ${filePath}`);
      }
      const buffer = fs.readFileSync(filePath);
      return {
        ...params,
        storagePath,
        mimeType: mimeFromPath(filePath),
        base64Data: buffer.toString('base64'),
      };
    };

    return {
      tik: makeRef({
        name: 'Тік',
        source: 'character',
        characterKind: 'imaginary',
        speciesSubtype: 'tiny clockwork fairy companion',
        description:
          'Тік, an existing imaginary character from the stored turnaround sheet. Preserve the exact silhouette, colors, proportions, face, and distinctive details from the model sheet.',
      }),
      snowSpirit: makeRef({
        name: 'Snow Spirit',
        source: 'character',
        characterKind: 'imaginary',
        speciesSubtype: 'snow spirit',
        description:
          'Snow Spirit, an existing gentle magical snow character from the stored turnaround sheet. Preserve the exact body shape, colors, face, and ethereal snow details from the model sheet.',
      }),
      emily: makeRef({
        name: 'Емілія',
        source: 'child',
        characterKind: 'human',
        description:
          'Емілія, an existing child character from the stored turnaround sheet. Preserve her face, age read, hair, body proportions, and outfit identity from the model sheet.',
      }),
    };
  } finally {
    await pool.end();
  }
}

function buildCharacterReferences(refs: ExistingReference[]): ReferenceImage[] {
  return refs.map((ref, index) => ({
    base64Data: ref.base64Data,
    mimeType: ref.mimeType,
    characterName: ref.name,
    referenceKind: 'character' as const,
    instructionText: `Image ${index + 2} is the existing turnaround identity reference for ${ref.name}. Preserve the exact character design from this sheet.`,
  }));
}

function validationReferenceImages(refs: ExistingReference[]) {
  return refs.map((ref) => ({
    characterName: ref.name,
    imageData: ref.base64Data,
    mimeType: ref.mimeType,
    referenceKind: 'identity' as const,
  }));
}

function sceneVisual(): SceneVisual {
  return {
    setting:
      'A quiet snowy forest clearing beside a frozen stream, with a small wooden footbridge, crystal snowflakes floating in the air, and warm lantern light from a tiny cabin in the distance.',
    lighting:
      'Soft blue winter twilight, warm amber lantern reflections on snow, gentle magical glow around the Snow Spirit, cozy and safe.',
    cameraComposition: {
      shot: 'Wide cinematic storybook shot, landscape 16:9',
      characters: [
        {
          name: 'Емілія',
          description:
            'standing near the snowy bridge, smiling gently, holding a small lantern and looking toward the two magical friends',
          outfitId: 'existing_turnaround_outfit',
        },
        {
          name: 'Тік',
          description:
            'hovering near Емілія at shoulder height, curious and cheerful, pointing toward glowing snowflakes',
        },
        {
          name: 'Snow Spirit',
          description:
            'floating on the other side of the bridge, calm and kind, softly illuminating the snow around them',
        },
      ],
    },
  };
}

function summarizeValidation(
  validation: ImageValidationResult,
  score: number | null,
  minAcceptScore: number
) {
  return {
    status: validation.validationStatus || 'completed',
    score,
    passed: validation.validationStatus === 'provider_blocked' || (score !== null && score > minAcceptScore),
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
  ensureRunnable();
  const outDir = path.join(API_ROOT, 'seedream-reference-story-output', `existing-${stamp()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const { getImageDomainService } = await import('../services/aiService');
  const imageDomain = getImageDomainService();
  const usageEvents: unknown[] = [];
  const onUsage = (usage: unknown) => usageEvents.push(usage);

  const existing = await loadExistingReferences();
  const characterRefs = [existing.tik, existing.snowSpirit, existing.emily];
  const visual = sceneVisual();

  console.log(`out=${outDir}`);
  console.log('Loaded existing turnarounds:');
  for (const ref of characterRefs) {
    console.log(`  ${ref.name}: ${ref.storagePath}`);
  }

  const environmentImage = await imageDomain.generateImageWithInstructions({
    prompt:
      'Environment reference only: a quiet snowy forest clearing beside a frozen stream, a small wooden footbridge, crystal snowflakes floating in the air, warm lantern light from a tiny cabin in the distance. No characters. No text. Children book watercolor style.',
    aspectRatio: '16:9',
    systemInstruction:
      'Create a clean reusable environment reference image. No characters, no text, no labels, no watermark. Clear spatial layout with key objects readable.',
    onUsage,
    operation: 'image_environment_reference',
  });
  const environmentPath = saveImage(outDir, 'environment-reference', environmentImage);

  const environmentReference: ReferenceImage = {
    base64Data: environmentImage.imageData.toString('base64'),
    mimeType: environmentImage.mimeType,
    referenceKind: 'object',
    instructionText:
      'Image 1 is the environment reference. Preserve the location layout, bridge, stream, snowy clearing, cabin position, snowflake atmosphere, and object placement; redraw in the scene art style.',
  };

  const image = await imageDomain.generateSceneWithReference(
    {
      primaryRead:
        'Емілія follows Тік to the snowy bridge, where Snow Spirit gently lights the clearing so they can find the safe path home.',
      sceneVisual: visual,
      sceneId: 1,
      sceneText:
        'Емілія follows Тік to the snowy bridge. Snow Spirit appears with a kind glow, and together they discover a warm safe path through the winter clearing.',
      ageGroup: '6-8',
      style: 'soft_watercolor',
      aspectRatio: '16:9',
      realWorldCharacters: [
        {
          name: 'Емілія',
          description: existing.emily.description,
        },
      ],
      imaginaryCharacters: [
        { name: 'Тік', isTurnaround: true, nameAliases: ['Tik'] },
        { name: 'Snow Spirit', isTurnaround: true },
      ],
      referenceImages: [environmentReference, ...buildCharacterReferences(characterRefs)],
      imageIndexMap: new Map([
        ['Тік', 2],
        ['Snow Spirit', 3],
        ['Емілія', 4],
      ]),
      currentEnvironment: {
        id: 'existing_snowy_clearing',
        name: 'Snowy Forest Clearing',
        description: visual.setting,
      },
      characterOutfits: {
        'Емілія': 'use the existing outfit from Image 4',
        'Тік': 'natural appearance from Image 2',
        'Snow Spirit': 'natural appearance from Image 3',
      },
      hasEnvironmentImageRef: true,
    },
    { onUsage }
  );
  const scenePath = saveImage(outDir, 'scene-existing-characters', image);

  const expectedCharacters = characterRefs.map((ref) => ({
    name: ref.name,
    characterKind: ref.characterKind,
    speciesSubtype: ref.speciesSubtype,
    description: ref.description,
    expectedOutfitForScene:
      ref.characterKind === 'human' ? 'same outfit and identity as the existing turnaround sheet' : undefined,
  }));
  const validationRefs = validationReferenceImages(characterRefs);
  const validation = await imageDomain.validateGeneratedImage({
    imageData: image.imageData,
    mimeType: image.mimeType,
    expectedCharacters,
    sceneVisual: visual,
    sceneCharacterOutfitsText:
      'Емілія: same outfit and identity as Image 4. Тік: natural appearance from Image 2. Snow Spirit: natural appearance from Image 3.',
    referenceImages: validationRefs,
    logContext: { storyId: 'seedream-existing-characters-sample', sceneId: 1 },
    onUsage,
  });
  const score =
    validation.validationStatus === 'provider_blocked'
      ? null
      : computeValidationScore(validation, {
          referenceNamesNormalized: new Set(['тік', 'snow spirit', 'емілія']),
          expectedCharacters,
          sceneVisual: visual,
          validationReferenceImages: validationRefs,
        });

  const summary = {
    provider: config.image.simpleProvider,
    model: config.seedream.model,
    outDir,
    environmentPath,
    scenePath,
    references: characterRefs.map((ref, index) => ({
      imageIndex: index + 2,
      name: ref.name,
      source: ref.source,
      storagePath: ref.storagePath,
      mimeType: ref.mimeType,
    })),
    imageIndexMap: {
      environment: 1,
      'Тік': 2,
      'Snow Spirit': 3,
      'Емілія': 4,
    },
    validation: summarizeValidation(validation, score, config.image.validationMinAcceptScore),
    usageEvents,
  };
  writeJson(path.join(outDir, 'summary.json'), summary);
  writeJson(path.join(outDir, 'validation.json'), validation);

  console.log(
    `scene: ${summary.validation.passed ? 'PASS' : 'FAIL'} score=${score ?? 'provider_blocked'} image=${scenePath}`
  );
  console.log(`summary=${path.join(outDir, 'summary.json')}`);

  if (!summary.validation.passed) {
    throw new Error('Existing-character Seedream scene failed validation.');
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'generateSeedreamExistingCharactersSample failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
