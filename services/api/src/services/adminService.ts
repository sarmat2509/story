import {
  getAdminConfigRepository,
  getAdminDashboardRepository,
  getEnvironmentImageCacheRepository,
  getFeedbackRepository,
  getOutfitPlateCacheRepository,
  getStoryDirectorSceneRepository,
  getStoryEnvironmentCacheRepository,
  getStoryOutfitPlateCacheRepository,
  getStoryRepository,
  getUserRepository,
} from '../repositories';
import type { AdminConfigResource } from '../repositories/AdminConfigRepository';
import { getAssetStorageService } from './assetStorageService';
import { getImageValidationById, listAllImageValidations, listImageValidationsForStory } from './imageValidationQueryService';
import { getStoryCacheStats, getStoryCost, getStoryCostBreakdown } from './aiUsageService';
import { normalizeOutfitPlateCharacterKey } from './outfitPlateService';
import { incrementLandingRenderVersion } from '../ssr/storyCache';
import { getUserSubscription } from './planService';
import { getUsageForPeriod } from './usageEventsService';

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

export async function listAdminUsers(params: {
  limit: number;
  offset: number;
  search?: string;
}) {
  const { limit, offset, search } = params;
  const repo = getUserRepository();
  const [items, total] = await Promise.all([
    repo.listAllPaginated({ limit, offset, search }),
    repo.countAll(search),
  ]);

  return {
    items: await Promise.all(items.map(async (item) => {
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
    })),
    meta: { limit, offset, total },
  };
}

export async function listAdminFeedback(params: {
  limit: number;
  offset: number;
  search?: string;
  category?: string;
  hasScreenshot?: boolean;
}) {
  const { limit, offset, search, category, hasScreenshot } = params;
  const repo = getFeedbackRepository();
  const [items, total] = await Promise.all([
    repo.listAllPaginated({ limit, offset, search, category, hasScreenshot }),
    repo.countAll(search, category, hasScreenshot),
  ]);
  const assetStorage = getAssetStorageService();

  return {
    items: await Promise.all(items.map(async (item) => {
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
          reportedScreen: typeof context.reportedScreen === 'string' ? context.reportedScreen : null,
        },
        createdAt: item.createdAt.toISOString(),
      };
    })),
    meta: { limit, offset, total },
  };
}

export async function listAdminImageValidations(params: {
  limit: number;
  offset: number;
}) {
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

export async function listAdminDirectorScenes(storyId: string) {
  const story = await getStoryRepository().findById(storyId);
  if (!story) return null;

  const storyScenes = Array.isArray(story.scenes)
    ? (story.scenes as Array<{ sceneId?: number; text?: string }>)
    : [];
  const storyTextBySceneIndex = new Map<number, string>(
    storyScenes
      .filter((item) => typeof item.sceneId === 'number')
      .map((item) => [item.sceneId as number, item.text ?? '']),
  );

  const metadata = (story.metadata ?? {}) as {
    environments?: Array<{ id: string; name?: string; description?: string }>;
    outfits?: Array<{ id: string; characterName?: string; description?: string }>;
  };
  const [items, storyEnvironmentMappings, storyOutfitMappings, validationsResult, costUsdRaw, costBreakdown, cacheStats] = await Promise.all([
    getStoryDirectorSceneRepository().listByStoryId(storyId),
    getStoryEnvironmentCacheRepository().listByStoryId(storyId),
    getStoryOutfitPlateCacheRepository().listByStoryId(storyId),
    listImageValidationsForStory(storyId, 500, 0),
    getStoryCost(storyId),
    getStoryCostBreakdown(storyId),
    getStoryCacheStats(storyId),
  ]);

  const environmentCaches = await getEnvironmentImageCacheRepository().getByIds(
    [...new Set(storyEnvironmentMappings.map((item) => item.cacheId))],
  );
  const outfitCaches = await getOutfitPlateCacheRepository().getByIds(
    [...new Set(storyOutfitMappings.map((item) => item.cacheId))],
  );

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
    environments: (Array.isArray(metadata.environments) ? metadata.environments : []).map((item) => ({
      ...item,
      imageUrl: environmentImageUrlById.get(item.id) ?? null,
    })),
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
        createdAt:
          item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
        updatedAt:
          item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
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
  patch: Record<string, unknown>,
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
  input: Record<string, unknown>,
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

export async function deleteAdminConfigItem(
  resource: AdminConfigResource,
  id: string,
) {
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
