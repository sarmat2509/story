import {
  getAdminConfigRepository,
  getAdminDashboardRepository,
  getAiUsageRepository,
  getAssetRepository,
  getEnvironmentImageCacheRepository,
  getFeedbackRepository,
  getGraphicNovelRepository,
  getOutfitPlateCacheRepository,
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
import { normalizeOutfitPlateCharacterKey } from './outfitPlateService';
import { incrementLandingRenderVersion } from '../ssr/storyCache';
import { incrementPublicPageRenderVersion } from '../ssr/publicPageCache';
import { getUserSubscription } from './planService';
import { getUsageForPeriod } from './usageEventsService';
import { readVendorStylePromptEnFromGenerationParams } from './ttsProsodyTaggingService';
import type { Asset, AudioAsset } from '../db/schema';
import type { ImageValidationResult } from '../ai/types';
import type { StoryAudioMetadata } from '@wondertales/shared';
import { clearStoryAudioData, type ClearStoryAudioResult } from './storyAudioCleanupService';
import { MAP_TILE_MASK_VARIANTS } from '../domain/story/mapTileMasks';
import { computeValidationScore } from './storyOrchestrationService';
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
  if (typeof row.validationScore === 'number' && Number.isFinite(row.validationScore)) {
    return row.validationScore;
  }
  if (row.validationStatus === 'provider_blocked') {
    return null;
  }
  if (!isStoredImageValidationResult(row.result)) {
    return null;
  }

  try {
    return computeValidationScore(row.result);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to compute fallback admin image validation score');
    return null;
  }
}

type AdminImageTargetKind = 'scene' | 'graphic_novel_page' | 'none';

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

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeAssetPath(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;
  return raw.replace(/^\/api\/v1\/assets\//, '');
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildAdminImageRequestManifest(
  generationParams: unknown,
  imageStoragePath: string | null
): Record<string, unknown> | null {
  const params = objectOrNull(generationParams);
  if (!params) return null;

  const manifestKey = (manifest: Record<string, unknown>) =>
    [
      manifest.operation,
      manifest.mode,
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
  if (
    repairRequestManifest &&
    !requestManifests.some((item) => manifestKey(item) === manifestKey(repairRequestManifest))
  ) {
    requestManifests.push(repairRequestManifest);
  }

  const references = Array.isArray(params.referenceImages) ? params.referenceImages : [];
  if (requestManifests.length === 0 && references.length === 0) return null;

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
    referenceCount: params.referenceCount ?? references.length,
    characterReferenceCount: params.characterReferenceCount ?? null,
    objectReferenceCount: params.objectReferenceCount ?? null,
    requests: requestManifests,
    references,
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

  const [matchedUsage, story] = await Promise.all([
    getAiUsageRepository().findNearestImageValidationUsage({
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
    attempt: row.attempt,
    imageStoragePath: row.imageStoragePath,
    imageUrl: adminImageValidationImageUrl(row.id),
    validationScore: resolveAdminValidationScore(row),
    validationStatus: row.validationStatus,
    visionModel: row.visionModel,
    requestManifest: row.requestManifest,
    providerError: row.providerError,
    result: row.result,
    usage: matchedUsage
      ? {
          provider: matchedUsage.provider,
          operation: matchedUsage.operation,
          model: matchedUsage.model,
          inputUnits: matchedUsage.inputUnits,
          outputUnits: matchedUsage.outputUnits,
          costUsd:
            matchedUsage.costUsd != null ? Math.round(matchedUsage.costUsd * 1e8) / 1e8 : null,
          durationMs: matchedUsage.durationMs,
          metadata: matchedUsage.metadata,
          createdAt: matchedUsage.createdAt.toISOString(),
          matchedDeltaMs: matchedUsage.matchedDeltaMs,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
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

  const outfitImageUrlByKey = new Map<string, string>();
  const outfitCacheById = new Map(outfitCaches.map((item) => [item.id, item]));
  for (const mapping of storyOutfitMappings) {
    const cache = outfitCacheById.get(mapping.cacheId);
    if (!cache || outfitImageUrlByKey.has(mapping.characterKey)) continue;
    outfitImageUrlByKey.set(mapping.characterKey, `/api/v1/assets/${cache.storagePath}`);
  }
  const graphicNovelPages = await loadAdminGraphicNovelPages(storyId, storyFormat);
  const pageTargets = buildGraphicNovelPageTargets({
    storyFormat,
    storyScenes,
    pages: graphicNovelPages,
  });
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
          imageStoragePath
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
    validations: validationsResult.items.map((row) => {
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

      return {
        ...item,
        imageUrl:
          (exactKey ? outfitImageUrlByKey.get(exactKey) : null) ??
          (fallbackKey ? outfitImageUrlByKey.get(fallbackKey) : null) ??
          null,
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
