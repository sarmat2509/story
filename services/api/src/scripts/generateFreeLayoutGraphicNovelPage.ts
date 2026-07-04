/**
 * Generate one experimental graphic-novel page without sending a preset layout guide image.
 *
 * The script reads an existing graphic-novel project, collects N staged panels
 * starting from --page, attaches the usual environment/character references plus
 * outfit plates, and asks the image model to choose a 5-panel comic layout itself.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx \
 *     src/scripts/generateFreeLayoutGraphicNovelPage.ts \
 *     --story-id=<uuid> --page=1 --panel-count=5
 *
 * Add --prompt-only=true to write the exact system/prompt/report files without
 * calling the image generator.
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import { stripCharacterIdFromName } from '@wondertales/shared';
import { config } from '../config';
import { closeDatabaseConnection } from '../db';
import {
  buildGraphicNovelPageFreeLayoutInstructions,
  buildGraphicNovelPageFreeLayoutSystemInstruction,
  generateGraphicNovelPageFreeLayout,
  planGraphicNovelLayouts,
  type GraphicNovelPanelScript,
  type GraphicNovelScript,
  type PlannedGraphicNovelPage,
} from '../domain/graphicNovel';
import { getGraphicNovelRepository, getStoryRepository } from '../repositories';
import { getAssetStorageService } from '../services/assetStorageService';
import { getComplexImageDomainService } from '../services/aiService';
import { recordUsage } from '../services/aiUsageService';
import { getOrCreateEnvironmentImage } from '../services/environmentReferenceImageService';
import {
  applyReferenceBucketLimits,
  assignSequentialImageIndices,
  logReferenceBucketDelivery,
  type ReferenceImageDataEntry,
} from '../services/referenceImageBuckets';
import {
  getOrCreateOutfitPlateImage,
  normalizeOutfitPlateCharacterKey,
  shouldGenerateOutfitPlateForCharacter,
} from '../services/outfitPlateService';
import { formatReferenceBindingInstruction } from '../services/referenceBinding';
import type { StoryEnvironment, StoryOutfitRow } from '../ai/types';
import type { ReferenceImage } from '../providers/base/IImageProvider';
import type { CharacterData } from '../services/types';
import { isNaturalAppearanceOutfit } from '../utils/characterOutfits';

type CharacterManifest = Array<{
  name: string;
  canonicalName?: string;
  nameAliases?: string[];
  type?: string;
  subtype?: string | null;
  childProfileId?: string | null;
  source?: CharacterData['source'];
  references?: Array<{
    storagePath: string;
    source?: string;
    type?: string;
    isTurnaround?: boolean;
  }>;
}>;

type GraphicNovelReferenceImage = ReferenceImage & {
  source?: string;
  type?: string;
  isTurnaround?: boolean;
  environmentId?: string;
  outfitId?: string;
  storagePath?: string;
  imageIndex?: number;
};

type BucketableReference = ReferenceImageDataEntry & {
  environmentId?: string;
  outfitId?: string;
  storagePath?: string;
};

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function argBoolean(name: string, defaultValue: boolean): boolean {
  const raw = argValue(name);
  if (raw === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'y'].includes(raw.trim().toLowerCase());
}

function normalizeName(value: string | undefined | null): string {
  return stripCharacterIdFromName(value || '').trim().toLowerCase();
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'ref';
}

function mimeTypeForStoragePath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function extensionForMimeType(mimeType?: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function pageCharacterNames(page: PlannedGraphicNovelPage): string[] {
  const byName = new Map<string, string>();
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition === 'string') continue;
    for (const character of composition.characters) {
      const key = normalizeName(character.name);
      if (key && !byName.has(key)) byName.set(key, character.name);
    }
  }
  return [...byName.values()];
}

function characterMatchesPageName(
  character: CharacterManifest[number],
  pageNameKey: string
): boolean {
  return [character.name, character.canonicalName, ...(character.nameAliases || [])]
    .filter((value): value is string => !!value)
    .some((name) => normalizeName(name) === pageNameKey);
}

function characterForPageName(
  characters: CharacterManifest,
  pageName: string
): CharacterManifest[number] | undefined {
  const key = normalizeName(pageName);
  return characters.find((character) => characterMatchesPageName(character, key));
}

function environmentsByIdForPage(
  page: PlannedGraphicNovelPage,
  environments: StoryEnvironment[]
): Map<string, StoryEnvironment> {
  const all = new Map(environments.map((environment) => [environment.id, environment]));
  const used = new Map<string, StoryEnvironment>();
  for (const panel of page.panels) {
    const environment = all.get(panel.script.visual.environmentId);
    if (environment) used.set(environment.id, environment);
  }
  return used;
}

function collectPanelScripts(params: {
  pages: Array<{ pageNumber: number; layoutJson: unknown }>;
  startPageNumber: number;
  panelCount: number;
}): {
  panelScripts: GraphicNovelPanelScript[];
  sourcePageNumbers: number[];
  firstSavedPage: PlannedGraphicNovelPage;
} {
  const panelScripts: GraphicNovelPanelScript[] = [];
  const sourcePageNumbers: number[] = [];
  let firstSavedPage: PlannedGraphicNovelPage | undefined;

  for (const row of params.pages) {
    if (row.pageNumber < params.startPageNumber) continue;
    const savedPage = row.layoutJson as PlannedGraphicNovelPage;
    if (!firstSavedPage) firstSavedPage = savedPage;

    for (const panel of savedPage.panels || []) {
      if (panelScripts.length >= params.panelCount) break;
      panelScripts.push(panel.script);
      sourcePageNumbers.push(row.pageNumber);
    }
    if (panelScripts.length >= params.panelCount) break;
  }

  if (!firstSavedPage) {
    throw new Error(`No saved page found at or after page ${params.startPageNumber}`);
  }
  if (panelScripts.length < params.panelCount) {
    throw new Error(
      `Only collected ${panelScripts.length} panels at or after page ${params.startPageNumber}; requested ${params.panelCount}`
    );
  }

  return { panelScripts, sourcePageNumbers, firstSavedPage };
}

async function loadRequiredCharacterReferences(params: {
  page: PlannedGraphicNovelPage;
  characters: CharacterManifest;
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
}): Promise<GraphicNovelReferenceImage[]> {
  const pageNames = pageCharacterNames(params.page);
  if (pageNames.length === 0) {
    throw new Error('The selected panels have no staged characters; refusing to generate');
  }

  const assetStorage = getAssetStorageService();
  const references: GraphicNovelReferenceImage[] = [];
  const missing: string[] = [];

  for (const pageName of pageNames) {
    const character = characterForPageName(params.characters, pageName);
    const ref = character?.references?.find((item) => item.storagePath);
    if (!character || !ref?.storagePath) {
      missing.push(pageName);
      continue;
    }

    const buffer = await assetStorage.getAssetByPath(ref.storagePath).catch(() => null);
    if (!buffer) {
      missing.push(`${pageName} (${ref.storagePath})`);
      continue;
    }

    const mimeType = mimeTypeForStoragePath(ref.storagePath);
    const uploaded =
      config.nanoBanana?.enableFilesApi === true
        ? await params.imageDomain.uploadReferenceFile(
            buffer,
            mimeType,
            `free_layout_graphic_novel_reference_${character.name}`,
            ref.storagePath
          )
        : null;

    references.push({
      base64Data: uploaded ? undefined : buffer.toString('base64'),
      fileUri: uploaded?.uri,
      mimeType: uploaded?.mimeType || mimeType,
      characterName: pageName,
      referenceKind: 'character',
      source: ref.source,
      type: ref.type,
      isTurnaround: ref.isTurnaround,
      storagePath: ref.storagePath,
    });
  }

  if (missing.length > 0) {
    throw new Error(`Missing required character references: ${missing.join(', ')}`);
  }

  return references;
}

async function buildEnvironmentReferences(params: {
  storyId: string;
  userId: string;
  page: PlannedGraphicNovelPage;
  environmentsById: Map<string, StoryEnvironment>;
}): Promise<GraphicNovelReferenceImage[]> {
  const assetStorage = getAssetStorageService();
  const references: GraphicNovelReferenceImage[] = [];

  for (const environment of params.environmentsById.values()) {
    const image = await getOrCreateEnvironmentImage({
      storyId: params.storyId,
      userId: params.userId,
      storyEnvironmentId: environment.id,
      environment,
      assetStorage,
    });
    if (!image) continue;
    const mimeType = image.storagePath
      ? mimeTypeForStoragePath(image.storagePath)
      : image.mimeType;

    references.push({
      base64Data: image.base64,
      mimeType,
      referenceKind: 'object',
      characterName: environment.name,
      source: 'environment',
      type: 'environment_reference',
      environmentId: environment.id,
      storagePath: image.storagePath,
    });
  }

  return references;
}

function collectOutfitRequests(params: {
  page: PlannedGraphicNovelPage;
  characters: CharacterManifest;
}): Array<{
  characterName: string;
  outfit: StoryOutfitRow;
  environmentId: string;
}> {
  const outfitsById = new Map((params.page.outfits || []).map((outfit) => [outfit.id, outfit]));
  const seen = new Set<string>();
  const requests: Array<{
    characterName: string;
    outfit: StoryOutfitRow;
    environmentId: string;
  }> = [];

  for (const panel of params.page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition === 'string') continue;

    for (const character of composition.characters) {
      if (!character.outfitId) continue;
      const outfit = outfitsById.get(character.outfitId);
      if (!outfit?.description?.trim()) continue;
      if (isNaturalAppearanceOutfit(outfit.description)) continue;

      const manifestCharacter = characterForPageName(params.characters, character.name);
      if (
        manifestCharacter &&
        !shouldGenerateOutfitPlateForCharacter(manifestCharacter as CharacterData)
      ) {
        continue;
      }

      const key = [normalizeName(character.name), outfit.id].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      requests.push({
        characterName: character.name,
        outfit,
        environmentId: panel.script.visual.environmentId,
      });
    }
  }

  return requests;
}

async function buildOutfitPlateReferences(params: {
  storyId: string;
  userId: string;
  page: PlannedGraphicNovelPage;
  characters: CharacterManifest;
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  imageStyle: string;
  ageGroup: string;
  scenarioCardId?: string;
}): Promise<GraphicNovelReferenceImage[]> {
  const assetStorage = getAssetStorageService();
  const requests = collectOutfitRequests({ page: params.page, characters: params.characters });
  const references: GraphicNovelReferenceImage[] = [];

  for (const request of requests) {
    const plate = await getOrCreateOutfitPlateImage({
      storyId: params.storyId,
      userId: params.userId,
      storyEnvironmentId: request.environmentId,
      characterName: request.characterName,
      outfitTextRaw: request.outfit.description,
      outfitId: request.outfit.id,
      imageStyle: params.imageStyle,
      ageGroup: params.ageGroup,
      scenarioCardId: params.scenarioCardId,
      assetStorage,
    });
    if (!plate) continue;

    const mimeType = plate.storagePath
      ? mimeTypeForStoragePath(plate.storagePath)
      : plate.mimeType;
    let fileUri = plate.fileUri;
    if (config.nanoBanana?.enableFilesApi === true && plate.base64) {
      const buffer = Buffer.from(plate.base64, 'base64');
      const uploaded = await params.imageDomain.uploadReferenceFile(
        buffer,
        mimeType,
        `free_layout_outfit_${normalizeOutfitPlateCharacterKey(request.characterName)}`,
        plate.storagePath
      );
      fileUri = uploaded?.uri || fileUri;
    }

    references.push({
      base64Data: fileUri ? undefined : plate.base64,
      fileUri,
      mimeType,
      referenceKind: 'object',
      characterName: request.characterName,
      source: 'outfit_plate',
      type: 'outfit_plate_reference',
      outfitId: request.outfit.id,
      storagePath: plate.storagePath,
    });
  }

  return references;
}

function buildReferenceInstruction(
  reference: GraphicNovelReferenceImage,
  imageIndex: number
): string {
  return formatReferenceBindingInstruction(reference, imageIndex);
}

function prepareReferences(params: {
  storyId: string;
  pageNumber: number;
  references: GraphicNovelReferenceImage[];
}): {
  references: GraphicNovelReferenceImage[];
  droppedCharacterCount: number;
  droppedObjectCount: number;
  characterCount: number;
  objectCount: number;
} {
  const bucketInput: BucketableReference[] = params.references.map((ref) => ({
    base64: ref.base64Data || '',
    mimeType: ref.mimeType || 'image/png',
    fileUri: ref.fileUri,
    source: ref.source,
    type: ref.type,
    characterName: ref.characterName,
    referenceKind: ref.referenceKind,
    isTurnaround: ref.isTurnaround,
    environmentId: ref.environmentId,
    outfitId: ref.outfitId,
    storagePath: ref.storagePath,
  }));

  const bucketResult = applyReferenceBucketLimits(
    bucketInput,
    config.image.maxCharacterReferenceImages,
    config.image.maxObjectReferenceImages
  );
  assignSequentialImageIndices(bucketResult.trimmed);
  logReferenceBucketDelivery({
    storyId: params.storyId,
    sceneId: params.pageNumber,
    characterCount: bucketResult.characterCount,
    objectCount: bucketResult.objectCount,
    droppedCharacterCount: bucketResult.droppedCharacterCount,
    droppedObjectCount: bucketResult.droppedObjectCount,
    totalAfterTrim: bucketResult.trimmed.length,
  });

  const references = bucketResult.trimmed.map((ref) => {
    const imageIndex = ref.imageIndex || 1;
    const mapped: GraphicNovelReferenceImage = {
      base64Data: ref.fileUri ? undefined : ref.base64 || undefined,
      fileUri: ref.fileUri,
      mimeType: ref.mimeType,
      characterName: ref.characterName,
      referenceKind: ref.referenceKind,
      source: ref.source,
      type: ref.type,
      isTurnaround: ref.isTurnaround,
      environmentId: ref.environmentId,
      outfitId: ref.outfitId,
      storagePath: ref.storagePath,
      referenceBindingId: ref.referenceBindingId,
      imageIndex,
    };
    return {
      ...mapped,
      instructionText: buildReferenceInstruction(mapped, imageIndex),
    };
  });

  return {
    references,
    droppedCharacterCount: bucketResult.droppedCharacterCount,
    droppedObjectCount: bucketResult.droppedObjectCount,
    characterCount: bucketResult.characterCount,
    objectCount: bucketResult.objectCount,
  };
}

async function writeReferenceDebugImages(params: {
  outputDir: string;
  references: GraphicNovelReferenceImage[];
}): Promise<void> {
  const assetStorage = getAssetStorageService();
  const refsDir = path.join(params.outputDir, 'references');
  await fs.mkdir(refsDir, { recursive: true });

  for (const ref of params.references) {
    let buffer: Buffer | null = null;
    if (ref.base64Data) {
      buffer = Buffer.from(ref.base64Data, 'base64');
    } else if (ref.storagePath) {
      buffer = await assetStorage.getAssetByPath(ref.storagePath).catch(() => null);
    }
    if (!buffer) continue;

    const label = [
      String(ref.imageIndex || 0).padStart(2, '0'),
      ref.source || ref.referenceKind || 'reference',
      safeFilePart(ref.characterName || ref.environmentId || ref.outfitId || 'reference'),
    ].join('-');
    const ext = extensionForMimeType(ref.mimeType);
    await fs.writeFile(path.join(refsDir, `${label}.${ext}`), buffer);
  }
}

function referenceReport(ref: GraphicNovelReferenceImage): Record<string, unknown> {
  return {
    index: ref.imageIndex ?? null,
    characterName: ref.characterName ?? null,
    referenceKind: ref.referenceKind ?? null,
    source: ref.source ?? null,
    type: ref.type ?? null,
    isTurnaround: ref.isTurnaround ?? null,
    environmentId: ref.environmentId ?? null,
    outfitId: ref.outfitId ?? null,
    storagePath: ref.storagePath ?? null,
    referenceBindingId: ref.referenceBindingId ?? null,
    hasFileUri: !!ref.fileUri,
    hasBase64Data: !!ref.base64Data,
    instructionText: ref.instructionText ?? null,
  };
}

async function main(): Promise<void> {
  const storyId = argValue('story-id');
  if (!storyId) {
    throw new Error('Missing required --story-id=<uuid>');
  }

  const pageNumber = Number(argValue('page') || '1');
  const panelCount = Number(argValue('panel-count') || '5');
  const includeOutfitPlates = argBoolean('outfit-plates', true);
  const promptOnly = argBoolean('prompt-only', false);
  const outputDir = path.resolve(
    process.cwd(),
    'output',
    `free-layout-comic-experiment-${storyId}-p${pageNumber}-${Date.now()}`
  );
  await fs.mkdir(outputDir, { recursive: true });

  const story = await getStoryRepository().findById(storyId);
  if (!story) throw new Error(`Story not found: ${storyId}`);

  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) throw new Error(`Graphic novel project not found for story ${storyId}`);

  const pageRows = await getGraphicNovelRepository().findPagesByProjectId(project.id);
  const { panelScripts, sourcePageNumbers, firstSavedPage } = collectPanelScripts({
    pages: pageRows,
    startPageNumber: pageNumber,
    panelCount,
  });

  const script = project.scriptJson as GraphicNovelScript;
  const storyMetadata = (story.metadata || {}) as Record<string, unknown>;
  const ageGroup = project.ageGroup || story.ageGroup || '6-8';
  const style =
    argValue('style') ||
    (storyMetadata.imageStyle as string | undefined) ||
    'soft_watercolor';
  const scenarioCardId =
    argValue('scenario-card-id') ||
    (storyMetadata.scenarioCardId as string | undefined) ||
    undefined;
  const outfits = (Array.isArray(script.outfits) ? script.outfits : []) as StoryOutfitRow[];

  const [page] = planGraphicNovelLayouts({
    ageGroup,
    pages: [{
      pageNumber,
      pageRole: firstSavedPage.pageRole,
      panels: panelScripts,
    }],
    outfits,
    preservePanelCount: true,
  });
  page.characterAliases = firstSavedPage.characterAliases;

  const environments = Array.isArray(script.environments) ? script.environments : [];
  const environmentsById = environmentsByIdForPage(page, environments);
  const characters =
    ((project.layoutManifest as { characters?: CharacterManifest } | null)?.characters || []);
  const imageDomain = getComplexImageDomainService();

  const environmentReferences = await buildEnvironmentReferences({
    storyId,
    userId: story.userId,
    page,
    environmentsById,
  });
  const characterReferences = await loadRequiredCharacterReferences({
    page,
    characters,
    imageDomain,
  });
  const outfitReferences = includeOutfitPlates
    ? await buildOutfitPlateReferences({
        storyId,
        userId: story.userId,
        page,
        characters,
        imageDomain,
        imageStyle: style,
        ageGroup,
        scenarioCardId,
      })
    : [];

  const prepared = prepareReferences({
    storyId,
    pageNumber,
    references: [
      ...environmentReferences,
      ...characterReferences,
      ...outfitReferences,
    ],
  });

  await writeReferenceDebugImages({
    outputDir,
    references: prepared.references,
  });

  const systemInstruction = buildGraphicNovelPageFreeLayoutSystemInstruction({
    style,
    panelCount: page.panels.length,
    ageGroup,
    scenarioCardId,
  });
  const prompt = buildGraphicNovelPageFreeLayoutInstructions(
    page,
    environmentsById,
    prepared.references
  );
  await fs.writeFile(path.join(outputDir, `page-${pageNumber}-free-layout-system.txt`), systemInstruction);
  await fs.writeFile(path.join(outputDir, `page-${pageNumber}-free-layout-prompt.txt`), prompt);

  const baseReport = {
    storyId,
    projectId: project.id,
    pageNumber,
    requestedPanelCount: panelCount,
    actualPanelCount: page.panels.length,
    sourcePageNumbers,
    outputDir,
    imagePath: null as string | null,
    style,
    ageGroup,
    scenarioCardId: scenarioCardId ?? null,
    presetLayoutReferenceSent: false,
    modelChoosesPanelLayout: true,
    planningLayoutId: page.template.id,
    promptOnly,
    references: {
      beforeBucket: {
        environment: environmentReferences.length,
        character: characterReferences.length,
        outfitPlate: outfitReferences.length,
      },
      afterBucket: {
        total: prepared.references.length,
        character: prepared.characterCount,
        object: prepared.objectCount,
        droppedCharacter: prepared.droppedCharacterCount,
        droppedObject: prepared.droppedObjectCount,
      },
      items: prepared.references.map(referenceReport),
    },
    panels: page.panels.map((panel, index) => ({
      index: index + 1,
      panelId: panel.script.panelId,
      environmentId: panel.script.visual.environmentId,
      primaryRead: panel.script.visual.primaryRead,
      cameraComposition: panel.script.visual.sceneVisual.cameraComposition,
    })),
    promptFiles: {
      system: path.join(outputDir, `page-${pageNumber}-free-layout-system.txt`),
      prompt: path.join(outputDir, `page-${pageNumber}-free-layout-prompt.txt`),
    },
  };

  if (promptOnly) {
    const reportPath = path.join(outputDir, `page-${pageNumber}-free-layout-report.json`);
    await fs.writeFile(reportPath, JSON.stringify(baseReport, null, 2));

    console.log(JSON.stringify({
      status: 'prompt_only',
      outputDir,
      reportPath,
      promptPath: baseReport.promptFiles.prompt,
      systemPath: baseReport.promptFiles.system,
      referenceCount: prepared.references.length,
      templateReferenceSent: false,
    }, null, 2));
    return;
  }

  const rendered = await generateGraphicNovelPageFreeLayout({
    imageDomain,
    page,
    style,
    ageGroup,
    scenarioCardId,
    environmentsById,
    referenceImages: prepared.references,
    onUsage: (usage) => recordUsage(usage, { userId: story.userId, storyId }),
    onAttemptImage: async ({ imageData, mimeType }) => {
      const ext = extensionForMimeType(mimeType);
      await fs.writeFile(path.join(outputDir, `page-${pageNumber}-free-layout-attempt-1.${ext}`), imageData);
    },
  });

  const imageExt = extensionForMimeType(rendered.mimeType);
  const imagePath = path.join(outputDir, `page-${pageNumber}-free-layout-art-only.${imageExt}`);
  await fs.writeFile(imagePath, rendered.imageData);

  const report = {
    ...baseReport,
    imagePath,
    generationParams: rendered.generationParams,
  };
  const reportPath = path.join(outputDir, `page-${pageNumber}-free-layout-report.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    status: 'ok',
    outputDir,
    imagePath,
    reportPath,
    referenceCount: prepared.references.length,
    templateReferenceSent: false,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
