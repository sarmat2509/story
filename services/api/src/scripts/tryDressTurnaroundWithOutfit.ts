#!/usr/bin/env npx tsx
/**
 * Experimental turnaround outfit transfer.
 *
 * Uses the cheap/simple image route from env (`config.image.simpleModel`) with:
 * - one character turnaround sheet as identity/layout reference
 * - one outfit image as clothing/accessory reference
 *
 * Example:
 *   cd services/api
 *   npx tsx src/scripts/tryDressTurnaroundWithOutfit.ts --runs 3
 *
 * Custom inputs:
 *   npx tsx src/scripts/tryDressTurnaroundWithOutfit.ts \
 *     --turnaround ./uploads/development/.../photos/child_turnaround/1771191639812.jpg \
 *     --outfit ./uploads/try-outfit-plate-dress-example.png \
 *     --runs 3 \
 *     --out-dir ./test-output/emily-outfit-turnaround
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { getEnvironmentImageProvider } from '../services/aiService';
import type { GenerateImageRequest, ReferenceImage } from '../providers/base/IImageProvider';
import type { UsageMetadata } from '../providers/base/UsageMetadata';

type AspectRatio = NonNullable<GenerateImageRequest['aspectRatio']>;

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const API_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_TURNAROUND_PATH = path.join(
  REPO_ROOT,
  'services/api/uploads/development/23a825d6-d750-4297-bf17-5e2452d112aa/photos/child_turnaround/1771191639812.jpg',
);
const DEFAULT_OUTFIT_PATH = path.join(
  REPO_ROOT,
  'services/api/uploads/try-outfit-plate-dress-example.png',
);

const DEFAULT_PROMPT =
  'DRAW COMMAND: draw Emily from Image 1 wearing the clothing/accessories from Image 2. Image 1 is PERSON SOURCE; Image 2 is CLOTHES SOURCE only. Preserve the same 4-view turnaround sheet layout, poses, white background, spacing, and FRONT / 3/4 / SIDE / BACK labels. Only clothes/accessories should change; do not draw the mannequin or copy its face, hair, body, age, silhouette, pose, background, or layout.';

const REFERENCE_ROLE_SYSTEM_INSTRUCTION =
  'Follow reference roles exactly. PERSON SOURCE images define the locked person identity: face, hairstyle structure, hair placement, age read, body proportions, silhouette, skin/hair palette, and stable marks. CLOTHES SOURCE images define clothing/accessories only. If a character has both sources, draw the person from the PERSON SOURCE wearing the clothing/accessories from the CLOTHES SOURCE. Outfit plates are mannequin/wardrobe references only and must not define or override face, hair, age, body identity, silhouette, pose, background, layout, or character likeness.';

function getArgValue(flag: string): string | undefined {
  const exact = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || process.argv.some((arg) => arg.startsWith(`${flag}=`));
}

function positionalArgs(): string[] {
  const out: string[] = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      if (!arg.includes('=') && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
        i += 1;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}

function resolveInputPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

function mimeTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function fileExtensionForMimeType(mimeType?: string, fallbackFormat?: string): string {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg' || fallbackFormat === 'jpeg') {
    return '.jpg';
  }
  if (normalized === 'image/webp' || fallbackFormat === 'webp') {
    return '.webp';
  }
  return '.png';
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureFileExists(filePath: string, label: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error(`${label} is not a file: ${filePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${filePath}`);
    }
    throw error;
  }
}

async function readReference(filePath: string): Promise<{
  base64Data: string;
  mimeType: string;
  byteLength: number;
}> {
  const buffer = await fs.readFile(filePath);
  return {
    base64Data: buffer.toString('base64'),
    mimeType: mimeTypeForPath(filePath),
    byteLength: buffer.length,
  };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function printHelp(): void {
  console.log(
    [
      'Usage:',
      '  npx tsx src/scripts/tryDressTurnaroundWithOutfit.ts [--turnaround <path>] [--outfit <path>] [--runs 3]',
      '  npx tsx src/scripts/tryDressTurnaroundWithOutfit.ts <turnaroundPath> <outfitPath> --runs 3',
      '',
      'Options:',
      '  --turnaround <path>    Character turnaround sheet. Defaults to Emily child turnaround.',
      '  --outfit <path>        Outfit reference image. Defaults to try-outfit-plate-dress-example.png.',
      '  --runs <number>        Number of attempts to generate. Defaults to 3.',
      '  --out-dir <path>       Output directory. Defaults to services/api/test-output/turnaround-outfit-<timestamp>.',
      '  --prompt <text>        Override the short transfer prompt.',
      '  --prompt-file <path>   Read prompt override from a text file.',
      '  --aspect-ratio <ratio> Output aspect ratio. Defaults to 16:9.',
      '',
      `Cheap model source: config.image.simpleModel (${config.image.simpleModel})`,
    ].join('\n'),
  );
}

async function loadPrompt(): Promise<string> {
  const promptFile = getArgValue('--prompt-file');
  if (promptFile) {
    return fs.readFile(resolveInputPath(promptFile), 'utf8');
  }
  return getArgValue('--prompt') || DEFAULT_PROMPT;
}

async function main(): Promise<void> {
  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp();
    return;
  }

  const positionals = positionalArgs();
  const turnaroundPath = resolveInputPath(
    getArgValue('--turnaround') || positionals[0] || DEFAULT_TURNAROUND_PATH,
  );
  const outfitPath = resolveInputPath(getArgValue('--outfit') || positionals[1] || DEFAULT_OUTFIT_PATH);
  const runs = parseInt(getArgValue('--runs') || '3', 10);
  const aspectRatio = (getArgValue('--aspect-ratio') || '16:9') as AspectRatio;
  const outDir = resolveInputPath(
    getArgValue('--out-dir') ||
      path.join(API_ROOT, 'test-output', `turnaround-outfit-${timestampSlug()}`),
  );
  const prompt = (await loadPrompt()).trim();

  if (!Number.isFinite(runs) || runs <= 0) {
    throw new Error(`--runs must be a positive number; got ${runs}`);
  }
  if (!prompt) {
    throw new Error('Prompt is empty.');
  }
  if (!config.google.apiKey) {
    throw new Error('GOOGLE_API_KEY is not set. Check repo .env.local / .env.');
  }

  await ensureFileExists(turnaroundPath, 'Turnaround image');
  await ensureFileExists(outfitPath, 'Outfit image');
  await fs.mkdir(outDir, { recursive: true });

  const [turnaround, outfit] = await Promise.all([
    readReference(turnaroundPath),
    readReference(outfitPath),
  ]);

  const referenceImages: ReferenceImage[] = [
    {
      characterName: 'Emily',
      referenceKind: 'character',
      mimeType: turnaround.mimeType,
      base64Data: turnaround.base64Data,
      instructionText:
        'Image 1: PERSON SOURCE for Emily and exact 4-view turnaround layout. Preserve face, hair, body proportions, silhouette, poses, white background, spacing, and view labels.',
    },
    {
      referenceKind: 'object',
      mimeType: outfit.mimeType,
      base64Data: outfit.base64Data,
      instructionText:
        'Image 2: CLOTHES SOURCE only. Use only the clothing/accessories from this image. DRAW COMMAND: draw Emily from Image 1 wearing the clothing/accessories from Image 2. Do not use Image 2 for face, hair, body, age, silhouette, pose, background, or layout. Do not draw the mannequin.',
    },
  ];

  await fs.writeFile(path.join(outDir, 'prompt.txt'), `${prompt}\n`, 'utf8');
  await fs.writeFile(
    path.join(outDir, 'systemInstruction.txt'),
    `${REFERENCE_ROLE_SYSTEM_INSTRUCTION}\n`,
    'utf8',
  );
  await writeJsonFile(path.join(outDir, 'inputs.json'), {
    createdAt: new Date().toISOString(),
    turnaroundPath,
    outfitPath,
    turnaroundMimeType: turnaround.mimeType,
    outfitMimeType: outfit.mimeType,
    turnaroundBytes: turnaround.byteLength,
    outfitBytes: outfit.byteLength,
    provider: 'environmentImageProvider',
    simpleProvider: config.image.simpleProvider,
    simpleModel: config.image.simpleModel,
    aspectRatio,
    runs,
    prompt,
    systemInstruction: REFERENCE_ROLE_SYSTEM_INSTRUCTION,
    referenceInstructions: referenceImages.map((ref, index) => ({
      image: index + 1,
      referenceKind: ref.referenceKind,
      characterName: ref.characterName || null,
      instructionText: ref.instructionText,
    })),
  });

  console.log(`Output directory: ${outDir}`);
  console.log(`Turnaround: ${turnaroundPath}`);
  console.log(`Outfit: ${outfitPath}`);
  console.log(`Provider: ${config.image.simpleProvider}`);
  console.log(`Cheap model: ${config.image.simpleModel}`);
  console.log(`Aspect ratio: ${aspectRatio}`);
  console.log(`Runs: ${runs}`);
  console.log(`Prompt: ${prompt}`);

  const provider = getEnvironmentImageProvider();

  for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
    const label = `attempt-${String(runIndex).padStart(3, '0')}`;
    const usageEvents: UsageMetadata[] = [];
    const request: GenerateImageRequest = {
      prompt,
      systemInstruction: REFERENCE_ROLE_SYSTEM_INSTRUCTION,
      aspectRatio,
      referenceImages,
      operation: 'image_turnaround_outfit_experiment',
      onUsage: (usage) => usageEvents.push(usage),
    };

    console.log(`\nGenerating ${label}...`);
    const startedAt = Date.now();
    const image = await provider.generateImage(request);
    const elapsedMs = Date.now() - startedAt;
    const imageBuffer = Buffer.isBuffer(image.imageData)
      ? image.imageData
      : Buffer.from(image.imageData as unknown as string, 'base64');
    const ext = fileExtensionForMimeType(image.mimeType, image.format);
    const imagePath = path.join(outDir, `${label}${ext}`);

    await fs.writeFile(imagePath, imageBuffer);
    await writeJsonFile(path.join(outDir, `${label}.request.json`), {
      prompt,
      systemInstruction: REFERENCE_ROLE_SYSTEM_INSTRUCTION,
      aspectRatio,
      referenceImages: referenceImages.map((ref) => ({
        characterName: ref.characterName || null,
        referenceKind: ref.referenceKind || null,
        mimeType: ref.mimeType || null,
        instructionText: ref.instructionText || null,
        hasBase64Data: !!ref.base64Data,
      })),
      model: config.image.simpleModel,
    });
    await writeJsonFile(path.join(outDir, `${label}.result.json`), {
      imagePath,
      elapsedMs,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      format: image.format,
      revisedPrompt: image.revisedPrompt || null,
      providerInteractionId: image.providerInteractionId || null,
    });
    await writeJsonFile(path.join(outDir, `${label}.usage.json`), usageEvents);

    console.log(`Saved image: ${imagePath}`);
    console.log(`Elapsed: ${elapsedMs} ms`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
