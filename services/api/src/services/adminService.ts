import {
  getAdminConfigRepository,
  getAdminDashboardRepository,
  getAiUsageRepository,
  getAssetRepository,
  getEnvironmentImageCacheRepository,
  getFeedbackRepository,
  getGraphicNovelRepository,
  getImageValidationRepository,
  getOutfitPlateCacheRepository,
  getSceneRepository,
  getStoryDirectorSceneRepository,
  getStoryEnvironmentCacheRepository,
  getStoryOutfitPlateCacheRepository,
  getStoryRepository,
  getUserRepository,
  getVoiceRepository,
} from '../repositories';
import { textQueue, imageQueue, audioQueue, instantQueue, storyJobQueue } from '../jobs/storyJobProcessor';
import type { AdminConfigResource } from '../repositories/AdminConfigRepository';
import { config } from '../config';
import { classifyQueueStatus, normalizeCostControlThresholds } from './costControlService';
import { getAssetStorageService } from './assetStorageService';
import {
  getImageValidationById,
  listAllImageValidations,
  listImageValidationsForStory,
} from './imageValidationQueryService';
import { getStoryCacheStats, getStoryCost, getStoryCostBreakdown } from './aiUsageService';
import {
  isPregeneratedOutfitPlateCatalogSource,
  normalizeOutfitPlateCharacterKey,
  requestedOutfitTextMatches,
} from './outfitPlateService';
import { incrementLandingRenderVersion } from '../ssr/storyCache';
import { incrementPublicPageRenderVersion } from '../ssr/publicPageCache';
import { getUserSubscription } from './planService';
import { getUsageForPeriod } from './usageEventsService';
import { readVendorStylePromptEnFromGenerationParams } from './ttsProsodyTaggingService';
import type { Asset, AudioAsset, ImageValidationResultRow, NewAsset } from '../db/schema';
import type { ImageValidationResult } from '../ai/types';
import type { StoryAudioMetadata } from '@wondertales/shared';
import { clearStoryAudioData, type ClearStoryAudioResult } from './storyAudioCleanupService';
import { MAP_TILE_MASK_VARIANTS } from '../domain/story/mapTileMasks';
import { computeValidationScore } from './storyOrchestrationService';
import { refreshStoryCoverAssetForScene } from './storyCoverService';
import { logger } from '../utils/logger';

const PUBLIC_PRICING_CONFIG_RESOURCES = new Set<AdminConfigResource>([
  'plans',
  'features',
  'planFeatures',
  'translations',
]);

async function invalidatePublicPricingPages(resource: AdminConfigResource): Promise<void> {
  if (!PUBLIC_PRICING_CONFIG_RESOURCES.has(resource)) return;

  await Promise.all([
    incrementPublicPageRenderVersion('pricing'),
    incrementLandingRenderVersion(),
  ]);
}

function isStoredImageValidationResult(value: unknown): value is ImageValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<ImageValidationResult>;
  return (
    typeof row.characterCount === 'number' &&
    typeof row.expectedCharacterCount === 'number' &&
    Array.isArray(row.characters) &&
    typeof row.hasUnexpectedCharacters === 'boolean' &&
    typeof row.hasTextOrLetters === 'boolean' &&
    typeof row.hasRenderingArtifacts === 'boolean'
  );
}

function resolveAdminValidationScore(row: {
  validationScore: number | null;
  validationStatus?: string | null;
  result: unknown;
}): number | null {
  if (row.validationStatus === 'provider_blocked') {
    return null;
  }
  if (typeof row.validationScore === 'number' && Number.isFinite(row.validationScore)) {
    return row.validationScore;
  }
  if (isStoredImageValidationResult(row.result)) {
    try {
      return computeValidationScore(row.result);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to compute admin image validation score');
    }
  }
  return null;
}

type AdminValidationUsageEvent = {
  provider: string;
  operation: string;
  model: string | null;
  inputUnits: number | null;
  outputUnits: number | null;
  costUsd: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  matchedDeltaMs?: number;
};

type AdminValidationUsageSummary = {
  provider: string;
  operation: string;
  model: string | null;
  inputUnits: number | null;
  outputUnits: number | null;
  costUsd: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  matchedDeltaMs: number;
  eventCount: number;
  operations: string[];
};

function usageNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function usageString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function usageMetadataMatchesValidation(
  event: AdminValidationUsageEvent,
  row: ImageValidationResultRow
): boolean {
  const metadata = event.metadata;
  if (!metadata) return false;
  if (usageString(metadata.usageTarget) !== 'image_validation') return false;

  const subjectType = usageString(metadata.subjectType);
  if (subjectType && subjectType !== row.subjectType) return false;

  const attempt = usageNumber(metadata.attempt);
  if (attempt != null && attempt !== row.attempt) return false;

  const sceneIndex = usageNumber(metadata.sceneIndex);
  if (sceneIndex != null && sceneIndex !== row.sceneIndex) return false;

  const pageNumber = usageNumber(metadata.pageNumber);
  if (row.pageNumber != null && pageNumber != null && pageNumber !== row.pageNumber) return false;

  const panelIndex = usageNumber(metadata.panelIndex);
  if (row.panelIndex != null && panelIndex != null && panelIndex !== row.panelIndex) return false;

  const panelId = usageString(metadata.panelId);
  if (row.panelId && panelId && panelId !== row.panelId) return false;

  if (row.subjectType === 'graphic_novel_panel') {
    return pageNumber === row.pageNumber && panelIndex === row.panelIndex;
  }

  return sceneIndex === row.sceneIndex && attempt === row.attempt;
}

function isImageValidationUsageEvent(event: AdminValidationUsageEvent): boolean {
  return event.operation.startsWith('image_validation');
}

function selectValidationUsageEvents(
  row: ImageValidationResultRow,
  events: AdminValidationUsageEvent[]
): AdminValidationUsageEvent[] {
  const validationEvents = events.filter((event) => {
    if (!isImageValidationUsageEvent(event)) return false;
    if (row.visionModel && event.model && event.model !== row.visionModel) return false;
    const deltaMs = Math.abs(event.createdAt.getTime() - row.createdAt.getTime());
    return deltaMs <= 5 * 60 * 1000;
  });
  const metadataMatches = validationEvents.filter((event) =>
    usageMetadataMatchesValidation(event, row)
  );
  if (metadataMatches.length > 0) return metadataMatches;

  const previousEvents = validationEvents.filter(
    (event) => event.createdAt.getTime() <= row.createdAt.getTime()
  );
  const fallbackPool = previousEvents.length > 0 ? previousEvents : validationEvents;
  if (fallbackPool.length === 0) return [];

  return [
    fallbackPool.reduce((best, event) => {
      const bestDelta = Math.abs(best.createdAt.getTime() - row.createdAt.getTime());
      const eventDelta = Math.abs(event.createdAt.getTime() - row.createdAt.getTime());
      return eventDelta < bestDelta ? event : best;
    }),
  ];
}

function singleOrMultiple(values: Array<string | null>, multipleLabel: string): string | null {
  const unique = [...new Set(values.filter((value): value is string => !!value))];
  if (unique.length === 0) return null;
  return unique.length === 1 ? unique[0] : multipleLabel;
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number');
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

function serializeAdminValidationUsage(
  row: ImageValidationResultRow,
  events: AdminValidationUsageEvent[]
): AdminValidationUsageSummary | null {
  const selected = selectValidationUsageEvents(row, events);
  if (selected.length === 0) return null;

  const operations = [...new Set(selected.map((event) => event.operation))];
  const firstCreatedAt = selected.reduce((earliest, event) =>
    event.createdAt.getTime() < earliest.createdAt.getTime() ? event : earliest
  ).createdAt;
  const minDeltaMs = Math.min(
    ...selected.map((event) =>
      event.matchedDeltaMs != null
        ? event.matchedDeltaMs
        : Math.abs(event.createdAt.getTime() - row.createdAt.getTime())
    )
  );
  const costUsd = sumNullable(selected.map((event) => event.costUsd));

  return {
    provider: singleOrMultiple(selected.map((event) => event.provider), 'multiple') ?? 'n/a',
    operation:
      selected.length === 1 ? selected[0].operation : `${selected.length} image_validation passes`,
    model: singleOrMultiple(selected.map((event) => event.model), 'multiple'),
    inputUnits: sumNullable(selected.map((event) => event.inputUnits)),
    outputUnits: sumNullable(selected.map((event) => event.outputUnits)),
    costUsd: costUsd != null ? Math.round(costUsd * 1e8) / 1e8 : null,
    durationMs: sumNullable(selected.map((event) => event.durationMs)),
    metadata: {
      matchMode: selected.some((event) => usageMetadataMatchesValidation(event, row))
        ? 'metadata'
        : 'nearest',
      events: selected.map((event) => ({
        provider: event.provider,
        operation: event.operation,
        model: event.model,
        inputUnits: event.inputUnits,
        outputUnits: event.outputUnits,
        costUsd: event.costUsd,
        durationMs: event.durationMs,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
    },
    createdAt: firstCreatedAt.toISOString(),
    matchedDeltaMs: Math.round(minDeltaMs),
    eventCount: selected.length,
    operations,
  };
}

function isRejectedValidationStoragePath(storagePath: string): boolean {
  return storagePath.split('/').includes('rejected');
}

function validationDeduplicationKey(row: ImageValidationResultRow): string {
  return [
    row.storyId,
    row.sceneIndex,
    row.attempt,
    row.validationStatus ?? '',
    row.visionModel ?? '',
    resolveAdminValidationScore(row) ?? 'null',
  ].join('|');
}

function hideRejectedBestOfFailedValidationDuplicates(
  rows: ImageValidationResultRow[]
): ImageValidationResultRow[] {
  const acceptedKeys = new Set(
    rows
      .filter((row) => !isRejectedValidationStoragePath(row.imageStoragePath))
      .map(validationDeduplicationKey)
  );

  return rows.filter((row) => {
    if (!isRejectedValidationStoragePath(row.imageStoragePath)) return true;
    return !acceptedKeys.has(validationDeduplicationKey(row));
  });
}

export class AdminValidationApplyError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'AdminValidationApplyError';
  }
}

type AdminImageTargetKind = 'scene' | 'graphic_novel_page' | 'none';

type AdminSceneValidationCandidateScore = {
  row: ImageValidationResultRow;
  score: number;
};

type AdminSceneValidationCandidateSummary = {
  id: string;
  attempt: number;
  imageStoragePath: string;
  score: number;
  validationStatus: string;
  missingCharacters: string[];
  selected: boolean;
  createdAt: string;
};

type AdminStorySceneSource = {
  sceneId?: unknown;
  text?: unknown;
  mixedStoryBlockKind?: unknown;
  mixedStoryScreenOrder?: unknown;
  graphicNovelPageNumber?: unknown;
};

type AdminGraphicNovelPageTarget = {
  sceneIndex: number;
  imageTargetKind: 'graphic_novel_page';
  graphicNovelPageNumber: number;
  mixedStoryScreenOrder: number | null;
};

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function adminImageValidationImageUrl(validationId: string): string {
  return `/api/v1/admin/image-validations/${validationId}/image`;
}

function publicAssetUrl(storagePath: string): string {
  return `/api/v1/assets/${storagePath}`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeAssetPath(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;
  return raw.replace(/^\/api\/v1\/assets\//, '');
}

function inferImageMimeType(storagePath: string): string {
  const normalized = storagePath.toLowerCase().split('?')[0];
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function missingCharacterNames(row: ImageValidationResultRow): string[] {
  if (!isStoredImageValidationResult(row.result)) return [];
  return row.result.characters
    .filter((character) => character.found === false)
    .map((character) => character.name)
    .filter((name) => typeof name === 'string' && name.trim().length > 0);
}

function compareAdminSceneValidationCandidates(
  left: AdminSceneValidationCandidateScore,
  right: AdminSceneValidationCandidateScore,
  currentImageStoragePath: string | null
): AdminSceneValidationCandidateScore {
  if (left.score !== right.score) return left.score > right.score ? left : right;

  const leftStoragePath = normalizeAssetPath(left.row.imageStoragePath) ?? left.row.imageStoragePath;
  const rightStoragePath =
    normalizeAssetPath(right.row.imageStoragePath) ?? right.row.imageStoragePath;
  const leftIsCurrent = leftStoragePath === currentImageStoragePath;
  const rightIsCurrent = rightStoragePath === currentImageStoragePath;
  if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? left : right;

  const leftRejected = isRejectedValidationStoragePath(left.row.imageStoragePath);
  const rightRejected = isRejectedValidationStoragePath(right.row.imageStoragePath);
  if (leftRejected !== rightRejected) return leftRejected ? right : left;

  return left.row.createdAt.getTime() >= right.row.createdAt.getTime() ? left : right;
}

async function ensureAssetForAdminSceneValidationCandidate(params: {
  row: ImageValidationResultRow;
  sceneDbId: string;
  score: number;
}): Promise<Asset> {
  const storagePath = normalizeAssetPath(params.row.imageStoragePath) ?? params.row.imageStoragePath;
  const assetRepo = getAssetRepository();
  const existing = await assetRepo.findByStoragePath(storagePath);

  if (existing) {
    if (existing.storyId !== params.row.storyId || existing.assetType !== 'image') {
      throw new AdminValidationApplyError('Validation image is linked to an incompatible asset', 409);
    }
    if (existing.sceneId && existing.sceneId !== params.sceneDbId) {
      throw new AdminValidationApplyError('Validation image asset belongs to another scene', 409);
    }

    const patch: Partial<NewAsset> = {};
    if (!existing.sceneId) patch.sceneId = params.sceneDbId;
    if (!existing.storageUrl) patch.storageUrl = publicAssetUrl(storagePath);
    if (existing.status !== 'completed') patch.status = 'completed';
    if (Object.keys(patch).length > 0) {
      await assetRepo.update(existing.id, patch);
      return { ...existing, ...patch };
    }
    return existing;
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = await getAssetStorageService().getAssetByPath(storagePath);
  } catch (error) {
    throw new AdminValidationApplyError('Validation image file not found in storage', 404);
  }

  return assetRepo.create({
    storyId: params.row.storyId,
    sceneId: params.sceneDbId,
    assetType: 'image',
    storagePath,
    storageUrl: publicAssetUrl(storagePath),
    signedUrl: null,
    signedUrlExpiresAt: null,
    mimeType: inferImageMimeType(storagePath),
    fileSizeBytes: imageBuffer.length,
    generationParams: {
      kind: 'admin_applied_validation_candidate',
      source: 'image_validation_results',
      validationId: params.row.id,
      validationAttempt: params.row.attempt,
      validationScore: params.score,
      validationStatus: params.row.validationStatus,
      createdFromRejectedCandidate: isRejectedValidationStoragePath(storagePath),
    },
    status: 'completed',
  });
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeAdminManifest(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAdminManifest);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'base64Data' || key === 'imageData' || key === 'b64_json') {
      sanitized[key] = '[omitted binary payload]';
      continue;
    }
    sanitized[key] = sanitizeAdminManifest(child);
  }
  return sanitized;
}

function buildAdminImageRequestManifest(
  generationParams: unknown,
  imageStoragePath: string | null,
  layoutJson?: unknown
): Record<string, unknown> | null {
  const params = objectOrNull(generationParams);
  if (!params) return null;

  const manifestKey = (manifest: Record<string, unknown>) =>
    [
      manifest.operation,
      manifest.operationType,
      manifest.mode,
      manifest.providerRequestId,
      manifest.providerInteractionId,
      manifest.previousInteractionId,
    ]
      .map((value) => (value == null ? '' : String(value)))
      .join('|');
  const requestManifests = Array.isArray(params.imageRequestManifests)
    ? params.imageRequestManifests.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item)
      )
    : objectOrNull(params.imageRequestManifest)
      ? [objectOrNull(params.imageRequestManifest)!]
      : [];
  const repairRequestManifest = objectOrNull(params.repairRequestManifest);
  const isEditRequestManifest = (manifest: Record<string, unknown>): boolean => {
    const operation = String(manifest.operation ?? '').toLowerCase();
    const operationType = String(manifest.operationType ?? '').toLowerCase();
    return operationType === 'edit' || operation.includes('edit') || operation.includes('repair');
  };
  if (
    repairRequestManifest &&
    !requestManifests.some((item) => manifestKey(item) === manifestKey(repairRequestManifest))
  ) {
    requestManifests.push(repairRequestManifest);
  }
  const editRequestManifests = requestManifests.filter(isEditRequestManifest);
  const initialRequestManifests = requestManifests.filter((item) => !isEditRequestManifest(item));

  const references = Array.isArray(params.referenceImages) ? params.referenceImages : [];
  const hasBubbleVisionAnalysis = !!objectOrNull(params.bubbleVisionAnalysis);
  const hasLayoutJson = !!objectOrNull(layoutJson);
  if (
    requestManifests.length === 0 &&
    references.length === 0 &&
    !hasBubbleVisionAnalysis &&
    !hasLayoutJson
  ) {
    return null;
  }

  const artRepair = objectOrNull(params.artValidationRepair);
  return {
    version: 1,
    mode: params.mode ?? null,
    imageRoute: params.imageRoute ?? null,
    imageStoragePath,
    provider:
      params.finalArtProvider ??
      params.initialImageProvider ??
      params.validationRepairProvider ??
      null,
    model:
      params.finalArtModel ??
      params.initialImageModel ??
      params.validationRepairModel ??
      null,
    providerInteractionId: params.providerInteractionId ?? null,
    validationRepairProviderInteractionId: params.validationRepairProviderInteractionId ?? null,
    selectedAttempt: artRepair?.selectedAttempt ?? null,
    selectedScore: artRepair?.selectedScore ?? null,
    renderingMode: params.renderingMode ?? null,
    layoutMode: params.layoutMode ?? null,
    requestedPanelCount: params.requestedPanelCount ?? null,
    planningLayoutId: params.planningLayoutId ?? null,
    templateFamily: params.templateFamily ?? null,
    panelImageSize: params.panelImageSize ?? null,
    panelImageGeneration: sanitizeAdminManifest(params.panelImageGeneration ?? null),
    bubblePlacement: sanitizeAdminManifest(params.bubblePlacement ?? null),
    bubbleVisionAnalysis: sanitizeAdminManifest(params.bubbleVisionAnalysis ?? null),
    artOnlyImageStoragePath: params.artOnlyImageStoragePath ?? null,
    layoutJson: sanitizeAdminManifest(layoutJson ?? null),
    referenceCount: params.referenceCount ?? references.length,
    characterReferenceCount: params.characterReferenceCount ?? null,
    objectReferenceCount: params.objectReferenceCount ?? null,
    initialRequests: sanitizeAdminManifest(initialRequestManifests),
    editRequests: sanitizeAdminManifest(editRequestManifests),
    requests: sanitizeAdminManifest(requestManifests),
    references: sanitizeAdminManifest(references),
  };
}

function adminSceneImageTargetKind(
  storyFormat: string | null,
  scene: AdminStorySceneSource
): AdminImageTargetKind {
  if (storyFormat === 'mixed_story') {
    return scene.mixedStoryBlockKind === 'comic' && numberOrNull(scene.graphicNovelPageNumber)
      ? 'graphic_novel_page'
      : 'none';
  }
  if (storyFormat === 'graphic_novel') return 'graphic_novel_page';
  return 'scene';
}

function buildGraphicNovelPageTargets(params: {
  storyFormat: string | null;
  storyScenes: AdminStorySceneSource[];
  pages: Array<{
    pageNumber: number;
    imageUrl: string | null;
    layoutJson: unknown;
    generationParams: unknown;
  }>;
}): {
  byPageNumber: Map<number, AdminGraphicNovelPageTarget>;
  bySceneIndex: Map<number, AdminGraphicNovelPageTarget>;
  byStoragePath: Map<string, AdminGraphicNovelPageTarget>;
} {
  const byPageNumber = new Map<number, AdminGraphicNovelPageTarget>();
  const bySceneIndex = new Map<number, AdminGraphicNovelPageTarget>();
  const byStoragePath = new Map<string, AdminGraphicNovelPageTarget>();
  const mixedSceneByPageNumber = new Map<number, number>();

  for (const scene of params.storyScenes) {
    const pageNumber = numberOrNull(scene.graphicNovelPageNumber);
    const screenOrder = numberOrNull(scene.mixedStoryScreenOrder) ?? numberOrNull(scene.sceneId);
    if (pageNumber != null && screenOrder != null) {
      mixedSceneByPageNumber.set(pageNumber, screenOrder);
    }
  }

  for (const page of params.pages) {
    const layout = (page.layoutJson ?? {}) as Record<string, unknown>;
    const generationParams = (page.generationParams ?? {}) as Record<string, unknown>;
    const screenOrder =
      numberOrNull(layout.mixedStoryScreenOrder) ??
      numberOrNull(generationParams.mixedStoryScreenOrder) ??
      mixedSceneByPageNumber.get(page.pageNumber) ??
      (params.storyFormat === 'mixed_story' ? null : page.pageNumber);
    const target: AdminGraphicNovelPageTarget = {
      sceneIndex: screenOrder ?? page.pageNumber,
      imageTargetKind: 'graphic_novel_page',
      graphicNovelPageNumber: page.pageNumber,
      mixedStoryScreenOrder: screenOrder,
    };

    byPageNumber.set(page.pageNumber, target);
    if (screenOrder != null) bySceneIndex.set(screenOrder, target);

    const storagePath =
      normalizeAssetPath(generationParams.storagePath) ?? normalizeAssetPath(page.imageUrl);
    if (storagePath) byStoragePath.set(storagePath, target);
  }

  return { byPageNumber, bySceneIndex, byStoragePath };
}

function resolveAdminValidationTarget(params: {
  storyFormat: string | null;
  sceneIndex: number;
  imageStoragePath: string;
  pageTargets: ReturnType<typeof buildGraphicNovelPageTargets>;
}): {
  sceneIndex: number;
  sourceSceneIndex: number;
  imageTargetKind: AdminImageTargetKind;
  graphicNovelPageNumber: number | null;
  mixedStoryScreenOrder: number | null;
} {
  const sourceSceneIndex = params.sceneIndex;
  const pageTarget =
    params.pageTargets.byStoragePath.get(params.imageStoragePath) ??
    params.pageTargets.byPageNumber.get(sourceSceneIndex) ??
    params.pageTargets.bySceneIndex.get(sourceSceneIndex);

  if (pageTarget && (params.storyFormat === 'mixed_story' || params.storyFormat === 'graphic_novel')) {
    return {
      sceneIndex: pageTarget.sceneIndex,
      sourceSceneIndex,
      imageTargetKind: pageTarget.imageTargetKind,
      graphicNovelPageNumber: pageTarget.graphicNovelPageNumber,
      mixedStoryScreenOrder: pageTarget.mixedStoryScreenOrder,
    };
  }

  return {
    sceneIndex: sourceSceneIndex,
    sourceSceneIndex,
    imageTargetKind: params.storyFormat === 'graphic_novel' ? 'graphic_novel_page' : 'scene',
    graphicNovelPageNumber: params.storyFormat === 'graphic_novel' ? sourceSceneIndex : null,
    mixedStoryScreenOrder: null,
  };
}

async function loadAdminGraphicNovelPages(storyId: string, storyFormat: string | null) {
  if (storyFormat !== 'graphic_novel' && storyFormat !== 'mixed_story') return [];
  const project = await getGraphicNovelRepository().findProjectByStoryId(storyId);
  if (!project) return [];
  return getGraphicNovelRepository().findPagesByProjectId(project.id);
}

export async function getAdminDashboard(days: number) {
  const dashboard = await getAdminDashboardRepository().getDashboard(days);
  const thresholds = normalizeCostControlThresholds(config.costControls);
  const [textStats, imageStats, audioStats, instantStats, legacyStats] = await Promise.all([
    textQueue.getStats(),
    imageQueue.getStats(),
    audioQueue.getStats(),
    instantQueue.getStats(),
    storyJobQueue.getStats(),
  ]);
  const queueStats = [
    textStats,
    imageStats,
    audioStats,
    instantStats,
    {
      name: 'legacy',
      maxConcurrency: 1,
      ...legacyStats,
    },
  ];
  const totalQueued = queueStats.reduce((sum, item) => sum + item.queued, 0);
  const totalProcessing = queueStats.reduce((sum, item) => sum + item.processing, 0);
  const totalFailed = queueStats.reduce((sum, item) => sum + item.failed, 0);

  return {
    ...dashboard,
    queueHealth: {
      status: classifyQueueStatus(totalQueued, thresholds.queueDepthWarn),
      thresholdQueued: thresholds.queueDepthWarn,
      totalQueued,
      totalProcessing,
      totalFailed,
      queues: queueStats.map((item) => ({
        name: item.name,
        total: item.total,
        queued: item.queued,
        processing: item.processing,
        completed: item.completed,
        failed: item.failed,
        maxConcurrency: item.maxConcurrency,
      })),
    },
  };
}

export async function listAdminStories(params: {
  limit: number;
  offset: number;
  search?: string;
  publishedStatus?: 'all' | 'published' | 'unlisted' | 'draft';
}) {
  const { limit, offset, search, publishedStatus = 'all' } = params;
  const repo = getStoryRepository();
  const [items, total] = await Promise.all([
    repo.listAllPaginated({ limit, offset, search, publishedStatus }),
    repo.countAll(search, publishedStatus),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      userId: item.userId,
      createdAt: item.createdAt.toISOString(),
      isPublished: item.isPublished,
      visibility: item.visibility,
      showOnHomePage: item.showOnHomePage,
      publishedSlug: item.publishedSlug,
    })),
    meta: { limit, offset, total },
  };
}

export async function updateAdminStoryHomePageFlag(storyId: string, showOnHomePage: boolean) {
  const repo = getStoryRepository();
  const story = await repo.findById(storyId);
  if (!story) return null;

  const isEligibleForHomePage =
    story.isPublished === true &&
    story.visibility === 'public' &&
    typeof story.publishedSlug === 'string' &&
    story.publishedSlug.trim().length > 0;
  const shouldShow = showOnHomePage && isEligibleForHomePage;
  const hasChanged = story.showOnHomePage !== shouldShow;

  await repo.updateHomePageVisibility(storyId, shouldShow);
  if (hasChanged) {
    await incrementLandingRenderVersion();
  }

  return {
    id: storyId,
    showOnHomePage: shouldShow,
    isPublished: story.isPublished,
    visibility: story.visibility,
    publishedSlug: story.publishedSlug,
  };
}

export async function listAdminUsers(params: { limit: number; offset: number; search?: string }) {
  const { limit, offset, search } = params;
  const repo = getUserRepository();
  const [items, total] = await Promise.all([
    repo.listAllPaginated({ limit, offset, search }),
    repo.countAll(search),
  ]);

  return {
    items: await Promise.all(
      items.map(async (item) => {
        const subscription = await getUserSubscription(item.id);
        const currentPeriodStart = subscription?.currentPeriodStart ?? null;
        const currentPeriodEnd = subscription?.currentPeriodEnd ?? subscription?.resetAt ?? null;

        let storiesUsedCurrentPeriod = 0;
        let graphicNovelsUsedCurrentPeriod = 0;
        let audioStoriesUsedCurrentPeriod = 0;

        if (currentPeriodStart && currentPeriodEnd) {
          [storiesUsedCurrentPeriod, graphicNovelsUsedCurrentPeriod, audioStoriesUsedCurrentPeriod] = await Promise.all([
            getUsageForPeriod(item.id, currentPeriodStart, currentPeriodEnd, 'story_created'),
            getUsageForPeriod(item.id, currentPeriodStart, currentPeriodEnd, 'graphic_novel_created'),
            getUsageForPeriod(item.id, currentPeriodStart, currentPeriodEnd, 'audio_synthesized'),
          ]);
        }

        return {
          id: item.id,
          email: item.email,
          role: item.role,
          status: item.status,
          suspendedAt: item.suspendedAt?.toISOString() ?? null,
          suspendedReason: item.suspendedReason,
          planSlug: item.planSlug,
          planName: item.planName,
          createdAt: item.createdAt.toISOString(),
          currentPeriodStart: currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
          storiesUsedCurrentPeriod,
          graphicNovelsUsedCurrentPeriod,
          audioStoriesUsedCurrentPeriod,
        };
      })
    ),
    meta: { limit, offset, total },
  };
}

export async function listAdminVoices(params: {
  limit: number;
  offset: number;
  search?: string;
  provider?: string;
}) {
  const { limit, offset, search, provider } = params;
  const repo = getVoiceRepository();
  const [items, total] = await Promise.all([
    repo.listForAdmin({ limit, offset, search, provider }),
    repo.countForAdmin({ search, provider }),
  ]);

  return {
    items: items.map((v) => ({
      id: v.id,
      provider: v.provider,
      providerVoiceId: v.providerVoiceId,
      name: v.name,
      displayName: v.displayName,
      language: v.language,
      isActive: v.isActive,
      isPremium: v.isPremium,
      updatedAt: v.updatedAt.toISOString(),
    })),
    meta: { limit, offset, total },
  };
}

export async function updateAdminVoiceActive(voiceId: string, isActive: boolean) {
  const row = await getVoiceRepository().updateIsActive(voiceId, isActive);
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    providerVoiceId: row.providerVoiceId,
    name: row.name,
    displayName: row.displayName,
    language: row.language,
    isActive: row.isActive,
    isPremium: row.isPremium,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAdminFeedback(params: {
  limit: number;
  offset: number;
  search?: string;
  category?: string;
  supportTopic?: string;
  hasScreenshot?: boolean;
}) {
  const { limit, offset, search, category, supportTopic, hasScreenshot } = params;
  const repo = getFeedbackRepository();
  const [items, total] = await Promise.all([
    repo.listAllPaginated({ limit, offset, search, category, supportTopic, hasScreenshot }),
    repo.countAll({ search, category, supportTopic, hasScreenshot }),
  ]);
  const assetStorage = getAssetStorageService();

  return {
    items: await Promise.all(
      items.map(async (item) => {
        const context =
          item.context && typeof item.context === 'object' && !Array.isArray(item.context)
            ? (item.context as Record<string, unknown>)
            : {};
        const screenshotUrl =
          item.screenshotUrl && !item.screenshotUrl.startsWith('http')
            ? (await assetStorage.generateSignedUrl(item.screenshotUrl, 24)).signedUrl
            : item.screenshotUrl;
        return {
          id: item.id,
          userId: item.userId,
          userEmail: item.userEmail,
          category: item.category,
          message: item.message,
          email: item.email,
          screenshotUrl,
          context: {
            platform: typeof context.platform === 'string' ? context.platform : null,
            userAgent: typeof context.userAgent === 'string' ? context.userAgent : null,
            url: typeof context.url === 'string' ? context.url : null,
            reportedScreen:
              typeof context.reportedScreen === 'string' ? context.reportedScreen : null,
            supportTopic:
              typeof context.supportTopic === 'string' ? context.supportTopic : null,
            storyId: typeof context.storyId === 'string' ? context.storyId : null,
            storySlug: typeof context.storySlug === 'string' ? context.storySlug : null,
            shareToken: typeof context.shareToken === 'string' ? context.shareToken : null,
            sceneId: typeof context.sceneId === 'number' ? context.sceneId : null,
            contentType: typeof context.contentType === 'string' ? context.contentType : null,
            contentReviewStatus:
              typeof context.contentReviewStatus === 'string' ? context.contentReviewStatus : null,
            contentReviewQueued:
              typeof context.contentReviewQueued === 'boolean' ? context.contentReviewQueued : null,
            contentQuarantined:
              typeof context.contentQuarantined === 'boolean' ? context.contentQuarantined : null,
            quarantinedStoryId:
              typeof context.quarantinedStoryId === 'string' ? context.quarantinedStoryId : null,
          },
          createdAt: item.createdAt.toISOString(),
        };
      })
    ),
    meta: { limit, offset, total },
  };
}

export async function listAdminImageValidations(params: { limit: number; offset: number }) {
  const { limit, offset } = params;
  const { items, total } = await listAllImageValidations(limit, offset);

  return {
    items: items.map((row) => ({
      id: row.id,
      storyId: row.storyId,
      sceneIndex: row.sceneIndex,
      subjectType: row.subjectType,
      pageNumber: row.pageNumber,
      panelIndex: row.panelIndex,
      panelId: row.panelId,
      cropRect: row.cropRect,
      attempt: row.attempt,
      imageStoragePath: row.imageStoragePath,
      imageUrl: adminImageValidationImageUrl(row.id),
      validationScore: resolveAdminValidationScore(row),
      validationStatus: row.validationStatus,
      visionModel: row.visionModel,
      requestManifest: row.requestManifest,
      providerError: row.providerError,
      result: row.result,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: { limit, offset, total },
  };
}

export async function getAdminImageValidation(id: string) {
  const row = await getImageValidationById(id);
  if (!row) return null;

  const [usageCandidates, story] = await Promise.all([
    getAiUsageRepository().listImageValidationUsageCandidates({
      storyId: row.storyId,
      model: row.visionModel,
      createdAt: row.createdAt,
    }),
    getStoryRepository().findById(row.storyId),
  ]);
  const storyMetadata = (story?.metadata ?? {}) as { storyFormat?: unknown };
  const storyFormat =
    typeof storyMetadata.storyFormat === 'string' ? storyMetadata.storyFormat : null;
  const storyScenes = Array.isArray(story?.scenes)
    ? (story!.scenes as AdminStorySceneSource[])
    : [];
  const graphicNovelPages = story
    ? await loadAdminGraphicNovelPages(story.id, storyFormat)
    : [];
  const pageTargets = buildGraphicNovelPageTargets({
    storyFormat,
    storyScenes,
    pages: graphicNovelPages,
  });
  const target = resolveAdminValidationTarget({
    storyFormat,
    sceneIndex: row.sceneIndex,
    imageStoragePath: row.imageStoragePath,
    pageTargets,
  });

  return {
    id: row.id,
    storyId: row.storyId,
    storyFormat,
    sceneIndex: target.sceneIndex,
    sourceSceneIndex: target.sourceSceneIndex,
    imageTargetKind: target.imageTargetKind,
    graphicNovelPageNumber: target.graphicNovelPageNumber,
    mixedStoryScreenOrder: target.mixedStoryScreenOrder,
    subjectType: row.subjectType,
    pageNumber: row.pageNumber,
    panelIndex: row.panelIndex,
    panelId: row.panelId,
    cropRect: row.cropRect,
    attempt: row.attempt,
    imageStoragePath: row.imageStoragePath,
    imageUrl: adminImageValidationImageUrl(row.id),
    validationScore: resolveAdminValidationScore(row),
    validationStatus: row.validationStatus,
    visionModel: row.visionModel,
    requestManifest: row.requestManifest,
    providerError: row.providerError,
    result: row.result,
    usage: serializeAdminValidationUsage(row, usageCandidates),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function applyBestAdminSceneImageValidationCandidate(id: string) {
  const anchor = await getImageValidationById(id);
  if (!anchor) {
    throw new AdminValidationApplyError('Validation not found', 404);
  }

  const story = await getStoryRepository().findById(anchor.storyId);
  if (!story) {
    throw new AdminValidationApplyError('Story not found', 404);
  }

  const metadata = (story.metadata ?? {}) as { storyFormat?: unknown };
  const storyFormat = typeof metadata.storyFormat === 'string' ? metadata.storyFormat : null;
  if (storyFormat === 'graphic_novel' || storyFormat === 'mixed_story') {
    throw new AdminValidationApplyError(
      'Best score apply is only available for regular story scene validations',
      400
    );
  }

  const scene = await getSceneRepository().findByStoryAndSceneId(anchor.storyId, anchor.sceneIndex);
  if (!scene) {
    throw new AdminValidationApplyError('Scene not found for validation', 404);
  }

  const currentImageStoragePath = normalizeAssetPath(scene.imageUrl) ?? scene.imageUrl ?? null;
  const rows = await getImageValidationRepository().listAllByStoryId(anchor.storyId);
  const scoredCandidates = rows
    .filter((row) => row.sceneIndex === anchor.sceneIndex)
    .filter((row) => row.validationStatus !== 'provider_blocked')
    .map((row): AdminSceneValidationCandidateScore | null => {
      const score = resolveAdminValidationScore(row);
      return score == null ? null : { row, score };
    })
    .filter((candidate): candidate is AdminSceneValidationCandidateScore => candidate != null);

  if (scoredCandidates.length === 0) {
    throw new AdminValidationApplyError('No scored validation candidates found for scene', 404);
  }

  const best = scoredCandidates.reduce((selected, candidate) =>
    compareAdminSceneValidationCandidates(selected, candidate, currentImageStoragePath)
  );
  const bestStoragePath =
    normalizeAssetPath(best.row.imageStoragePath) ?? best.row.imageStoragePath;
  const selectedAsset = await ensureAssetForAdminSceneValidationCandidate({
    row: best.row,
    sceneDbId: scene.id,
    score: best.score,
  });
  const changed = currentImageStoragePath !== bestStoragePath;

  if (changed) {
    await getSceneRepository().update(scene.id, {
      imageUrl: bestStoragePath,
    });
  }

  await refreshStoryCoverAssetForScene(anchor.storyId, scene.id, selectedAsset.id);

  const candidates: AdminSceneValidationCandidateSummary[] = scoredCandidates
    .map((candidate) => ({
      id: candidate.row.id,
      attempt: candidate.row.attempt,
      imageStoragePath:
        normalizeAssetPath(candidate.row.imageStoragePath) ?? candidate.row.imageStoragePath,
      score: candidate.score,
      validationStatus: candidate.row.validationStatus,
      missingCharacters: missingCharacterNames(candidate.row),
      selected: candidate.row.id === best.row.id,
      createdAt: candidate.row.createdAt.toISOString(),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.attempt !== right.attempt) return left.attempt - right.attempt;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

  logger.info(
    {
      storyId: anchor.storyId,
      sceneIndex: anchor.sceneIndex,
      validationId: id,
      selectedValidationId: best.row.id,
      selectedScore: best.score,
      previousImageStoragePath: currentImageStoragePath,
      selectedImageStoragePath: bestStoragePath,
      changed,
    },
    'Admin applied best scene validation candidate'
  );

  return {
    storyId: anchor.storyId,
    sceneIndex: anchor.sceneIndex,
    previousImageStoragePath: currentImageStoragePath,
    selectedValidationId: best.row.id,
    selectedAttempt: best.row.attempt,
    selectedScore: best.score,
    selectedImageStoragePath: bestStoragePath,
    selectedAssetId: selectedAsset.id,
    compared: candidates,
    changed,
  };
}

/** Final stitched row: `is_final` + `scene_group_index` null (see `findFinalCompletedAudioByStoryId`). */
function isStoryAudioFinalConcatMix(
  r: Pick<AudioAsset, 'isFinal' | 'sceneGroupIndex'>
): boolean {
  return r.isFinal && (r.sceneGroupIndex == null || r.sceneGroupIndex === undefined);
}

/** Count `[` openings that look like prosody tokens, skipping `[ID:uuid]` markers from scene JSON. */
function countInlineProsodyBracketOpens(s: string): number {
  if (!s) return 0;
  let c = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '[') continue;
    if (s.slice(i, i + 4).toLowerCase() === '[id:') {
      const close = s.indexOf(']', i);
      i = close >= 0 ? close : s.length - 1;
      continue;
    }
    c++;
  }
  return c;
}

/** Chunks first (by `scene_group_index`), then final concat mix — matches TTS chunk order. */
function adminStoryAudioRowOrder(
  a: Pick<AudioAsset, 'isFinal' | 'sceneGroupIndex' | 'createdAt'>,
  b: Pick<AudioAsset, 'isFinal' | 'sceneGroupIndex' | 'createdAt'>
): number {
  const fa = isStoryAudioFinalConcatMix(a) ? 1 : 0;
  const fb = isStoryAudioFinalConcatMix(b) ? 1 : 0;
  if (fa !== fb) return fa - fb;
  const ia = a.sceneGroupIndex ?? 1_000_000;
  const ib = b.sceneGroupIndex ?? 1_000_000;
  if (ia !== ib) return ia - ib;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function serializeAdminMapTileAsset(asset: Asset | null) {
  if (!asset) return null;

  const generationParams =
    asset.generationParams && typeof asset.generationParams === 'object'
      ? (asset.generationParams as Record<string, unknown>)
      : {};
  const maskId = typeof generationParams.maskId === 'string' ? generationParams.maskId : null;
  const mask = maskId ? MAP_TILE_MASK_VARIANTS.find((item) => item.id === maskId) ?? null : null;

  return {
    id: asset.id,
    imageUrl: `/api/v1/admin/assets/${asset.id}/image`,
    storagePath: asset.storagePath,
    thumbnailPath: asset.thumbnailPath,
    mimeType: asset.mimeType,
    fileSizeBytes: asset.fileSizeBytes,
    generationTimeMs: asset.generationTimeMs,
    createdAt: asset.createdAt.toISOString(),
    mask: mask
      ? {
          id: mask.id,
          label: mask.label,
          description: mask.description,
          connectors: mask.connectors,
          topology: mask.topology,
          routeGroups: mask.routeGroups,
          features: mask.features,
          imageUrl: `/api/v1/admin/map-tile-masks/${mask.id}/image`,
        }
      : maskId
        ? { id: maskId }
        : null,
    generationParams,
  };
}

function readAdminTextValidation(policyChecks: unknown): Record<string, unknown> | null {
  if (!policyChecks || typeof policyChecks !== 'object' || Array.isArray(policyChecks)) {
    return null;
  }
  const value = (policyChecks as Record<string, unknown>).textValidation;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export async function listAdminDirectorScenes(storyId: string) {
  const story = await getStoryRepository().findById(storyId);
  if (!story) return null;

  const storyScenes = Array.isArray(story.scenes)
    ? (story.scenes as AdminStorySceneSource[])
    : [];
  const storyTextBySceneIndex = new Map<number, string>(
    storyScenes
      .filter((item) => numberOrNull(item.sceneId) != null)
      .map((item) => [numberOrNull(item.sceneId)!, typeof item.text === 'string' ? item.text : ''])
  );

  const metadata = (story.metadata ?? {}) as {
    environments?: Array<{ id: string; name?: string; description?: string }>;
    outfits?: Array<{ id: string; characterName?: string; description?: string }>;
    storyFormat?: unknown;
    mapTile?: unknown;
    mapTileAssetId?: unknown;
  };
  const textValidation = readAdminTextValidation(story.policyChecks);
  const storyFormat = typeof metadata.storyFormat === 'string' ? metadata.storyFormat : null;
  const mapTileAssetId =
    typeof metadata.mapTileAssetId === 'string' && metadata.mapTileAssetId.trim()
      ? metadata.mapTileAssetId
      : null;
  const assetRepo = getAssetRepository();
  const [
    items,
    storyEnvironmentMappings,
    storyOutfitMappings,
    validationsResult,
    costUsdRaw,
    costBreakdown,
    aiUsageEvents,
    cacheStats,
    finalAudio,
    mapTileAssetById,
    latestMapTileAsset,
    completedSceneImages,
  ] = await Promise.all([
    getStoryDirectorSceneRepository().listByStoryId(storyId),
    getStoryEnvironmentCacheRepository().listByStoryId(storyId),
    getStoryOutfitPlateCacheRepository().listByStoryId(storyId),
    listImageValidationsForStory(storyId, 500, 0),
    getStoryCost(storyId),
    getStoryCostBreakdown(storyId),
    getAiUsageRepository().listByStoryId(storyId),
    getStoryCacheStats(storyId),
    assetRepo.findFinalCompletedAudioByStoryId(storyId),
    mapTileAssetId ? assetRepo.findById(mapTileAssetId) : Promise.resolve(null),
    assetRepo.findLatestCompletedMapTileByStoryId(storyId),
    assetRepo.findCompletedSceneImagesByStoryId(storyId),
  ]);
  const mapTileAsset =
    mapTileAssetById?.storyId === storyId ? mapTileAssetById : latestMapTileAsset;

  const environmentCaches = await getEnvironmentImageCacheRepository().getByIds([
    ...new Set(storyEnvironmentMappings.map((item) => item.cacheId)),
  ]);
  const outfitCaches = await getOutfitPlateCacheRepository().getByIds([
    ...new Set(storyOutfitMappings.map((item) => item.cacheId)),
  ]);

  const environmentImageUrlById = new Map<string, string>();
  const environmentCacheById = new Map(environmentCaches.map((item) => [item.id, item]));
  for (const mapping of storyEnvironmentMappings) {
    const cache = environmentCacheById.get(mapping.cacheId);
    if (!cache || environmentImageUrlById.has(mapping.storyEnvironmentId)) continue;
    environmentImageUrlById.set(mapping.storyEnvironmentId, `/api/v1/assets/${cache.storagePath}`);
  }

  const outfitImageByKey = new Map<
    string,
    {
      imageUrl: string;
      requestedOutfitText: string | null;
      cacheOutfitText: string;
    }
  >();
  const outfitCacheById = new Map(outfitCaches.map((item) => [item.id, item]));
  for (const mapping of storyOutfitMappings) {
    const cache = outfitCacheById.get(mapping.cacheId);
    if (!cache || outfitImageByKey.has(mapping.characterKey)) continue;
    if (!isPregeneratedOutfitPlateCatalogSource(cache.catalogSource)) continue;
    outfitImageByKey.set(mapping.characterKey, {
      imageUrl: `/api/v1/assets/${cache.storagePath}`,
      requestedOutfitText: mapping.requestedOutfitText ?? null,
      cacheOutfitText: cache.outfitText,
    });
  }
  const graphicNovelPages = await loadAdminGraphicNovelPages(storyId, storyFormat);
  const pageTargets = buildGraphicNovelPageTargets({
    storyFormat,
    storyScenes,
    pages: graphicNovelPages,
  });
  const visibleValidationRows = hideRejectedBestOfFailedValidationDuplicates(
    validationsResult.items
  );
  const sceneImageBySceneIndex = new Map<number, (typeof completedSceneImages)[number]>();
  for (const image of completedSceneImages) {
    if (image.sceneNumber == null || sceneImageBySceneIndex.has(image.sceneNumber)) continue;
    sceneImageBySceneIndex.set(image.sceneNumber, image);
  }
  const graphicNovelPageByNumber = new Map(
    graphicNovelPages.map((page) => [page.pageNumber, page])
  );

  const gp = finalAudio?.asset?.generationParams as Record<string, unknown> | undefined;
  const am = (story.audioMetadata ?? {}) as StoryAudioMetadata;
  const sceneGroupAssetIds = Array.isArray(am.sceneGroupAssetIds) ? am.sceneGroupAssetIds : [];
  const chunkRows = await Promise.all(
    sceneGroupAssetIds.map(async (id, slotIndex) => {
      if (!id) {
        return {
          slotIndex,
          groupIndex: slotIndex,
          assetId: null as string | null,
          generationTimeMs: null as number | null,
        };
      }
      const row = await assetRepo.findById(id);
      if (!row) {
        return {
          slotIndex,
          groupIndex: slotIndex,
          assetId: id,
          generationTimeMs: null as number | null,
        };
      }
      const rowGp = (row.generationParams ?? {}) as Record<string, unknown>;
      const groupIndex = typeof rowGp.groupIndex === 'number' ? rowGp.groupIndex : slotIndex;
      const fromCol = row.generationTimeMs;
      const fromGp = typeof rowGp.generationTimeMs === 'number' ? rowGp.generationTimeMs : null;
      const ms = fromCol ?? fromGp;
      return {
        slotIndex,
        groupIndex,
        assetId: id,
        generationTimeMs: typeof ms === 'number' && Number.isFinite(ms) ? ms : null,
      };
    })
  );
  chunkRows.sort((a, b) => a.groupIndex - b.groupIndex);

  const numFromGp = (k: string) => {
    const v = gp?.[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const timing = {
    audioGenerationTimeMs: am.audioGenerationTimeMs ?? null,
    prosodyTaggingTimeMs: am.prosodyTaggingTimeMs ?? numFromGp('prosodyTaggingTimeMs'),
    ttsChunksSynthesisTimeMs: am.ttsChunksSynthesisTimeMs ?? numFromGp('ttsChunksSynthesisTimeMs'),
    ttsBatchWallTimeMs: am.ttsBatchWallTimeMs ?? numFromGp('ttsBatchWallTimeMs'),
    ttsSynthesisBatchesWallMs:
      am.ttsSynthesisBatchesWallMs ?? numFromGp('ttsSynthesisBatchesWallMs'),
    ttsChunksParallelEstimateMs:
      am.ttsChunksParallelEstimateMs ?? numFromGp('ttsChunksParallelEstimateMs'),
  };

  const deferredFullRaw = am.deferredTaggedFullText;
  const deferredFull =
    typeof deferredFullRaw === 'string' && deferredFullRaw.length > 0 ? deferredFullRaw : '';
  const deferredLens =
    Array.isArray(am.deferredTtsChunkCharLengths) && am.deferredTtsChunkCharLengths.length > 0
      ? am.deferredTtsChunkCharLengths
      : null;

  let synthesisTaggedSegments: Array<{ text: string; isMissingChunk: boolean }> | null = null;
  let audioRowsCache: Awaited<ReturnType<typeof assetRepo.findAudioAssetsByStoryId>> | null =
    null;

  if (deferredFull.length > 0 && deferredLens) {
    audioRowsCache = await assetRepo.findAudioAssetsByStoryId(storyId);
    const chunkTtsCompleted = (index: number, assetId: string | null): boolean => {
      if (!assetId) return false;
      return audioRowsCache!.some(
        (r) =>
          r.assetId === assetId &&
          r.sceneGroupIndex === index &&
          r.status === 'completed'
      );
    };
    const sumLens = deferredLens.reduce((acc, n) => acc + (typeof n === 'number' && n >= 0 ? n : 0), 0);
    if (sumLens !== deferredFull.length) {
      logger.warn(
        {
          storyId,
          sumLens,
          fullLen: deferredFull.length,
          chunkCount: deferredLens.length,
        },
        'Admin director: deferredTtsChunkCharLengths sum does not match deferredTaggedFullText'
      );
      synthesisTaggedSegments = [{ text: deferredFull, isMissingChunk: false }];
    } else {
      let offset = 0;
      synthesisTaggedSegments = deferredLens.map((len, i) => {
        const safeLen = typeof len === 'number' && len >= 0 ? len : 0;
        const text = deferredFull.slice(offset, offset + safeLen);
        offset += safeLen;
        const slot = sceneGroupAssetIds[i];
        const slotId = typeof slot === 'string' && slot.length > 0 ? slot : null;
        return { text, isMissingChunk: !chunkTtsCompleted(i, slotId) };
      });
    }
  }

  /** Final mix row (after concat) when deferred snapshot is absent. */
  const fromFinalCol = finalAudio?.audioAsset?.synthesisTaggedText?.trim() ?? '';
  const fromFinalGpTts =
    typeof gp?.ttsSynthesisText === 'string' ? gp.ttsSynthesisText.trim() : '';
  const synthesisTaggedText: string | null = synthesisTaggedSegments
    ? synthesisTaggedSegments.map((s) => s.text).join('')
    : fromFinalCol.length > 0
      ? fromFinalCol
      : fromFinalGpTts.length > 0
        ? fromFinalGpTts
        : null;

  const synthesisInlineBracketOpenCount = countInlineProsodyBracketOpens(synthesisTaggedText ?? '');
  const synthesisProsodyHint: string | null =
    synthesisTaggedText &&
    synthesisTaggedText.length > 0 &&
    synthesisInlineBracketOpenCount === 0
      ? 'Stored TTS input has no inline [bracket] prosody tags. The deferred prosody step likely fell back to plain narration (LLM error, canon validation failure, or reuse of a prior untagged row). This page shows the DB verbatim — regenerate audio or check API logs for this storyId.'
      : null;

  let vendorStylePromptEn = readVendorStylePromptEnFromGenerationParams(gp ?? {});

  if (!vendorStylePromptEn) {
    const audioRowsAll = audioRowsCache ?? (await assetRepo.findAudioAssetsByStoryId(storyId));
    const completedSorted = audioRowsAll
      .filter((r) => r.status === 'completed')
      .sort(adminStoryAudioRowOrder);
    const uniqueAssetIds = [...new Set(completedSorted.map((r) => r.assetId))];
    const linkedAssets = await Promise.all(uniqueAssetIds.map((id) => assetRepo.findById(id)));
    const gpByAssetId = new Map(
      linkedAssets
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
        .map((a) => [a.id, a.generationParams])
    );
    for (const r of completedSorted) {
      const agp = gpByAssetId.get(r.assetId);
      const v = readVendorStylePromptEnFromGenerationParams(agp ?? {});
      if (v) {
        vendorStylePromptEn = v;
        break;
      }
    }
  }
  const audioPath =
    finalAudio?.asset?.storagePath && String(finalAudio.asset.storagePath).length > 0
      ? `/api/v1/assets/${finalAudio.asset.storagePath}`
      : null;

  return {
    story: {
      id: story.id,
      title: story.title,
      storyFormat,
      mapTile: metadata.mapTile ?? null,
      mapTileAsset: serializeAdminMapTileAsset(mapTileAsset),
      textValidation,
      createdAt: story.createdAt.toISOString(),
    },
    storyScenes: storyScenes
      .filter((item) => numberOrNull(item.sceneId) != null)
      .map((item) => {
        const sceneIndex = numberOrNull(item.sceneId)!;
        const imageTargetKind = adminSceneImageTargetKind(storyFormat, item);
        const graphicNovelPageNumber = numberOrNull(item.graphicNovelPageNumber);
        const sceneImage =
          imageTargetKind === 'scene' ? sceneImageBySceneIndex.get(sceneIndex) : null;
        const graphicNovelPage =
          imageTargetKind === 'graphic_novel_page' && graphicNovelPageNumber != null
            ? graphicNovelPageByNumber.get(graphicNovelPageNumber)
            : null;
        const imageStoragePath =
          sceneImage?.storagePath ?? normalizeAssetPath(graphicNovelPage?.imageUrl);
        const imageUrl = sceneImage
          ? `/api/v1/assets/${sceneImage.storagePath}`
          : stringOrNull(graphicNovelPage?.imageUrl);
        const imageRequestManifest = buildAdminImageRequestManifest(
          sceneImage?.generationParams ?? graphicNovelPage?.generationParams,
          imageStoragePath,
          graphicNovelPage?.layoutJson
        );
        return {
          sceneIndex,
          storyText: typeof item.text === 'string' ? item.text : '',
          mixedStoryBlockKind:
            typeof item.mixedStoryBlockKind === 'string' ? item.mixedStoryBlockKind : null,
          mixedStoryScreenOrder: numberOrNull(item.mixedStoryScreenOrder),
          graphicNovelPageNumber,
          imageTargetKind,
          hasImage: !!imageUrl,
          imageUrl,
          imageStoragePath,
          imageRequestManifest,
        };
      }),
    items: items.map((item) => ({
      id: item.id,
      storyId: item.storyId,
      sceneIndex: item.sceneIndex,
      storyText: storyTextBySceneIndex.get(item.sceneIndex) ?? '',
      environmentId: item.environmentId,
      characterOutfitIds: item.characterOutfitIds,
      sceneVisual: item.sceneVisual,
      illustrationBlockIndex: item.illustrationBlockIndex,
      isBlockAnchor: item.isBlockAnchor,
      createdAt: item.createdAt.toISOString(),
    })),
    validations: visibleValidationRows.map((row) => {
      const target = resolveAdminValidationTarget({
        storyFormat,
        sceneIndex: row.sceneIndex,
        imageStoragePath: row.imageStoragePath,
        pageTargets,
      });
      return {
        id: row.id,
        storyId: row.storyId,
        sceneIndex: target.sceneIndex,
        sourceSceneIndex: target.sourceSceneIndex,
        imageTargetKind: target.imageTargetKind,
        graphicNovelPageNumber: target.graphicNovelPageNumber,
        mixedStoryScreenOrder: target.mixedStoryScreenOrder,
        subjectType: row.subjectType,
        pageNumber: row.pageNumber,
        panelIndex: row.panelIndex,
        panelId: row.panelId,
        cropRect: row.cropRect,
        attempt: row.attempt,
        imageStoragePath: row.imageStoragePath,
        imageUrl: adminImageValidationImageUrl(row.id),
        validationScore: resolveAdminValidationScore(row),
        validationStatus: row.validationStatus,
        visionModel: row.visionModel,
        requestManifest: row.requestManifest,
        providerError: row.providerError,
        result: row.result,
        usage: serializeAdminValidationUsage(row, aiUsageEvents),
        createdAt: row.createdAt.toISOString(),
      };
    }),
    cost: {
      costUsd: Math.round(costUsdRaw * 1e8) / 1e8,
      cacheStats: {
        totalCachedInputUnits: cacheStats.totalCachedInputUnits,
        totalEffectiveInputUnits: cacheStats.totalEffectiveInputUnits,
        cacheHitCount: cacheStats.cacheHitCount,
        cachedOperationCount: cacheStats.cachedOperationCount,
      },
      breakdown: costBreakdown.map((item) => ({
        provider: item.provider,
        operation: item.operation,
        model: item.model,
        costUsd: Math.round(item.costUsd * 1e8) / 1e8,
        createdAt: item.createdAt.toISOString(),
      })),
    },
    environments: (Array.isArray(metadata.environments) ? metadata.environments : []).map(
      (item) => ({
        ...item,
        imageUrl: environmentImageUrlById.get(item.id) ?? null,
      })
    ),
    outfits: (Array.isArray(metadata.outfits) ? metadata.outfits : []).map((item) => {
      const normalizedCharacterName = item.characterName
        ? normalizeOutfitPlateCharacterKey(item.characterName)
        : '';
      const exactKey =
        normalizedCharacterName && item.id ? `${normalizedCharacterName}::${item.id}` : '';
      const fallbackKey = normalizedCharacterName || '';
      const currentDescription = item.description ?? '';
      const exactImage = exactKey ? outfitImageByKey.get(exactKey) : null;
      const fallbackImage = fallbackKey ? outfitImageByKey.get(fallbackKey) : null;
      const matchingImage = [exactImage, fallbackImage].find((candidate) => {
        if (!candidate) return false;
        return (
          requestedOutfitTextMatches(candidate.requestedOutfitText, currentDescription) ||
          (candidate.requestedOutfitText == null &&
            requestedOutfitTextMatches(candidate.cacheOutfitText, currentDescription))
        );
      });

      return {
        ...item,
        imageUrl: matchingImage?.imageUrl ?? null,
      };
    }),
    audio: {
      audioUrl: audioPath,
      synthesisTaggedText: synthesisTaggedText,
      synthesisTaggedSegments: synthesisTaggedSegments,
      synthesisInlineBracketOpenCount,
      synthesisProsodyHint: synthesisProsodyHint,
      vendorStylePromptEn: vendorStylePromptEn || null,
      durationSeconds: (() => {
        const raw = finalAudio?.audioAsset?.durationSeconds;
        if (raw == null) return null;
        const n = parseFloat(String(raw));
        return Number.isFinite(n) ? n : null;
      })(),
      voiceName: finalAudio?.audioAsset?.voiceName ?? null,
      timing,
      chunks: chunkRows.map((c) => ({
        groupIndex: c.groupIndex,
        assetId: c.assetId,
        generationTimeMs: c.generationTimeMs,
      })),
    },
    meta: { total: items.length },
  };
}

function serializeAdminConfigItem(resource: AdminConfigResource, item: Record<string, unknown>) {
  switch (resource) {
    case 'plans':
    case 'features':
    case 'planFeatures':
    case 'translations':
    case 'scenarioPlotExamples':
    case 'scenarioWorldRules':
      return {
        ...item,
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
        updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
      };
    default:
      return item;
  }
}

export async function listAdminConfigItems(resource: AdminConfigResource) {
  const items = await getAdminConfigRepository().list(resource);

  return {
    resource,
    items: items.map((item) => serializeAdminConfigItem(resource, item as Record<string, unknown>)),
    meta: { total: items.length },
  };
}

export async function updateAdminConfigItem(
  resource: AdminConfigResource,
  id: string,
  patch: Record<string, unknown>
) {
  const repo = getAdminConfigRepository();
  let item: Record<string, unknown> | null = null;

  switch (resource) {
    case 'plans':
      item = await repo.updatePlan(id, patch);
      break;
    case 'features':
      item = await repo.updateFeature(id, patch);
      break;
    case 'planFeatures':
      item = await repo.updatePlanFeature(id, patch);
      break;
    case 'translations':
      item = await repo.updateTranslation(id, patch);
      break;
    case 'storyGoals':
      item = await repo.updateStoryGoal(id, patch);
      break;
    case 'contentPolicyRules':
      item = await repo.updateContentPolicyRule(id, patch);
      break;
    case 'ageEngineRules':
      item = await repo.updateAgeEngineRule(id, patch);
      break;
    case 'scenarioCards':
      item = await repo.updateScenarioCard(id, patch);
      break;
    case 'scenarioPlotExamples':
      item = await repo.updateScenarioPlotExample(id, patch);
      break;
    case 'scenarioWorldRules':
      item = await repo.updateScenarioWorldRule(id, patch);
      break;
    default:
      item = null;
  }

  if (item) {
    await invalidatePublicPricingPages(resource);
  }

  return item;
}

export async function createAdminConfigItem(
  resource: AdminConfigResource,
  input: Record<string, unknown>
) {
  const repo = getAdminConfigRepository();

  let item: Record<string, unknown> | null = null;
  switch (resource) {
    case 'plans':
      item = await repo.createPlan(input as any);
      break;
    case 'features':
      item = await repo.createFeature(input as any);
      break;
    case 'planFeatures':
      item = await repo.createPlanFeature(input as any);
      break;
    case 'translations':
      item = await repo.createTranslation(input as any);
      break;
    case 'storyGoals':
      item = await repo.createStoryGoal(input as any);
      break;
    case 'contentPolicyRules':
      item = await repo.createContentPolicyRule(input as any);
      break;
    case 'ageEngineRules':
      item = await repo.createAgeEngineRule(input as any);
      break;
    case 'scenarioCards':
      item = await repo.createScenarioCard(input as any);
      break;
    case 'scenarioPlotExamples':
      item = await repo.createScenarioPlotExample(input as any);
      break;
    case 'scenarioWorldRules':
      item = await repo.createScenarioWorldRule(input as any);
      break;
    default:
      item = null;
  }

  if (item) {
    await invalidatePublicPricingPages(resource);
  }

  return item ? serializeAdminConfigItem(resource, item) : null;
}

export async function deleteAdminConfigItem(resource: AdminConfigResource, id: string) {
  const repo = getAdminConfigRepository();
  let item: Record<string, unknown> | null = null;

  switch (resource) {
    case 'plans':
      item = await repo.deletePlan(id);
      break;
    case 'features':
      item = await repo.deleteFeature(id);
      break;
    case 'planFeatures':
      item = await repo.deletePlanFeature(id);
      break;
    case 'translations':
      item = await repo.deleteTranslation(id);
      break;
    case 'storyGoals':
      item = await repo.deleteStoryGoal(id);
      break;
    case 'contentPolicyRules':
      item = await repo.deleteContentPolicyRule(id);
      break;
    case 'ageEngineRules':
      item = await repo.deleteAgeEngineRule(id);
      break;
    case 'scenarioCards':
      item = await repo.deleteScenarioCard(id);
      break;
    case 'scenarioPlotExamples':
      item = await repo.deleteScenarioPlotExample(id);
      break;
    case 'scenarioWorldRules':
      item = await repo.deleteScenarioWorldRule(id);
      break;
    default:
      item = null;
  }

  if (item) {
    await invalidatePublicPricingPages(resource);
  }

  return item;
}

export type AdminResetStoryAudioResult = {
  cleared: ClearStoryAudioResult;
  jobId?: string;
};

/**
 * Clears all audio DB rows, alignment, and audio files for a story.
 * Optionally enqueues a fresh `audio_generation` job (same path as user "Generate audio").
 */
export async function adminResetStoryAudio(
  storyId: string,
  options?: { regenerate?: boolean; voiceId?: string; speed?: number; nightMode?: boolean }
): Promise<AdminResetStoryAudioResult> {
  const cleared = await clearStoryAudioData(storyId);

  if (!options?.regenerate) {
    return { cleared };
  }

  const { storyJobQueue } = await import('../jobs/storyJobProcessor');
  const jobId = await storyJobQueue.addJob({
    type: 'audio_generation',
    storyId,
    userId: cleared.userId,
    voiceParams: {
      voiceId: options.voiceId,
      speed: options.speed,
      nightMode: options.nightMode,
    },
  });

  return { cleared, jobId };
}
