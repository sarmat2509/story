#!/usr/bin/env npx tsx
/**
 * Artifact-driven image generation lab.
 *
 * Flow:
 * 1. Prepare a local editable pack from image-prompt-debug/<story>/<scene-attempt>.json
 * 2. Edit prompt.txt / systemInstruction.txt / references.json
 * 3. Re-run Nano Banana generation multiple times from that controlled pack
 *
 * Examples:
 *   npx tsx src/scripts/runArtifactImagePrompt.ts --artifact ../../../image-prompt-debug/<storyId>/1-1.json --prepare-only
 *   npx tsx src/scripts/runArtifactImagePrompt.ts --artifact ../../../image-prompt-debug/<storyId>/1-1.json --runs 3
 *   npx tsx src/scripts/runArtifactImagePrompt.ts --pack ../../../image-prompt-lab/<storyId>/scene-1-attempt-1 --runs 5
 *   npx tsx src/scripts/runArtifactImagePrompt.ts --pack ../../../image-prompt-lab/<storyId>/scene-1-attempt-1 --prompt-file ./my-prompt.txt --runs 3 --model gemini-2.5-flash-image
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { NanoBananaProProvider } from '../providers/image/nanobananapro/NanoBananaProProvider';
import type { GenerateImageRequest, ReferenceImage } from '../providers/base/IImageProvider';
import type { UsageMetadata } from '../providers/base/UsageMetadata';

type PromptArtifactReference = {
  index?: number | null;
  instructionText?: string | null;
  characterName?: string | null;
  referenceKind?: 'character' | 'object' | null;
  mimeType?: string | null;
  fileUri?: string | null;
  url?: string | null;
  hasBase64Data?: boolean;
};

type LabReferenceImage = ReferenceImage & {
  localPath?: string;
};

type PromptArtifact = {
  storyId: string;
  sceneId: number;
  attemptId: number;
  primaryRead?: string | null;
  prompt: string;
  systemInstruction?: string | null;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | null;
  referenceImages?: PromptArtifactReference[];
  fullTextPrompt?: string;
};

type PackMetadata = {
  storyId: string;
  sceneId: number;
  attemptId: number;
  primaryRead?: string | null;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | null;
  sourceArtifactPath: string;
  createdAt: string;
};

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LAB_ROOT = path.join(REPO_ROOT, 'image-prompt-lab');

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

function resolveInputPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
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

function mimeTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function sanitizeFileStem(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function defaultPackDirForArtifact(artifact: PromptArtifact): string {
  return path.join(
    LAB_ROOT,
    artifact.storyId,
    `scene-${artifact.sceneId}-attempt-${artifact.attemptId}`,
  );
}

function normalizeArtifactReferences(artifact: PromptArtifact): ReferenceImage[] {
  return (artifact.referenceImages || [])
    .filter((ref) => ref.fileUri || ref.url)
    .map((ref) => ({
      instructionText: ref.instructionText || undefined,
      characterName: ref.characterName || undefined,
      referenceKind: ref.referenceKind || undefined,
      mimeType: ref.mimeType || undefined,
      fileUri: ref.fileUri || undefined,
      url: ref.url || undefined,
    }));
}

async function createPackFromArtifact(
  artifactPath: string,
  packDirOverride?: string,
): Promise<string> {
  const resolvedArtifactPath = resolveInputPath(artifactPath);
  const artifact = await readJsonFile<PromptArtifact>(resolvedArtifactPath);
  const packDir = packDirOverride
    ? resolveInputPath(packDirOverride)
    : defaultPackDirForArtifact(artifact);

  await ensureDir(packDir);
  await ensureDir(path.join(packDir, 'runs'));

  const metadata: PackMetadata = {
    storyId: artifact.storyId,
    sceneId: artifact.sceneId,
    attemptId: artifact.attemptId,
    primaryRead: artifact.primaryRead ?? null,
    aspectRatio: artifact.aspectRatio ?? '16:9',
    sourceArtifactPath: resolvedArtifactPath,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(path.join(packDir, 'prompt.txt'), artifact.prompt || '', 'utf8');
  await fs.writeFile(
    path.join(packDir, 'systemInstruction.txt'),
    artifact.systemInstruction || '',
    'utf8',
  );
  await writeJsonFile(
    path.join(packDir, 'references.json'),
    normalizeArtifactReferences(artifact),
  );
  await writeJsonFile(path.join(packDir, 'metadata.json'), metadata);
  await writeJsonFile(path.join(packDir, 'artifact.snapshot.json'), artifact);

  if (artifact.fullTextPrompt?.trim()) {
    await fs.writeFile(
      path.join(packDir, 'fullTextPrompt.txt'),
      artifact.fullTextPrompt,
      'utf8',
    );
  }

  return packDir;
}

async function loadPackInputs(options: {
  packDir: string;
  promptFile?: string;
  systemFile?: string;
  referencesFile?: string;
  aspectRatioOverride?: string;
}): Promise<{
  packDir: string;
  metadata: PackMetadata;
  prompt: string;
  systemInstruction?: string;
  referenceImages: ReferenceImage[];
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
}> {
  const packDir = resolveInputPath(options.packDir);
  const metadata = await readJsonFile<PackMetadata>(path.join(packDir, 'metadata.json'));

  const promptPath = options.promptFile
    ? resolveInputPath(options.promptFile)
    : path.join(packDir, 'prompt.txt');
  const systemPath = options.systemFile
    ? resolveInputPath(options.systemFile)
    : path.join(packDir, 'systemInstruction.txt');
  const referencesPath = options.referencesFile
    ? resolveInputPath(options.referencesFile)
    : path.join(packDir, 'references.json');

  const prompt = await fs.readFile(promptPath, 'utf8');
  const systemInstruction = (await pathExists(systemPath))
    ? await fs.readFile(systemPath, 'utf8')
    : '';
  const rawReferenceImages = await readJsonFile<LabReferenceImage[]>(referencesPath);
  const referenceImages: ReferenceImage[] = [];
  for (const ref of rawReferenceImages) {
    if (ref.localPath) {
      const resolvedLocalPath = resolveInputPath(ref.localPath);
      const buffer = await fs.readFile(resolvedLocalPath);
      referenceImages.push({
        instructionText: ref.instructionText,
        characterName: ref.characterName,
        referenceKind: ref.referenceKind,
        mimeType: ref.mimeType || mimeTypeForPath(resolvedLocalPath),
        base64Data: buffer.toString('base64'),
      });
      continue;
    }
    referenceImages.push({
      instructionText: ref.instructionText,
      characterName: ref.characterName,
      referenceKind: ref.referenceKind,
      mimeType: ref.mimeType,
      fileUri: ref.fileUri,
      url: ref.url,
      base64Data: ref.base64Data,
    });
  }

  const aspectRatio = (options.aspectRatioOverride || metadata.aspectRatio || '16:9') as
    | '1:1'
    | '16:9'
    | '9:16'
    | '4:3'
    | '3:4';

  return {
    packDir,
    metadata,
    prompt,
    systemInstruction: systemInstruction.trim() ? systemInstruction : undefined,
    referenceImages,
    aspectRatio,
  };
}

async function runGenerations(options: {
  packDir: string;
  promptFile?: string;
  systemFile?: string;
  referencesFile?: string;
  aspectRatioOverride?: string;
  runs: number;
  modelOverride?: string;
  label?: string;
}): Promise<void> {
  const pack = await loadPackInputs(options);
  const runsDir = path.join(pack.packDir, 'runs');
  await ensureDir(runsDir);

  const provider = new NanoBananaProProvider(config.google.apiKey, options.modelOverride);

  console.log(`\nPack: ${pack.packDir}`);
  console.log(`Story: ${pack.metadata.storyId}`);
  console.log(`Scene: ${pack.metadata.sceneId}`);
  console.log(`Attempt source: ${pack.metadata.attemptId}`);
  console.log(`Primary read: ${pack.metadata.primaryRead || '(none)'}`);
  console.log(`NODE_ENV: ${config.nodeEnv}`);
  console.log(`Provider: ${config.image.simpleProvider}`);
  console.log(`Resolved model: ${options.modelOverride || config.image.simpleModel}`);
  console.log(`Aspect ratio: ${pack.aspectRatio}`);
  console.log(`References: ${pack.referenceImages.length}`);
  console.log(`Runs: ${options.runs}`);
  if (options.modelOverride) {
    console.log(`Model override: ${options.modelOverride}`);
  }

  for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
    const runLabel = options.label
      ? `${sanitizeFileStem(options.label)}-${String(runIndex).padStart(3, '0')}`
      : `run-${String(runIndex).padStart(3, '0')}`;
    const request: GenerateImageRequest = {
      prompt: pack.prompt,
      systemInstruction: pack.systemInstruction,
      aspectRatio: pack.aspectRatio,
      referenceImages: pack.referenceImages,
      operation: 'image_generate',
    };

    const usageEvents: UsageMetadata[] = [];
    request.onUsage = (usage) => {
      usageEvents.push(usage);
    };

    console.log(`\nGenerating ${runLabel}...`);
    const startedAt = Date.now();
    const image = await provider.generateImage(request);
    const elapsedMs = Date.now() - startedAt;
    const ext = fileExtensionForMimeType(image.mimeType, image.format);
    const imagePath = path.join(runsDir, `${runLabel}${ext}`);
    const requestPath = path.join(runsDir, `${runLabel}.request.json`);
    const resultPath = path.join(runsDir, `${runLabel}.result.json`);
    const usagePath = path.join(runsDir, `${runLabel}.usage.json`);

    await fs.writeFile(imagePath, image.imageData);
    await writeJsonFile(requestPath, {
      prompt: pack.prompt,
      systemInstruction: pack.systemInstruction || null,
      aspectRatio: pack.aspectRatio,
      referenceImages: pack.referenceImages,
      primaryRead: pack.metadata.primaryRead || null,
      modelOverride: options.modelOverride || null,
    });
    await writeJsonFile(resultPath, {
      storyId: pack.metadata.storyId,
      sceneId: pack.metadata.sceneId,
      sourceAttemptId: pack.metadata.attemptId,
      runLabel,
      elapsedMs,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      format: image.format,
      revisedPrompt: image.revisedPrompt || null,
      imagePath,
    });
    await writeJsonFile(usagePath, usageEvents);

    console.log(`Saved image: ${imagePath}`);
    console.log(`Saved request: ${requestPath}`);
    console.log(`Saved usage: ${usagePath}`);
  }
}

async function main(): Promise<void> {
  const artifactPath = getArgValue('--artifact');
  const packArg = getArgValue('--pack');
  const packDirArg = getArgValue('--pack-dir');
  const promptFile = getArgValue('--prompt-file');
  const systemFile = getArgValue('--system-file');
  const referencesFile = getArgValue('--references-file');
  const modelOverride = getArgValue('--model');
  const label = getArgValue('--label');
  const aspectRatioOverride = getArgValue('--aspect-ratio');
  const runs = parseInt(getArgValue('--runs') || '1', 10);
  const prepareOnly = hasFlag('--prepare-only');

  if (!artifactPath && !packArg) {
    console.error(
      'Usage: npx tsx src/scripts/runArtifactImagePrompt.ts --artifact <artifact.json> [--prepare-only] [--runs 3]\n' +
      '   or: npx tsx src/scripts/runArtifactImagePrompt.ts --pack <pack-dir> [--runs 3]',
    );
    process.exit(1);
  }

  let packDir = packArg ? resolveInputPath(packArg) : '';

  if (artifactPath) {
    packDir = await createPackFromArtifact(artifactPath, packDirArg);
    console.log(`Prepared pack: ${packDir}`);
  }

  if (prepareOnly) {
    console.log('Preparation complete. Edit prompt.txt / systemInstruction.txt / references.json and re-run with --pack.');
    return;
  }

  await runGenerations({
    packDir,
    promptFile,
    systemFile,
    referencesFile,
    aspectRatioOverride,
    runs,
    modelOverride,
    label,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
