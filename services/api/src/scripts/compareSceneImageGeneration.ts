#!/usr/bin/env npx tsx
/**
 * Generate one scene image through the current ImageDomainService path and
 * place it side by side with an existing image.
 *
 * Example from repo root:
 *   pnpm --dir services/api exec tsx src/scripts/compareSceneImageGeneration.ts \
 *     --story-id 3d0de735-c407-45c3-a63d-8e41add42011 \
 *     --scene-id 1
 *
 * Add --prompt-only to inspect prompt/reference payloads without spending an image call.
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { stripCharacterIdFromName } from '@wondertales/shared';
import config from '../config';
import { closeDatabaseConnection, db } from '../db';
import {
  assets,
  characters,
  environmentImageCache,
  outfitPlateCache,
  scenes,
  stories,
  storyEnvironmentCache,
  storyOutfitPlateCache,
  translations,
  type Asset,
} from '../db/schema';
import { ImageDomainService } from '../domain/image/ImageDomainService';
import type { GeneratedImage, IImageProvider, ReferenceImage } from '../providers/base/IImageProvider';
import { NanoBananaProProvider } from '../providers/image/nanobananapro/NanoBananaProProvider';
import { assignSequentialImageIndices, collectOutfitPlateImageIndices } from '../services/referenceImageBuckets';
import type { SceneVisual } from '../services/types';

const DEFAULT_STORY_ID = '3d0de735-c407-45c3-a63d-8e41add42011';
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const API_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_ROOT = path.join(API_ROOT, 'uploads');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'image-generation-compare');

type Args = {
  storyId: string;
  sceneId: number;
  runs: number;
  outDir?: string;
  existingImage?: string;
  model?: string;
  promptOnly: boolean;
};

type StoryScene = {
  sceneId: number;
  text?: string;
  primaryRead?: string;
  environmentId?: string;
  characterOutfitIds?: Record<string, string>;
  sceneVisual?: SceneVisual;
  visualPrompt?: string;
};

type StoryEnvironment = {
  id: string;
  name: string;
  description: string;
};

type StoryOutfit = {
  id: string;
  characterName: string;
  description: string;
};

type RefEntry = {
  base64: string;
  mimeType: string;
  source: string;
  type?: string;
  characterName?: string;
  imageIndex?: number;
  referenceKind?: 'character' | 'object';
  isTurnaround?: boolean;
  storagePath?: string;
};

type BuiltPromptSnapshot = {
  primaryRead?: string;
  prompt: string;
  systemInstruction?: string;
  aspectRatio?: string | null;
  referenceImages?: Array<{
    instructionText?: string;
    characterName?: string;
    referenceKind?: 'character' | 'object';
    mimeType?: string;
    fileUri?: string;
    hasBase64Data?: boolean;
    url?: string;
  }>;
};

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const exact = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return exact ? exact.slice(flag.length + 1) : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseArgs(): Args {
  return {
    storyId: getArg('--story-id') || DEFAULT_STORY_ID,
    sceneId: Number.parseInt(getArg('--scene-id') || '1', 10),
    runs: Number.parseInt(getArg('--runs') || '1', 10),
    outDir: getArg('--out-dir'),
    existingImage: getArg('--existing-image'),
    model: getArg('--model'),
    promptOnly: hasFlag('--prompt-only'),
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveStoragePath(input: string): string {
  const clean = input.split('?')[0] || input;
  if (path.isAbsolute(clean)) return clean;
  if (clean.startsWith('/api/v1/assets/')) {
    return path.join(UPLOADS_ROOT, clean.slice('/api/v1/assets/'.length));
  }
  if (/^https?:\/\//i.test(clean)) {
    const url = new URL(clean);
    if (url.pathname.startsWith('/api/v1/assets/')) {
      return path.join(UPLOADS_ROOT, url.pathname.slice('/api/v1/assets/'.length));
    }
  }
  if (clean.startsWith('uploads/')) return path.join(API_ROOT, clean);
  return path.join(UPLOADS_ROOT, clean);
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function readRef(storagePath: string): Promise<{ base64: string; mimeType: string; absPath: string }> {
  const absPath = resolveStoragePath(storagePath);
  const data = await fs.readFile(absPath);
  return {
    base64: data.toString('base64'),
    mimeType: mimeFromPath(absPath),
    absPath,
  };
}

function normalizeName(name: string | undefined | null): string {
  const withoutOutfitSuffix = (name || '').split('::')[0] || '';
  return stripCharacterIdFromName(withoutOutfitSuffix).trim().toLowerCase();
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = stripCharacterIdFromName(value).trim().replace(/\s+/g, ' ');
  return clean || undefined;
}

function pushUnique(out: string[], value: unknown): void {
  const clean = cleanName(value);
  if (!clean) return;
  if (!out.some((item) => item.toLowerCase() === clean.toLowerCase())) out.push(clean);
}

function aliasSuffix(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function buildSubjectAliasByImageIndex(imageIndexMap: Map<string, number>): Map<number, string> {
  const out = new Map<number, string>();
  const seenNames = new Set<string>();
  const indices = [...imageIndexMap.entries()]
    .filter(([name]) => {
      const normalized = normalizeName(name);
      if (!normalized || seenNames.has(normalized)) return false;
      seenNames.add(normalized);
      return true;
    })
    .map(([, index]) => index)
    .sort((a, b) => a - b);
  indices.forEach((index, i) => out.set(index, `Subject ${aliasSuffix(i)}`));
  return out;
}

function referenceInstruction(ref: RefEntry, subjectAliasByImageIndex: Map<number, string>, imageIndexMap: Map<string, number>): string {
  const img = `Image ${ref.imageIndex}`;
  if (ref.source === 'environment') {
    return `${img}: Environment reference - content/layout only, not style. Re-draw in scene art style.`;
  }
  if (ref.source === 'outfit_plate') {
    const idIdx = ref.characterName ? imageIndexMap.get(ref.characterName) : undefined;
    const subject = idIdx ? subjectAliasByImageIndex.get(idIdx) : undefined;
    const clothes = subject ? subject.replace(/^Subject\b/, 'Clothes') : 'the clothes source';
    const identityPart = idIdx
      ? `DRAW COMMAND: draw ${subject} from Image ${idIdx} wearing ${clothes} from ${img}. Image ${idIdx} is PERSON SOURCE. ${img} is CLOTHES SOURCE only.`
      : `DRAW COMMAND: draw the matching PERSON SOURCE wearing ${clothes} from ${img}. The character reference is PERSON SOURCE. ${img} is CLOTHES SOURCE only.`;
    return `${img}: CLOTHES SOURCE ${clothes}. Use only the clothing/accessories from this image. ${identityPart} Do not use ${img} for face, hair, body, age, or silhouette. Do not draw the mannequin.`;
  }
  const subject = ref.imageIndex ? subjectAliasByImageIndex.get(ref.imageIndex) : undefined;
  const sheetType = ref.isTurnaround ? 'Character sheet' : 'Reference photo';
  return `${img}: PERSON SOURCE ${subject ?? 'Subject'}. ${sheetType}. Use as the locked source of truth for face, exact hairstyle structure, hair placement, age read, body proportions, silhouette, skin/hair palette, and stable marks.`;
}

function parseSceneVisual(scene: StoryScene): SceneVisual | undefined {
  if (scene.sceneVisual) return scene.sceneVisual;
  if (!scene.visualPrompt?.trim()) return undefined;
  try {
    const parsed = JSON.parse(scene.visualPrompt);
    if (parsed && typeof parsed.setting === 'string' && parsed.cameraComposition !== undefined) {
      return parsed as SceneVisual;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function buildComposedSceneVisual(scene: StoryScene, env?: StoryEnvironment, hasEnvironmentRef = true): SceneVisual {
  const sceneVisual = parseSceneVisual(scene);
  if (!sceneVisual) {
    return { setting: scene.visualPrompt || '', cameraComposition: '', lighting: '' };
  }
  if (hasEnvironmentRef) return sceneVisual;
  return {
    ...sceneVisual,
    setting: [env?.description, sceneVisual.setting].filter(Boolean).join(' ').trim(),
  };
}

function findMetadataCharacter(metadataCharacters: any[], name: string): any | undefined {
  const key = normalizeName(name);
  return metadataCharacters.find((char) => {
    const names = [char.name, char.nameInStory, char.canonicalName];
    return names.some((candidate) => normalizeName(candidate) === key);
  });
}

async function loadCharacterRowsById(ids: string[]): Promise<Map<string, any>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(characters).where(inArray(characters.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadNameAliasesById(ids: string[]): Promise<Map<string, string[]>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select()
    .from(translations)
    .where(and(inArray(translations.entityId, unique), eq(translations.fieldName, 'name')));

  const out = new Map<string, string[]>();
  for (const row of rows) {
    const list = out.get(row.entityId) ?? [];
    pushUnique(list, row.value);
    if (list.length > 0) out.set(row.entityId, list);
  }
  return out;
}

function buildAliases(char: any | undefined, aliasesById: Map<string, string[]>): string[] {
  const aliases: string[] = [];
  if (!char) return aliases;
  pushUnique(aliases, char.name);
  pushUnique(aliases, char.nameInStory);
  pushUnique(aliases, char.canonicalName);
  for (const alias of char.nameAliases ?? []) pushUnique(aliases, alias);
  for (const alias of char.id ? aliasesById.get(char.id) ?? [] : []) pushUnique(aliases, alias);
  return aliases;
}

function humanLikeType(type?: string): boolean {
  return type === 'person' || type === 'child' || type === 'human';
}

function buildOutfitMap(scene: StoryScene, outfits: StoryOutfit[] | undefined): Record<string, string> | undefined {
  if (!scene.characterOutfitIds || !outfits?.length) return undefined;
  const byId = new Map(outfits.map((outfit) => [outfit.id, outfit.description]));
  const out: Record<string, string> = {};
  for (const [name, outfitId] of Object.entries(scene.characterOutfitIds)) {
    const description = byId.get(outfitId);
    if (description) out[name] = description;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function findExistingImage(args: Args, storyId: string, sceneId: number): Promise<string> {
  if (args.existingImage) return path.isAbsolute(args.existingImage) ? args.existingImage : path.resolve(process.cwd(), args.existingImage);

  const rejected = path.join(
    UPLOADS_ROOT,
    'development/23a825d6-d750-4297-bf17-5e2452d112aa',
    storyId,
    'rejected',
    `scene${sceneId}_attempt2.jpg`,
  );
  if (await exists(rejected)) return rejected;

  const [completed] = await db
    .select({ asset: assets })
    .from(assets)
    .innerJoin(scenes, eq(assets.sceneId, scenes.id))
    .where(and(eq(assets.storyId, storyId), eq(assets.assetType, 'image'), eq(assets.status, 'completed'), eq(scenes.sceneId, sceneId)))
    .orderBy(desc(assets.createdAt))
    .limit(1);

  if (!completed?.asset.storagePath) {
    throw new Error(`No existing image found for story ${storyId} scene ${sceneId}`);
  }
  return resolveStoragePath(completed.asset.storagePath);
}

async function loadSceneAsset(storyId: string, sceneId: number): Promise<Asset | null> {
  const [row] = await db
    .select({ asset: assets })
    .from(assets)
    .innerJoin(scenes, eq(assets.sceneId, scenes.id))
    .where(and(eq(assets.storyId, storyId), eq(assets.assetType, 'image'), eq(scenes.sceneId, sceneId)))
    .orderBy(desc(assets.createdAt))
    .limit(1);
  return row?.asset ?? null;
}

async function loadEnvironmentRef(storyId: string, environmentId: string | undefined): Promise<RefEntry | null> {
  if (!environmentId) return null;
  const [row] = await db
    .select({ cache: environmentImageCache })
    .from(storyEnvironmentCache)
    .innerJoin(environmentImageCache, eq(storyEnvironmentCache.cacheId, environmentImageCache.id))
    .where(and(eq(storyEnvironmentCache.storyId, storyId), eq(storyEnvironmentCache.storyEnvironmentId, environmentId)))
    .limit(1);
  if (!row) return null;
  const ref = await readRef(row.cache.storagePath);
  return {
    base64: ref.base64,
    mimeType: ref.mimeType,
    source: 'environment',
    type: 'environment_reference',
    characterName: 'unknown',
    referenceKind: 'object',
    storagePath: row.cache.storagePath,
  };
}

async function loadOutfitRefs(storyId: string, environmentId: string | undefined, sceneCharacters: string[]): Promise<RefEntry[]> {
  if (!environmentId || sceneCharacters.length === 0) return [];
  const cacheRows = await db
    .select({
      characterKey: storyOutfitPlateCache.characterKey,
      storagePath: outfitPlateCache.storagePath,
    })
    .from(storyOutfitPlateCache)
    .innerJoin(outfitPlateCache, eq(storyOutfitPlateCache.cacheId, outfitPlateCache.id))
    .where(
      and(
        eq(storyOutfitPlateCache.storyId, storyId),
        eq(storyOutfitPlateCache.storyEnvironmentId, environmentId),
      ),
    );

  const refs: RefEntry[] = [];
  for (const row of cacheRows) {
    const matchedName = sceneCharacters.find((name) => normalizeName(name) === normalizeName(row.characterKey));
    if (!matchedName) continue;
    const ref = await readRef(row.storagePath);
    refs.push({
      base64: ref.base64,
      mimeType: ref.mimeType,
      source: 'outfit_plate',
      type: 'outfit_plate_reference',
      characterName: cleanName(matchedName),
      referenceKind: 'object',
      storagePath: row.storagePath,
    });
  }
  return refs;
}

class PromptOnlyImageProvider implements IImageProvider {
  async generateImage(): Promise<GeneratedImage> {
    const imageData = await sharp({
      create: {
        width: 16,
        height: 9,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer();
    return {
      imageData,
      mimeType: 'image/jpeg',
      width: 16,
      height: 9,
      format: 'jpeg',
    };
  }
}

async function loadCharacterRefs(sceneAsset: Asset | null, sceneCharacters: string[], metadataCharacters: any[]): Promise<RefEntry[]> {
  const params = (sceneAsset?.generationParams ?? {}) as any;
  const fromAsset = Array.isArray(params.referenceImages) ? params.referenceImages : [];
  const refs: RefEntry[] = [];
  for (const characterName of sceneCharacters) {
    const characterKey = normalizeName(characterName);
    const assetRef = fromAsset.find((ref: any) => {
      if (ref.source === 'environment' || ref.source === 'outfit_plate') return false;
      return normalizeName(ref.characterName) === characterKey;
    });
    const metadataChar = findMetadataCharacter(metadataCharacters, characterName);
    const storagePath =
      assetRef?.url && assetRef.url !== 'unknown'
        ? assetRef.url
        : metadataChar?.turnaroundSheet?.url || metadataChar?.turnaroundSheet?.frontUrl;
    if (!storagePath) continue;
    const ref = await readRef(storagePath);
    refs.push({
      base64: ref.base64,
      mimeType: ref.mimeType,
      source: assetRef?.source || (humanLikeType(metadataChar?.type) ? 'child_reference' : 'character_reference'),
      type: assetRef?.type || (humanLikeType(metadataChar?.type) ? 'child_reference' : 'character_reference'),
      characterName: cleanName(characterName),
      referenceKind: 'character',
      isTurnaround: /turnaround|llm_turnaround_cache/i.test(storagePath),
      storagePath,
    });
  }
  return refs;
}

async function makeComparison(existingPath: string, generatedPath: string, outPath: string): Promise<void> {
  const labelHeight = 48;
  const targetHeight = 720;
  const gutter = 16;
  const existing = await sharp(existingPath).rotate().resize({ height: targetHeight }).toBuffer({ resolveWithObject: true });
  const generated = await sharp(generatedPath).rotate().resize({ height: targetHeight }).toBuffer({ resolveWithObject: true });
  const width = existing.info.width + generated.info.width + gutter;
  const height = targetHeight + labelHeight;
  const labelSvg = Buffer.from(`
    <svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111827"/>
      <text x="20" y="31" font-family="Arial, sans-serif" font-size="22" fill="#fff">existing</text>
      <text x="${existing.info.width + gutter + 20}" y="31" font-family="Arial, sans-serif" font-size="22" fill="#fff">generated with current prompt</text>
    </svg>
  `);
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#f3f4f6',
    },
  })
    .composite([
      { input: labelSvg, left: 0, top: 0 },
      { input: existing.data, left: 0, top: labelHeight },
      { input: generated.data, left: existing.info.width + gutter, top: labelHeight },
    ])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = args.outDir
    ? path.resolve(process.cwd(), args.outDir)
    : path.join(OUTPUT_ROOT, args.storyId, `scene-${args.sceneId}-${timestamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const [story] = await db.select().from(stories).where(eq(stories.id, args.storyId)).limit(1);
  if (!story) throw new Error(`Story not found: ${args.storyId}`);

  const sceneRows = await db.select().from(scenes).where(eq(scenes.storyId, args.storyId));
  const sceneRow = sceneRows.find((row) => row.sceneId === args.sceneId);
  const storyScenes = (story.scenes as StoryScene[]) || [];
  const storyScene = storyScenes.find((scene) => scene.sceneId === args.sceneId);
  const scene: StoryScene = {
    ...(storyScene ?? {}),
    sceneId: args.sceneId,
    text: storyScene?.text || sceneRow?.text,
    visualPrompt: storyScene?.visualPrompt || sceneRow?.visualPrompt || undefined,
    sceneVisual: storyScene?.sceneVisual || parseSceneVisual({ sceneId: args.sceneId, visualPrompt: sceneRow?.visualPrompt || undefined }),
  };
  if (!scene.sceneVisual && !scene.visualPrompt) throw new Error(`Scene ${args.sceneId} has no visual prompt`);

  const metadata = (story.metadata ?? {}) as any;
  const environments = (metadata.environments ?? []) as StoryEnvironment[];
  const currentEnvironment = environments.find((env) => env.id === scene.environmentId);
  const sceneVisual = buildComposedSceneVisual(scene, currentEnvironment, true);
  const sceneCharacterNames =
    sceneVisual.cameraComposition && typeof sceneVisual.cameraComposition !== 'string'
      ? sceneVisual.cameraComposition.characters.map((char) => char.name)
      : [];
  const metadataCharacters = Array.isArray(metadata.mergedCharacters) ? metadata.mergedCharacters : [];
  const metadataIds = metadataCharacters.map((char: any) => char.id).filter((id: unknown): id is string => typeof id === 'string');
  const dbCharactersById = await loadCharacterRowsById(metadataIds);
  const aliasesById = await loadNameAliasesById(metadataIds);
  const mergedCharacters = metadataCharacters.map((char: any) => ({
    ...dbCharactersById.get(char.id),
    ...char,
  }));

  const sceneAsset = await loadSceneAsset(args.storyId, args.sceneId);
  const envRef = await loadEnvironmentRef(args.storyId, scene.environmentId);
  const characterRefs = await loadCharacterRefs(sceneAsset, sceneCharacterNames, mergedCharacters);
  const outfitRefs = await loadOutfitRefs(args.storyId, scene.environmentId, sceneCharacterNames);
  const refs: RefEntry[] = [...(envRef ? [envRef] : []), ...characterRefs, ...outfitRefs];
  const imageIndexMap = assignSequentialImageIndices(refs);
  const subjectAliasByImageIndex = buildSubjectAliasByImageIndex(imageIndexMap);
  const referenceImages: ReferenceImage[] = refs.map((ref) => ({
    base64Data: ref.base64,
    mimeType: ref.mimeType,
    instructionText: referenceInstruction(ref, subjectAliasByImageIndex, imageIndexMap),
    characterName: ref.characterName,
    referenceKind: ref.referenceKind,
  }));

  const outfitPlateImageIndexByCharacter = collectOutfitPlateImageIndices(refs);
  const imaginaryCharacters = characterRefs.map((ref) => {
    const metadataChar = findMetadataCharacter(mergedCharacters, ref.characterName || '');
    return {
      name: ref.characterName || '',
      isTurnaround: !!ref.isTurnaround,
      nameAliases: buildAliases(metadataChar, aliasesById),
    };
  });
  const refNameSet = new Set(imaginaryCharacters.map((char) => normalizeName(char.name)));
  const realWorldCharacters = sceneCharacterNames
    .filter((name) => !refNameSet.has(normalizeName(name)))
    .map((name) => {
      const metadataChar = findMetadataCharacter(mergedCharacters, name);
      return {
        name,
        description:
          metadataChar?.descriptionEn ||
          metadataChar?.aiGeneratedDescription ||
          metadataChar?.appearance ||
          metadataChar?.description ||
          name,
        nameAliases: buildAliases(metadataChar, aliasesById),
      };
    });

  const existingImage = await findExistingImage(args, args.storyId, args.sceneId);
  const style = (metadata.imageStyle || config.image.defaultStyle) as string;
  const ageGroup = story.ageGroup || '6-8';
  const characterOutfits = buildOutfitMap(scene, metadata.outfits as StoryOutfit[] | undefined);
  const imageProvider = args.promptOnly
    ? new PromptOnlyImageProvider()
    : new NanoBananaProProvider(undefined, args.model);
  const imageDomain = new ImageDomainService(imageProvider);
  let builtPrompt: BuiltPromptSnapshot | undefined;

  const request = {
    primaryRead: scene.primaryRead,
    sceneVisual,
    visualPrompt: scene.visualPrompt,
    sceneId: args.sceneId,
    sceneText: scene.text,
    ageGroup,
    style,
    aspectRatio: '16:9' as const,
    realWorldCharacters,
    imaginaryCharacters,
    referenceImages,
    imageIndexMap,
    outfitPlateImageIndexByCharacter,
    currentEnvironment,
    characterOutfits,
    scenarioCardId: undefined,
    hasEnvironmentImageRef: !!envRef,
  };

  await writeJson(path.join(outDir, 'request.json'), {
    storyId: args.storyId,
    sceneId: args.sceneId,
    model: args.model || config.nanoBanana.model,
    style,
    ageGroup,
    existingImage,
    sceneVisual,
    currentEnvironment,
    imageIndexMap: Object.fromEntries(imageIndexMap),
    outfitPlateImageIndexByCharacter: Object.fromEntries(outfitPlateImageIndexByCharacter),
    imaginaryCharacters,
    realWorldCharacters,
    characterOutfits,
    referenceSources: refs.map((ref) => ({
      imageIndex: ref.imageIndex,
      source: ref.source,
      type: ref.type,
      characterName: ref.characterName,
      referenceKind: ref.referenceKind,
      isTurnaround: ref.isTurnaround,
      storagePath: ref.storagePath,
      mimeType: ref.mimeType,
      instructionText: referenceInstruction(ref, subjectAliasByImageIndex, imageIndexMap),
    })),
  });

  if (args.promptOnly) {
    await imageDomain.generateSceneWithReference(request, {
      onBuiltPrompt: async (payload) => {
        builtPrompt = payload as BuiltPromptSnapshot;
      },
    });
    if (builtPrompt) {
      await fs.writeFile(path.join(outDir, 'prompt.txt'), builtPrompt.prompt, 'utf8');
      await fs.writeFile(path.join(outDir, 'systemInstruction.txt'), builtPrompt.systemInstruction || '', 'utf8');
      await writeJson(path.join(outDir, 'references.json'), builtPrompt.referenceImages || []);
    }
    console.log(`Prompt-only output: ${outDir}`);
    return;
  }

  for (let i = 1; i <= args.runs; i++) {
    console.log(`Generating scene ${args.sceneId}, run ${i}/${args.runs}...`);
    const image = await imageDomain.generateSceneWithReference(request, {
      onBuiltPrompt: async (payload) => {
        builtPrompt = payload as BuiltPromptSnapshot;
      },
    });

    if (builtPrompt) {
      await fs.writeFile(path.join(outDir, 'prompt.txt'), builtPrompt.prompt, 'utf8');
      await fs.writeFile(path.join(outDir, 'systemInstruction.txt'), builtPrompt.systemInstruction || '', 'utf8');
      await writeJson(path.join(outDir, 'references.json'), builtPrompt.referenceImages || []);
    }

    const ext = image.format === 'png' ? 'png' : image.format === 'webp' ? 'webp' : 'jpg';
    const imagePath = path.join(outDir, `generated-${i}.${ext}`);
    await fs.writeFile(imagePath, image.imageData);
    await writeJson(path.join(outDir, `result-${i}.json`), {
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      format: image.format,
      providerInteractionId: image.providerInteractionId,
    });
    await makeComparison(existingImage, imagePath, path.join(outDir, `comparison-${i}.jpg`));
  }

  console.log(`Output: ${outDir}`);
  console.log(`Existing: ${existingImage}`);
  console.log(`Comparison: ${path.join(outDir, 'comparison-1.jpg')}`);
}

main()
  .then(async () => {
    await closeDatabaseConnection();
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.stack || err.message : err);
    await closeDatabaseConnection().catch(() => undefined);
    process.exitCode = 1;
  });
