import crypto from 'crypto';
import type { StoryEnvironment } from '../ai/types';
import { config } from '../config';
import {
  getEnvironmentImageCacheRepository,
  getStoryEnvironmentCacheRepository,
} from '../repositories';
import { buildEnvironmentImagePrompt } from '../prompts/image';
import { USAGE_OP_IMAGE_ENVIRONMENT, recordUsage } from './aiUsageService';
import { getEnvironmentImageProvider } from './aiService';
import type { getAssetStorageService } from './assetStorageService';
import { generateEmbedding } from './embeddingService';
import { logger } from '../utils/logger';

export interface EnvImageData {
  base64: string;
  mimeType: string;
  fileUri?: string;
  storagePath: string;
}

export async function getOrCreateEnvironmentImage(params: {
  storyId: string;
  userId?: string;
  storyEnvironmentId: string;
  environment: StoryEnvironment;
  assetStorage: ReturnType<typeof getAssetStorageService>;
  scenarioCardId?: string;
  previousStoryIds?: string[];
}): Promise<EnvImageData | null> {
  if (!config.image.enableEnvironmentReference) return null;

  const {
    storyId,
    userId,
    storyEnvironmentId,
    environment,
    assetStorage,
    scenarioCardId,
    previousStoryIds,
  } = params;
  const envCacheRepo = getEnvironmentImageCacheRepository();
  const storyEnvRepo = getStoryEnvironmentCacheRepository();
  const threshold = config.image.environmentEmbeddingSimilarityThreshold;

  const existing = await storyEnvRepo.getByStoryAndEnvId(storyId, storyEnvironmentId);
  if (existing) {
    const cached = await envCacheRepo.getById(existing.cacheId);
    if (cached) {
      const buffer = await assetStorage.getAssetByPath(cached.storagePath);
      return {
        base64: buffer.toString('base64'),
        mimeType: 'image/png',
        storagePath: cached.storagePath,
      };
    }
  }

  for (const previousStoryId of previousStoryIds ?? []) {
    const previous = await storyEnvRepo.getByStoryAndEnvId(previousStoryId, storyEnvironmentId);
    if (!previous) continue;
    const cached = await envCacheRepo.getById(previous.cacheId);
    if (!cached) continue;

    const buffer = await assetStorage.getAssetByPath(cached.storagePath);
    await storyEnvRepo.upsert(storyId, storyEnvironmentId, previous.cacheId);
    logger.info(
      { storyId, storyEnvironmentId, previousStoryId, cacheId: previous.cacheId },
      'Reused environment image from previous story'
    );
    return {
      base64: buffer.toString('base64'),
      mimeType: 'image/png',
      storagePath: cached.storagePath,
    };
  }

  const embedding = await generateEmbedding(environment.description);
  const similar = await envCacheRepo.findSimilar(embedding, threshold);
  if (similar) {
    const buffer = await assetStorage.getAssetByPath(similar.storagePath);
    await storyEnvRepo.upsert(storyId, storyEnvironmentId, similar.id);
    return {
      base64: buffer.toString('base64'),
      mimeType: 'image/png',
      storagePath: similar.storagePath,
    };
  }

  try {
    const provider = getEnvironmentImageProvider();
    const prompt = buildEnvironmentImagePrompt({ environment, scenarioCardId });
    const result = await provider.generateImage({
      prompt,
      aspectRatio: '16:9',
      onUsage: (usage) => recordUsage(usage, { userId: userId ?? null, storyId }),
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
      description: environment.description,
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
