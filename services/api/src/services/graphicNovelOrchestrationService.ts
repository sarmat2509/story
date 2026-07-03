import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import {
  getBaseStoryTextSizePxForAgeGroup,
  getBaseStoryTextSizePxForAgeYears,
  getStoryTextSizePx,
  normalizeStoryTextSizeMultiplier,
  stripCharacterIdFromName,
} from '@wondertales/shared';
import type { CreateStoryRequestInput } from '@wondertales/shared';
import { config } from '../config';
import {
  getAssetRepository,
  getChildProfileRepository,
  getDictionaryRepository,
  getGraphicNovelRepository,
  getSceneRepository,
  getStoryRepository,
} from '../repositories';
import { getAssetStorageService } from './assetStorageService';
import {
  getComplexImageDomainService,
  getGraphicNovelDomainService,
  getMixedStoryDomainService,
  getValidationTextProvider,
} from './aiService';
import type { StoryEnvironment } from '../ai/types';
import { recordUsage } from './aiUsageService';
import {
  STORY_TASKS,
  completeTask,
  setPlannedTasks,
  startTask,
  transitionTask,
  updateTaskProgress,
} from './storyProgress';
import {
  buildStorySpec,
  computeValidationScore,
  createStoryRequest,
  type ContinuationContext,
} from './storyOrchestrationService';
import { createStoryStub } from './storyOrchestration/storyRecords';
import { getStoryCreationAttributionInputFromRequest } from './storyCreationAttributionService';
import {
  GRAPHIC_NOVEL_USAGE_EVENT,
  assertGraphicNovelQuotaAvailable,
} from './graphicNovelQuotaService';
import { assertMixedStoryAccessAvailable } from './mixedStoryAccessService';
import { recordUsageEvent } from './usageEventsService';
import { persistImageValidationResult } from './imageValidationPersistenceService';
import {
  applyReferenceBucketLimits,
  assignSequentialImageIndices,
  logReferenceBucketDelivery,
  type ReferenceImageDataEntry,
} from './referenceImageBuckets';
import {
  analyzeGraphicNovelBubbleVision,
  analyzeGraphicNovelBubbleVisionByPanelCrops,
  applyGraphicNovelBubbleVisionLayout,
  buildGraphicNovelImageRequestManifest,
  buildGraphicNovelPageRepairSystemInstruction,
  buildGraphicNovelPageTextOverlay,
  buildGraphicNovelPageValidationRepairInstructions,
  generateGraphicNovelPageFreeLayout,
  graphicNovelBubbleTextSizingFromStoryTextSize,
  GRAPHIC_NOVEL_PAGE_SIZE,
  overlayGraphicNovelBubblesOnly,
  pageSizeForGraphicNovelPage,
  planGraphicNovelLayouts,
  type GraphicNovelPanelScript,
  type GraphicNovelScript,
  type GraphicNovelPageTextOverlay,
  type GraphicNovelBubbleTextSizing,
  type GraphicNovelBubbleVisionAnalysis,
  type PlannedGraphicNovelPage,
} from '../domain/graphicNovel';
import { graphicNovelPanelCountRange } from '../prompts/text';
import type { Rect } from '../domain/graphicNovel/types';
import { mixedStoryComicPages, type MixedStoryScript } from '../domain/mixedStory';
import type { ImageValidationResult } from '../ai/types';
import type { CharacterData, SceneVisual } from './types';
import type { ReferenceImage } from '../providers/base/IImageProvider';
import { getOrCreateEnvironmentImage } from './environmentReferenceImageService';
import {
  countNarrationWords,
  extractClosingKeepsakeFromEpisodeText,
  stripAllTags,
  stripCharacterIds,
  stripForAudio,
} from '../utils/audioTags';
import { getPlanFeatures } from './planService';
import { getIllustrationBlockStartSceneIds } from './storyOrchestration/utilities';
import { recordStageTiming, withStageTiming } from './generationStageTimingService';
import { logger } from '../utils/logger';

export const GRAPHIC_NOVEL_KIND = 'graphic_novel';
export const MIXED_STORY_KIND = 'mixed_story';
export const GRAPHIC_NOVEL_DEFAULT_PAGE_COUNT = 8;
const GRAPHIC_NOVEL_PROGRESS_STAGES = [
  'generating_script',
  'planning_pages',
  'placing_bubbles',
  'generating_first_page',
] as const;
const GRAPHIC_NOVEL_ART_REPAIR_THRESHOLD = 70;

export interface GraphicNovelTextManifest {
  version: 1;
  textMode: 'html_overlay';
  pages: GraphicNovelPageTextOverlay[];
  fullText: string;
  scenes: Array<{
    sceneId: number;
    text: string;
    graphicNovelPageNumber: number;
    graphicNovelTextMode: 'html_overlay';
    graphicNovelTextSegmentIds: string[];
  }>;
}

export interface MixedStoryTextManifest {
  version: 1;
  textMode: 'mixed_story_reading_blocks';
  pages: GraphicNovelPageTextOverlay[];
  fullText: string;
  scenes: Array<{
    sceneId: number;
    text: string;
    mixedStoryBlockKind: 'comic' | 'prose';
    mixedStoryScreenOrder: number;
    mixedStorySourceSceneIds: number[];
    mixedStoryAnchorSceneId?: number;
    graphicNovelPageNumber?: number;
    graphicNovelTextMode?: 'html_overlay';
    graphicNovelTextSegmentIds?: string[];
  }>;
  readingOrder: Array<{
    screenOrder: number;
    kind: 'comic' | 'prose';
    sceneId?: number;
    pageNumber?: number;
    sourceSceneIds: number[];
    textSegmentIds: string[];
  }>;
}

type GraphicNovelCharacterManifest = Array<{
  name: string;
  canonicalName?: string;
  nameAliases?: string[];
  type?: string;
  description?: string;
  references?: Array<{
    storagePath: string;
    source: 'child_reference' | 'character_reference' | 'imaginary_friend';
    type: 'child_reference' | 'character_reference' | 'imaginary';
    isTurnaround: boolean;
  }>;
}>;

type GraphicNovelReferenceImage = ReferenceImage & {
  source?: string;
  type?: string;
  isTurnaround?: boolean;
  identitySource?: 'turnaround' | 'reference_photo';
  environmentId?: string;
  storagePath?: string;
};

type RenderedGraphicNovelPageAssets = {
  pageAssetId: string;
  coverAssetId?: string;
  coverSource?: GraphicNovelCoverSource;
};

type PixelCropRect = { left: number; top: number; width: number; height: number };
type GraphicNovelCoverSource = 'full_width_panel' | 'widest_first_page_panel';
type GraphicNovelCoverPanelSelection = {
  panelIndex: number;
  source: GraphicNovelCoverSource;
};

function annotateGraphicNovelRequestManifest(
  manifest: unknown,
  params: {
    providerRoute?: string;
    provider?: string;
    model?: string;
    providerInteractionId?: string | null;
  }
): Record<string, unknown> | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  return {
    ...(manifest as Record<string, unknown>),
    providerRoute: params.providerRoute ?? null,
    provider: params.provider ?? null,
    model: params.model ?? null,
    providerInteractionId:
      params.providerInteractionId ??
      ((manifest as Record<string, unknown>).providerInteractionId as string | null | undefined) ??
      null,
  };
}

function compactGraphicNovelRequestManifests(
  ...manifests: unknown[]
): Record<string, unknown>[] {
  return manifests.filter(
    (manifest): manifest is Record<string, unknown> =>
      !!manifest && typeof manifest === 'object' && !Array.isArray(manifest)
  );
}

function getContinuationDataFromRequest(request: { id: string; intermediateData?: unknown }): {
  intermediateData: Record<string, any>;
  isContinuation: boolean;
  isScheduledContinuation: boolean;
  seriesId?: string;
  partNumber?: number;
  continuationContext?: ContinuationContext;
} {
  const intermediateData =
    request.intermediateData && typeof request.intermediateData === 'object'
      ? (request.intermediateData as Record<string, any>)
      : {};
  const isContinuation = !!intermediateData.isContinuation;
  const seriesId =
    typeof intermediateData.seriesId === 'string' ? intermediateData.seriesId : undefined;
  const partNumber =
    typeof intermediateData.partNumber === 'number' ? intermediateData.partNumber : undefined;
  const continuationContext = intermediateData.continuationContext as
    | ContinuationContext
    | undefined;

  if (isContinuation && (!seriesId || !partNumber || !continuationContext)) {
    throw new Error(
      `Invalid graphic novel continuation request ${request.id}: missing series context`
    );
  }

  return {
    intermediateData,
    isContinuation,
    isScheduledContinuation: !!intermediateData.isScheduledContinuation,
    seriesId,
    partNumber,
    continuationContext: isContinuation ? continuationContext : undefined,
  };
}

function isGraphicNovelCoverSource(value: unknown): value is GraphicNovelCoverSource {
  return value === 'full_width_panel' || value === 'widest_first_page_panel';
}

async function hasReusableGraphicNovelCover(
  storyMetadata: Record<string, unknown>,
  coverAssetId: string | null | undefined
): Promise<boolean> {
  if (!coverAssetId || !isGraphicNovelCoverSource(storyMetadata.graphicNovelCoverSource)) {
    return false;
  }

  const asset = await getAssetRepository().findById(coverAssetId);
  const params = (asset?.generationParams as Record<string, unknown> | null) || {};
  return (
    params.kind === 'graphic_novel_cover_panel' &&
    params.sourceImageKind === 'art_only_before_bubble_overlay'
  );
}

type GraphicNovelCoverPanelCrop = {
  cropRect: PixelCropRect;
  fullPanelCropRect: PixelCropRect;
  borderInsetPx: number;
  targetAspectRatio: number;
  focusRect: Rect | null;
  focusStrategy: 'character_body' | 'head_priority' | 'action' | 'center';
};

type GraphicNovelRenderedPageValidation = {
  validation: ImageValidationResult;
  score: number | null;
  attempt: number;
};

type GraphicNovelReadingTextSettings = {
  baseTextSizePx: number;
  textSizeMultiplier: number;
  textSizePx: number;
  bubbleTextSizing: GraphicNovelBubbleTextSizing;
};

function getAgeYearsFromBirthDateForGraphicNovelReadingSettings(
  birthDate: Date | string | null
): number | null {
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

async function resolveGraphicNovelReadingTextSettings(params: {
  ageGroup: string;
  userId: string;
  childProfileId?: string | null;
}): Promise<GraphicNovelReadingTextSettings> {
  const readingProfile = params.childProfileId
    ? await getChildProfileRepository().findById(params.childProfileId, params.userId)
    : null;
  const readingProfileAgeYears = readingProfile
    ? getAgeYearsFromBirthDateForGraphicNovelReadingSettings(readingProfile.birthDate)
    : null;
  const baseTextSizePx =
    readingProfileAgeYears !== null
      ? getBaseStoryTextSizePxForAgeYears(readingProfileAgeYears)
      : getBaseStoryTextSizePxForAgeGroup(params.ageGroup);
  const textSizeMultiplier = normalizeStoryTextSizeMultiplier(
    readingProfile?.storyTextSizeMultiplier
  );
  const textSizePx = getStoryTextSizePx(baseTextSizePx, textSizeMultiplier);

  return {
    baseTextSizePx,
    textSizeMultiplier,
    textSizePx,
    bubbleTextSizing: graphicNovelBubbleTextSizingFromStoryTextSize(textSizePx, {
      ageYears: readingProfileAgeYears,
      ageGroup: params.ageGroup,
    }),
  };
}

export function getGraphicNovelStoryCharacterLinks(
  characters: Array<Pick<CharacterData, 'id' | 'type' | 'role'>>
): Array<{ characterId: string; role: string }> {
  const rolesById = new Map<string, string>();

  for (const character of characters) {
    if (!character.id || character.type === 'child') continue;
    if (!rolesById.has(character.id)) {
      rolesById.set(character.id, character.role || 'supporting');
    }
  }

  return [...rolesById.entries()].map(([characterId, role]) => ({ characterId, role }));
}

async function linkGraphicNovelStoryCharacters(params: {
  storyId: string;
  characters: CharacterData[];
}): Promise<void> {
  const links = getGraphicNovelStoryCharacterLinks(params.characters);
  if (links.length === 0) return;

  await Promise.all(
    links.map((link) =>
      getStoryRepository()
        .createStoryCharacter({
          storyId: params.storyId,
          characterId: link.characterId,
          role: link.role,
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          const code =
            typeof error === 'object' && error && 'code' in error
              ? String((error as { code?: unknown }).code)
              : '';
          if (!message.includes('duplicate') && code !== '23505') {
            logger.error(
              { err: error, storyId: params.storyId, characterId: link.characterId },
              'Failed to link graphic novel character'
            );
            throw error;
          }
        })
    )
  );

  logger.info(
    {
      storyId: params.storyId,
      characterCount: links.length,
    },
    'Graphic novel characters linked to story'
  );
}

export function buildGraphicNovelTextManifest(
  plannedPages: PlannedGraphicNovelPage[]
): GraphicNovelTextManifest {
  const pages = plannedPages.map((page) =>
    buildGraphicNovelPageTextOverlay(page, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    })
  );
  const scenes = pages.map((page) => ({
    sceneId: page.pageNumber,
    text: page.rawPlainText,
    graphicNovelPageNumber: page.pageNumber,
    graphicNovelTextMode: 'html_overlay' as const,
    graphicNovelTextSegmentIds: page.items.map((item) => item.segmentId),
  }));

  return {
    version: 1,
    textMode: 'html_overlay',
    pages,
    fullText: scenes
      .map((scene) => scene.text)
      .filter(Boolean)
      .join('\n\n'),
    scenes,
  };
}

export function buildMixedStoryTextManifest(params: {
  script: MixedStoryScript;
  plannedPages: PlannedGraphicNovelPage[];
}): MixedStoryTextManifest {
  const pages = params.plannedPages.map((page) =>
    buildGraphicNovelPageTextOverlay(page, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    })
  );
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const scenes: MixedStoryTextManifest['scenes'] = [];
  const readingOrder: MixedStoryTextManifest['readingOrder'] = [];

  const blocks = [...params.script.readingBlocks].sort((a, b) => a.screenOrder - b.screenOrder);
  for (const block of blocks) {
    if (block.kind === 'comic') {
      const page = pageByNumber.get(block.comicPageNumber);
      const orderedItems = [...(page?.items || [])].sort((a, b) => a.readingOrder - b.readingOrder);
      const text = orderedItems
        .map((item) => item.audioText)
        .filter(Boolean)
        .join('\n');
      const textSegmentIds = orderedItems.map((item) => item.segmentId);
      scenes.push({
        sceneId: block.screenOrder,
        text,
        mixedStoryBlockKind: 'comic',
        mixedStoryScreenOrder: block.screenOrder,
        mixedStorySourceSceneIds: [block.sceneId],
        mixedStoryAnchorSceneId: block.sceneId,
        graphicNovelPageNumber: block.comicPageNumber,
        graphicNovelTextMode: 'html_overlay',
        graphicNovelTextSegmentIds: textSegmentIds,
      });
      readingOrder.push({
        screenOrder: block.screenOrder,
        kind: 'comic',
        sceneId: block.sceneId,
        pageNumber: block.comicPageNumber,
        sourceSceneIds: [block.sceneId],
        textSegmentIds,
      });
      continue;
    }

    scenes.push({
      sceneId: block.screenOrder,
      text: block.text,
      mixedStoryBlockKind: 'prose',
      mixedStoryScreenOrder: block.screenOrder,
      mixedStorySourceSceneIds: block.sceneIds,
    });
    readingOrder.push({
      screenOrder: block.screenOrder,
      kind: 'prose',
      sourceSceneIds: block.sceneIds,
      textSegmentIds: [`mixed-prose-${block.screenOrder}`],
    });
  }

  return {
    version: 1,
    textMode: 'mixed_story_reading_blocks',
    pages,
    scenes,
    fullText: scenes
      .map((scene) => scene.text)
      .filter(Boolean)
      .join('\n\n'),
    readingOrder,
  };
}

async function mergeRequestIntermediateData(
  requestId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const request = await getStoryRepository().findRequestById(requestId);
  await getStoryRepository().updateRequest(requestId, {
    intermediateData: {
      ...((request?.intermediateData as Record<string, unknown> | null) || {}),
      ...patch,
    },
  });
}

async function setGraphicNovelProgressStage(
  requestId: string,
  stage: (typeof GRAPHIC_NOVEL_PROGRESS_STAGES)[number],
  generationKind: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND = GRAPHIC_NOVEL_KIND
): Promise<void> {
  await mergeRequestIntermediateData(requestId, {
    generationKind,
    graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
    graphicNovelProgressStage: stage,
  });
}

async function saveThumbnail(
  assetId: string,
  storagePath: string,
  imageBuffer: Buffer,
  options: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain';
    background?: string;
  } = {}
): Promise<void> {
  try {
    const width = options.width ?? 384;
    const height = options.height ?? 512;
    const fit = options.fit ?? 'cover';
    const thumbnailBuffer =
      fit === 'cover'
        ? await getAssetStorageService().generateThumbnail(imageBuffer, width, height)
        : await sharp(imageBuffer)
            .resize(width, height, {
              fit,
              position: 'center',
              background: options.background ?? '#fffaf2',
            })
            .jpeg({ quality: 80 })
            .toBuffer();
    const thumbnailPath = storagePath.replace(/(\.[^.]+)$/, '_thumb.jpg');
    const fullPath = path.join(process.cwd(), 'uploads', thumbnailPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, thumbnailBuffer);
    await getAssetRepository().update(assetId, {
      thumbnailPath,
      thumbnailUrl: `/api/v1/assets/${thumbnailPath}`,
    });
  } catch (error) {
    logger.warn({ err: error, assetId }, 'Graphic novel page thumbnail generation failed');
  }
}

function isFullWidthHorizontalCoverPanel(rect: {
  x: number;
  width: number;
  height: number;
}): boolean {
  const pageAspectRatio = GRAPHIC_NOVEL_PAGE_SIZE.width / GRAPHIC_NOVEL_PAGE_SIZE.height;
  const panelAspectRatio = (rect.width * pageAspectRatio) / rect.height;
  return rect.width >= 0.9 && rect.x <= 0.05 && rect.x + rect.width >= 0.95 && panelAspectRatio > 1;
}

const ORDINARY_STORY_THUMBNAIL_ASPECT_RATIO = 672 / 384;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampRectToUnit(rect: Rect): Rect | null {
  const x = clampNumber(rect.x, 0, 1);
  const y = clampNumber(rect.y, 0, 1);
  const right = clampNumber(rect.x + rect.width, 0, 1);
  const bottom = clampNumber(rect.y + rect.height, 0, 1);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function mergeRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function tinyRectAroundVisionPoint(
  point: { x: number; y: number },
  size: { width: number; height: number }
): Rect | null {
  return clampRectToUnit({
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  });
}

function coverHeadFocusRectFromCharacterRect(rect: Rect): Rect | null {
  return clampRectToUnit({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: Math.max(0.08, Math.min(rect.height, rect.height * 0.35)),
  });
}

function coverFocusRectsFromVision(
  analysis: GraphicNovelBubbleVisionAnalysis | null | undefined,
  panelIndex: number
): { body: Rect | null; head: Rect | null; action: Rect | null } {
  const panelAnalysis = analysis?.panels?.find(
    (panel) => Number(panel.panelIndex) === panelIndex + 1
  );
  if (!panelAnalysis) return { body: null, head: null, action: null };

  const characterRects =
    panelAnalysis.occupiedZones
      ?.filter((zone) => zone.kind === 'character' || zone.kind === 'face')
      .map((zone) => clampRectToUnit(zone))
      .filter((rect): rect is Rect => !!rect) ?? [];

  const explicitHeadRects =
    panelAnalysis.occupiedZones
      ?.filter((zone) => zone.kind === 'face')
      .map((zone) => clampRectToUnit(zone))
      .filter((rect): rect is Rect => !!rect) ?? [];

  const detectedHeadRects =
    panelAnalysis.detectedCharacters?.flatMap((character) =>
      [character.faceCenter, character.headCenter]
        .filter((point): point is { x: number; y: number } => !!point)
        .map((point) => tinyRectAroundVisionPoint(point, { width: 0.18, height: 0.16 }))
        .filter((rect): rect is Rect => !!rect)
    ) ?? [];

  const inferredHeadRects =
    explicitHeadRects.length === 0 && detectedHeadRects.length === 0
      ? characterRects
          .map(coverHeadFocusRectFromCharacterRect)
          .filter((rect): rect is Rect => !!rect)
      : [];

  const actionRects =
    panelAnalysis.occupiedZones
      ?.filter((zone) => zone.kind === 'main_action' || zone.kind === 'important_object')
      .map((zone) => clampRectToUnit(zone))
      .filter((rect): rect is Rect => !!rect) ?? [];

  return {
    body: mergeRects(characterRects),
    head: mergeRects([...explicitHeadRects, ...detectedHeadRects, ...inferredHeadRects]),
    action: mergeRects(actionRects),
  };
}

export function selectGraphicNovelCoverPanel(
  page: PlannedGraphicNovelPage
): GraphicNovelCoverPanelSelection | null {
  const panelIndex = page.panels.findIndex((panel) =>
    isFullWidthHorizontalCoverPanel(panel.templatePanel.rect)
  );
  if (panelIndex >= 0) {
    return { panelIndex, source: 'full_width_panel' };
  }

  if (page.pageNumber !== 1) {
    return null;
  }

  let widestPanelIndex = -1;
  let widestPanelWidth = -1;
  let widestPanelArea = -1;
  page.panels.forEach((panel, index) => {
    const rect = panel.templatePanel.rect;
    const width = Number(rect.width);
    const area = width * Number(rect.height);
    if (
      width > widestPanelWidth + 0.0001 ||
      (Math.abs(width - widestPanelWidth) <= 0.0001 && area > widestPanelArea)
    ) {
      widestPanelIndex = index;
      widestPanelWidth = width;
      widestPanelArea = area;
    }
  });

  return widestPanelIndex >= 0
    ? { panelIndex: widestPanelIndex, source: 'widest_first_page_panel' }
    : null;
}

function panelCropRect(
  page: PlannedGraphicNovelPage,
  panelIndex: number,
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  const rect = page.panels[panelIndex]?.templatePanel.rect ?? page.panels[0]?.templatePanel.rect;
  if (!rect) {
    return { left: 0, top: 0, width: imageWidth, height: imageHeight };
  }

  const left = Math.max(0, Math.min(imageWidth - 1, Math.round(rect.x * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(rect.y * imageHeight)));
  const right = Math.max(
    left + 1,
    Math.min(imageWidth, Math.round((rect.x + rect.width) * imageWidth))
  );
  const bottom = Math.max(
    top + 1,
    Math.min(imageHeight, Math.round((rect.y + rect.height) * imageHeight))
  );
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function focusRectToPixelBounds(
  rect: Rect,
  panelRect: PixelCropRect
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return {
    left: panelRect.left + rect.x * panelRect.width,
    top: panelRect.top + rect.y * panelRect.height,
    right: panelRect.left + (rect.x + rect.width) * panelRect.width,
    bottom: panelRect.top + (rect.y + rect.height) * panelRect.height,
  };
}

function shiftCropStartToContainRange(params: {
  start: number;
  cropSize: number;
  minStart: number;
  maxStart: number;
  rangeStart: number;
  rangeEnd: number;
}): number {
  const rangeSize = params.rangeEnd - params.rangeStart;
  if (rangeSize <= 0 || rangeSize > params.cropSize) {
    return clampNumber(params.start, params.minStart, params.maxStart);
  }

  let start = params.start;
  if (start > params.rangeStart) {
    start = params.rangeStart;
  }
  if (start + params.cropSize < params.rangeEnd) {
    start = params.rangeEnd - params.cropSize;
  }
  return clampNumber(start, params.minStart, params.maxStart);
}

export function buildGraphicNovelCoverPanelCrop(params: {
  page: PlannedGraphicNovelPage;
  panelIndex: number;
  imageWidth: number;
  imageHeight: number;
  analysis?: GraphicNovelBubbleVisionAnalysis | null;
}): GraphicNovelCoverPanelCrop {
  const fullPanelCropRect = panelCropRect(
    params.page,
    params.panelIndex,
    params.imageWidth,
    params.imageHeight
  );
  const borderInsetPx = Math.min(
    Math.max(6, Math.round(Math.min(fullPanelCropRect.width, fullPanelCropRect.height) * 0.025)),
    Math.floor(Math.min(fullPanelCropRect.width, fullPanelCropRect.height) / 5)
  );
  const innerLeft = fullPanelCropRect.left + borderInsetPx;
  const innerTop = fullPanelCropRect.top + borderInsetPx;
  const innerWidth = Math.max(1, fullPanelCropRect.width - borderInsetPx * 2);
  const innerHeight = Math.max(1, fullPanelCropRect.height - borderInsetPx * 2);
  const innerAspect = innerWidth / innerHeight;
  const targetAspectRatio = ORDINARY_STORY_THUMBNAIL_ASPECT_RATIO;
  const cropWidth =
    innerAspect > targetAspectRatio
      ? Math.max(1, Math.round(innerHeight * targetAspectRatio))
      : innerWidth;
  const cropHeight =
    innerAspect > targetAspectRatio
      ? innerHeight
      : Math.max(1, Math.round(innerWidth / targetAspectRatio));
  const focusRects = coverFocusRectsFromVision(params.analysis, params.panelIndex);
  const cropWidthUnit = cropWidth / fullPanelCropRect.width;
  const cropHeightUnit = cropHeight / fullPanelCropRect.height;
  const bodyFits =
    !!focusRects.body &&
    focusRects.body.width <= cropWidthUnit * 0.92 &&
    focusRects.body.height <= cropHeightUnit * 0.92;
  const focusStrategy =
    focusRects.body && !bodyFits && focusRects.head
      ? 'head_priority'
      : focusRects.body
        ? 'character_body'
        : focusRects.head
          ? 'head_priority'
          : focusRects.action
            ? 'action'
            : 'center';
  const focusRect =
    focusStrategy === 'head_priority'
      ? focusRects.head
      : focusStrategy === 'character_body'
        ? focusRects.body
        : focusStrategy === 'action'
          ? focusRects.action
          : null;
  const focusCenterX = focusRect ? focusRect.x + focusRect.width / 2 : 0.5;
  const focusCenterY = focusRect ? focusRect.y + focusRect.height / 2 : 0.5;
  const desiredCenterX = fullPanelCropRect.left + focusCenterX * fullPanelCropRect.width;
  const desiredCenterY = fullPanelCropRect.top + focusCenterY * fullPanelCropRect.height;
  const maxLeft = innerLeft + innerWidth - cropWidth;
  const maxTop = innerTop + innerHeight - cropHeight;
  let left = clampNumber(desiredCenterX - cropWidth / 2, innerLeft, maxLeft);
  let top = clampNumber(desiredCenterY - cropHeight / 2, innerTop, maxTop);

  if (focusRect) {
    const focusBounds = focusRectToPixelBounds(focusRect, fullPanelCropRect);
    const paddingX = Math.min(
      Math.round(cropWidth * (focusStrategy === 'head_priority' ? 0.12 : 0.08)),
      Math.round(innerWidth * 0.12)
    );
    const paddingTop = Math.min(
      Math.round(cropHeight * (focusStrategy === 'head_priority' ? 0.2 : 0.1)),
      Math.round(innerHeight * 0.12)
    );
    const paddingBottom = Math.min(
      Math.round(cropHeight * (focusStrategy === 'head_priority' ? 0.14 : 0.1)),
      Math.round(innerHeight * 0.1)
    );

    left = shiftCropStartToContainRange({
      start: left,
      cropSize: cropWidth,
      minStart: innerLeft,
      maxStart: maxLeft,
      rangeStart: focusBounds.left - paddingX,
      rangeEnd: focusBounds.right + paddingX,
    });
    top = shiftCropStartToContainRange({
      start: top,
      cropSize: cropHeight,
      minStart: innerTop,
      maxStart: maxTop,
      rangeStart: focusBounds.top - paddingTop,
      rangeEnd: focusBounds.bottom + paddingBottom,
    });
  }

  return {
    cropRect: {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    },
    fullPanelCropRect,
    borderInsetPx,
    targetAspectRatio,
    focusRect,
    focusStrategy,
  };
}

async function createGraphicNovelCoverPanelAsset(params: {
  storyId: string;
  userId: string;
  requestId: string;
  page: PlannedGraphicNovelPage;
  pageAssetId: string;
  imageData: Buffer;
  sourceImageKind: 'art_only_before_bubble_overlay';
  bubbleVisionAnalysis?: GraphicNovelBubbleVisionAnalysis | null;
}): Promise<{ assetId: string; source: GraphicNovelCoverSource } | null> {
  const selectedPanel = selectGraphicNovelCoverPanel(params.page);
  if (!selectedPanel) {
    return null;
  }

  const metadata = await sharp(params.imageData).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;
  if (!imageWidth || !imageHeight) {
    throw new Error('Cannot create graphic novel cover panel without image dimensions');
  }

  const coverCrop = buildGraphicNovelCoverPanelCrop({
    page: params.page,
    panelIndex: selectedPanel.panelIndex,
    imageWidth,
    imageHeight,
    analysis: params.bubbleVisionAnalysis,
  });
  const cropRect = coverCrop.cropRect;
  const coverImage = await sharp(params.imageData).extract(cropRect).png().toBuffer();

  const assetStorage = getAssetStorageService();
  const uploadResult = await assetStorage.uploadAsset({
    data: coverImage,
    mimeType: 'image/png',
    userId: params.userId,
    storyId: params.storyId,
    assetType: 'image',
  });

  const asset = await getAssetRepository().create({
    storyId: params.storyId,
    sceneId: null,
    assetType: 'image',
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    signedUrl: uploadResult.signedUrl,
    signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
    mimeType: 'image/png',
    fileSizeBytes: uploadResult.fileSizeBytes,
    generationParams: {
      kind: 'graphic_novel_cover_panel',
      source: selectedPanel.source,
      cropStrategy: 'smart_character_aware_ordinary_story_ratio',
      sourceImageKind: params.sourceImageKind,
      pageNumber: params.page.pageNumber,
      panelIndex: selectedPanel.panelIndex + 1,
      requestId: params.requestId,
      sourcePageAssetId: params.pageAssetId,
      cropRect,
      fullPanelCropRect: coverCrop.fullPanelCropRect,
      borderInsetPx: coverCrop.borderInsetPx,
      targetAspectRatio: coverCrop.targetAspectRatio,
      focusRect: coverCrop.focusRect,
      focusStrategy: coverCrop.focusStrategy,
      templatePanelRect: params.page.panels[selectedPanel.panelIndex]?.templatePanel.rect ?? null,
    },
    generationTimeMs: null,
    status: 'completed',
  });

  await saveThumbnail(asset.id, uploadResult.storagePath, coverImage, {
    width: 672,
    height: 384,
    fit: 'cover',
  });
  return { assetId: asset.id, source: selectedPanel.source };
}

function panelCharacterNames(panel: GraphicNovelPanelScript): string[] {
  const composition = panel.visual.sceneVisual.cameraComposition;
  if (typeof composition === 'string') return [];
  return composition.characters.map((character) => character.name).filter(Boolean);
}

function normalizeCharacterName(value: string): string {
  return stripCharacterIdFromName(value).trim().toLowerCase();
}

function graphicNovelCharacterKind(type?: string): 'human' | 'animal' | 'imaginary' {
  const normalized = (type || '').toLowerCase();
  if (normalized === 'animal') return 'animal';
  if (normalized === 'imaginary' || normalized === 'creature' || normalized === 'object')
    return 'imaginary';
  return 'human';
}

function graphicNovelReferenceSource(character: { type?: string }): {
  source: 'child_reference' | 'character_reference' | 'imaginary_friend';
  type: 'child_reference' | 'character_reference' | 'imaginary';
} {
  if (character.type === 'child') return { source: 'child_reference', type: 'child_reference' };
  if (character.type === 'imaginary') return { source: 'imaginary_friend', type: 'imaginary' };
  return { source: 'character_reference', type: 'character_reference' };
}

function extractStoragePath(url: string): string {
  const withoutQuery = url.split('?')[0];
  const withoutOrigin = withoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return withoutOrigin.replace(/^\/api\/v1\/assets\//, '').replace(/^\/+/, '');
}

function mimeTypeForStoragePath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function buildGraphicNovelCharacterReferences(
  character: any
): NonNullable<GraphicNovelCharacterManifest[number]['references']> {
  const refs: NonNullable<GraphicNovelCharacterManifest[number]['references']> = [];
  const source = graphicNovelReferenceSource(character);
  const turnaround = character.turnaroundSheet as
    | { url?: string; frontUrl?: string }
    | null
    | undefined;
  const turnaroundUrl = turnaround?.url || turnaround?.frontUrl;

  if (turnaroundUrl) {
    refs.push({
      storagePath: extractStoragePath(turnaroundUrl),
      ...source,
      isTurnaround: true,
    });
    return refs;
  }

  for (const photo of character.referencePhotos || []) {
    if (!photo?.url) continue;
    refs.push({
      storagePath: extractStoragePath(photo.url),
      ...source,
      isTurnaround: false,
    });
  }

  return refs;
}

function pushUniqueName(names: string[], value: unknown): void {
  const name = typeof value === 'string' ? stripCharacterIdFromName(value).trim() : '';
  if (!name) return;
  if (!names.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    names.push(name);
  }
}

async function buildGraphicNovelCharacterManifest(
  characters: CharacterData[]
): Promise<GraphicNovelCharacterManifest> {
  const characterIds = characters
    .map((character) => character.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  const translationsById = new Map<string, string[]>();

  if (characterIds.length > 0) {
    try {
      const translations = await getDictionaryRepository().findTranslationsForEntities(
        'character',
        characterIds,
        'name'
      );
      for (const translation of translations) {
        const aliases = translationsById.get(translation.entityId) || [];
        pushUniqueName(aliases, translation.value);
        translationsById.set(translation.entityId, aliases);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load graphic novel character name aliases');
    }
  }

  return characters.map((character) => {
    const aliases: string[] = [];
    pushUniqueName(aliases, character.name);
    pushUniqueName(aliases, (character as any).canonicalName);
    for (const translatedName of translationsById.get(character.id) || []) {
      pushUniqueName(aliases, translatedName);
    }

    return {
      name: character.name,
      canonicalName: (character as any).canonicalName,
      nameAliases: aliases,
      type: character.type,
      description: character.description || character.appearance || character.personality,
      references: buildGraphicNovelCharacterReferences(character),
    };
  });
}

function buildGraphicNovelCharacterAliasMap(
  characters: GraphicNovelCharacterManifest
): Record<string, string[]> {
  const aliasMap: Record<string, string[]> = {};
  for (const character of characters) {
    const aliases: string[] = [];
    pushUniqueName(aliases, character.name);
    pushUniqueName(aliases, character.canonicalName);
    for (const alias of character.nameAliases || []) {
      pushUniqueName(aliases, alias);
    }
    if (character.name && aliases.length > 0) {
      aliasMap[character.name] = aliases;
    }
  }
  return aliasMap;
}

function buildGraphicNovelExpectedCharacters(
  page: PlannedGraphicNovelPage,
  characters: GraphicNovelCharacterManifest
): Array<{ name: string; characterKind: 'human' | 'animal' | 'imaginary'; description?: string }> {
  const characterByName = new Map(
    characters.map((character) => [normalizeCharacterName(character.name), character])
  );
  const seen = new Set<string>();
  const expected: Array<{
    name: string;
    characterKind: 'human' | 'animal' | 'imaginary';
    description?: string;
  }> = [];

  for (const panel of page.panels) {
    for (const name of panelCharacterNames(panel.script)) {
      const normalized = normalizeCharacterName(name);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      const manifest = characterByName.get(normalized);
      expected.push({
        name,
        characterKind: graphicNovelCharacterKind(manifest?.type),
        description: manifest?.description,
      });
    }
  }

  return expected;
}

function panelVisualSummary(panel: GraphicNovelPanelScript): string {
  const composition = panel.visual.sceneVisual.cameraComposition;
  const shot = typeof composition === 'string' ? composition : composition.shot;
  return [
    `Primary read: ${panel.visual.primaryRead}`,
    `Environment: ${panel.visual.environmentId}`,
    `Setting delta: ${panel.visual.sceneVisual.setting}`,
    `Shot: ${shot}`,
    `Lighting: ${panel.visual.sceneVisual.lighting}`,
  ].join('. ');
}

function graphicNovelPageEditAspectRatio(page: PlannedGraphicNovelPage): '16:9' | '3:4' {
  const pageSize = pageSizeForGraphicNovelPage(page);
  return pageSize.width >= pageSize.height ? '16:9' : '3:4';
}

function pageEnvironmentIds(page: PlannedGraphicNovelPage): string[] {
  return [
    ...new Set(page.panels.map((panel) => panel.script.visual.environmentId).filter(Boolean)),
  ];
}

function environmentMapForPage(
  page: PlannedGraphicNovelPage,
  environments: StoryEnvironment[]
): Map<string, StoryEnvironment> {
  const requestedIds = new Set(pageEnvironmentIds(page));
  return new Map(
    environments
      .filter((environment) => requestedIds.has(environment.id))
      .map((environment) => [environment.id, environment])
  );
}

async function ensureGraphicNovelEnvironmentImages(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  environments: StoryEnvironment[];
  scenarioCardId?: string;
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
}): Promise<Array<{ environmentId: string; storagePath: string; mimeType: string }>> {
  const assetStorage = getAssetStorageService();
  const results: Array<{ environmentId: string; storagePath: string; mimeType: string }> = [];

  for (const environment of params.environments) {
    const startedAt = new Date();
    let image: Awaited<ReturnType<typeof getOrCreateEnvironmentImage>> | null = null;
    try {
      image = await getOrCreateEnvironmentImage({
        storyId: params.storyId,
        userId: params.userId,
        storyEnvironmentId: environment.id,
        environment,
        assetStorage,
        scenarioCardId: params.scenarioCardId,
      });
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        status: image ? 'completed' : 'skipped',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_preload',
          environmentName: environment.name,
          scenarioCardId: params.scenarioCardId,
          hasImage: !!image,
        },
      });
    } catch (error) {
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_preload',
          environmentName: environment.name,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
    if (image) {
      results.push({
        environmentId: environment.id,
        storagePath: image.storagePath,
        mimeType: image.mimeType,
      });
    }
  }

  return results;
}

async function buildPageEnvironmentReferenceImages(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  page: PlannedGraphicNovelPage;
  environments: StoryEnvironment[];
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
}): Promise<GraphicNovelReferenceImage[]> {
  const pageEnvironmentMap = environmentMapForPage(params.page, params.environments);
  if (pageEnvironmentMap.size === 0) return [];

  const assetStorage = getAssetStorageService();
  const references: GraphicNovelReferenceImage[] = [];
  for (const environment of pageEnvironmentMap.values()) {
    const startedAt = new Date();
    let image: Awaited<ReturnType<typeof getOrCreateEnvironmentImage>> | null = null;
    try {
      image = await getOrCreateEnvironmentImage({
        storyId: params.storyId,
        userId: params.userId,
        storyEnvironmentId: environment.id,
        environment,
        assetStorage,
      });
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        pageNumber: params.page.pageNumber,
        status: image ? 'completed' : 'skipped',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_page_reference',
          environmentName: environment.name,
          hasImage: !!image,
        },
      });
    } catch (error) {
      await recordStageTiming({
        storyId: params.storyId,
        storyRequestId: params.storyRequestId,
        userId: params.userId,
        generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'asset_generation',
        operation: 'environment_image',
        targetType: 'environment',
        targetKey: environment.id,
        pageNumber: params.page.pageNumber,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        metadata: {
          source: 'graphic_novel_page_reference',
          environmentName: environment.name,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
    if (!image) continue;

    references.push({
      base64Data: image.base64,
      mimeType: image.storagePath ? mimeTypeForStoragePath(image.storagePath) : image.mimeType,
      referenceKind: 'object',
      characterName: environment.name,
      source: 'environment',
      type: 'environment_reference',
      environmentId: environment.id,
      storagePath: image.storagePath,
      instructionText: `Environment reference for "${environment.name}". Reusable location layout, fixed background objects, materials, and color continuity.`,
    });
  }

  return references;
}

function pageCharacterNameKeys(page: PlannedGraphicNovelPage): Set<string> {
  const keys = new Set<string>();
  for (const panel of page.panels) {
    for (const name of panelCharacterNames(panel.script)) {
      const normalized = normalizeCharacterName(name);
      if (normalized) keys.add(normalized);
    }
  }
  return keys;
}

function characterManifestMatchesPage(
  character: GraphicNovelCharacterManifest[number],
  pageNames: Set<string>
): boolean {
  const names = [character.name, character.canonicalName].filter(
    (value): value is string => !!value
  );
  return names.some((name) => pageNames.has(normalizeCharacterName(name)));
}

async function loadGraphicNovelReferenceImage(params: {
  ref: NonNullable<GraphicNovelCharacterManifest[number]['references']>[number];
  characterName: string;
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  assetStorage: ReturnType<typeof getAssetStorageService>;
}): Promise<GraphicNovelReferenceImage | null> {
  try {
    const buffer = await params.assetStorage.getAssetByPath(params.ref.storagePath);
    if (!buffer) {
      logger.warn(
        { characterName: params.characterName, storagePath: params.ref.storagePath },
        'Graphic novel character reference asset not found'
      );
      return null;
    }

    const mimeType = mimeTypeForStoragePath(params.ref.storagePath);
    const uploaded =
      config.nanoBanana?.enableFilesApi === true
        ? await params.imageDomain.uploadReferenceFile(
            buffer,
            mimeType,
            `graphic_novel_reference_${params.characterName}`,
            params.ref.storagePath
          )
        : null;

    return {
      base64Data: uploaded ? undefined : buffer.toString('base64'),
      fileUri: uploaded?.uri,
      mimeType: uploaded?.mimeType || mimeType,
      characterName: params.characterName,
      referenceKind: 'character',
      source: params.ref.source,
      type: params.ref.type,
      isTurnaround: params.ref.isTurnaround,
      storagePath: params.ref.storagePath,
    };
  } catch (error) {
    logger.warn(
      { err: error, characterName: params.characterName, storagePath: params.ref.storagePath },
      'Failed to load graphic novel character reference'
    );
    return null;
  }
}

async function buildPageCharacterReferenceImages(params: {
  page: PlannedGraphicNovelPage;
  characters: GraphicNovelCharacterManifest;
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
}): Promise<GraphicNovelReferenceImage[]> {
  const pageNames = pageCharacterNameKeys(params.page);
  if (pageNames.size === 0) return [];

  const assetStorage = getAssetStorageService();
  const references: GraphicNovelReferenceImage[] = [];
  const seenStoragePaths = new Set<string>();

  for (const character of params.characters) {
    if (!characterManifestMatchesPage(character, pageNames)) continue;
    const firstReference = character.references?.find(
      (ref) => !seenStoragePaths.has(ref.storagePath)
    );
    if (!firstReference) continue;
    seenStoragePaths.add(firstReference.storagePath);
    const loaded = await loadGraphicNovelReferenceImage({
      ref: firstReference,
      characterName: character.name,
      imageDomain: params.imageDomain,
      assetStorage,
    });
    if (loaded) references.push(loaded);
  }

  return references;
}

function buildGraphicNovelReferenceInstruction(
  reference: GraphicNovelReferenceImage,
  imageIndex: number
): string {
  const imgLabel = `Image ${imageIndex}`;
  if (reference.referenceKind === 'object' || reference.source === 'environment') {
    return `${imgLabel}: Environment reference for "${reference.characterName || reference.environmentId || 'location'}". Reusable location structure, background objects, materials, and color continuity.`;
  }

  const sourceKind = reference.isTurnaround ? 'Character sheet' : 'Reference photo';
  return `${imgLabel}: Character reference for "${reference.characterName || 'character'}". ${sourceKind}.`;
}

function prepareGraphicNovelPageReferences(params: {
  storyId: string;
  pageNumber: number;
  environmentReferences: GraphicNovelReferenceImage[];
  characterReferences: GraphicNovelReferenceImage[];
}): GraphicNovelReferenceImage[] {
  const bucketInput: ReferenceImageDataEntry[] = [
    ...params.environmentReferences.map((ref) => ({
      base64: ref.base64Data || '',
      mimeType: ref.mimeType || 'image/png',
      fileUri: ref.fileUri,
      source: 'environment',
      type: 'environment_reference',
      characterName: ref.characterName,
      referenceKind: 'object' as const,
      referenceEnvironmentId: ref.environmentId,
      storagePath: ref.storagePath,
    })),
    ...params.characterReferences.map((ref) => ({
      base64: ref.base64Data || '',
      mimeType: ref.mimeType || 'image/png',
      fileUri: ref.fileUri,
      source: ref.source,
      type: ref.type,
      characterName: ref.characterName,
      referenceKind: 'character' as const,
      isTurnaround: ref.isTurnaround,
      storagePath: ref.storagePath,
    })),
  ];

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

  const byIdentity = new Map<string, GraphicNovelReferenceImage>();
  for (const ref of [...params.environmentReferences, ...params.characterReferences]) {
    const key = [
      ref.referenceKind,
      ref.source,
      ref.type,
      ref.characterName,
      ref.fileUri,
      ref.base64Data?.slice(0, 16),
    ].join('|');
    byIdentity.set(key, ref);
  }

  return bucketResult.trimmed.map((bucketRef) => {
    const key = [
      bucketRef.referenceKind,
      bucketRef.source,
      bucketRef.type,
      bucketRef.characterName,
      bucketRef.fileUri,
      bucketRef.base64?.slice(0, 16),
    ].join('|');
    const source = byIdentity.get(key);
    const reference: GraphicNovelReferenceImage = {
      ...(source || {}),
      base64Data: source?.base64Data || bucketRef.base64 || undefined,
      fileUri: source?.fileUri || bucketRef.fileUri,
      mimeType: source?.mimeType || bucketRef.mimeType,
      characterName: source?.characterName || bucketRef.characterName,
      referenceKind: source?.referenceKind || bucketRef.referenceKind,
      source: source?.source || bucketRef.source,
      type: source?.type || bucketRef.type,
      isTurnaround: source?.isTurnaround || bucketRef.isTurnaround,
    };
    return {
      ...reference,
      instructionText: buildGraphicNovelReferenceInstruction(reference, bucketRef.imageIndex || 1),
    };
  });
}

function buildGraphicNovelPageValidationSceneVisual(
  page: PlannedGraphicNovelPage,
  options?: { includeBubbleChecks?: boolean }
): SceneVisual {
  const includeBubbleChecks = options?.includeBubbleChecks !== false;

  return {
    setting: [
      `Graphic novel page ${page.pageNumber} using model-chosen free layout.`,
      `The page must visually contain exactly ${page.panels.length} panels, no more and no fewer.`,
      includeBubbleChecks
        ? 'Validate that each planned panel is one continuous illustration/story moment, artwork stays inside panel boxes, and artwork does not cover reserved/server-rendered bubbles.'
        : 'Validate that each planned panel is one continuous illustration/story moment and artwork stays inside panel boxes.',
      'No preset layout guide or fixed panel coordinate map is attached; evaluate the visible generated page structure.',
    ].join(' '),
    lighting: 'N/A. This is a layout validation pass for a rendered graphic novel page.',
    cameraComposition: {
      shot: includeBubbleChecks
        ? `Full page view with exactly ${page.panels.length} visible comic panels, gutters, and server-rendered speech/thought/caption bubbles. Extra visual panels, fake gutters, inset panels, split-screen dividers, or multiple story beats inside one planned panel are invalid.`
        : `Full page view with exactly ${page.panels.length} visible comic panels and gutters. Extra visual panels, fake gutters, inset panels, split-screen dividers, or multiple story beats inside one planned panel are invalid.`,
      characters: page.panels.map((panel, index) => ({
        name: `Panel ${index + 1}`,
        description: [
          `Expected visual focus: ${panel.script.visual.primaryRead}`,
          `Environment id: ${panel.script.visual.environmentId}`,
          `Scene setting delta: ${panel.script.visual.sceneVisual.setting}`,
          includeBubbleChecks ? `Bubble count: ${panel.bubbles.length}` : null,
          `Characters named in panel: ${panelCharacterNames(panel.script).join(', ') || 'none'}`,
        ]
          .filter(Boolean)
          .join('. '),
      })),
    },
  };
}

function summarizeGraphicNovelLayoutValidation(
  validation: ImageValidationResult,
  score?: number | null
): Record<string, unknown> {
  return {
    validationStatus: validation.validationStatus ?? 'completed',
    validationAttemptKind: validation.validationAttemptKind ?? null,
    validationModelUsed: validation.validationModelUsed ?? null,
    validationScore: score ?? null,
    hasArtworkOutsidePanelBounds: validation.hasArtworkOutsidePanelBounds ?? false,
    hasArtworkOverSpeechBubbles: validation.hasArtworkOverSpeechBubbles ?? false,
    hasExtraPanelStructure: validation.hasExtraPanelStructure ?? false,
    layoutFeedback: validation.layoutFeedback ?? null,
    overallFeedback: validation.overallFeedback,
  };
}

function summarizeGraphicNovelValidationAttempt(
  result: GraphicNovelRenderedPageValidation | null
): Record<string, unknown> | null {
  if (!result) return null;
  return {
    attempt: result.attempt,
    score: result.score,
    validationStatus: result.validation.validationStatus ?? 'completed',
    validationAttemptKind: result.validation.validationAttemptKind ?? null,
    validationModelUsed: result.validation.validationModelUsed ?? null,
    hasArtworkOutsidePanelBounds: result.validation.hasArtworkOutsidePanelBounds ?? false,
    hasArtworkOverSpeechBubbles: result.validation.hasArtworkOverSpeechBubbles ?? false,
    hasExtraPanelStructure: result.validation.hasExtraPanelStructure ?? false,
    layoutFeedback: result.validation.layoutFeedback ?? null,
    overallFeedback: result.validation.overallFeedback,
  };
}

function textOverlayFromPageRow(page: {
  bubbleLayoutJson: unknown;
  layoutJson: unknown;
}): GraphicNovelPageTextOverlay | null {
  const bubbleLayout = page.bubbleLayoutJson as {
    textOverlay?: GraphicNovelPageTextOverlay;
  } | null;
  if (bubbleLayout?.textOverlay) {
    return bubbleLayout.textOverlay;
  }

  const plannedPage = page.layoutJson as PlannedGraphicNovelPage | null;
  if (plannedPage?.panels) {
    return buildGraphicNovelPageTextOverlay(plannedPage, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripForAudio,
    });
  }

  return null;
}

function buildGraphicNovelBubbleLayoutJson(
  page: PlannedGraphicNovelPage,
  placementMode: 'script_initial' | 'post_art_vision' | 'script_fallback' = 'post_art_vision'
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

function normalizeVisionMimeType(mimeType: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
    return mimeType;
  }
  return 'image/png';
}

async function applyVisionBubblePlacementForRenderedPage(params: {
  page: PlannedGraphicNovelPage;
  imageData: Buffer;
  mimeType: string;
  userId: string;
  storyId: string;
  usePanelCrops?: boolean;
}): Promise<{
  page: PlannedGraphicNovelPage;
  analysis: GraphicNovelBubbleVisionAnalysis | null;
  placementSummary: Record<string, unknown>;
}> {
  if (config.image.skipGeneration) {
    return {
      page: params.page,
      analysis: null,
      placementSummary: {
        mode: 'script_fallback_skip_generation',
        skipped: true,
      },
    };
  }

  try {
    const usePanelCrops = params.usePanelCrops !== false;
    const analysis = usePanelCrops
      ? await analyzeGraphicNovelBubbleVisionByPanelCrops({
          textProvider: getValidationTextProvider(),
          page: params.page,
          imageData: params.imageData,
          mimeType: normalizeVisionMimeType(params.mimeType),
          onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
        })
      : await analyzeGraphicNovelBubbleVision({
          textProvider: getValidationTextProvider(),
          page: params.page,
          imageData: params.imageData,
          mimeType: normalizeVisionMimeType(params.mimeType),
          detectPanelBounds: true,
          onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
        });
    const planned = applyGraphicNovelBubbleVisionLayout(params.page, analysis, {
      useDetectedPanelBounds: !usePanelCrops,
    });
    return {
      page: planned.page,
      analysis,
      placementSummary: {
        mode: usePanelCrops ? 'post_art_vision_panel_crops' : 'post_art_vision_full_page',
        ...planned.placementSummary,
      },
    };
  } catch (error) {
    logger.warn(
      { err: error, storyId: params.storyId, pageNumber: params.page.pageNumber },
      'Graphic novel bubble vision placement failed; falling back to script bubble geometry'
    );
    return {
      page: params.page,
      analysis: null,
      placementSummary: {
        mode: 'script_fallback_after_vision_error',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function validateGraphicNovelRenderedPage(params: {
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  imageData: Buffer;
  mimeType: string;
  page: PlannedGraphicNovelPage;
  characters: GraphicNovelCharacterManifest;
  referenceImages?: GraphicNovelReferenceImage[];
  userId: string;
  storyId: string;
  attempt?: number;
  includeLayoutChecks?: boolean;
  includeBubbleChecks?: boolean;
}): Promise<GraphicNovelRenderedPageValidation | null> {
  if (!config.image.enableValidation) {
    return null;
  }

  try {
    const expectedCharacters = buildGraphicNovelExpectedCharacters(params.page, params.characters);
    const sceneVisual = buildGraphicNovelPageValidationSceneVisual(params.page, {
      includeBubbleChecks: params.includeBubbleChecks,
    });
    const characterValidationReferenceImages = params.referenceImages
      ?.filter(
        (ref) =>
          ref.referenceKind === 'character' && ref.characterName && (ref.base64Data || ref.fileUri)
      )
      .map((ref) => ({
        characterName: ref.characterName!,
        imageData: ref.base64Data,
        fileUri: ref.fileUri,
        mimeType: ref.mimeType || 'image/png',
        referenceKind: 'identity' as const,
        identitySource: ref.isTurnaround ? ('turnaround' as const) : ('reference_photo' as const),
      }));
    const validationReferenceImages = characterValidationReferenceImages ?? [];
    const validation = await params.imageDomain.validateGeneratedImageSegmented({
      imageData: params.imageData,
      mimeType: params.mimeType,
      expectedCharacters,
      sceneVisual,
      referenceImages: validationReferenceImages.length > 0 ? validationReferenceImages : undefined,
      logContext: {
        storyId: params.storyId,
        sceneId: params.page.pageNumber,
        attempt: params.attempt ?? 1,
      },
      includeLayoutChecks: params.includeLayoutChecks !== false,
      includeBubbleChecks: params.includeBubbleChecks,
      onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
    });
    const validationRefNamesNormalized = new Set(
      (characterValidationReferenceImages || []).map((ref) =>
        stripCharacterIdFromName(ref.characterName).trim().toLowerCase()
      )
    );
    const score =
      validation.validationStatus === 'provider_blocked'
        ? null
        : computeValidationScore(validation, {
            referenceNamesNormalized: validationRefNamesNormalized,
            expectedCharacters,
            sceneVisual,
            validationReferenceImages:
              validationReferenceImages.length > 0 ? validationReferenceImages : undefined,
          });

    if (
      validation.validationStatus !== 'provider_blocked' &&
      (validation.hasArtworkOutsidePanelBounds ||
        validation.hasArtworkOverSpeechBubbles ||
        validation.hasExtraPanelStructure)
    ) {
      logger.warn(
        {
          storyId: params.storyId,
          pageNumber: params.page.pageNumber,
          layoutFeedback: validation.layoutFeedback,
          overallFeedback: validation.overallFeedback,
          hasArtworkOutsidePanelBounds: validation.hasArtworkOutsidePanelBounds,
          hasArtworkOverSpeechBubbles: validation.hasArtworkOverSpeechBubbles,
          hasExtraPanelStructure: validation.hasExtraPanelStructure,
          validationScore: score,
        },
        'Graphic novel layout validation reported issues'
      );
    }

    return { validation, score, attempt: params.attempt ?? 1 };
  } catch (error) {
    logger.warn(
      {
        err: error,
        storyId: params.storyId,
        pageNumber: params.page.pageNumber,
      },
      'Graphic novel image validation failed; keeping generated page'
    );
    return null;
  }
}

function shouldRepairGraphicNovelArtValidation(
  validationResult: GraphicNovelRenderedPageValidation | null
): boolean {
  if (!validationResult) return false;
  if (validationResult.validation.validationStatus === 'provider_blocked') return false;
  if (validationResult.score == null) return false;
  return validationResult.score <= GRAPHIC_NOVEL_ART_REPAIR_THRESHOLD;
}

function chooseGraphicNovelArtAttempt<
  T extends { validation: GraphicNovelRenderedPageValidation | null },
>(first: T, repaired: T | null): T {
  if (!repaired?.validation) return first;
  if (!first.validation) return repaired;
  const firstScore = first.validation.score ?? -1;
  const repairedScore = repaired.validation.score ?? -1;
  return repairedScore >= firstScore ? repaired : first;
}

async function repairGraphicNovelArtWithValidationFeedback(params: {
  imageDomain: ReturnType<typeof getComplexImageDomainService>;
  page: PlannedGraphicNovelPage;
  imageData: Buffer;
  mimeType: string;
  validation: ImageValidationResult;
  score: number | null;
  style: string;
  ageGroup: string;
  environmentsById: Map<string, StoryEnvironment>;
  referenceImages: GraphicNovelReferenceImage[];
  userId: string;
  storyId: string;
  previousInteractionId?: string | null;
}): Promise<{
  imageData: Buffer;
  mimeType: string;
  providerInteractionId?: string;
  requestManifest: Record<string, unknown>;
}> {
  const editInstructions = buildGraphicNovelPageValidationRepairInstructions({
    page: params.page,
    validation: params.validation,
    score: params.score,
    environmentsById: params.environmentsById,
    referenceImages: params.referenceImages,
  });
  const aspectRatio = graphicNovelPageEditAspectRatio(params.page);
  const systemInstruction = buildGraphicNovelPageRepairSystemInstruction({
    style: params.style,
    slotCount: params.page.panels.length,
    ageGroup: params.ageGroup,
  });
  const edited = await params.imageDomain.editImageWithInstructions({
    originalImage: params.imageData,
    originalMimeType: params.mimeType,
    editInstructions,
    aspectRatio,
    referenceImages: params.referenceImages,
    personGeneration: 'allow_all',
    previousInteractionId: params.previousInteractionId ?? undefined,
    systemInstruction,
    onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
    operation: 'graphic_novel_page_validation_repair_edit',
  });

  return {
    imageData: Buffer.from(edited.imageData),
    mimeType: edited.mimeType || 'image/png',
    providerInteractionId: edited.providerInteractionId,
    requestManifest: {
      ...buildGraphicNovelImageRequestManifest({
        operation: 'graphic_novel_page_validation_repair_edit',
        mode: 'edit',
        prompt: editInstructions,
        systemInstruction,
        aspectRatio,
        personGeneration: 'allow_all',
        previousInteractionId: params.previousInteractionId ?? null,
        referenceImages: params.referenceImages,
      }),
      providerInteractionId: edited.providerInteractionId ?? null,
      validationScore: params.score,
      validationFeedback: params.validation.overallFeedback ?? null,
      validationIssues: summarizeGraphicNovelLayoutValidation(params.validation, params.score),
    },
  };
}

export async function createGraphicNovelRequest(
  userId: string,
  input: CreateStoryRequestInput
): Promise<string> {
  await assertGraphicNovelQuotaAvailable(userId);
  const requestId = await createStoryRequest(userId, input, {
    quotaSource: 'graphic_novel',
  });

  await getStoryRepository().updateRequest(requestId, {
    intermediateData: {
      generationKind: GRAPHIC_NOVEL_KIND,
      graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
      graphicNovelProgressStage: 'generating_script',
    },
  });
  await recordUsageEvent(userId, GRAPHIC_NOVEL_USAGE_EVENT, 1, {
    childProfileId: input.childProfileId ?? null,
    metadata: {
      requestId,
      quotaReservation: true,
      reservationSource: 'graphic_novel',
      reservedAt: new Date().toISOString(),
      reservationBehavior: 'consumed_on_queue_acceptance',
    },
  });

  return requestId;
}

export async function createMixedStoryRequest(
  userId: string,
  input: CreateStoryRequestInput
): Promise<string> {
  await assertMixedStoryAccessAvailable(userId);
  const requestId = await createStoryRequest(userId, input, {
    quotaSource: 'mixed_story',
  });

  await getStoryRepository().updateRequest(requestId, {
    intermediateData: {
      generationKind: MIXED_STORY_KIND,
      graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
      graphicNovelProgressStage: 'generating_script',
    },
  });

  return requestId;
}

function estimateMixedStorySceneCount(ageGroup: string): number {
  switch (ageGroup) {
    case '0-1':
    case '1y':
      return 5;
    case '2-3':
      return 6;
    case '4-5':
      return 8;
    case '6-8':
      return 8;
    case '9-12':
      return 11;
    default:
      return 8;
  }
}

export async function processGraphicNovelRequest(requestId: string): Promise<{ storyId: string }> {
  const request = await getStoryRepository().findRequestById(requestId);
  if (!request) {
    throw new Error(`Graphic novel request ${requestId} not found`);
  }

  const existingProject = await getGraphicNovelRepository().findProjectByRequestId(requestId);
  if (existingProject) {
    return { storyId: existingProject.storyId };
  }

  let storyId: string | undefined;
  const continuationData = getContinuationDataFromRequest(request);

  try {
    await getStoryRepository().updateRequest(requestId, {
      status: 'processing',
      errorMessage: null,
      updatedAt: new Date(),
    });

    const pageCount = GRAPHIC_NOVEL_DEFAULT_PAGE_COUNT;
    const specData = await buildStorySpec(
      {
        ...request,
        selectedCharacters: Array.isArray(request.selectedCharacters)
          ? request.selectedCharacters
          : [],
        selectedChildren: Array.isArray(request.selectedChildren) ? request.selectedChildren : [],
      } as any,
      continuationData.isContinuation
        ? {
            continuationContext: continuationData.continuationContext,
          }
        : undefined
    );
    const spec = specData.spec;

    await setPlannedTasks(requestId, [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 45_000 },
      { task: STORY_TASKS.PRODUCING_VISUALS, estimatedMs: 20_000 },
      { task: STORY_TASKS.GENERATING_IMAGES, estimatedMs: 20_000 },
    ]);

    storyId = await createStoryStub({
      userId: request.userId,
      storyRequestId: request.id,
      childProfileId: request.childProfileId,
      ...getStoryCreationAttributionInputFromRequest(request),
      spec,
      ...(continuationData.isContinuation &&
        continuationData.seriesId &&
        continuationData.partNumber && {
          seriesData: {
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
        }),
      isScheduledContinuation: continuationData.isScheduledContinuation,
    });
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: GRAPHIC_NOVEL_KIND,
        storyId,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_script',
      },
    });

    const graphicNovelDomain = getGraphicNovelDomainService();
    await setGraphicNovelProgressStage(requestId, 'generating_script');
    await startTask(requestId, STORY_TASKS.GENERATING_TEXT, { estimatedMs: 45_000 });
    const script = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'text',
        operation: 'graphic_novel_script',
        targetType: 'story',
        metadata: {
          pageCount,
          isContinuation: continuationData.isContinuation,
          language: spec.language,
          ageGroup: spec.ageGroup,
        },
        successMetadata: (result) => ({
          environmentCount: result.environments?.length ?? 0,
          pageCount: result.pages?.length ?? pageCount,
          outfitCount: result.outfits?.length ?? 0,
        }),
      },
      () =>
        graphicNovelDomain.generateScript({
          spec,
          pageCount,
          ...(continuationData.isContinuation &&
            continuationData.continuationContext && {
              isContinuation: true,
              continuationContext: continuationData.continuationContext,
            }),
          onUsage: (usage) => recordUsage(usage, { userId: request.userId, storyId: storyId! }),
        })
    );

    await transitionTask(requestId, STORY_TASKS.GENERATING_TEXT, STORY_TASKS.PRODUCING_VISUALS, {
      estimatedMs: 20_000,
    });
    await setGraphicNovelProgressStage(requestId, 'planning_pages');
    const graphicNovelEnvironmentImages = await ensureGraphicNovelEnvironmentImages({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      environments: script.environments,
      scenarioCardId: spec.scenarioCard?.id,
      generationKind: GRAPHIC_NOVEL_KIND,
    });
    const readingTextSettings = await resolveGraphicNovelReadingTextSettings({
      ageGroup: spec.ageGroup,
      userId: request.userId,
      childProfileId: request.childProfileId ?? request.createdByChildProfileId ?? null,
    });
    const { characterManifest, plannedPages } = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: GRAPHIC_NOVEL_KIND,
        pipelinePhase: 'visual_planning',
        operation: 'graphic_novel_layout',
        targetType: 'story',
        metadata: {
          pageCount,
          environmentCount: script.environments.length,
        },
        successMetadata: (result) => ({
          plannedPageCount: result.plannedPages.length,
          characterCount: result.characterManifest.length,
          textSizePx: readingTextSettings.textSizePx,
        }),
      },
      async () => {
        const manifest = await buildGraphicNovelCharacterManifest(
          (spec.characters || []) as CharacterData[]
        );
        const aliases = buildGraphicNovelCharacterAliasMap(manifest);
        const pages = graphicNovelDomain
          .planLayouts({
            spec,
            script,
            bubbleTextSizing: readingTextSettings.bubbleTextSizing,
          })
          .map((page) => ({ ...page, characterAliases: aliases }));
        return { characterManifest: manifest, plannedPages: pages };
      }
    );
    await setGraphicNovelProgressStage(requestId, 'placing_bubbles');
    await completeTask(requestId, STORY_TASKS.PRODUCING_VISUALS);

    const textManifest = buildGraphicNovelTextManifest(plannedPages);
    const closingKeepsakeLabel = extractClosingKeepsakeFromEpisodeText({
      fullText: textManifest.fullText,
      scenes: textManifest.scenes,
    });
    await getStoryRepository().updateStory(storyId, {
      title: stripCharacterIds(script.title),
      language: spec.language,
      ageGroup: spec.ageGroup,
      moralTheme: request.goal,
      scenes: textManifest.scenes,
      fullText: textManifest.fullText,
      wordCount: countNarrationWords(textManifest.fullText),
      closingKeepsakeLabel,
      closingArtifactId: spec.closingArtifact?.id ?? null,
      modelVersion: config.ai.modelVersion,
      generationTimeMs: null,
      metadata: {
        storyFormat: GRAPHIC_NOVEL_KIND,
        graphicNovelTextMode: 'html_overlay',
        graphicNovelTextManifestVersion: textManifest.version,
        firstPageReady: false,
        graphicNovelGenerationComplete: false,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        graphicNovelBubbleTextSizing: readingTextSettings.bubbleTextSizing,
        imageStyle: (spec as any).imageStyle,
        graphicNovelPageCount: pageCount,
        graphicNovelPlannedPageCount: plannedPages.length,
        environments: script.environments,
        outfits: script.outfits || [],
        graphicNovelEnvironmentImages,
        seoDescription: script.description,
        ...(spec.closingArtifact && {
          storyArtifactId: spec.closingArtifact.id,
          storyArtifactCode: spec.closingArtifact.artifactCode,
          storyArtifactTitle: spec.closingArtifact.title,
          storyArtifactImagePath: spec.closingArtifact.imagePath,
          storyArtifactSelection: (spec.closingArtifact as any).selection,
        }),
      },
      policyChecks: {
        graphicNovelScriptGenerated: true,
        timestamp: new Date().toISOString(),
      },
    });
    await linkGraphicNovelStoryCharacters({
      storyId,
      characters: (spec.characters || []) as CharacterData[],
    });

    const project = await getGraphicNovelRepository().createProject({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      language: spec.language,
      ageGroup: spec.ageGroup,
      pageCount,
      status: 'generating',
      scriptJson: script,
      layoutManifest: {
        layoutMode: 'free_layout',
        modelChoosesPanelLayout: true,
        minimumPanelsPerPage: 2,
        pageSize: { width: 1536, height: 2048 },
        textMode: 'html_overlay',
        textManifestVersion: textManifest.version,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        bubbleTextSizing: readingTextSettings.bubbleTextSizing,
        characters: characterManifest,
        environments: script.environments.map((environment) => ({
          id: environment.id,
          name: environment.name,
        })),
        outfits: script.outfits || [],
        environmentImages: graphicNovelEnvironmentImages,
        pageTextSegments: textManifest.pages.map((page) => ({
          pageNumber: page.pageNumber,
          segmentIds: page.items.map((item) => item.segmentId),
        })),
      },
    });

    const textOverlayByPage = new Map(textManifest.pages.map((page) => [page.pageNumber, page]));

    for (const plannedPage of plannedPages) {
      const textOverlay = textOverlayByPage.get(plannedPage.pageNumber);
      const page = await getGraphicNovelRepository().createPage({
        projectId: project.id,
        storyId,
        pageNumber: plannedPage.pageNumber,
        pageRole: plannedPage.pageRole,
        layoutJson: plannedPage,
        bubbleLayoutJson: {
          ...buildGraphicNovelBubbleLayoutJson(plannedPage, 'script_initial'),
          textOverlay,
        },
        status: 'pending',
        generationParams: {
          renderingMode: 'edit',
          bubblePlacement: 'script_initial_pending_post_art_vision',
          textRenderingMode: 'html_overlay',
        },
      });

      await getGraphicNovelRepository().createPanels(
        plannedPage.panels.map((panel, index) => ({
          pageId: page.id,
          projectId: project.id,
          storyId,
          pageNumber: plannedPage.pageNumber,
          panelIndex: index + 1,
          panelId: panel.script.panelId,
          speakerLines: panel.script.dialogue,
          thoughtLines: panel.script.thoughts,
          caption: panel.script.caption ?? null,
          visualAction: panel.script.visual.primaryRead,
          charactersPresent: panelCharacterNames(panel.script),
          artPrompt: panelVisualSummary(panel.script),
          bubbleGeometry: panel.bubbles,
        }))
      );
    }

    await getStoryRepository().updateRequest(requestId, {
      errorMessage: null,
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: GRAPHIC_NOVEL_KIND,
        storyId,
        projectId: project.id,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_first_page',
      },
    });

    logger.info(
      { requestId, storyId, projectId: project.id, pageCount },
      'Graphic novel script/layout saved'
    );
    if (
      continuationData.isContinuation &&
      continuationData.seriesId &&
      continuationData.partNumber
    ) {
      const createdStory = await getStoryRepository().findById(storyId);
      if (createdStory) {
        const { addContinuationToSeries } = await import('./seriesService');
        await addContinuationToSeries(continuationData.seriesId, storyId, createdStory);
        logger.info(
          {
            requestId,
            storyId,
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
          'Added graphic novel continuation to series'
        );
      }
    }
    return { storyId };
  } catch (error) {
    logger.error(
      {
        err: error,
        requestId,
        storyId,
      },
      'Graphic novel script/layout generation failed'
    );

    if (storyId) {
      const existingStory = await getStoryRepository().findById(storyId);
      if (existingStory?.title === 'Generating...') {
        await getStoryRepository().deleteStory(storyId, request.userId);
        logger.info({ requestId, storyId }, 'Deleted graphic novel story stub after failure');
      }
    }

    await getStoryRepository().updateRequest(requestId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      updatedAt: new Date(),
    });

    throw error;
  }
}

export async function processMixedStoryRequest(requestId: string): Promise<{ storyId: string }> {
  const request = await getStoryRepository().findRequestById(requestId);
  if (!request) {
    throw new Error(`Mixed story request ${requestId} not found`);
  }

  const existingProject = await getGraphicNovelRepository().findProjectByRequestId(requestId);
  if (existingProject) {
    return { storyId: existingProject.storyId };
  }

  let storyId: string | undefined;
  const continuationData = getContinuationDataFromRequest(request);

  try {
    await getStoryRepository().updateRequest(requestId, {
      status: 'processing',
      errorMessage: null,
      updatedAt: new Date(),
    });

    const specData = await buildStorySpec(
      {
        ...request,
        selectedCharacters: Array.isArray(request.selectedCharacters)
          ? request.selectedCharacters
          : [],
        selectedChildren: Array.isArray(request.selectedChildren) ? request.selectedChildren : [],
      } as any,
      continuationData.isContinuation
        ? {
            continuationContext: continuationData.continuationContext,
          }
        : undefined
    );
    const spec = specData.spec;
    const userPlan = await getPlanFeatures(request.userId);
    const comicBlockCount = Number(userPlan.imagesPerStory || 0);
    if (comicBlockCount <= 0) {
      throw new Error('Mixed story mode is unavailable when the plan has no story illustrations.');
    }

    const sceneCount = estimateMixedStorySceneCount(spec.ageGroup);
    const comicSceneIds = getIllustrationBlockStartSceneIds(sceneCount, comicBlockCount);

    await setPlannedTasks(requestId, [
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: 45_000 },
      { task: STORY_TASKS.PRODUCING_VISUALS, estimatedMs: 15_000 },
      { task: STORY_TASKS.GENERATING_IMAGES, estimatedMs: 20_000 },
    ]);

    storyId = await createStoryStub({
      userId: request.userId,
      storyRequestId: request.id,
      childProfileId: request.childProfileId,
      ...getStoryCreationAttributionInputFromRequest(request),
      spec,
      ...(continuationData.isContinuation &&
        continuationData.seriesId &&
        continuationData.partNumber && {
          seriesData: {
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
        }),
      isScheduledContinuation: continuationData.isScheduledContinuation,
    });
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: MIXED_STORY_KIND,
        storyId,
        mixedStoryComicBlockCount: comicBlockCount,
        mixedStorySceneCount: sceneCount,
        mixedStoryAnchorSceneIds: comicSceneIds,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_script',
      },
    });

    const mixedStoryDomain = getMixedStoryDomainService();
    await setGraphicNovelProgressStage(requestId, 'generating_script', MIXED_STORY_KIND);
    await startTask(requestId, STORY_TASKS.GENERATING_TEXT, { estimatedMs: 45_000 });
    const { script, repairs } = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: MIXED_STORY_KIND,
        pipelinePhase: 'text',
        operation: 'mixed_story_script',
        targetType: 'story',
        metadata: {
          sceneCount,
          comicBlockCount,
          isContinuation: continuationData.isContinuation,
          language: spec.language,
          ageGroup: spec.ageGroup,
        },
        successMetadata: (result) => ({
          environmentCount: result.script.environments?.length ?? 0,
          readingBlockCount: result.script.readingBlocks?.length ?? 0,
          repairCount: result.repairs?.length ?? 0,
          outfitCount: result.script.outfits?.length ?? 0,
        }),
      },
      () =>
        mixedStoryDomain.generateScript({
          spec,
          sceneCount,
          comicSceneIds,
          comicBlockCount,
          ...(continuationData.isContinuation &&
            continuationData.continuationContext && {
              isContinuation: true,
              continuationContext: continuationData.continuationContext,
            }),
          onUsage: (usage) => recordUsage(usage, { userId: request.userId, storyId: storyId! }),
        })
    );

    await transitionTask(requestId, STORY_TASKS.GENERATING_TEXT, STORY_TASKS.PRODUCING_VISUALS, {
      estimatedMs: 15_000,
    });
    await setGraphicNovelProgressStage(requestId, 'planning_pages', MIXED_STORY_KIND);
    const graphicNovelEnvironmentImages = await ensureGraphicNovelEnvironmentImages({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      environments: script.environments,
      scenarioCardId: spec.scenarioCard?.id,
      generationKind: MIXED_STORY_KIND,
    });
    const readingTextSettings = await resolveGraphicNovelReadingTextSettings({
      ageGroup: spec.ageGroup,
      userId: request.userId,
      childProfileId: request.childProfileId ?? request.createdByChildProfileId ?? null,
    });
    const { characterManifest, plannedPages } = await withStageTiming(
      {
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: MIXED_STORY_KIND,
        pipelinePhase: 'visual_planning',
        operation: 'mixed_story_layout',
        targetType: 'story',
        metadata: {
          sceneCount,
          comicBlockCount,
          environmentCount: script.environments.length,
        },
        successMetadata: (result) => ({
          plannedPageCount: result.plannedPages.length,
          characterCount: result.characterManifest.length,
          textSizePx: readingTextSettings.textSizePx,
        }),
      },
      async () => {
        const manifest = await buildGraphicNovelCharacterManifest(
          (spec.characters || []) as CharacterData[]
        );
        const aliases = buildGraphicNovelCharacterAliasMap(manifest);
        const pages = planGraphicNovelLayouts({
          ageGroup: spec.ageGroup,
          pages: mixedStoryComicPages(script),
          outfits: script.outfits,
          bubbleTextSizing: readingTextSettings.bubbleTextSizing,
        }).map((page) => ({ ...page, characterAliases: aliases }));
        return { characterManifest: manifest, plannedPages: pages };
      }
    );
    const comicPanelRange = graphicNovelPanelCountRange(spec.ageGroup);
    await setGraphicNovelProgressStage(requestId, 'placing_bubbles', MIXED_STORY_KIND);
    await completeTask(requestId, STORY_TASKS.PRODUCING_VISUALS);

    const textManifest = buildMixedStoryTextManifest({ script, plannedPages });
    const closingKeepsakeLabel = extractClosingKeepsakeFromEpisodeText({
      fullText: textManifest.fullText,
      scenes: textManifest.scenes,
    });
    await getStoryRepository().updateStory(storyId, {
      title: stripCharacterIds(script.title),
      language: spec.language,
      ageGroup: spec.ageGroup,
      moralTheme: request.goal,
      scenes: textManifest.scenes,
      fullText: textManifest.fullText,
      wordCount: countNarrationWords(textManifest.fullText),
      closingKeepsakeLabel,
      closingArtifactId: spec.closingArtifact?.id ?? null,
      modelVersion: config.ai.modelVersion,
      generationTimeMs: null,
      metadata: {
        storyFormat: MIXED_STORY_KIND,
        graphicNovelTextMode: 'html_overlay',
        mixedStoryVersion: 1,
        mixedStoryTextMode: textManifest.textMode,
        mixedStoryTextManifestVersion: textManifest.version,
        mixedStoryComicBlockCount: comicBlockCount,
        mixedStorySceneCount: sceneCount,
        mixedStoryAnchorSceneIds: comicSceneIds,
        mixedStoryReadingOrder: textManifest.readingOrder,
        mixedStoryComicTextRepairs: repairs,
        firstPageReady: false,
        graphicNovelGenerationComplete: false,
        imageGenerationComplete: true,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        graphicNovelBubbleTextSizing: readingTextSettings.bubbleTextSizing,
        sceneIdsWithImages: [],
        imageStyle: (spec as any).imageStyle,
        graphicNovelPageCount: comicBlockCount,
        graphicNovelPlannedPageCount: plannedPages.length,
        graphicNovelLayoutMode: 'free_layout',
        environments: script.environments,
        outfits: script.outfits || [],
        graphicNovelEnvironmentImages,
        seoDescription: script.description,
        ...(spec.closingArtifact && {
          storyArtifactId: spec.closingArtifact.id,
          storyArtifactCode: spec.closingArtifact.artifactCode,
          storyArtifactTitle: spec.closingArtifact.title,
          storyArtifactImagePath: spec.closingArtifact.imagePath,
          storyArtifactSelection: (spec.closingArtifact as any).selection,
        }),
      },
      policyChecks: {
        mixedStoryScriptGenerated: true,
        graphicNovelScriptGenerated: true,
        timestamp: new Date().toISOString(),
      },
    });

    const existingSceneRows = await getSceneRepository().findByStoryId(storyId);
    if (existingSceneRows.length === 0) {
      await getSceneRepository().createMany(
        textManifest.scenes.map((scene) => ({
          storyId: storyId!,
          sceneId: scene.sceneId,
          text: scene.text,
          visualPrompt: '',
          charactersPresent: [],
          generationParams: {
            source: MIXED_STORY_KIND,
            mixedStoryBlockKind: scene.mixedStoryBlockKind,
            mixedStoryScreenOrder: scene.mixedStoryScreenOrder,
            mixedStorySourceSceneIds: scene.mixedStorySourceSceneIds,
            mixedStoryAnchorSceneId: scene.mixedStoryAnchorSceneId ?? null,
            graphicNovelPageNumber: scene.graphicNovelPageNumber ?? null,
            graphicNovelTextSegmentIds: scene.graphicNovelTextSegmentIds ?? [],
          },
        }))
      );
    }

    await linkGraphicNovelStoryCharacters({
      storyId,
      characters: (spec.characters || []) as CharacterData[],
    });

    const project = await getGraphicNovelRepository().createProject({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      language: spec.language,
      ageGroup: spec.ageGroup,
      pageCount: comicBlockCount,
      status: 'generating',
      scriptJson: script,
      layoutManifest: {
        storyFormat: MIXED_STORY_KIND,
        layoutMode: 'free_layout',
        modelChoosesPanelLayout: true,
        minimumPanelsPerPage: comicPanelRange.min,
        maximumPanelsPerPage: comicPanelRange.max,
        pageSize: GRAPHIC_NOVEL_PAGE_SIZE,
        textMode: 'html_overlay',
        textManifestVersion: textManifest.version,
        readingSettings: {
          baseTextSizePx: readingTextSettings.baseTextSizePx,
          textSizeMultiplier: readingTextSettings.textSizeMultiplier,
          textSizePx: readingTextSettings.textSizePx,
        },
        bubbleTextSizing: readingTextSettings.bubbleTextSizing,
        mixedStoryReadingOrder: textManifest.readingOrder,
        characters: characterManifest,
        environments: script.environments.map((environment) => ({
          id: environment.id,
          name: environment.name,
        })),
        outfits: script.outfits || [],
        environmentImages: graphicNovelEnvironmentImages,
        pageTextSegments: textManifest.pages.map((page) => ({
          pageNumber: page.pageNumber,
          segmentIds: page.items.map((item) => item.segmentId),
        })),
      },
    });

    const textOverlayByPage = new Map(textManifest.pages.map((page) => [page.pageNumber, page]));
    const comicBlockByPage = new Map(
      script.readingBlocks
        .filter((block) => block.kind === 'comic')
        .map((block) => [block.comicPageNumber, block])
    );

    for (const plannedPage of plannedPages) {
      const textOverlay = textOverlayByPage.get(plannedPage.pageNumber);
      const comicBlock = comicBlockByPage.get(plannedPage.pageNumber);
      const page = await getGraphicNovelRepository().createPage({
        projectId: project.id,
        storyId,
        pageNumber: plannedPage.pageNumber,
        pageRole: plannedPage.pageRole,
        layoutJson: {
          ...plannedPage,
          mixedStorySceneId: comicBlock?.sceneId ?? null,
          mixedStoryScreenOrder: comicBlock?.screenOrder ?? null,
        },
        bubbleLayoutJson: {
          ...buildGraphicNovelBubbleLayoutJson(plannedPage, 'script_initial'),
          textOverlay,
        },
        status: 'pending',
        generationParams: {
          renderingMode: 'edit',
          bubblePlacement: 'script_initial_pending_post_art_vision',
          textRenderingMode: 'html_overlay',
          storyFormat: MIXED_STORY_KIND,
          mixedStorySceneId: comicBlock?.sceneId ?? null,
          mixedStoryScreenOrder: comicBlock?.screenOrder ?? null,
        },
      });

      await getGraphicNovelRepository().createPanels(
        plannedPage.panels.map((panel, index) => ({
          pageId: page.id,
          projectId: project.id,
          storyId,
          pageNumber: plannedPage.pageNumber,
          panelIndex: index + 1,
          panelId: panel.script.panelId,
          speakerLines: panel.script.dialogue,
          thoughtLines: panel.script.thoughts,
          caption: panel.script.caption ?? null,
          visualAction: panel.script.visual.primaryRead,
          charactersPresent: panelCharacterNames(panel.script),
          artPrompt: panelVisualSummary(panel.script),
          bubbleGeometry: panel.bubbles,
        }))
      );
    }

    await getStoryRepository().updateRequest(requestId, {
      errorMessage: null,
      intermediateData: {
        ...continuationData.intermediateData,
        generationKind: MIXED_STORY_KIND,
        storyId,
        projectId: project.id,
        mixedStoryComicBlockCount: comicBlockCount,
        mixedStorySceneCount: sceneCount,
        mixedStoryAnchorSceneIds: comicSceneIds,
        graphicNovelProgressStages: [...GRAPHIC_NOVEL_PROGRESS_STAGES],
        graphicNovelProgressStage: 'generating_first_page',
      },
    });

    logger.info(
      { requestId, storyId, projectId: project.id, comicBlockCount, sceneCount },
      'Mixed story script/layout saved'
    );
    if (
      continuationData.isContinuation &&
      continuationData.seriesId &&
      continuationData.partNumber
    ) {
      const createdStory = await getStoryRepository().findById(storyId);
      if (createdStory) {
        const { addContinuationToSeries } = await import('./seriesService');
        await addContinuationToSeries(continuationData.seriesId, storyId, createdStory);
        logger.info(
          {
            requestId,
            storyId,
            seriesId: continuationData.seriesId,
            partNumber: continuationData.partNumber,
          },
          'Added mixed story continuation to series'
        );
      }
    }
    return { storyId };
  } catch (error) {
    logger.error(
      {
        err: error,
        requestId,
        storyId,
      },
      'Mixed story script/layout generation failed'
    );

    if (storyId) {
      const existingStory = await getStoryRepository().findById(storyId);
      if (existingStory?.title === 'Generating...') {
        await getStoryRepository().deleteStory(storyId, request.userId);
        logger.info({ requestId, storyId }, 'Deleted mixed story stub after failure');
      }
    }

    await getStoryRepository().updateRequest(requestId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      updatedAt: new Date(),
    });

    throw error;
  }
}

async function renderAndStorePage(params: {
  requestId: string;
  storyId: string;
  userId: string;
  generationKind?: typeof GRAPHIC_NOVEL_KIND | typeof MIXED_STORY_KIND;
  page: any;
  style: string;
  ageGroup: string;
  environments: StoryEnvironment[];
  characters: GraphicNovelCharacterManifest;
  createCoverCandidate?: boolean;
}): Promise<RenderedGraphicNovelPageAssets> {
  const pageStartedAt = new Date();
  const plannedPage = params.page.layoutJson as PlannedGraphicNovelPage;
  const complexImageDomain = getComplexImageDomainService();
  const complexImageProvider = config.image.complexProvider || 'nanobananapro';
  const complexImageModel = config.image.complexModel || 'gemini-3.1-flash-image';
  const pageSize = pageSizeForGraphicNovelPage(plannedPage);
  const environmentsById = environmentMapForPage(plannedPage, params.environments);
  const environmentReferenceImages = await buildPageEnvironmentReferenceImages({
    storyId: params.storyId,
    storyRequestId: params.requestId,
    userId: params.userId,
    page: plannedPage,
    environments: params.environments,
    generationKind: params.generationKind,
  });
  const characterReferenceImages = await buildPageCharacterReferenceImages({
    page: plannedPage,
    characters: params.characters,
    imageDomain: complexImageDomain,
  });
  const referenceImages = prepareGraphicNovelPageReferences({
    storyId: params.storyId,
    pageNumber: plannedPage.pageNumber,
    environmentReferences: environmentReferenceImages,
    characterReferences: characterReferenceImages,
  });

  let rendered = config.image.skipGeneration
    ? {
        imageData: await sharp({
          create: {
            width: pageSize.width,
            height: pageSize.height,
            channels: 4,
            background: '#fffaf0',
          },
        }).png().toBuffer(),
        mimeType: 'image/png',
        generationParams: {
          mode: 'graphic_novel_page_free_layout_placeholder_only',
          skippedImageGeneration: true,
          requestedPanelCount: plannedPage.panels.length,
          layoutMode: 'free_layout',
          planningLayoutId: plannedPage.template.id,
          modelChoosesPanelLayout: true,
          textRenderingMode: 'html_overlay',
          bubbleShapeRenderingMode:
            'script_fallback_svg_translucent_cloud_outline_rounded_rect_24_short_beaded_tail',
          referenceCount: referenceImages.length,
          characterReferenceCount: referenceImages.filter(
            (ref) => ref.referenceKind === 'character'
          ).length,
          objectReferenceCount: referenceImages.filter((ref) => ref.referenceKind === 'object')
            .length,
          environmentReferenceCount: environmentReferenceImages.length,
        },
      }
    : await generateGraphicNovelPageFreeLayout({
          imageDomain: complexImageDomain,
          page: plannedPage,
          style: params.style,
          ageGroup: params.ageGroup,
          environmentsById,
          referenceImages,
          onUsage: (usage) => recordUsage(usage, { userId: params.userId, storyId: params.storyId }),
          onAttemptImage: async ({ attempt, imageData }) => {
            await saveGraphicNovelDebugImage({
              pageNumber: params.page.pageNumber,
              label: `free-layout-generate-attempt-${attempt}`,
              imageData,
            });
          },
        });
  if (!config.image.skipGeneration) {
    const imageRequestManifest = annotateGraphicNovelRequestManifest(
      rendered.generationParams.imageRequestManifest,
      {
        providerRoute: 'complex',
        provider: complexImageProvider,
        model: complexImageModel,
        providerInteractionId:
          typeof rendered.generationParams.providerInteractionId === 'string'
            ? rendered.generationParams.providerInteractionId
            : null,
      }
    );
    rendered = {
      ...rendered,
      generationParams: {
        ...rendered.generationParams,
        initialImageProviderRoute: 'complex',
        initialImageProvider: complexImageProvider,
        initialImageModel: complexImageModel,
        finalArtProviderRoute: 'complex',
        finalArtProvider: complexImageProvider,
        finalArtModel: complexImageModel,
        ...(imageRequestManifest && {
          imageRequestManifest,
          imageRequestManifests: compactGraphicNovelRequestManifests(imageRequestManifest),
        }),
      },
    };
  }
  await saveGraphicNovelDebugImage({
    pageNumber: params.page.pageNumber,
    label: 'art-only',
    imageData: Buffer.from(rendered.imageData),
  });
  const firstArtValidationResult = await validateGraphicNovelRenderedPage({
    imageDomain: complexImageDomain,
    imageData: Buffer.from(rendered.imageData),
    mimeType: rendered.mimeType,
    page: plannedPage,
    characters: params.characters,
    referenceImages,
    userId: params.userId,
    storyId: params.storyId,
    attempt: 1,
    includeLayoutChecks: true,
    includeBubbleChecks: false,
  });
  const artValidationAttempts: Array<{
    result: GraphicNovelRenderedPageValidation;
    imageData: Buffer;
    mimeType: string;
  }> = [];
  if (firstArtValidationResult) {
    artValidationAttempts.push({
      result: firstArtValidationResult,
      imageData: Buffer.from(rendered.imageData),
      mimeType: rendered.mimeType,
    });
  }
  let selectedArtValidationResult = firstArtValidationResult;
  let repairArtValidationResult: GraphicNovelRenderedPageValidation | null = null;
  let validationRepairSummary: Record<string, unknown> = {
    threshold: GRAPHIC_NOVEL_ART_REPAIR_THRESHOLD,
    enabled: config.image.enableValidation,
    editRepairEnabled: config.image.validationUseEditRepair,
    attempted: false,
    selectedAttempt: selectedArtValidationResult?.attempt ?? 1,
    selectedScore: selectedArtValidationResult?.score ?? null,
    attempts: [summarizeGraphicNovelValidationAttempt(firstArtValidationResult)].filter(Boolean),
  };

  if (
    !config.image.skipGeneration &&
    config.image.validationUseEditRepair &&
    shouldRepairGraphicNovelArtValidation(firstArtValidationResult)
  ) {
    try {
      logger.info(
        {
          storyId: params.storyId,
          pageNumber: plannedPage.pageNumber,
          score: firstArtValidationResult?.score,
          threshold: GRAPHIC_NOVEL_ART_REPAIR_THRESHOLD,
          feedback: firstArtValidationResult?.validation.overallFeedback,
          layoutFeedback: firstArtValidationResult?.validation.layoutFeedback,
        },
        'Graphic novel art validation failed threshold; editing page art with validator feedback'
      );
      const repaired = await repairGraphicNovelArtWithValidationFeedback({
        imageDomain: complexImageDomain,
        page: plannedPage,
        imageData: Buffer.from(rendered.imageData),
        mimeType: rendered.mimeType,
        validation: firstArtValidationResult!.validation,
        score: firstArtValidationResult!.score,
        style: params.style,
        ageGroup: params.ageGroup,
        environmentsById,
        referenceImages,
        userId: params.userId,
        storyId: params.storyId,
        previousInteractionId:
          typeof rendered.generationParams.providerInteractionId === 'string'
            ? rendered.generationParams.providerInteractionId
            : null,
      });
      const repairRequestManifest = annotateGraphicNovelRequestManifest(repaired.requestManifest, {
        providerRoute: 'complex',
        provider: complexImageProvider,
        model: complexImageModel,
        providerInteractionId: repaired.providerInteractionId ?? null,
      });
      await saveGraphicNovelDebugImage({
        pageNumber: params.page.pageNumber,
        label: 'art-repair-edit-attempt-2',
        imageData: repaired.imageData,
      });
      repairArtValidationResult = await validateGraphicNovelRenderedPage({
        imageDomain: complexImageDomain,
        imageData: repaired.imageData,
        mimeType: repaired.mimeType,
        page: plannedPage,
        characters: params.characters,
        referenceImages,
        userId: params.userId,
        storyId: params.storyId,
        attempt: 2,
        includeLayoutChecks: true,
        includeBubbleChecks: false,
      });
      if (repairArtValidationResult) {
        artValidationAttempts.push({
          result: repairArtValidationResult,
          imageData: Buffer.from(repaired.imageData),
          mimeType: repaired.mimeType,
        });
      }

      const selected = chooseGraphicNovelArtAttempt(
        {
          validation: firstArtValidationResult,
          imageData: Buffer.from(rendered.imageData),
          mimeType: rendered.mimeType,
          generationParams: rendered.generationParams,
        },
        {
          validation: repairArtValidationResult,
          imageData: repaired.imageData,
          mimeType: repaired.mimeType,
          generationParams: {
            ...rendered.generationParams,
            validationRepairProviderInteractionId: repaired.providerInteractionId ?? null,
            validationRepairMode: 'edit',
            validationRepairProviderRoute: 'complex',
            validationRepairProvider: complexImageProvider,
            validationRepairModel: complexImageModel,
            finalArtProviderRoute: 'complex',
            finalArtProvider: complexImageProvider,
            finalArtModel: complexImageModel,
            ...(repairRequestManifest && {
              repairRequestManifest,
              imageRequestManifests: compactGraphicNovelRequestManifests(
                rendered.generationParams.imageRequestManifest,
                repairRequestManifest
              ),
            }),
          },
        }
      );
      const selectedGenerationParams: Record<string, unknown> = {
        ...selected.generationParams,
      };
      if (repairRequestManifest) {
        selectedGenerationParams.repairRequestManifest = repairRequestManifest;
        selectedGenerationParams.imageRequestManifests = compactGraphicNovelRequestManifests(
          selectedGenerationParams.imageRequestManifest,
          repairRequestManifest
        );
      }

      rendered = {
        imageData: selected.imageData,
        mimeType: selected.mimeType,
        generationParams: selectedGenerationParams,
      };
      selectedArtValidationResult = selected.validation;
      validationRepairSummary = {
        threshold: GRAPHIC_NOVEL_ART_REPAIR_THRESHOLD,
        enabled: config.image.enableValidation,
        editRepairEnabled: config.image.validationUseEditRepair,
        attempted: true,
        mode: 'edit',
        selectedAttempt: selectedArtValidationResult?.attempt ?? 1,
        selectedScore: selectedArtValidationResult?.score ?? null,
        attempts: [
          summarizeGraphicNovelValidationAttempt(firstArtValidationResult),
          summarizeGraphicNovelValidationAttempt(repairArtValidationResult),
        ].filter(Boolean),
      };
    } catch (error) {
      logger.warn(
        {
          err: error,
          storyId: params.storyId,
          pageNumber: plannedPage.pageNumber,
        },
        'Graphic novel validation edit repair failed; keeping first art attempt'
      );
      validationRepairSummary = {
        ...validationRepairSummary,
        attempted: true,
        mode: 'edit',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const bubbleVision = await applyVisionBubblePlacementForRenderedPage({
    page: plannedPage,
    imageData: Buffer.from(rendered.imageData),
    mimeType: rendered.mimeType,
    userId: params.userId,
    storyId: params.storyId,
    usePanelCrops: false,
  });
  const artOnlyImageData = Buffer.from(rendered.imageData);
  const assetStorage = getAssetStorageService();
  const artOnlyUploadResult = await assetStorage.uploadAsset({
    data: artOnlyImageData,
    mimeType: rendered.mimeType,
    userId: params.userId,
    storyId: params.storyId,
    assetType: 'image',
  });
  const finalPlannedPage = bubbleVision.page;
  const finalImage = await overlayGraphicNovelBubblesOnly(artOnlyImageData, finalPlannedPage);
  const layoutValidation = selectedArtValidationResult?.validation ?? null;
  const layoutValidationScore = selectedArtValidationResult?.score ?? null;
  const layoutValidationAttempt = selectedArtValidationResult?.attempt ?? 1;
  const generationParams: Record<string, unknown> = {
    ...rendered.generationParams,
    bubblePlacement: bubbleVision.placementSummary,
    bubbleVisionAnalysis: bubbleVision.analysis,
    artValidationRepair: validationRepairSummary,
    artOnlyImageStoragePath: artOnlyUploadResult.storagePath,
    artOnlyImageMimeType: rendered.mimeType,
    artOnlyImageFileSizeBytes: artOnlyUploadResult.fileSizeBytes,
    finalOverlayMode: 'bubbles_only',
    finalOverlayApplied: true,
    deterministicOverlayApplied: true,
    bubbleShapeRenderingMode:
      'post_art_vision_svg_translucent_cloud_outline_rounded_rect_24_short_beaded_tail',
    ...(layoutValidation && {
      layoutValidation: summarizeGraphicNovelLayoutValidation(
        layoutValidation,
        layoutValidationScore
      ),
    }),
  };

  const uploadResult = await assetStorage.uploadAsset({
    data: finalImage,
    mimeType: 'image/png',
    userId: params.userId,
    storyId: params.storyId,
    assetType: 'image',
  });

  const asset = await getAssetRepository().create({
    storyId: params.storyId,
    sceneId: null,
    assetType: 'image',
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    signedUrl: uploadResult.signedUrl,
    signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
    mimeType: 'image/png',
    fileSizeBytes: uploadResult.fileSizeBytes,
    generationParams: {
      ...generationParams,
      kind: 'graphic_novel_page',
      pageNumber: params.page.pageNumber,
      requestId: params.requestId,
      storyFormat: params.generationKind ?? GRAPHIC_NOVEL_KIND,
    },
    generationTimeMs: Date.now() - pageStartedAt.getTime(),
    status: 'completed',
  });

  await saveThumbnail(asset.id, uploadResult.storagePath, finalImage);
  for (const attempt of artValidationAttempts) {
    if (!layoutValidation || attempt.result.attempt === layoutValidationAttempt) continue;
    const attemptStoragePath = await saveGraphicNovelValidationAttemptImage({
      storyId: params.storyId,
      userId: params.userId,
      pageNumber: params.page.pageNumber,
      attempt: attempt.result.attempt,
      imageData: attempt.imageData,
      mimeType: attempt.mimeType,
      feedback: attempt.result.validation.overallFeedback ?? '',
    });
    if (!attemptStoragePath) continue;
    await persistImageValidationResult({
      storyId: params.storyId,
      sceneIndex: params.page.pageNumber,
      attempt: attempt.result.attempt,
      imageStoragePath: attemptStoragePath,
      validationScore: attempt.result.score,
      visionModel:
        attempt.result.validation.validationModelUsed ??
        config.ai.validationModel ??
        config.ai.geminiVisionModel,
      validation: attempt.result.validation,
    });
  }
  if (layoutValidation) {
    await persistImageValidationResult({
      storyId: params.storyId,
      sceneIndex: params.page.pageNumber,
      attempt: layoutValidationAttempt,
      imageStoragePath: artOnlyUploadResult.storagePath,
      validationScore: layoutValidationScore,
      visionModel:
        layoutValidation.validationModelUsed ??
        config.ai.validationModel ??
        config.ai.geminiVisionModel,
      validation: layoutValidation,
    });
  }

  await getGraphicNovelRepository().updatePage(params.page.id, {
    imageAssetId: asset.id,
    imageUrl: uploadResult.storageUrl,
    layoutJson: finalPlannedPage,
    bubbleLayoutJson: buildGraphicNovelBubbleLayoutJson(
      finalPlannedPage,
      typeof bubbleVision.placementSummary.mode === 'string' &&
        bubbleVision.placementSummary.mode.startsWith('post_art_vision')
        ? 'post_art_vision'
        : 'script_fallback'
    ),
    status: 'completed',
    generationParams: {
      ...(params.page.generationParams as Record<string, unknown> | null),
      ...generationParams,
      ...(layoutValidation && {
        layoutValidation: summarizeGraphicNovelLayoutValidation(
          layoutValidation,
          layoutValidationScore
        ),
      }),
      assetId: asset.id,
      storagePath: uploadResult.storagePath,
      completedAt: new Date().toISOString(),
    },
  });

  const pagePanels = await getGraphicNovelRepository().findPanelsByPageId(params.page.id);
  await Promise.all(
    pagePanels.map((panelRow) => {
      const plannedPanel = finalPlannedPage.panels[panelRow.panelIndex - 1];
      if (!plannedPanel) return Promise.resolve();
      return getGraphicNovelRepository().updatePanel(panelRow.id, {
        bubbleGeometry: plannedPanel.bubbles,
      });
    })
  );

  let coverAssetId: string | undefined;
  let coverSource: RenderedGraphicNovelPageAssets['coverSource'];
  if (params.createCoverCandidate === true) {
    try {
      const coverAsset = await createGraphicNovelCoverPanelAsset({
        storyId: params.storyId,
        userId: params.userId,
        requestId: params.requestId,
        page: finalPlannedPage,
        pageAssetId: asset.id,
        imageData: artOnlyImageData,
        sourceImageKind: 'art_only_before_bubble_overlay',
        bubbleVisionAnalysis: bubbleVision.analysis,
      });
      coverAssetId = coverAsset?.assetId;
      coverSource = coverAsset?.source;
    } catch (error) {
      logger.warn(
        { err: error, storyId: params.storyId, pageNumber: params.page.pageNumber },
        'Graphic novel cover panel crop failed'
      );
    }
  }

  await recordStageTiming({
    storyId: params.storyId,
    storyRequestId: params.requestId,
    userId: params.userId,
    generationKind: params.generationKind ?? GRAPHIC_NOVEL_KIND,
    pipelinePhase: 'asset_generation',
    operation: 'comic_page_image',
    targetType: 'comic_page',
    targetKey: String(params.page.pageNumber),
    pageNumber: params.page.pageNumber,
    assetId: asset.id,
    provider:
      typeof generationParams.finalArtProvider === 'string'
        ? generationParams.finalArtProvider
        : null,
    model:
      typeof generationParams.finalArtModel === 'string' ? generationParams.finalArtModel : null,
    startedAt: pageStartedAt,
    completedAt: new Date(),
    metadata: {
      layoutMode: 'free_layout',
      planningLayoutId: plannedPage.template.id,
      pageRole: plannedPage.pageRole,
      panelCount: plannedPage.panels.length,
      referenceCount: referenceImages.length,
      environmentReferenceCount: environmentReferenceImages.length,
      characterReferenceCount: characterReferenceImages.length,
      bubblePlacementMode:
        typeof bubbleVision.placementSummary.mode === 'string'
          ? bubbleVision.placementSummary.mode
          : null,
      validationScore: layoutValidationScore,
      validationAttempt: layoutValidationAttempt,
      createCoverCandidate: params.createCoverCandidate === true,
      coverAssetId: coverAssetId ?? null,
    },
  });

  return {
    pageAssetId: asset.id,
    coverAssetId,
    coverSource,
  };
}

async function saveGraphicNovelDebugImage(params: {
  pageNumber: number;
  label: string;
  imageData: Buffer;
}): Promise<void> {
  const outputDir = process.env.GRAPHIC_NOVEL_DEBUG_OUTPUT_DIR;
  if (!outputDir) return;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, `page-${params.pageNumber}-${params.label}.png`),
    params.imageData
  );
}

async function saveGraphicNovelValidationAttemptImage(params: {
  storyId: string;
  userId: string;
  pageNumber: number;
  attempt: number;
  imageData: Buffer;
  mimeType: string;
  feedback: string;
}): Promise<string | null> {
  try {
    const ext = params.mimeType.includes('png') ? '.png' : '.jpg';
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const rejectedDir = path.join(
      uploadsDir,
      config.nodeEnv,
      params.userId,
      params.storyId,
      'rejected'
    );
    await fs.mkdir(rejectedDir, { recursive: true });

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseName = `graphic_page${params.pageNumber}_attempt${params.attempt}_${suffix}`;
    const imageFilename = `${baseName}${ext}`;
    const imagePath = path.join(rejectedDir, imageFilename);
    await fs.writeFile(imagePath, params.imageData);

    if (params.feedback.trim()) {
      await fs.writeFile(path.join(rejectedDir, `${baseName}.txt`), params.feedback, 'utf-8');
    }

    const storagePath = `${config.nodeEnv}/${params.userId}/${params.storyId}/rejected/${imageFilename}`;
    logger.debug(
      {
        storyId: params.storyId,
        pageNumber: params.pageNumber,
        attempt: params.attempt,
        storagePath,
        size: params.imageData.length,
      },
      'Graphic novel non-selected validation attempt image saved'
    );
    return storagePath;
  } catch (error) {
    logger.warn(
      {
        err: error,
        storyId: params.storyId,
        pageNumber: params.pageNumber,
        attempt: params.attempt,
      },
      'Failed to save graphic novel non-selected validation attempt image'
    );
    return null;
  }
}

export function shouldCompleteGraphicNovelRequestAfterPage(params: {
  pageNumber: number;
  firstPageReady: boolean;
}): boolean {
  return params.pageNumber === 1 && !params.firstPageReady;
}

function replanGraphicNovelPageFromSavedScript(params: {
  savedPage: PlannedGraphicNovelPage;
  ageGroup: string;
  storyFormat?: string;
  bubbleTextSizing?: GraphicNovelBubbleTextSizing;
}): PlannedGraphicNovelPage {
  const scenePanels = params.savedPage.panels.map((panel) => panel.script);
  const [page] = planGraphicNovelLayouts({
    ageGroup: params.ageGroup,
    pages: [
      {
        pageNumber: params.savedPage.pageNumber,
        pageRole: params.savedPage.pageRole,
        panels: scenePanels,
      },
    ],
    preservePanelCount: true,
    bubbleTextSizing: params.bubbleTextSizing,
  });

  if (!page) {
    throw new Error(`Failed to plan graphic novel page ${params.savedPage.pageNumber}`);
  }

  if (
    page.panels.length !== scenePanels.length ||
    page.template.panelCount !== scenePanels.length
  ) {
    throw new Error(
      `Layout/panel mismatch after planning page ${params.savedPage.pageNumber}: ` +
        `layout=${page.template.id} panels=${page.template.panelCount}, ` +
        `scenes=${scenePanels.length}, plannedPanels=${page.panels.length}`
    );
  }

  return page;
}

export async function regenerateGraphicNovelPageImage(params: {
  storyId: string;
  pageNumber: number;
  style?: string;
}): Promise<RenderedGraphicNovelPageAssets> {
  const story = await getStoryRepository().findById(params.storyId);
  if (!story) {
    throw new Error(`Story ${params.storyId} not found`);
  }

  const storyMetadata = (story.metadata as Record<string, unknown> | null) || {};
  if (
    storyMetadata.storyFormat !== GRAPHIC_NOVEL_KIND &&
    storyMetadata.storyFormat !== MIXED_STORY_KIND
  ) {
    throw new Error(`Story ${params.storyId} is not a graphic novel or mixed story`);
  }

  const project = await getGraphicNovelRepository().findProjectByStoryId(params.storyId);
  if (!project) {
    throw new Error(`Graphic novel project for story ${params.storyId} not found`);
  }

  const pageRow = await getGraphicNovelRepository().findPageByProjectAndNumber(
    project.id,
    params.pageNumber
  );
  if (!pageRow) {
    throw new Error(
      `Graphic novel page ${params.pageNumber} for story ${params.storyId} not found`
    );
  }

  const savedPage = pageRow.layoutJson as PlannedGraphicNovelPage;
  if (!savedPage || !Array.isArray(savedPage.panels) || savedPage.panels.length < 1) {
    throw new Error(`Graphic novel page ${params.pageNumber} has no saved panel script`);
  }

  const ageGroup = project.ageGroup || story.ageGroup || '6-8';
  const readingTextSettings = await resolveGraphicNovelReadingTextSettings({
    ageGroup,
    userId: story.userId,
    childProfileId: story.childProfileId ?? story.createdByChildProfileId ?? null,
  });
  const layoutManifest =
    (project.layoutManifest as { characters?: GraphicNovelCharacterManifest } | null) || {};
  const plannedPageWithoutAliases = replanGraphicNovelPageFromSavedScript({
    savedPage,
    ageGroup,
    storyFormat: storyMetadata.storyFormat as string | undefined,
    bubbleTextSizing: readingTextSettings.bubbleTextSizing,
  });
  const plannedPage: PlannedGraphicNovelPage = {
    ...plannedPageWithoutAliases,
    characterAliases:
      savedPage.characterAliases ||
      buildGraphicNovelCharacterAliasMap(layoutManifest.characters || []),
  };

  const generationParams = {
    ...(pageRow.generationParams as Record<string, unknown> | null),
    adminRegeneration: true,
    adminRegenerationSource: 'graphic_novel_page_endpoint',
    adminRegeneratedAt: new Date().toISOString(),
    previousPlanningLayoutId: savedPage.template?.id ?? null,
    selectedPlanningLayoutId: plannedPage.template.id,
    graphicNovelBubbleTextSizing: readingTextSettings.bubbleTextSizing,
  };

  await getGraphicNovelRepository().updatePage(pageRow.id, {
    status: 'generating',
    errorMessage: null,
    pageRole: plannedPage.pageRole,
    layoutJson: plannedPage,
    generationParams,
  });

  const pageForRender = {
    ...pageRow,
    status: 'generating',
    errorMessage: null,
    pageRole: plannedPage.pageRole,
    layoutJson: plannedPage,
    generationParams,
  };
  const script = project.scriptJson as GraphicNovelScript;
  const hasGraphicNovelCover = await hasReusableGraphicNovelCover(
    storyMetadata,
    story.coverAssetId
  );

  try {
    const renderedAssets = await renderAndStorePage({
      requestId: project.storyRequestId || `admin-regenerate-${params.storyId}`,
      storyId: params.storyId,
      userId: story.userId,
      generationKind:
        storyMetadata.storyFormat === MIXED_STORY_KIND ? MIXED_STORY_KIND : GRAPHIC_NOVEL_KIND,
      page: pageForRender,
      style: params.style || (storyMetadata.imageStyle as string | undefined) || 'soft_watercolor',
      ageGroup,
      environments: script.environments || [],
      characters: layoutManifest.characters || [],
      createCoverCandidate: !hasGraphicNovelCover,
    });

    if (renderedAssets.coverAssetId) {
      const latestStoryForCover = await getStoryRepository().findById(params.storyId);
      await getStoryRepository().updateStory(params.storyId, {
        coverAssetId: renderedAssets.coverAssetId,
        metadata: {
          ...((latestStoryForCover?.metadata as Record<string, unknown> | null) || {}),
          graphicNovelCoverSource: renderedAssets.coverSource ?? 'full_width_panel',
          graphicNovelCoverPageNumber: params.pageNumber,
          graphicNovelCoverPanelAssetId: renderedAssets.coverAssetId,
          graphicNovelCoverPending: false,
        },
      });
    }

    const pages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
    const failedPages = pages
      .filter((page) => page.status === 'failed' && page.pageNumber !== params.pageNumber)
      .map((page) => ({
        pageNumber: page.pageNumber,
        errorMessage: page.errorMessage || 'Page generation failed',
      }));
    const generationComplete = pages.every(
      (page) =>
        page.pageNumber === params.pageNumber ||
        page.status === 'completed' ||
        page.status === 'failed'
    );

    await getGraphicNovelRepository().updateProject(project.id, {
      status: generationComplete
        ? failedPages.length > 0
          ? 'completed_with_errors'
          : 'completed'
        : 'generating',
    });
    const latestStory = await getStoryRepository().findById(params.storyId);
    await getStoryRepository().updateStory(params.storyId, {
      metadata: {
        ...((latestStory?.metadata as Record<string, unknown> | null) || {}),
        firstPageReady: true,
        graphicNovelGenerationComplete: generationComplete,
        ...(failedPages.length > 0
          ? { failedGraphicNovelPages: failedPages }
          : { failedGraphicNovelPages: [] }),
      },
    });

    logger.info(
      {
        storyId: params.storyId,
        pageNumber: params.pageNumber,
        planningLayoutId: plannedPage.template.id,
        assetId: renderedAssets.pageAssetId,
      },
      'Admin graphic novel page regeneration completed'
    );

    return renderedAssets;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await getGraphicNovelRepository().updatePage(pageRow.id, {
      status: 'failed',
      errorMessage: message,
      generationParams: {
        ...generationParams,
        failedAt: new Date().toISOString(),
        errorMessage: message,
      },
    });
    throw error;
  }
}

export async function processGraphicNovelPages(
  requestId: string,
  options: { stopAfterFirstPage?: boolean } = {}
): Promise<void> {
  const pageBatchStartedAt = new Date();
  const request = await getStoryRepository().findRequestById(requestId);
  if (!request) {
    throw new Error(`Graphic novel request ${requestId} not found for page generation`);
  }
  const requestCreatedAt = request.createdAt
    ? new Date(request.createdAt as Date)
    : pageBatchStartedAt;
  const storyReadyStartedAt = Number.isNaN(requestCreatedAt.getTime())
    ? pageBatchStartedAt
    : requestCreatedAt;

  const project = await getGraphicNovelRepository().findProjectByRequestId(requestId);
  if (!project) {
    throw new Error(`Graphic novel project for request ${requestId} not found`);
  }

  const pages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
  const script = project.scriptJson as GraphicNovelScript;
  const layoutManifest =
    (project.layoutManifest as { characters?: GraphicNovelCharacterManifest } | null) || {};
  const story = await getStoryRepository().findById(project.storyId);
  const storyMetadata = (story?.metadata as Record<string, unknown> | null) || {};
  const generationKind =
    (request.intermediateData as Record<string, unknown> | null | undefined)?.generationKind ===
    MIXED_STORY_KIND
      ? MIXED_STORY_KIND
      : GRAPHIC_NOVEL_KIND;
  let firstPageReady = storyMetadata.firstPageReady === true || request.status === 'completed';
  let hasGraphicNovelCover = await hasReusableGraphicNovelCover(storyMetadata, story?.coverAssetId);

  if (!firstPageReady) {
    await setGraphicNovelProgressStage(requestId, 'generating_first_page', generationKind);
    await startTask(requestId, STORY_TASKS.GENERATING_IMAGES, { estimatedMs: 20_000 });
  }

  const failedPages: Array<{ pageNumber: number; errorMessage: string }> = [];

  for (const page of pages) {
    if (page.status === 'completed') {
      continue;
    }

    const pageStartedAt = new Date();
    try {
      await getGraphicNovelRepository().updatePage(page.id, { status: 'generating' });
      const renderedAssets = await renderAndStorePage({
        requestId,
        storyId: project.storyId,
        userId: request.userId,
        generationKind,
        page,
        style: (storyMetadata.imageStyle as string | undefined) || 'soft_watercolor',
        ageGroup: project.ageGroup || story?.ageGroup || '6-8',
        environments: script.environments || [],
        characters: layoutManifest.characters || [],
        createCoverCandidate: !hasGraphicNovelCover,
      });
      if (renderedAssets.coverAssetId) {
        hasGraphicNovelCover = true;
        const latestStoryForCover = await getStoryRepository().findById(project.storyId);
        await getStoryRepository().updateStory(project.storyId, {
          coverAssetId: renderedAssets.coverAssetId,
          metadata: {
            ...((latestStoryForCover?.metadata as Record<string, unknown> | null) || {}),
            graphicNovelCoverSource: renderedAssets.coverSource ?? 'full_width_panel',
            graphicNovelCoverPageNumber: page.pageNumber,
            graphicNovelCoverPanelAssetId: renderedAssets.coverAssetId,
            graphicNovelCoverPending: false,
          },
        });
      }

      if (
        shouldCompleteGraphicNovelRequestAfterPage({ pageNumber: page.pageNumber, firstPageReady })
      ) {
        firstPageReady = true;
        await updateTaskProgress(requestId, STORY_TASKS.GENERATING_IMAGES, 1, {
          current: 1,
          total: 1,
        });
        await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
        const latestStoryForFirstPage = await getStoryRepository().findById(project.storyId);
        await getStoryRepository().updateStory(project.storyId, {
          ...(!hasGraphicNovelCover && { coverAssetId: null }),
          metadata: {
            ...((latestStoryForFirstPage?.metadata as Record<string, unknown> | null) || {}),
            firstPageReady: true,
            graphicNovelGenerationComplete: false,
            graphicNovelCoverPending: !hasGraphicNovelCover,
          },
        });
        await getStoryRepository().updateRequest(requestId, {
          status: 'completed',
          storyId: project.storyId,
          updatedAt: new Date(),
        });
        const firstPageCompletedAt = new Date();
        await recordStageTiming({
          storyId: project.storyId,
          storyRequestId: requestId,
          userId: request.userId,
          generationKind,
          pipelinePhase: 'asset_generation',
          operation: 'first_page_ready',
          targetType: 'comic_page',
          targetKey: String(page.pageNumber),
          pageNumber: page.pageNumber,
          assetId: renderedAssets.pageAssetId,
          startedAt: pageBatchStartedAt,
          completedAt: firstPageCompletedAt,
          metadata: {
            pageCount: pages.length,
            stopAfterFirstPage: options.stopAfterFirstPage === true,
            coverAssetId: renderedAssets.coverAssetId ?? null,
          },
        });
        await recordStageTiming({
          storyId: project.storyId,
          storyRequestId: requestId,
          userId: request.userId,
          generationKind,
          pipelinePhase: 'postprocess',
          operation: 'story_ready',
          targetType: 'story',
          targetKey: project.storyId,
          startedAt: storyReadyStartedAt,
          completedAt: firstPageCompletedAt,
          metadata: {
            readyReason: 'first_comic_page',
            pageCount: pages.length,
            firstPageNumber: page.pageNumber,
            stopAfterFirstPage: options.stopAfterFirstPage === true,
          },
        });
        logger.info({ requestId, storyId: project.storyId }, 'Graphic novel first page ready');
        if (options.stopAfterFirstPage) {
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await getGraphicNovelRepository().updatePage(page.id, {
        status: 'failed',
        errorMessage: message,
      });
      await recordStageTiming({
        storyId: project.storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind,
        pipelinePhase: 'asset_generation',
        operation: 'comic_page_image',
        targetType: 'comic_page',
        targetKey: String(page.pageNumber),
        pageNumber: page.pageNumber,
        status: 'failed',
        startedAt: pageStartedAt,
        completedAt: new Date(),
        metadata: {
          pageCount: pages.length,
          errorMessage: message,
        },
      });
      failedPages.push({ pageNumber: page.pageNumber, errorMessage: message });

      if (page.pageNumber === 1 && !firstPageReady) {
        await recordStageTiming({
          storyId: project.storyId,
          storyRequestId: requestId,
          userId: request.userId,
          generationKind,
          pipelinePhase: 'asset_generation',
          operation: 'comic_page_batch',
          targetType: 'story',
          targetKey: project.storyId,
          status: 'failed',
          startedAt: pageBatchStartedAt,
          completedAt: new Date(),
          metadata: {
            pageCount: pages.length,
            failedPageCount: failedPages.length,
            stopAfterFirstPage: options.stopAfterFirstPage === true,
            errorMessage: message,
          },
        });
        throw error;
      }
      logger.warn(
        { err: error, requestId, pageNumber: page.pageNumber },
        'Graphic novel background page failed'
      );
    }
  }

  const finalPages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
  const generationComplete = finalPages.every(
    (page) => page.status === 'completed' || page.status === 'failed'
  );
  await getGraphicNovelRepository().updateProject(project.id, {
    status: options.stopAfterFirstPage
      ? 'generating'
      : failedPages.length > 0
        ? 'completed_with_errors'
        : 'completed',
  });
  const latestStory = await getStoryRepository().findById(project.storyId);
  await getStoryRepository().updateStory(project.storyId, {
    metadata: {
      ...((latestStory?.metadata as Record<string, unknown> | null) || {}),
      firstPageReady: true,
      graphicNovelGenerationComplete: generationComplete,
      ...(failedPages.length > 0 && { failedGraphicNovelPages: failedPages }),
    },
  });
  await recordStageTiming({
    storyId: project.storyId,
    storyRequestId: requestId,
    userId: request.userId,
    generationKind,
    pipelinePhase: 'asset_generation',
    operation: 'comic_page_batch',
    targetType: 'story',
    targetKey: project.storyId,
    startedAt: pageBatchStartedAt,
    completedAt: new Date(),
    metadata: {
      pageCount: pages.length,
      failedPageCount: failedPages.length,
      generationComplete,
      stopAfterFirstPage: options.stopAfterFirstPage === true,
    },
  });
}

export async function getGraphicNovel(storyId: string, userId: string) {
  const story = await getStoryRepository().findByIdAndUser(storyId, userId);
  if (!story) return null;

  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) return null;

  const [pages, panels] = await Promise.all([
    getGraphicNovelRepository().findPagesByProjectId(project.id),
    getGraphicNovelRepository().findPanelsByProjectId(project.id),
  ]);
  const panelsByPageId = new Map<string, any[]>();
  for (const panel of panels) {
    const list = panelsByPageId.get(panel.pageId) || [];
    list.push(panel);
    panelsByPageId.set(panel.pageId, list);
  }

  return {
    story,
    project,
    pages: pages.map((page) => ({
      ...page,
      imageUrl: page.imageUrl || null,
      textOverlay: textOverlayFromPageRow(page),
      panels: panelsByPageId.get(page.id) || [],
    })),
  };
}

export async function getGraphicNovelGenerationStatus(storyId: string, userId: string) {
  const story = await getStoryRepository().findByIdAndUser(storyId, userId);
  if (!story) return null;

  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) return null;

  const pages = await getGraphicNovelRepository().findPagesByProjectId(project.id);
  return buildGraphicNovelGenerationStatus({
    storyId,
    projectId: project.id,
    pages,
  });
}

export function buildGraphicNovelGenerationStatus(params: {
  storyId: string;
  projectId: string;
  pages: Array<{
    pageNumber: number;
    status: string;
    imageUrl?: string | null;
    imageAssetId?: string | null;
    errorMessage?: string | null;
  }>;
}) {
  const readyPages = params.pages.filter((page) => page.status === 'completed' && page.imageUrl);
  const failedPages = params.pages
    .filter((page) => page.status === 'failed')
    .map((page) => ({
      pageNumber: page.pageNumber,
      errorMessage: page.errorMessage || 'Page generation failed',
    }));

  return {
    storyId: params.storyId,
    projectId: params.projectId,
    textOverlayMode: 'html_overlay',
    firstPageReady: readyPages.some((page) => page.pageNumber === 1),
    generationComplete:
      params.pages.length > 0 &&
      params.pages.every((page) => page.status === 'completed' || page.status === 'failed'),
    readyPageNumbers: readyPages.map((page) => page.pageNumber),
    failedPages,
    pagesWithImages: readyPages.map((page) => ({
      pageNumber: page.pageNumber,
      imageUrl: page.imageUrl,
      assetId: page.imageAssetId,
      textOverlayMode: 'html_overlay',
    })),
  };
}
