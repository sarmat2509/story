/**
 * Re-place graphic-novel bubbles over the original LLM page outputs.
 *
 * This does not call image generation. It retrieves stored Gemini Interactions
 * output images by providerInteractionId, reruns bubble vision placement, then
 * overlays server SVG frames/bubbles and updates graphic_novel_pages.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx \
 *     src/scripts/reoverlayGraphicNovelBubblesFromInteractions.ts \
 *     --story-id=<uuid>
 *
 * To redraw only deterministic SVG frames/bubbles over the same original art,
 * keeping the current bubble positions:
 *   ... --story-id=<uuid> --reuse-layout
 *
 * To recalculate bubble geometry from the already saved vision analysis,
 * without a new vision call:
 *   ... --story-id=<uuid> --page=1 --reuse-vision
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  getBaseStoryTextSizePxForAgeGroup,
  getBaseStoryTextSizePxForAgeYears,
  getStoryTextSizePx,
  normalizeStoryTextSizeMultiplier,
} from '@wondertales/shared';
import {
  analyzeGraphicNovelBubbleVision,
  applyGraphicNovelBubbleVisionLayout,
  buildGraphicNovelPageTextOverlay,
  graphicNovelBubbleTextSizingFromStoryTextSize,
  overlayGraphicNovelBubblesOnly,
  type GraphicNovelBubbleTextSizing,
  type GraphicNovelBubbleVisionAnalysis,
  type PlannedGraphicNovelPage,
} from '../domain/graphicNovel';
import {
  getAssetRepository,
  getChildProfileRepository,
  getGraphicNovelRepository,
  getStoryRepository,
} from '../repositories';
import { getAssetStorageService } from '../services/assetStorageService';
import { getValidationTextProvider } from '../services/aiService';
import { recordUsage } from '../services/aiUsageService';
import { closeDatabaseConnection } from '../db';
import { stripAllTags, stripCharacterIds, stripForAudio } from '../utils/audioTags';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function boolFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function buildBubbleLayoutJson(
  page: PlannedGraphicNovelPage,
  placementMode: 'post_art_vision' | 'script_fallback' = 'post_art_vision'
): Record<string, unknown> {
  return {
    mode: 'html_overlay',
    placementMode,
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

function getInteractionOutputImage(interaction: any): { data: Buffer; mimeType: string } {
  const output = interaction?.output_image ?? interaction?.outputImage;
  const data = output?.data ?? output?.inlineData?.data ?? output?.inline_data?.data;
  const mimeType =
    output?.mime_type ??
    output?.mimeType ??
    output?.inlineData?.mimeType ??
    output?.inline_data?.mime_type ??
    'image/png';

  if (!data || typeof data !== 'string') {
    throw new Error(`Interaction ${interaction?.id ?? '(unknown)'} has no output image data`);
  }

  return {
    data: Buffer.from(data, 'base64'),
    mimeType,
  };
}

function normalizeVisionMimeType(mimeType: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (mimeType === 'image/jpeg' || mimeType === 'image/webp') return mimeType;
  return 'image/png';
}

function mimeTypeForStoragePath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function summarizeBubblePlacement(page: PlannedGraphicNovelPage): Record<string, unknown> {
  const bubbles = page.panels.flatMap((panel) => panel.bubbles);
  const bubblesWithVisionTargets = bubbles.filter((bubble) =>
    Boolean((bubble as unknown as { placement?: { visionTarget?: unknown } }).placement?.visionTarget)
  ).length;
  const bubblesWithVisionEmptyZones = bubbles.filter((bubble) =>
    Boolean((bubble as unknown as { placement?: { visionEmptyZones?: unknown[] } }).placement?.visionEmptyZones?.length)
  ).length;
  const bubblesWithVisionOccupiedZones = bubbles.filter((bubble) =>
    Boolean((bubble as unknown as { placement?: { visionOccupiedZones?: unknown[] } }).placement?.visionOccupiedZones?.length)
  ).length;

  return {
    panelCount: page.panels.length,
    bubblesPlaced: bubbles.length,
    bubblesWithVisionTargets,
    bubblesWithVisionEmptyZones,
    bubblesWithVisionOccupiedZones,
    extraVisionPanelCount: 0,
    hasExtraVisionPanelStructure: false,
  };
}

function pushUniqueName(names: string[], value: unknown): void {
  const name = typeof value === 'string' ? stripCharacterIds(value).trim() : '';
  if (!name) return;
  if (!names.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    names.push(name);
  }
}

function buildCharacterAliasMap(layoutManifest: unknown): Record<string, string[]> {
  const characters = (layoutManifest as { characters?: Array<{
    name?: string;
    canonicalName?: string;
    nameAliases?: string[];
  }> } | null)?.characters || [];
  const aliasMap: Record<string, string[]> = {};
  for (const character of characters) {
    if (!character.name) continue;
    const aliases: string[] = [];
    pushUniqueName(aliases, character.name);
    pushUniqueName(aliases, character.canonicalName);
    for (const alias of character.nameAliases || []) {
      pushUniqueName(aliases, alias);
    }
    if (aliases.length > 0) {
      aliasMap[character.name] = aliases;
    }
  }
  return aliasMap;
}

function getAgeYearsFromBirthDate(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let ageYears = now.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (birthdayThisYear > now) {
    ageYears -= 1;
  }
  return Math.max(0, ageYears);
}

async function resolveBubbleTextSizingForStory(params: {
  story: Awaited<ReturnType<ReturnType<typeof getStoryRepository>['findById']>>;
  ageGroup: string;
}): Promise<GraphicNovelBubbleTextSizing> {
  const story = params.story;
  const childProfileId = story?.childProfileId ?? story?.createdByChildProfileId ?? null;
  const childProfile =
    story && childProfileId
      ? await getChildProfileRepository().findById(childProfileId, story.userId)
      : null;
  const ageYears = childProfile
    ? getAgeYearsFromBirthDate(childProfile.birthDate)
    : null;
  const baseTextSizePx =
    ageYears !== null
      ? getBaseStoryTextSizePxForAgeYears(ageYears)
      : getBaseStoryTextSizePxForAgeGroup(params.ageGroup);
  const textSizePx = getStoryTextSizePx(
    baseTextSizePx,
    normalizeStoryTextSizeMultiplier(childProfile?.storyTextSizeMultiplier)
  );

  return graphicNovelBubbleTextSizingFromStoryTextSize(textSizePx, {
    ageYears,
    ageGroup: params.ageGroup,
  });
}

async function main(): Promise<void> {
  const storyId = argValue('story-id') || '8d1db0cd-7161-43ce-9654-cd5ce26c5c21';
  const pageNumber = Number(argValue('page'));
  const dryRun = boolFlag('dry-run');
  const reuseLayout = boolFlag('reuse-layout');
  const reuseVision = boolFlag('reuse-vision');
  const outputDir = path.resolve(
    process.cwd(),
    'output',
    `graphic-novel-reoverlay-${reuseLayout ? 'reuse-layout-' : reuseVision ? 'reuse-vision-' : ''}${storyId}-${Date.now()}`
  );
  await fs.mkdir(outputDir, { recursive: true });

  const story = await getStoryRepository().findById(storyId);
  if (!story) throw new Error(`Story not found: ${storyId}`);
  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) throw new Error(`Graphic novel project not found for story: ${storyId}`);
  const bubbleTextSizing = await resolveBubbleTextSizingForStory({
    story,
    ageGroup: project.ageGroup || story.ageGroup || '6-8',
  });

  const pages = (await getGraphicNovelRepository().findPagesByProjectId(project.id))
    .filter((page) => !Number.isFinite(pageNumber) || page.pageNumber === pageNumber);
  const characterAliases = buildCharacterAliasMap(project.layoutManifest);
  const textProvider = getValidationTextProvider();
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
  });

  const report: Array<Record<string, unknown>> = [];
  for (const page of pages) {
    const storedPlannedPage = page.layoutJson as PlannedGraphicNovelPage | null;
    const plannedPage = storedPlannedPage
      ? {
          ...storedPlannedPage,
          characterAliases: storedPlannedPage.characterAliases || characterAliases,
          bubbleTextSizing,
        }
      : null;
    if (!plannedPage?.panels?.length) {
      report.push({ pageNumber: page.pageNumber, skipped: true, reason: 'missing_layout' });
      continue;
    }

    const generationParams = (page.generationParams as Record<string, unknown> | null) || {};
    const providerInteractionId =
      typeof generationParams.providerInteractionId === 'string'
        ? generationParams.providerInteractionId
        : undefined;
    const artOnlyImageStoragePath =
      typeof generationParams.artOnlyImageStoragePath === 'string'
        ? generationParams.artOnlyImageStoragePath
        : undefined;
    if (!providerInteractionId && !artOnlyImageStoragePath) {
      report.push({ pageNumber: page.pageNumber, skipped: true, reason: 'missing_providerInteractionId' });
      continue;
    }

    const raw = artOnlyImageStoragePath
      ? {
          data: await getAssetStorageService().getAssetByPath(artOnlyImageStoragePath),
          mimeType: mimeTypeForStoragePath(artOnlyImageStoragePath),
        }
      : getInteractionOutputImage(await ai.interactions.get(providerInteractionId!));
    const persistedArtOnlyStoragePath = artOnlyImageStoragePath ?? (await getAssetStorageService().uploadAsset({
      data: raw.data,
      mimeType: raw.mimeType,
      userId: story.userId,
      storyId,
      assetType: 'image',
    })).storagePath;
    await fs.writeFile(path.join(outputDir, `page-${page.pageNumber}-art-only.${raw.mimeType.includes('jpeg') ? 'jpg' : 'png'}`), raw.data);

    let analysis: GraphicNovelBubbleVisionAnalysis | null = null;
    let placedPage = plannedPage;
    let placementSummary = summarizeBubblePlacement(plannedPage);

    if (reuseLayout) {
      analysis = (generationParams.bubbleVisionAnalysis as Awaited<ReturnType<typeof analyzeGraphicNovelBubbleVisionByPanelCrops>>) ?? null;
    } else if (reuseVision) {
      analysis = (generationParams.bubbleVisionAnalysis as GraphicNovelBubbleVisionAnalysis | null) ?? null;
      if (!analysis?.panels?.length) {
        report.push({ pageNumber: page.pageNumber, skipped: true, reason: 'missing_saved_bubble_vision_analysis' });
        continue;
      }
      const applied = applyGraphicNovelBubbleVisionLayout(plannedPage, analysis, {
        useDetectedPanelBounds: true,
      });
      placedPage = applied.page;
      placementSummary = applied.placementSummary;
    } else {
      analysis = await analyzeGraphicNovelBubbleVision({
        textProvider,
        page: plannedPage,
        imageData: raw.data,
        mimeType: normalizeVisionMimeType(raw.mimeType),
        detectPanelBounds: true,
        onUsage: (usage) => recordUsage(usage, { userId: story.userId, storyId }),
      });
      const applied = applyGraphicNovelBubbleVisionLayout(plannedPage, analysis, {
        useDetectedPanelBounds: true,
      });
      placedPage = applied.page;
      placementSummary = applied.placementSummary;
    }
    const finalImage = await overlayGraphicNovelBubblesOnly(raw.data, placedPage);
    await fs.writeFile(path.join(outputDir, `page-${page.pageNumber}-with-new-bubbles.png`), finalImage);

    if (dryRun) {
      report.push({
        pageNumber: page.pageNumber,
        dryRun: true,
        providerInteractionId,
        placementSummary,
      });
      continue;
    }

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
        ...(generationParams || {}),
        kind: 'graphic_novel_page',
        pageNumber: page.pageNumber,
        providerInteractionId,
        reoverlaySource: 'gemini_interaction_output_image',
        reoverlayArtOnlySource: artOnlyImageStoragePath ? 'stored_art_only_asset' : 'gemini_interaction_output_image',
        artOnlyImageStoragePath: persistedArtOnlyStoragePath,
        artOnlyImageMimeType: raw.mimeType,
        reoverlayAt: new Date().toISOString(),
        bubblePlacement: {
          mode: 'post_art_vision_full_page',
          ...placementSummary,
        },
        bubbleVisionAnalysis: analysis,
        finalOverlayApplied: true,
        deterministicOverlayApplied: true,
        bubbleOverlayReuseLayout: reuseLayout,
        bubbleShapeRenderingMode: 'post_art_vision_svg_speech_single_path_tail_thought_beaded_tail',
      },
      generationTimeMs: null,
      status: 'completed',
    });
    await saveThumbnail(asset.id, uploadResult.storagePath, finalImage);

    await getGraphicNovelRepository().updatePage(page.id, {
      imageAssetId: asset.id,
      imageUrl: uploadResult.storageUrl,
      layoutJson: placedPage,
      bubbleLayoutJson: buildBubbleLayoutJson(placedPage, 'post_art_vision'),
      status: 'completed',
      generationParams: {
        ...(generationParams || {}),
        bubblePlacement: {
          mode: 'post_art_vision_full_page',
          ...placementSummary,
        },
        bubbleVisionAnalysis: analysis,
        finalOverlayApplied: true,
        deterministicOverlayApplied: true,
        bubbleOverlayReuseLayout: reuseLayout,
        bubbleShapeRenderingMode: 'post_art_vision_svg_speech_single_path_tail_thought_beaded_tail',
        reoverlaySource: 'gemini_interaction_output_image',
        reoverlayArtOnlySource: artOnlyImageStoragePath ? 'stored_art_only_asset' : 'gemini_interaction_output_image',
        artOnlyImageStoragePath: persistedArtOnlyStoragePath,
        artOnlyImageMimeType: raw.mimeType,
        reoverlayAt: new Date().toISOString(),
        assetId: asset.id,
        storagePath: uploadResult.storagePath,
      },
    });

    const panels = await getGraphicNovelRepository().findPanelsByPageId(page.id);
    await Promise.all(panels.map((panelRow) => {
      const plannedPanel = placedPage.panels[panelRow.panelIndex - 1];
      if (!plannedPanel) return Promise.resolve();
      return getGraphicNovelRepository().updatePanel(panelRow.id, {
        bubbleGeometry: plannedPanel.bubbles,
      });
    }));

    report.push({
      pageNumber: page.pageNumber,
      assetId: asset.id,
      storagePath: uploadResult.storagePath,
      providerInteractionId,
        placementSummary,
    });
  }

  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ storyId, dryRun, outputDir, pages: report }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
