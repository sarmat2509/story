import {
  getAdminConfigRepository,
  getAdminDashboardRepository,
  getAssetRepository,
  getEnvironmentImageCacheRepository,
  getFeedbackRepository,
  getOutfitPlateCacheRepository,
  getStoryDirectorSceneRepository,
  getStoryEnvironmentCacheRepository,
  getStoryOutfitPlateCacheRepository,
  getStoryRepository,
  getUserRepository,
  getVoiceRepository,
} from '../repositories';
import type { AdminConfigResource } from '../repositories/AdminConfigRepository';
import { getAssetStorageService } from './assetStorageService';
import {
  getImageValidationById,
  listAllImageValidations,
  listImageValidationsForStory,
} from './imageValidationQueryService';
import { getStoryCacheStats, getStoryCost, getStoryCostBreakdown } from './aiUsageService';
import { normalizeOutfitPlateCharacterKey } from './outfitPlateService';
import { incrementLandingRenderVersion } from '../ssr/storyCache';
import { getUserSubscription } from './planService';
import { getUsageForPeriod } from './usageEventsService';
import { readVendorStylePromptEnFromGenerationParams } from './ttsProsodyTaggingService';
import type { AudioAsset } from '../db/schema';
import type { StoryAudioMetadata } from '@wondertales/shared';
import { clearStoryAudioData, type ClearStoryAudioResult } from './storyAudioCleanupService';
import { logger } from '../utils/logger';

export async function getAdminDashboard(days: number) {
  return getAdminDashboardRepository().getDashboard(days);
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
        let audioStoriesUsedCurrentPeriod = 0;

        if (currentPeriodStart && currentPeriodEnd) {
          [storiesUsedCurrentPeriod, audioStoriesUsedCurrentPeriod] = await Promise.all([
            getUsageForPeriod(item.id, currentPeriodStart, currentPeriodEnd, 'story_created'),
            getUsageForPeriod(item.id, currentPeriodStart, currentPeriodEnd, 'audio_synthesized'),
          ]);
        }

        return {
          id: item.id,
          email: item.email,
          role: item.role,
          planSlug: item.planSlug,
          planName: item.planName,
          createdAt: item.createdAt.toISOString(),
          currentPeriodStart: currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
          storiesUsedCurrentPeriod,
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
      imageUrl: `/api/v1/assets/${row.imageStoragePath}`,
      validationScore: row.validationScore,
      visionModel: row.visionModel,
      result: row.result,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: { limit, offset, total },
  };
}

export async function getAdminImageValidation(id: string) {
  const row = await getImageValidationById(id);
  if (!row) return null;

  return {
    id: row.id,
    storyId: row.storyId,
    sceneIndex: row.sceneIndex,
    attempt: row.attempt,
    imageStoragePath: row.imageStoragePath,
    imageUrl: `/api/v1/assets/${row.imageStoragePath}`,
    validationScore: row.validationScore,
    visionModel: row.visionModel,
    result: row.result,
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

export async function listAdminDirectorScenes(storyId: string) {
  const story = await getStoryRepository().findById(storyId);
  if (!story) return null;

  const storyScenes = Array.isArray(story.scenes)
    ? (story.scenes as Array<{ sceneId?: number; text?: string }>)
    : [];
  const storyTextBySceneIndex = new Map<number, string>(
    storyScenes
      .filter((item) => typeof item.sceneId === 'number')
      .map((item) => [item.sceneId as number, item.text ?? ''])
  );

  const metadata = (story.metadata ?? {}) as {
    environments?: Array<{ id: string; name?: string; description?: string }>;
    outfits?: Array<{ id: string; characterName?: string; description?: string }>;
  };
  const [
    items,
    storyEnvironmentMappings,
    storyOutfitMappings,
    validationsResult,
    costUsdRaw,
    costBreakdown,
    cacheStats,
    finalAudio,
  ] = await Promise.all([
    getStoryDirectorSceneRepository().listByStoryId(storyId),
    getStoryEnvironmentCacheRepository().listByStoryId(storyId),
    getStoryOutfitPlateCacheRepository().listByStoryId(storyId),
    listImageValidationsForStory(storyId, 500, 0),
    getStoryCost(storyId),
    getStoryCostBreakdown(storyId),
    getStoryCacheStats(storyId),
    getAssetRepository().findFinalCompletedAudioByStoryId(storyId),
  ]);

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

  const gp = finalAudio?.asset?.generationParams as Record<string, unknown> | undefined;
  const am = (story.audioMetadata ?? {}) as StoryAudioMetadata;
  const sceneGroupAssetIds = Array.isArray(am.sceneGroupAssetIds) ? am.sceneGroupAssetIds : [];
  const assetRepo = getAssetRepository();
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
      createdAt: story.createdAt.toISOString(),
    },
    storyScenes: storyScenes
      .filter((item) => typeof item.sceneId === 'number')
      .map((item) => ({
        sceneIndex: item.sceneId as number,
        storyText: item.text ?? '',
      })),
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
    validations: validationsResult.items.map((row) => ({
      id: row.id,
      storyId: row.storyId,
      sceneIndex: row.sceneIndex,
      attempt: row.attempt,
      imageStoragePath: row.imageStoragePath,
      imageUrl: `/api/v1/assets/${row.imageStoragePath}`,
      validationScore: row.validationScore,
      visionModel: row.visionModel,
      result: row.result,
      createdAt: row.createdAt.toISOString(),
    })),
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

  switch (resource) {
    case 'plans':
      return repo.updatePlan(id, patch);
    case 'features':
      return repo.updateFeature(id, patch);
    case 'planFeatures':
      return repo.updatePlanFeature(id, patch);
    case 'translations':
      return repo.updateTranslation(id, patch);
    case 'storyGoals':
      return repo.updateStoryGoal(id, patch);
    case 'contentPolicyRules':
      return repo.updateContentPolicyRule(id, patch);
    case 'ageEngineRules':
      return repo.updateAgeEngineRule(id, patch);
    case 'scenarioCards':
      return repo.updateScenarioCard(id, patch);
    case 'scenarioPlotExamples':
      return repo.updateScenarioPlotExample(id, patch);
    case 'scenarioWorldRules':
      return repo.updateScenarioWorldRule(id, patch);
    default:
      return null;
  }
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

  return item ? serializeAdminConfigItem(resource, item) : null;
}

export async function deleteAdminConfigItem(resource: AdminConfigResource, id: string) {
  const repo = getAdminConfigRepository();

  switch (resource) {
    case 'plans':
      return repo.deletePlan(id);
    case 'features':
      return repo.deleteFeature(id);
    case 'planFeatures':
      return repo.deletePlanFeature(id);
    case 'translations':
      return repo.deleteTranslation(id);
    case 'storyGoals':
      return repo.deleteStoryGoal(id);
    case 'contentPolicyRules':
      return repo.deleteContentPolicyRule(id);
    case 'ageEngineRules':
      return repo.deleteAgeEngineRule(id);
    case 'scenarioCards':
      return repo.deleteScenarioCard(id);
    case 'scenarioPlotExamples':
      return repo.deleteScenarioPlotExample(id);
    case 'scenarioWorldRules':
      return repo.deleteScenarioWorldRule(id);
    default:
      return null;
  }
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
