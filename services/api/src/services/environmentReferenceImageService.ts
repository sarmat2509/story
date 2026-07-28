import crypto from 'crypto';
import type { StoryEnvironment } from '../ai/types';
import { config } from '../config';
import {
  getEnvironmentImageCacheRepository,
  getStoryEnvironmentCacheRepository,
} from '../repositories';
import {
  ENVIRONMENT_REFERENCE_CACHE_PREFIX,
  buildImageSystemInstruction,
  buildEnvironmentImageCacheDescription,
  buildEnvironmentImagePrompt,
  isCurrentEnvironmentImageCacheDescription,
} from '../prompts/image';
import { USAGE_OP_IMAGE_ENVIRONMENT, recordUsage } from './aiUsageService';
import { getEnvironmentImageProvider } from './aiService';
import type { getAssetStorageService } from './assetStorageService';
import { generateEmbedding } from './embeddingService';
import { logger } from '../utils/logger';
import { imageMimeTypeFromPath } from '../utils/imageMimeType';

export interface EnvImageData {
  base64: string;
  mimeType: string;
  fileUri?: string;
  storagePath: string;
}

/** Different Director environment IDs may share a plate only at near-exact semantic similarity. */
const CROSS_ENVIRONMENT_REUSE_SCORE_EXCLUSIVE = 0.95;

export interface EnvironmentImageRequest {
  storyId: string;
  userId?: string;
  storyEnvironmentId: string;
  environment: StoryEnvironment;
  assetStorage: ReturnType<typeof getAssetStorageService>;
  scenarioCardId?: string;
  previousStoryIds?: string[];
}

interface EnvironmentImageDependencies {
  enabled: boolean;
  similarityThreshold: number;
  envCacheRepo: ReturnType<typeof getEnvironmentImageCacheRepository>;
  storyEnvRepo: ReturnType<typeof getStoryEnvironmentCacheRepository>;
  generateEmbedding: typeof generateEmbedding;
  getEnvironmentImageProvider: typeof getEnvironmentImageProvider;
  recordUsage: typeof recordUsage;
}

export async function getOrCreateEnvironmentImageCore(
  params: EnvironmentImageRequest,
  deps: EnvironmentImageDependencies
): Promise<EnvImageData | null> {
  if (!deps.enabled) return null;

  const {
    storyId,
    userId,
    storyEnvironmentId,
    environment,
    assetStorage,
    scenarioCardId,
    previousStoryIds,
  } = params;
  const { envCacheRepo, storyEnvRepo } = deps;
  const cacheDescription = buildEnvironmentImageCacheDescription(environment.description);

  const existing = await storyEnvRepo.getByStoryAndEnvId(storyId, storyEnvironmentId);
  if (existing) {
    const cached = await envCacheRepo.getById(existing.cacheId);
    if (cached && isCurrentEnvironmentImageCacheDescription(cached.description)) {
      const buffer = await assetStorage.getAssetByPath(cached.storagePath);
      return {
        base64: buffer.toString('base64'),
        mimeType: imageMimeTypeFromPath(cached.storagePath),
        storagePath: cached.storagePath,
      };
    }
  }

  for (const previousStoryId of previousStoryIds ?? []) {
    const previous = await storyEnvRepo.getByStoryAndEnvId(previousStoryId, storyEnvironmentId);
    if (!previous) continue;
    const cached = await envCacheRepo.getById(previous.cacheId);
    if (!cached || !isCurrentEnvironmentImageCacheDescription(cached.description)) continue;

    const buffer = await assetStorage.getAssetByPath(cached.storagePath);
    await storyEnvRepo.upsert(storyId, storyEnvironmentId, previous.cacheId);
    logger.info(
      { storyId, storyEnvironmentId, previousStoryId, cacheId: previous.cacheId },
      'Reused environment image from previous story'
    );
    return {
      base64: buffer.toString('base64'),
      mimeType: imageMimeTypeFromPath(cached.storagePath),
      storagePath: cached.storagePath,
    };
  }

  const embedding = await deps.generateEmbedding(cacheDescription);
  const similarCandidates = await envCacheRepo.findSimilarMany(
    embedding,
    deps.similarityThreshold,
    {
      descriptionPrefix: ENVIRONMENT_REFERENCE_CACHE_PREFIX,
    }
  );
  if (similarCandidates.length > 0) {
    const highConfidenceCrossEnvironmentCandidate = similarCandidates.find(
      (candidate) => candidate.score > CROSS_ENVIRONMENT_REUSE_SCORE_EXCLUSIVE
    );
    const selectedCandidate = highConfidenceCrossEnvironmentCandidate;

    if (selectedCandidate) {
      const buffer = await assetStorage.getAssetByPath(selectedCandidate.storagePath);
      await storyEnvRepo.upsert(storyId, storyEnvironmentId, selectedCandidate.id);

      logger.info(
        {
          storyId,
          storyEnvironmentId,
          cacheId: selectedCandidate.id,
          score: selectedCandidate.score.toFixed(3),
          minimumScoreExclusive: CROSS_ENVIRONMENT_REUSE_SCORE_EXCLUSIVE,
        },
        'Reused high-confidence environment cache across stories'
      );
      return {
        base64: buffer.toString('base64'),
        mimeType: imageMimeTypeFromPath(selectedCandidate.storagePath),
        storagePath: selectedCandidate.storagePath,
      };
    }

    const bestCandidate = similarCandidates[0];
    if (bestCandidate) {
      logger.info(
        {
          storyId,
          storyEnvironmentId,
          cacheId: bestCandidate.id,
          score: bestCandidate.score.toFixed(3),
          minimumScoreExclusive: CROSS_ENVIRONMENT_REUSE_SCORE_EXCLUSIVE,
        },
        'Environment cache hit skipped because no high-confidence match was found'
      );
    }
  }

  try {
    const provider = deps.getEnvironmentImageProvider();
    const prompt = buildEnvironmentImagePrompt({ environment, scenarioCardId });
    const systemInstruction = buildImageSystemInstruction({
      style: 'storybook',
      ageGroup: '6-8',
      hasReferences: false,
      hasEnvironmentReference: false,
      scenarioCardId,
    });
    const result = await provider.generateImage({
      prompt,
      aspectRatio: '16:9',
      systemInstruction,
      onUsage: (usage) => deps.recordUsage(usage, { userId: userId ?? null, storyId }),
      operation: USAGE_OP_IMAGE_ENVIRONMENT,
    });

    const buffer = Buffer.isBuffer(result.imageData)
      ? result.imageData
      : Buffer.from(result.imageData as string, 'base64');
    const cacheId = crypto.randomUUID();
    const { storagePath } = await assetStorage.saveEnvironmentCacheImage(
      cacheId,
      buffer,
      result.mimeType
    );

    await envCacheRepo.create({
      id: cacheId,
      description: cacheDescription,
      descriptionEmbedding: embedding,
      storagePath,
      storageUrl: `/api/v1/assets/${storagePath}`,
    });

    await storyEnvRepo.upsert(storyId, storyEnvironmentId, cacheId);

    return {
      base64: buffer.toString('base64'),
      mimeType: result.mimeType,
      storagePath,
    };
  } catch (error) {
    logger.warn({ err: error, storyEnvironmentId }, 'Environment image generation failed');
    return null;
  }
}

export async function getOrCreateEnvironmentImage(
  params: EnvironmentImageRequest
): Promise<EnvImageData | null> {
  return getOrCreateEnvironmentImageCore(params, {
    enabled: config.image.enableEnvironmentReference,
    similarityThreshold: config.image.environmentEmbeddingSimilarityThreshold,
    envCacheRepo: getEnvironmentImageCacheRepository(),
    storyEnvRepo: getStoryEnvironmentCacheRepository(),
    generateEmbedding,
    getEnvironmentImageProvider,
    recordUsage,
  });
}
