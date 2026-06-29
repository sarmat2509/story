/**
 * Regenerate a single graphic-novel page from the saved project/page layout.
 *
 * This script hard-stops before image generation unless every character staged
 * on the page has a readable character reference attached.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx \
 *     src/scripts/regenerateGraphicNovelPageFromProject.ts \
 *     --story-id=<uuid> --page=2
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import { stripCharacterIdFromName } from '@wondertales/shared';
import {
  analyzeGraphicNovelBubbleVisionByPanelCrops,
  applyGraphicNovelBubbleVisionLayout,
  buildGraphicNovelPageTextOverlay,
  editGraphicNovelPage,
  overlayGraphicNovelTemplate,
  planGraphicNovelLayouts,
  renderGraphicNovelPageTemplate,
  type GraphicNovelBubbleVisionAnalysis,
  type PlannedGraphicNovelPage,
} from '../domain/graphicNovel';
import { config } from '../config';
import { closeDatabaseConnection } from '../db';
import {
  getAssetRepository,
  getGraphicNovelRepository,
  getStoryRepository,
} from '../repositories';
import { getAssetStorageService } from '../services/assetStorageService';
import {
  getComplexImageDomainService,
  getValidationTextProvider,
} from '../services/aiService';
import { recordUsage } from '../services/aiUsageService';
import type { StoryEnvironment } from '../ai/types';
import type { ReferenceImage } from '../providers/base/IImageProvider';
import { stripAllTags, stripCharacterIds, stripForAudio } from '../utils/audioTags';

type CharacterManifest = Array<{
  name: string;
  canonicalName?: string;
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
};

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeName(value: string): string {
  return stripCharacterIdFromName(value).trim().toLowerCase();
}

function pageCharacterNames(page: PlannedGraphicNovelPage): string[] {
  const byName = new Map<string, string>();
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition === 'string') continue;
    for (const character of composition.characters) {
      const name = character.name?.trim();
      const key = name ? normalizeName(name) : '';
      if (key && !byName.has(key)) byName.set(key, name);
    }
  }
  return [...byName.values()];
}

function characterMatchesPageName(
  character: CharacterManifest[number],
  pageNameKey: string
): boolean {
  return [character.name, character.canonicalName]
    .filter((value): value is string => !!value)
    .some((name) => normalizeName(name) === pageNameKey);
}

function mimeTypeForStoragePath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

async function loadRequiredCharacterReferences(params: {
  page: PlannedGraphicNovelPage;
  characters: CharacterManifest;
}): Promise<GraphicNovelReferenceImage[]> {
  const pageNames = pageCharacterNames(params.page);
  if (pageNames.length === 0) {
    throw new Error(`Page ${params.page.pageNumber} has no staged characters; refusing to regenerate`);
  }

  const assetStorage = getAssetStorageService();
  const imageDomain = getComplexImageDomainService();
  const references: GraphicNovelReferenceImage[] = [];
  const missing: string[] = [];

  for (const pageName of pageNames) {
    const key = normalizeName(pageName);
    const character = params.characters.find((item) => characterMatchesPageName(item, key));
    const ref = character?.references?.[0];
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
    const uploaded = config.nanoBanana?.enableFilesApi === true
      ? await imageDomain.uploadReferenceFile(
          buffer,
          mimeType,
          `graphic_novel_reference_${character.name}`,
          ref.storagePath
        )
      : null;
    const referenceIndex = references.length;
    references.push({
      base64Data: uploaded ? undefined : buffer.toString('base64'),
      fileUri: uploaded?.uri,
      mimeType: uploaded?.mimeType || mimeType,
      characterName: character.name,
      referenceKind: 'character',
      source: ref.source,
      type: ref.type,
      isTurnaround: ref.isTurnaround,
      instructionText: `Image ${referenceIndex + 1}: Character reference for "${character.name}". ${ref.isTurnaround ? 'Character sheet' : 'Reference photo'}.`,
    });
  }

  if (missing.length > 0) {
    throw new Error(`Missing required character references for page ${params.page.pageNumber}: ${missing.join(', ')}`);
  }

  return references;
}

function environmentsByIdForPage(
  page: PlannedGraphicNovelPage,
  environments: StoryEnvironment[]
): Map<string, StoryEnvironment> {
  const byId = new Map(environments.map((environment) => [environment.id, environment]));
  const used = new Map<string, StoryEnvironment>();
  for (const panel of page.panels) {
    const environment = byId.get(panel.script.visual.environmentId);
    if (environment) used.set(environment.id, environment);
  }
  return used;
}

function buildBubbleLayoutJson(page: PlannedGraphicNovelPage): Record<string, unknown> {
  return {
    mode: 'html_overlay',
    placementMode: 'post_art_vision',
    panels: page.panels.map((panel) => ({
      panelId: panel.script.panelId,
      bubbles: panel.bubbles,
    })),
    textOverlay: buildGraphicNovelPageTextOverlay(page, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    }),
  };
}

function replanPageFromSavedScript(params: {
  savedPage: PlannedGraphicNovelPage;
  ageGroup: string;
  preferredTemplateId?: string;
}): {
  page: PlannedGraphicNovelPage;
  scenePanelCount: number;
  savedTemplateId: string | null;
  savedTemplateSlotCount: number | null;
} {
  const scenePanels = params.savedPage.panels.map((panel) => panel.script);
  const [page] = planGraphicNovelLayouts({
    ageGroup: params.ageGroup,
    pages: [{
      pageNumber: params.savedPage.pageNumber,
      pageRole: params.savedPage.pageRole,
      panels: scenePanels,
    }],
    preservePanelCount: true,
    preferredTemplateId: params.preferredTemplateId,
  });

  if (!page) {
    throw new Error(`Failed to plan graphic novel page ${params.savedPage.pageNumber}`);
  }
  if (page.panels.length !== scenePanels.length || page.template.panelCount !== scenePanels.length) {
    throw new Error(
      `Template/panel mismatch after planning page ${params.savedPage.pageNumber}: template=${page.template.id} slots=${page.template.panelCount}, scenes=${scenePanels.length}, plannedPanels=${page.panels.length}`
    );
  }

  return {
    page,
    scenePanelCount: scenePanels.length,
    savedTemplateId: params.savedPage.template?.id ?? null,
    savedTemplateSlotCount: Array.isArray(params.savedPage.template?.panels)
      ? params.savedPage.template.panels.length
      : null,
  };
}

async function saveThumbnail(assetId: string, storagePath: string, imageBuffer: Buffer): Promise<void> {
  const assetStorage = getAssetStorageService();
  const thumbnailBuffer = await assetStorage.generateThumbnail(imageBuffer, 384, 512);
  const thumbnailPath = storagePath.replace(/(\.[^.]+)$/, '_thumb.jpg');
  const fullPath = path.join(process.cwd(), 'uploads', thumbnailPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, thumbnailBuffer);
  await getAssetRepository().update(assetId, {
    thumbnailPath,
    thumbnailUrl: `/api/v1/assets/${thumbnailPath}`,
  });
}

function normalizeVisionMimeType(mimeType: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (mimeType === 'image/jpeg' || mimeType === 'image/webp') return mimeType;
  return 'image/png';
}

async function main(): Promise<void> {
  const storyId = argValue('story-id') || '8d1db0cd-7161-43ce-9654-cd5ce26c5c21';
  const pageNumber = Number(argValue('page') || '2');
  const preferredTemplateId = argValue('template-id');
  const style = argValue('style') || 'soft watercolor children graphic novel, clean ink line art';
  const outputDir = path.resolve(
    process.cwd(),
    'output',
    `graphic-novel-page-regenerate-${storyId}-p${pageNumber}-${Date.now()}`
  );
  await fs.mkdir(outputDir, { recursive: true });
  process.env.GRAPHIC_NOVEL_DEBUG_OUTPUT_DIR = outputDir;

  const story = await getStoryRepository().findById(storyId);
  if (!story) throw new Error(`Story not found: ${storyId}`);
  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) throw new Error(`Graphic novel project not found: ${storyId}`);
  const pageRow = await getGraphicNovelRepository().findPageByProjectAndNumber(project.id, pageNumber);
  if (!pageRow) throw new Error(`Page ${pageNumber} not found for story ${storyId}`);

  const savedPage = pageRow.layoutJson as PlannedGraphicNovelPage;
  const replanned = replanPageFromSavedScript({
    savedPage,
    ageGroup: project.ageGroup || story.ageGroup || '6-8',
    preferredTemplateId,
  });
  const page = replanned.page;
  const ageGroup = project.ageGroup || story.ageGroup || '6-8';
  const characters = ((project.layoutManifest as { characters?: CharacterManifest } | null)?.characters || []);
  const script = project.scriptJson as { environments?: StoryEnvironment[] };
  const environments = script.environments || [];
  const environmentsById = environmentsByIdForPage(page, environments);
  const referenceImages = await loadRequiredCharacterReferences({ page, characters });
  const stagedCharacters = pageCharacterNames(page);

  if (referenceImages.length !== stagedCharacters.length) {
    throw new Error(
      `Reference guard failed before image generation: staged=${stagedCharacters.length}, loaded=${referenceImages.length}`
    );
  }

  const templateBuffer = await renderGraphicNovelPageTemplate(page);
  await fs.writeFile(path.join(outputDir, `page-${pageNumber}-template.png`), templateBuffer);
  await fs.writeFile(path.join(outputDir, `page-${pageNumber}-reference-report.json`), JSON.stringify({
    storyId,
    pageNumber,
    stagedCharacters,
    referenceCount: referenceImages.length,
    references: referenceImages.map((ref, index) => ({
      index: index + 1,
      characterName: ref.characterName,
      referenceKind: ref.referenceKind,
      source: ref.source,
      type: ref.type,
      isTurnaround: ref.isTurnaround,
      hasFileUri: !!ref.fileUri,
      hasBase64Data: !!ref.base64Data,
      instructionText: ref.instructionText,
    })),
    environmentIds: [...environmentsById.keys()],
    layout: {
      pageRowTemplateId: pageRow.templateId,
      savedLayoutTemplateId: replanned.savedTemplateId,
      savedTemplateSlotCount: replanned.savedTemplateSlotCount,
      selectedTemplateId: page.template.id,
      selectedTemplateSlotCount: page.template.panelCount,
      scenePanelCount: replanned.scenePanelCount,
      preferredTemplateId: preferredTemplateId ?? null,
      exactMatch: page.template.panelCount === replanned.scenePanelCount,
    },
  }, null, 2));

  const imageDomain = getComplexImageDomainService();
  const rendered = await editGraphicNovelPage({
    imageDomain,
    page,
    templateBuffer,
    style,
    ageGroup,
    environmentsById,
    referenceImages,
    onUsage: (usage) => recordUsage(usage, { userId: story.userId, storyId }),
    onAttemptImage: async ({ imageData }) => {
      await fs.writeFile(path.join(outputDir, `page-${pageNumber}-art-only.png`), imageData);
    },
  });

  const artOnly = Buffer.from(rendered.imageData);
  await fs.writeFile(path.join(outputDir, `page-${pageNumber}-art-only.png`), artOnly);

  const analysis = await analyzeGraphicNovelBubbleVisionByPanelCrops({
    textProvider: getValidationTextProvider(),
    page,
    imageData: artOnly,
    mimeType: normalizeVisionMimeType(rendered.mimeType),
    onUsage: (usage) => recordUsage(usage, { userId: story.userId, storyId }),
  });
  const placed = applyGraphicNovelBubbleVisionLayout(page, analysis);
  const finalPage = placed.page;
  const finalImage = await overlayGraphicNovelTemplate(artOnly, finalPage);
  await fs.writeFile(path.join(outputDir, `page-${pageNumber}-with-bubbles.png`), finalImage);
  await fs.writeFile(
    path.join(outputDir, `page-${pageNumber}-bubble-vision-panel-crops.json`),
    JSON.stringify(analysis, null, 2)
  );

  const uploadResult = await getAssetStorageService().uploadAsset({
    data: finalImage,
    mimeType: 'image/png',
    userId: story.userId,
    storyId,
    assetType: 'image',
  });
  const asset = await getAssetRepository().create({
    storyId,
    sceneId: null,
    assetType: 'image',
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    signedUrl: uploadResult.signedUrl,
    signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
    mimeType: 'image/png',
    fileSizeBytes: uploadResult.fileSizeBytes,
    generationParams: {
      ...(pageRow.generationParams as Record<string, unknown> | null),
      ...rendered.generationParams,
      kind: 'graphic_novel_page',
      pageNumber,
      requestId: project.storyRequestId,
      manualRegeneration: true,
      manualRegenerationSource: 'saved_graphic_novel_project_page',
      bubblePlacement: {
        mode: 'post_art_vision_panel_crops',
        ...placed.placementSummary,
      },
      bubbleVisionAnalysis: analysis as GraphicNovelBubbleVisionAnalysis,
      finalOverlayApplied: true,
      deterministicOverlayApplied: true,
      bubbleShapeRenderingMode: 'post_art_vision_svg_speech_single_path_tail_thought_beaded_tail',
    },
    generationTimeMs: null,
    status: 'completed',
  });
  await saveThumbnail(asset.id, uploadResult.storagePath, finalImage);

  await getGraphicNovelRepository().updatePage(pageRow.id, {
    imageAssetId: asset.id,
    imageUrl: uploadResult.storageUrl,
    templateId: finalPage.template.id,
    pageRole: finalPage.pageRole,
    layoutJson: finalPage,
    bubbleLayoutJson: buildBubbleLayoutJson(finalPage),
    status: 'completed',
    generationParams: {
      ...(pageRow.generationParams as Record<string, unknown> | null),
      ...rendered.generationParams,
      manualRegeneration: true,
      manualRegenerationSource: 'saved_graphic_novel_project_page',
      bubblePlacement: {
        mode: 'post_art_vision_panel_crops',
        ...placed.placementSummary,
      },
      bubbleVisionAnalysis: analysis as GraphicNovelBubbleVisionAnalysis,
      finalOverlayApplied: true,
      deterministicOverlayApplied: true,
      bubbleShapeRenderingMode: 'post_art_vision_svg_speech_single_path_tail_thought_beaded_tail',
      assetId: asset.id,
      storagePath: uploadResult.storagePath,
      completedAt: new Date().toISOString(),
    },
  });

  const panels = await getGraphicNovelRepository().findPanelsByPageId(pageRow.id);
  await Promise.all(panels.map((panelRow) => {
    const plannedPanel = finalPage.panels[panelRow.panelIndex - 1];
    if (!plannedPanel) return Promise.resolve();
    return getGraphicNovelRepository().updatePanel(panelRow.id, {
      bubbleGeometry: plannedPanel.bubbles,
    });
  }));

  const report = {
    storyId,
    pageNumber,
    outputDir,
    assetId: asset.id,
    storagePath: uploadResult.storagePath,
    providerInteractionId: rendered.generationParams.providerInteractionId ?? null,
    stagedCharacters,
    referenceCount: referenceImages.length,
    references: referenceImages.map((ref, index) => ({
      index: index + 1,
      characterName: ref.characterName,
      hasFileUri: !!ref.fileUri,
      hasBase64Data: !!ref.base64Data,
      instructionText: ref.instructionText,
    })),
    environmentIds: [...environmentsById.keys()],
    placementSummary: placed.placementSummary,
    layout: {
      pageRowTemplateId: pageRow.templateId,
      savedLayoutTemplateId: replanned.savedTemplateId,
      savedTemplateSlotCount: replanned.savedTemplateSlotCount,
      selectedTemplateId: finalPage.template.id,
      selectedTemplateSlotCount: finalPage.template.panelCount,
      scenePanelCount: replanned.scenePanelCount,
      preferredTemplateId: preferredTemplateId ?? null,
      exactMatch: finalPage.template.panelCount === replanned.scenePanelCount,
    },
  };
  await fs.writeFile(path.join(outputDir, 'regenerate-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
