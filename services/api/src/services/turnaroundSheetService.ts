/**
 * Turnaround Sheet Service
 * Generates multi-view turnaround model sheets for imaginary characters.
 * Uses a dedicated image provider (gemini-3-pro-image-preview by default)
 * for higher quality, separate from the scene generation provider.
 */

import crypto from 'crypto';
import { getAssetStorageService } from './assetStorageService';
import { recordUsage } from './aiUsageService';
import { generateEmbedding } from './embeddingService';
import { extractFrontFromTurnaround } from './turnaroundFrontExtractor';
import { getCharacterRepository, getChildProfileRepository, getLlmTurnaroundCacheRepository } from '../repositories';
import { NanoBananaProProvider } from '../providers/image/nanobananapro';
import { ImageDomainService } from '../domain/image';
import { logger } from '../utils/logger';
import config from '../config';

// Lazy singleton for turnaround-specific image domain (uses pro model)
let turnaroundImageDomain: ImageDomainService | null = null;

// Lazy singleton for LLM text-only character turnaround (Gemini 2.5 Flash Image)
let llmTurnaroundImageDomain: ImageDomainService | null = null;

function getTurnaroundImageDomain(): ImageDomainService {
  if (!turnaroundImageDomain) {
    const model = config.image.turnaroundModel;
    logger.info({ model }, 'Initializing dedicated turnaround image provider');
    const provider = new NanoBananaProProvider(config.google.apiKey, model);
    turnaroundImageDomain = new ImageDomainService(provider);
  }
  return turnaroundImageDomain;
}

function getLlmTurnaroundImageDomain(): ImageDomainService {
  if (!llmTurnaroundImageDomain) {
    const model = config.image.simpleModel;
    logger.info({ model }, 'Initializing LLM turnaround image provider');
    const provider = new NanoBananaProProvider(config.google.apiKey, model);
    llmTurnaroundImageDomain = new ImageDomainService(provider);
  }
  return llmTurnaroundImageDomain;
}

export interface TurnaroundSheetFromReferenceParams {
  targetType: 'character' | 'child';
  targetId: string;
  referencePhotoUrls: string[];
  characterName: string;
  userId: string;
  storyId?: string;
  aiDescription?: string;
}

export interface TurnaroundSheetFromDescriptionParams {
  targetType: 'child';
  targetId: string;
  characterName: string;
  characterDescription: string;
  userId: string;
}

export interface TurnaroundSheetResult {
  url: string;
  frontUrl?: string;
  frontThumbnailUrl?: string;
  generatedAt: string;
  sourcePhotoUrl: string;
}

async function uploadFrontThumbnail(params: {
  assetStorage: ReturnType<typeof getAssetStorageService>;
  frontBuffer: Buffer;
  userId: string;
  photoType: 'character_front_thumbnail' | 'child_front_thumbnail';
}): Promise<string | undefined> {
  try {
    const thumbnailBuffer = await params.assetStorage.generateAvatarThumbnail(params.frontBuffer);
    const thumbnailUpload = await params.assetStorage.uploadUserPhoto({
      buffer: thumbnailBuffer,
      mimeType: 'image/jpeg',
      userId: params.userId,
      photoType: params.photoType,
    });
    return thumbnailUpload.storagePath;
  } catch (err) {
    logger.warn({ err, photoType: params.photoType }, 'Failed to create front thumbnail');
    return undefined;
  }
}

/**
 * Generate a turnaround model sheet from reference photos.
 * Unified method for both characters and child profiles.
 */
export async function generateTurnaroundSheetFromReference(
  params: TurnaroundSheetFromReferenceParams,
): Promise<TurnaroundSheetResult> {
  const { targetType, targetId, referencePhotoUrls, characterName, userId, storyId, aiDescription } = params;

  const firstUrl = referencePhotoUrls.find(u => u && u.trim());
  if (!firstUrl) {
    throw new Error('At least one reference photo URL is required');
  }

  logger.info({
    targetType,
    targetId,
    characterName,
    hasDescription: !!aiDescription,
  }, 'Starting turnaround sheet generation from reference');

  const assetStorage = getAssetStorageService();
  const storagePath = extractStoragePath(firstUrl);
  const photoBuffer = await assetStorage.getAssetByPath(storagePath);
  const mimeType = guessMimeType(storagePath);

  logger.info({
    targetType,
    targetId,
    photoSize: photoBuffer.length,
    mimeType,
  }, 'Loaded reference for turnaround sheet');

  const imageDomain = getTurnaroundImageDomain();
  const usageContext = targetType === 'character'
    ? { userId, characterId: targetId, storyId }
    : { userId, childProfileId: targetId, storyId };

  const generated = await imageDomain.generateTurnaroundSheet(
    {
      referenceImageBase64: photoBuffer.toString('base64'),
      referenceMimeType: mimeType,
      characterName,
      characterDescription: aiDescription,
    },
    { onUsage: (u) => recordUsage(u, usageContext) }
  );

  const photoType = targetType === 'character' ? 'character_turnaround' as const : 'child_turnaround' as const;
  const frontPhotoType = targetType === 'character' ? 'character_front' as const : 'child_front' as const;
  const frontThumbnailPhotoType =
    targetType === 'character' ? 'character_front_thumbnail' as const : 'child_front_thumbnail' as const;

  const uploadResult = await assetStorage.uploadUserPhoto({
    buffer: generated.imageData,
    mimeType: generated.mimeType,
    userId,
    photoType,
  });

  let frontUrl: string | undefined;
  let frontThumbnailUrl: string | undefined;
  try {
    const frontBuffer = await extractFrontFromTurnaround(generated.imageData);
    if (frontBuffer) {
      const frontUpload = await assetStorage.uploadUserPhoto({
        buffer: frontBuffer,
        mimeType: 'image/png',
        userId,
        photoType: frontPhotoType,
      });
      frontUrl = frontUpload.storagePath;
      frontThumbnailUrl = await uploadFrontThumbnail({
        assetStorage,
        frontBuffer,
        userId,
        photoType: frontThumbnailPhotoType,
      });
    }
  } catch (err) {
    logger.warn({ err, targetType, targetId }, 'Failed to extract front from turnaround, saving without frontUrl');
  }

  const turnaroundSheet: TurnaroundSheetResult = {
    url: uploadResult.storagePath,
    ...(frontUrl && { frontUrl }),
    ...(frontThumbnailUrl && { frontThumbnailUrl }),
    generatedAt: new Date().toISOString(),
    sourcePhotoUrl: firstUrl,
  };

  if (targetType === 'character') {
    await getCharacterRepository().updateTurnaroundSheet(targetId, turnaroundSheet);
  } else {
    await getChildProfileRepository().updateTurnaroundSheet(targetId, turnaroundSheet);
  }

  logger.info({
    targetType,
    targetId,
    turnaroundUrl: turnaroundSheet.url,
  }, 'Turnaround sheet generated and stored successfully');

  return turnaroundSheet;
}

/**
 * Generate a turnaround model sheet for a child profile from text description only (no photos).
 */
export async function generateTurnaroundSheetFromDescription(
  params: TurnaroundSheetFromDescriptionParams,
): Promise<TurnaroundSheetResult> {
  const { targetId, characterName, characterDescription, userId } = params;

  logger.info({
    childId: targetId,
    userId,
    characterName,
    descriptionLength: characterDescription.length,
  }, 'Starting text-only turnaround sheet generation for child');

  const imageDomain = getTurnaroundImageDomain();
  const usageContext = { userId, childProfileId: targetId };

  const generated = await imageDomain.generateTurnaroundSheetFromDescription(
    { characterName, characterDescription },
    { onUsage: (u) => recordUsage(u, usageContext) }
  );

  const assetStorage = getAssetStorageService();
  const uploadResult = await assetStorage.uploadUserPhoto({
    buffer: generated.imageData,
    mimeType: generated.mimeType,
    userId,
    photoType: 'child_turnaround' as const,
  });

  let frontUrl: string | undefined;
  let frontThumbnailUrl: string | undefined;
  try {
    const frontBuffer = await extractFrontFromTurnaround(generated.imageData);
    if (frontBuffer) {
      const frontUpload = await assetStorage.uploadUserPhoto({
        buffer: frontBuffer,
        mimeType: 'image/png',
        userId,
        photoType: 'child_front' as const,
      });
      frontUrl = frontUpload.storagePath;
      frontThumbnailUrl = await uploadFrontThumbnail({
        assetStorage,
        frontBuffer,
        userId,
        photoType: 'child_front_thumbnail',
      });
    }
  } catch (err) {
    logger.warn({ err, childId: targetId }, 'Failed to extract front from turnaround, saving without frontUrl');
  }

  const turnaroundSheet: TurnaroundSheetResult = {
    url: uploadResult.storagePath,
    ...(frontUrl && { frontUrl }),
    ...(frontThumbnailUrl && { frontThumbnailUrl }),
    generatedAt: new Date().toISOString(),
    sourcePhotoUrl: 'text-description',
  };

  await getChildProfileRepository().updateTurnaroundSheet(targetId, turnaroundSheet);

  logger.info({
    childId: targetId,
    characterName,
    turnaroundUrl: turnaroundSheet.url,
  }, 'Child turnaround sheet generated from description');

  return turnaroundSheet;
}

/**
 * Extract storage path from a full or relative URL.
 * Strips protocol + host and the /api/v1/assets/ prefix if present.
 */
function extractStoragePath(url: string): string {
  // Strip query parameters (signed URLs contain ?token=...&expires=...)
  const urlWithoutQuery = url.split('?')[0];
  const urlWithoutProtocol = urlWithoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return urlWithoutProtocol.replace(/^\/api\/v1\/assets\//, '');
}

/**
 * Guess MIME type from file extension in a storage path.
 */
function guessMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  // Default to JPEG (most common for uploaded photos)
  return 'image/jpeg';
}

export interface LlmCharacterTurnaroundParams {
  characterId: string;
  userId: string;
  characterName: string;
  characterDescription: string;
  imageStyle?: string;
  storyId?: string;
  /** When false (user-created from route), skip cache lookup. Default true. */
  useCache?: boolean;
}

/**
 * Generate a turnaround sheet for an LLM-invented character from text description only.
 * No reference image needed — the model creates the character from the description.
 * Uses embedding cache: if similar description exists (95% threshold), reuse instead of generating.
 */
export async function generateLlmCharacterTurnaround(
  params: LlmCharacterTurnaroundParams,
): Promise<TurnaroundSheetResult> {
  const { characterId, userId, characterName, characterDescription, imageStyle, storyId, useCache = true } = params;

  logger.info({
    characterId,
    userId,
    characterName,
    descriptionLength: characterDescription.length,
    imageStyle,
    useCache,
  }, 'Starting text-only turnaround sheet generation for LLM character');

  const assetStorage = getAssetStorageService();
  const characterRepo = getCharacterRepository();

  // 1. Cache lookup (only when useCache !== false)
  if (useCache && characterDescription.trim().length > 0) {
    try {
      const embedding = await generateEmbedding(characterDescription);
      const threshold = config.image.llmTurnaroundEmbeddingSimilarityThreshold;
      const similar = await getLlmTurnaroundCacheRepository().findSimilar(embedding, threshold);

      if (similar) {
        const turnaroundSheet: TurnaroundSheetResult = {
          url: similar.storagePath,
          ...(similar.frontStoragePath && { frontUrl: similar.frontStoragePath }),
          generatedAt: new Date().toISOString(),
          sourcePhotoUrl: 'cache',
        };
        await characterRepo.updateTurnaroundSheet(characterId, turnaroundSheet);
        logger.info({
          characterId,
          characterName,
          cacheId: similar.id,
          score: similar.score.toFixed(3),
        }, 'LLM turnaround reused from cache');
        return turnaroundSheet;
      }
    } catch (err) {
      logger.warn({ err, characterId }, 'Cache lookup failed, falling back to generation');
    }
  }

  // 2. Generate new turnaround (text-only LLM characters: Flash Image, not photo-reference turnaround model)
  const imageDomain = getLlmTurnaroundImageDomain();
  const usageContext = { userId, characterId, storyId };
  const generated = await imageDomain.generateTurnaroundSheetFromDescription(
    {
      characterName,
      characterDescription,
      imageStyle,
    },
    { onUsage: (u) => recordUsage(u, usageContext) }
  );

  const buffer = Buffer.isBuffer(generated.imageData)
    ? generated.imageData
    : Buffer.from(generated.imageData as string, 'base64');
  const cacheId = crypto.randomUUID();

  const { storagePath } = await assetStorage.saveLlmTurnaroundCacheImage(
    cacheId,
    buffer,
    generated.mimeType
  );

  let frontStoragePath: string | undefined;
  let frontThumbnailStoragePath: string | undefined;
  try {
    const frontBuffer = await extractFrontFromTurnaround(generated.imageData);
    if (frontBuffer) {
      const frontResult = await assetStorage.saveLlmTurnaroundCacheImage(
        cacheId,
        frontBuffer,
        'image/png',
        '_front'
      );
      frontStoragePath = frontResult.storagePath;
      frontThumbnailStoragePath = await uploadFrontThumbnail({
        assetStorage,
        frontBuffer,
        userId,
        photoType: 'character_front_thumbnail',
      });
    }
  } catch (err) {
    logger.warn({ err, characterId }, 'Failed to extract front from turnaround, saving without frontUrl');
  }

  const embedding = await generateEmbedding(characterDescription).catch(() => null);
  if (embedding) {
    await getLlmTurnaroundCacheRepository().create({
      id: cacheId,
      description: characterDescription,
      descriptionEmbedding: embedding,
      storagePath,
      frontStoragePath: frontStoragePath ?? null,
    });
  }

  const turnaroundSheet: TurnaroundSheetResult = {
    url: storagePath,
    ...(frontStoragePath && { frontUrl: frontStoragePath }),
    ...(frontThumbnailStoragePath && { frontThumbnailUrl: frontThumbnailStoragePath }),
    generatedAt: new Date().toISOString(),
    sourcePhotoUrl: 'text-description',
  };
  await characterRepo.updateTurnaroundSheet(characterId, turnaroundSheet);

  logger.info({
    characterId,
    characterName,
    turnaroundUrl: turnaroundSheet.url,
  }, 'LLM character turnaround sheet generated and stored');

  return turnaroundSheet;
}

/**
 * Check whether turnaround sheet generation is enabled via feature flag.
 */
export function isTurnaroundSheetEnabled(): boolean {
  return config.image.enableTurnaroundSheet;
}
