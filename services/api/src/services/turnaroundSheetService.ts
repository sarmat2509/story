/**
 * Turnaround Sheet Service
 * Generates multi-view turnaround model sheets for imaginary characters.
 * Uses a dedicated image provider (gemini-3-pro-image-preview by default)
 * for higher quality, separate from the scene generation provider.
 */

import { getAssetStorageService } from './assetStorageService';
import { recordUsage } from './aiUsageService';
import { getCharacterRepository, getChildProfileRepository } from '../repositories';
import { NanoBananaProProvider } from '../providers/image/nanobananapro';
import { Imagen4FastProvider } from '../providers/image/gemini/Imagen4FastProvider';
import { ImageDomainService } from '../domain/image';
import { logger } from '../utils/logger';
import config from '../config';

// Lazy singleton for turnaround-specific image domain (uses pro model)
let turnaroundImageDomain: ImageDomainService | null = null;

// Lazy singleton for LLM character turnaround (Imagen 4 Fast — text-to-image, $0.02)
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
    logger.info('Initializing LLM turnaround image provider (Imagen 4 Fast)');
    const provider = new Imagen4FastProvider();
    llmTurnaroundImageDomain = new ImageDomainService(provider);
  }
  return llmTurnaroundImageDomain;
}

export interface TurnaroundSheetParams {
  characterId: string;
  userId: string;
  referencePhotoUrl: string; // Storage path to the child's drawing
  characterName: string;
  aiDescription?: string; // From Gemini Vision analysis
  storyId?: string;
}

export interface TurnaroundSheetResult {
  url: string;
  generatedAt: string;
  sourcePhotoUrl: string;
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
 * Generate a turnaround model sheet for an imaginary character.
 *
 * 1. Loads the child's drawing from asset storage
 * 2. Calls ImageDomainService.generateTurnaroundSheet()
 * 3. Uploads the result via assetStorage.uploadUserPhoto()
 * 4. Updates the character record with turnaroundSheet metadata
 */
export async function generateTurnaroundSheet(
  params: TurnaroundSheetParams,
): Promise<TurnaroundSheetResult> {
  const { characterId, userId, referencePhotoUrl, characterName, aiDescription, storyId } = params;

  logger.info({
    characterId,
    userId,
    characterName,
    referencePhotoUrl,
    hasDescription: !!aiDescription,
  }, 'Starting turnaround sheet generation');

  // 1. Load the child's original drawing
  const assetStorage = getAssetStorageService();
  const storagePath = extractStoragePath(referencePhotoUrl);
  const drawingBuffer = await assetStorage.getAssetByPath(storagePath);

  // Determine mime type from the storage path
  const mimeType = guessMimeType(storagePath);

  logger.info({
    characterId,
    drawingSize: drawingBuffer.length,
    mimeType,
  }, 'Loaded reference drawing for turnaround sheet');

  // 2. Generate the turnaround sheet via dedicated pro model provider
  const imageDomain = getTurnaroundImageDomain();
  const usageContext = { userId, characterId, storyId };
  const generated = await imageDomain.generateTurnaroundSheet(
    {
      referenceImageBase64: drawingBuffer.toString('base64'),
      referenceMimeType: mimeType,
      characterName,
      characterDescription: aiDescription,
    },
    { onUsage: (u) => recordUsage(u, usageContext) }
  );

  // 3. Upload the turnaround sheet
  const uploadResult = await assetStorage.uploadUserPhoto({
    buffer: generated.imageData,
    mimeType: generated.mimeType,
    userId,
    photoType: 'character_turnaround' as const,
  });

  const turnaroundSheet: TurnaroundSheetResult = {
    url: uploadResult.storagePath,
    generatedAt: new Date().toISOString(),
    sourcePhotoUrl: referencePhotoUrl,
  };

  // 4. Persist in the characters table
  const characterRepo = getCharacterRepository();
  await characterRepo.updateTurnaroundSheet(characterId, turnaroundSheet);

  logger.info({
    characterId,
    characterName,
    turnaroundUrl: turnaroundSheet.url,
  }, 'Turnaround sheet generated and stored successfully');

  return turnaroundSheet;
}

export interface ChildTurnaroundSheetParams {
  childId: string;
  userId: string;
  referencePhotoUrl: string; // Storage path to the child's photo
  childName: string;
  aiDescription?: string; // From Gemini Vision analysis
  storyId?: string;
}

/**
 * Generate a turnaround model sheet for a child profile.
 *
 * 1. Loads the child's photo from asset storage
 * 2. Calls ImageDomainService.generateTurnaroundSheet()
 * 3. Uploads the result via assetStorage.uploadUserPhoto()
 * 4. Updates the child_profiles record with turnaroundSheet metadata
 */
export async function generateChildTurnaroundSheet(
  params: ChildTurnaroundSheetParams,
): Promise<TurnaroundSheetResult> {
  const { childId, userId, referencePhotoUrl, childName, aiDescription, storyId } = params;

  logger.info({
    childId,
    userId,
    childName,
    referencePhotoUrl,
    hasDescription: !!aiDescription,
  }, 'Starting child turnaround sheet generation');

  // 1. Load the child's photo
  const assetStorage = getAssetStorageService();
  const storagePath = extractStoragePath(referencePhotoUrl);
  const photoBuffer = await assetStorage.getAssetByPath(storagePath);

  const mimeType = guessMimeType(storagePath);

  logger.info({
    childId,
    photoSize: photoBuffer.length,
    mimeType,
  }, 'Loaded reference photo for child turnaround sheet');

  // 2. Generate the turnaround sheet via dedicated pro model provider
  const imageDomain = getTurnaroundImageDomain();
  const usageContext = { userId, childProfileId: childId, storyId };
  const generated = await imageDomain.generateTurnaroundSheet(
    {
      referenceImageBase64: photoBuffer.toString('base64'),
      referenceMimeType: mimeType,
      characterName: childName,
      characterDescription: aiDescription,
    },
    { onUsage: (u) => recordUsage(u, usageContext) }
  );

  // 3. Upload the turnaround sheet
  const uploadResult = await assetStorage.uploadUserPhoto({
    buffer: generated.imageData,
    mimeType: generated.mimeType,
    userId,
    photoType: 'child_turnaround' as const,
  });

  const turnaroundSheet: TurnaroundSheetResult = {
    url: uploadResult.storagePath,
    generatedAt: new Date().toISOString(),
    sourcePhotoUrl: referencePhotoUrl,
  };

  // 4. Persist in the child_profiles table
  const childProfileRepo = getChildProfileRepository();
  await childProfileRepo.updateTurnaroundSheet(childId, turnaroundSheet);

  logger.info({
    childId,
    childName,
    turnaroundUrl: turnaroundSheet.url,
  }, 'Child turnaround sheet generated and stored successfully');

  return turnaroundSheet;
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
}

/**
 * Generate a turnaround sheet for an LLM-invented character from text description only.
 * No reference image needed — the model creates the character from the description.
 */
export async function generateLlmCharacterTurnaround(
  params: LlmCharacterTurnaroundParams,
): Promise<TurnaroundSheetResult> {
  const { characterId, userId, characterName, characterDescription, imageStyle, storyId } = params;

  logger.info({
    characterId,
    userId,
    characterName,
    descriptionLength: characterDescription.length,
    imageStyle,
  }, 'Starting text-only turnaround sheet generation for LLM character');

  const imageDomain = config.image.llmTurnaroundUseImagen4Fast
    ? getLlmTurnaroundImageDomain()
    : getTurnaroundImageDomain();
  const usageContext = { userId, characterId, storyId };
  const generated = await imageDomain.generateTurnaroundSheetFromDescription(
    {
      characterName,
      characterDescription,
      imageStyle,
    },
    { onUsage: (u) => recordUsage(u, usageContext) }
  );

  const assetStorage = getAssetStorageService();
  const uploadResult = await assetStorage.uploadUserPhoto({
    buffer: generated.imageData,
    mimeType: generated.mimeType,
    userId,
    photoType: 'character_turnaround' as const,
  });

  const turnaroundSheet: TurnaroundSheetResult = {
    url: uploadResult.storagePath,
    generatedAt: new Date().toISOString(),
    sourcePhotoUrl: 'text-description',
  };

  const characterRepo = getCharacterRepository();
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
