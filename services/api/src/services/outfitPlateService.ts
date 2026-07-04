import crypto from 'crypto';
import {
  stripCharacterIdFromName,
  isHumanType,
  type CharacterData,
  type CharacterType,
} from '@wondertales/shared';
import { config } from '../config';
import { logger } from '../utils/logger';
import { buildOutfitPlatePrompt } from '../prompts/image/ImagePrompts';
import { generateEmbedding } from './embeddingService';
import { getEnvironmentImageProvider } from './aiService';
import { recordUsage, USAGE_OP_IMAGE_OUTFIT_PLATE } from './aiUsageService';
import {
  getOutfitPlateCacheRepository,
  getStoryOutfitPlateCacheRepository,
} from '../repositories';
import type { AssetStorageService } from './assetStorageService';
import { imageMimeTypeFromPath } from '../utils/imageMimeType';

export function normalizeOutfitPlateCharacterKey(characterName: string): string {
  return stripCharacterIdFromName(characterName).trim().toLowerCase();
}

/**
 * Outfit plates (mannequin + garment) are only generated for human cast:
 * child profile (`child`) and user-provided humans (`person`). LLM-generated
 * characters already have a full default turnaround design, so they keep
 * turnaround-only consistency unless a future flow creates a dedicated visual
 * wardrobe reference. Animals and imaginary characters also stay on references.
 */
export function shouldGenerateOutfitPlateForCharacter(char: CharacterData | undefined): boolean {
  if (!char?.type || typeof char.type !== 'string') return false;
  if ((char as any).source === 'llm_generated') return false;
  if (char.type === 'child') return true;
  return isHumanType(char.type as CharacterType);
}

function findCharacterDataForOutfitKey(
  outfitKey: string,
  characters: CharacterData[],
): CharacterData | undefined {
  const k = stripCharacterIdFromName(outfitKey).trim().toLowerCase();
  for (const c of characters) {
    if (!c?.name) continue;
    const cn = stripCharacterIdFromName(c.name).trim().toLowerCase();
    if (cn === k) return c;
    if (c.name.trim().toLowerCase() === outfitKey.trim().toLowerCase()) return c;
  }
  return undefined;
}

/**
 * Wardrobe prose in scene image prompts (and validation expectations) applies only to humans
 * (child / person). Imaginary creatures and animals stay on turnaround or reference — we still
 * store outfitId in JSON for Director consistency, but do not pass garment text into the model.
 * Keys whose character is unknown in `characters` are kept (assume human cast from LLM).
 */
export function omitOutfitProseForNonHumanCharacters(
  outfits: Record<string, string> | undefined,
  characters: CharacterData[],
): Record<string, string> | undefined {
  if (!outfits || Object.keys(outfits).length === 0) return outfits;
  const out: Record<string, string> = { ...outfits };
  for (const key of Object.keys(out)) {
    const char = findCharacterDataForOutfitKey(key, characters);
    if (char && !shouldGenerateOutfitPlateForCharacter(char)) {
      delete out[key];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sceneCharacterHasVisualReference(
  characterName: string,
  characterReferenceData: Array<{ characterName?: string; type?: string }>,
): boolean {
  const t = stripCharacterIdFromName(characterName).trim().toLowerCase();
  return characterReferenceData.some((r) => {
    if (!r.characterName) return false;
    const rt = stripCharacterIdFromName(r.characterName).trim().toLowerCase();
    if (rt !== t) return false;
    return (
      r.type === 'imaginary' ||
      r.type === 'child_reference' ||
      r.type === 'character_reference'
    );
  });
}

/**
 * Load or generate an outfit plate image (Gemini Flash Image), with global + per-story cache.
 */
export async function getOrCreateOutfitPlateImage(params: {
  storyId: string;
  userId?: string | null;
  storyEnvironmentId: string;
  characterName: string;
  outfitTextRaw: string;
  /** When set, per-story cache key includes this id so one character can have multiple plates in the same environment. */
  outfitId?: string | null;
  imageStyle: string;
  ageGroup: string;
  scenarioCardId?: string;
  assetStorage: AssetStorageService;
}): Promise<{
  base64: string;
  mimeType: string;
  storagePath: string;
  fileUri?: string;
} | null> {
  const characterKey = normalizeOutfitPlateCharacterKey(params.characterName);
  const storyPlateKey =
    params.outfitId?.trim() ? `${characterKey}::${params.outfitId.trim()}` : characterKey;
  const outfitRepo = getOutfitPlateCacheRepository();
  const storyRepo = getStoryOutfitPlateCacheRepository();
  const threshold = config.image.outfitPlateEmbeddingSimilarityThreshold;

  const existingStory = await storyRepo.getByStoryEnvAndCharacter(
    params.storyId,
    params.storyEnvironmentId,
    storyPlateKey,
  );
  if (existingStory) {
    const cached = await outfitRepo.getById(existingStory.cacheId);
    if (cached) {
      const buffer = await params.assetStorage.getAssetByPath(cached.storagePath);
      return {
        base64: buffer.toString('base64'),
        mimeType: imageMimeTypeFromPath(cached.storagePath),
        storagePath: cached.storagePath,
      };
    }
  }

  const canonicalText = [
    params.outfitId?.trim() ?? '',
    params.outfitTextRaw.trim(),
    params.imageStyle,
    params.ageGroup,
  ].join(' | ');

  const embedding = await generateEmbedding(canonicalText);
  const similar = await outfitRepo.findSimilar(embedding, threshold);
  if (similar) {
    const buffer = await params.assetStorage.getAssetByPath(similar.storagePath);
    await storyRepo.upsert(
      params.storyId,
      params.storyEnvironmentId,
      storyPlateKey,
      similar.id,
    );
    return {
      base64: buffer.toString('base64'),
      mimeType: imageMimeTypeFromPath(similar.storagePath),
      storagePath: similar.storagePath,
    };
  }

  try {
    const envProvider = getEnvironmentImageProvider();
    const prompt = buildOutfitPlatePrompt({
      outfitDescription: params.outfitTextRaw.trim(),
      imageStyle: params.imageStyle,
      ageGroup: params.ageGroup,
      scenarioCardId: params.scenarioCardId,
    });
    const usageContext = { userId: params.userId ?? null, storyId: params.storyId };
    const result = await envProvider.generateImage({
      prompt,
      // 1:1 reduces wide multi-panel / "four variants in a row" layouts vs 16:9
      aspectRatio: '1:1',
      onUsage: (u) => recordUsage(u, usageContext),
      operation: USAGE_OP_IMAGE_OUTFIT_PLATE,
    });

    const buffer = Buffer.isBuffer(result.imageData)
      ? result.imageData
      : Buffer.from(result.imageData as string, 'base64');
    const cacheId = crypto.randomUUID();
    const { storagePath } = await params.assetStorage.saveOutfitPlateCacheImage(
      cacheId,
      buffer,
      result.mimeType,
    );

    await outfitRepo.create({
      id: cacheId,
      outfitText: params.outfitTextRaw.trim(),
      descriptionEmbedding: embedding,
      imageStyle: params.imageStyle,
      ageGroup: params.ageGroup,
      storagePath,
      storageUrl: `/api/v1/assets/${storagePath}`,
    });

    await storyRepo.upsert(params.storyId, params.storyEnvironmentId, storyPlateKey, cacheId);

    return {
      base64: buffer.toString('base64'),
      mimeType: result.mimeType,
      storagePath,
    };
  } catch (err) {
    logger.warn(
      { err, characterKey: storyPlateKey, storyId: params.storyId },
      'Outfit plate generation failed',
    );
    return null;
  }
}
