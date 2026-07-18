import crypto from 'crypto';
import {
  stripCharacterIdFromName,
  isHumanType,
  type CharacterData,
  type CharacterType,
} from '@wondertales/shared';
import { config } from '../config';
import { logger } from '../utils/logger';
import { cosineSimilarity, generateEmbedding } from './embeddingService';
import { getEnvironmentImageProvider } from './aiService';
import {
  recordUsage,
  USAGE_OP_IMAGE_CHARACTER_OUTFIT_TURNAROUND,
} from './aiUsageService';
import {
  getCharacterOutfitTurnaroundCacheRepository,
  getOutfitPlateCacheRepository,
  getStoryOutfitPlateCacheRepository,
} from '../repositories';
import type { AssetStorageService } from './assetStorageService';
import { imageMimeTypeFromPath } from '../utils/imageMimeType';
import type { ReferenceImage } from '../providers/base/IImageProvider';
import { isNaturalAppearanceOutfit } from '../utils/characterOutfits';
import { inferOutfitCatalogFilters } from './outfitCatalogTags';
import { referenceBindingIdFor } from './referenceBinding';
import { NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE } from '../prompts/image';

export type OutfitPlateImageResult =
  | {
      useDefaultOutfit?: false;
      base64: string;
      mimeType: string;
      storagePath: string;
      fileUri?: string;
    }
  | {
      useDefaultOutfit: true;
      defaultOutfitScore: number;
      catalogScore?: number;
      catalogCacheId?: string;
    };

export function isDefaultOutfitPlateSelection(
  result: OutfitPlateImageResult | null | undefined,
): result is Extract<OutfitPlateImageResult, { useDefaultOutfit: true }> {
  return !!result && result.useDefaultOutfit === true;
}

export function normalizeOutfitPlateCharacterKey(characterName: string): string {
  return stripCharacterIdFromName(characterName).trim().toLowerCase();
}

export function normalizeOutfitRequestText(outfitText: string | undefined | null): string {
  return String(outfitText || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function requestedOutfitTextMatches(
  cachedRequestedOutfitText: string | undefined | null,
  currentOutfitText: string | undefined | null,
): boolean {
  const cached = normalizeOutfitRequestText(cachedRequestedOutfitText);
  const current = normalizeOutfitRequestText(currentOutfitText);
  return cached.length > 0 && current.length > 0 && cached === current;
}

export function outfitPlateEmbeddingSimilarity(
  requestedEmbedding: number[] | null | undefined,
  cachedEmbedding: number[] | null | undefined,
): number | null {
  if (!Array.isArray(requestedEmbedding) || !Array.isArray(cachedEmbedding)) return null;
  if (requestedEmbedding.length === 0 || requestedEmbedding.length !== cachedEmbedding.length) {
    return null;
  }
  return cosineSimilarity(requestedEmbedding, cachedEmbedding);
}

export function isPregeneratedOutfitPlateCatalogSource(
  catalogSource: string | undefined | null,
): boolean {
  return String(catalogSource || '').trim().endsWith(':planned');
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

export function isDefaultTurnaroundOutfit(
  outfitText: string | undefined | null,
  outfitId?: string | null,
): boolean {
  if (isNaturalAppearanceOutfit(outfitText)) return true;
  const normalizedText = String(outfitText || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '');
  const normalizedId = String(outfitId || '').trim().toLowerCase();
  const defaultTokens = new Set([
    'default',
    'defaults',
    'same',
    'same outfit',
    'same clothes',
    'current',
    'current outfit',
    'usual',
    'usual outfit',
    'canonical',
    'canonical outfit',
    'natural',
    'natural appearance',
  ]);
  return defaultTokens.has(normalizedText) || defaultTokens.has(normalizedId);
}

function findCharacterDataForOutfitKey(
  outfitKey: string,
  characters: CharacterData[],
): CharacterData | undefined {
  const k = stripCharacterIdFromName(outfitKey).trim().toLowerCase();
  for (const c of characters) {
    if (!c?.name) continue;
    const names = [
      c.name,
      (c as any).canonicalName,
      ...(((c as any).nameAliases || []) as string[]),
    ];
    for (const name of names) {
      if (!name) continue;
      const cn = stripCharacterIdFromName(name).trim().toLowerCase();
      if (cn === k) return c;
      if (name.trim().toLowerCase() === outfitKey.trim().toLowerCase()) return c;
    }
  }
  return undefined;
}

/**
 * Wardrobe prose in scene image prompts (and validation expectations) applies only to humans
 * (child / person). Imaginary creatures and animals stay on turnaround or reference — we still
 * store outfitId in JSON for Director consistency, but do not pass garment text into the model.
 * Unknown keys are removed: scene wardrobe is now applied only to selected user humans.
 */
export function omitOutfitProseForNonHumanCharacters(
  outfits: Record<string, string> | undefined,
  characters: CharacterData[],
): Record<string, string> | undefined {
  if (!outfits || Object.keys(outfits).length === 0) return outfits;
  const out: Record<string, string> = { ...outfits };
  for (const key of Object.keys(out)) {
    const char = findCharacterDataForOutfitKey(key, characters);
    if (!char || !shouldGenerateOutfitPlateForCharacter(char)) {
      delete out[key];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function omitOutfitProseForDefaultOutfitCharacters(
  outfits: Record<string, string> | undefined,
  defaultOutfitCharacterKeys?: Set<string>,
): Record<string, string> | undefined {
  if (!outfits || !defaultOutfitCharacterKeys || defaultOutfitCharacterKeys.size === 0) {
    return outfits;
  }
  const out: Record<string, string> = { ...outfits };
  for (const key of Object.keys(out)) {
    const normalized = normalizeOutfitPlateCharacterKey(key);
    if (defaultOutfitCharacterKeys.has(normalized)) {
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
      r.type === 'character_reference' ||
      r.type === 'dressed_turnaround_reference'
    );
  });
}

function dressedTurnaroundHash(params: {
  characterId: string;
  outfitPlateStoragePath: string;
}): string {
  return crypto
    .createHash('sha256')
    .update([params.characterId, params.outfitPlateStoragePath].join('\x1f'))
    .digest('hex');
}

export function buildCharacterOutfitTurnaroundPrompt(params: {
  characterName: string;
  imageStyle: string;
  ageGroup: string;
}): string {
  return [
    `Create a clean character turnaround sheet for ${params.characterName} wearing the outfit from Image 2.`,
    '',
    'Inputs:',
    `- Image 1 is the locked identity turnaround for ${params.characterName}. Keep the same face, hair, age read, body proportions, silhouette, palette, and distinctive marks.`,
    '- Image 2 is wardrobe only. Use it for garments, shoes, and all worn accessories.',
    '',
    'Turnaround requirements:',
    '- Keep the same projection count and projection layout as Image 1.',
    '- For every projection, keep the same pose, position, body orientation, head orientation, leg orientation, and foot orientation as the matching projection in Image 1.',
    '- Wearable accessories from Image 2 must appear on every projection where they would be visible.',
    '- Do not change the character into a mannequin or into the model from Image 2.',
    '- Plain white background. No scenery. Existing view labels from Image 1 may remain if already present.',
    '',
    `Style: ${params.imageStyle}. Age group: ${params.ageGroup}.`,
  ].join('\n');
}

export function shouldKeepDefaultOutfitForScene(params: {
  defaultScore: number | null | undefined;
  catalogScore: number | null | undefined;
  tolerance: number;
}): boolean {
  const defaultScore =
    typeof params.defaultScore === 'number' && Number.isFinite(params.defaultScore)
      ? params.defaultScore
      : null;
  if (defaultScore === null) return false;
  const catalogScore =
    typeof params.catalogScore === 'number' && Number.isFinite(params.catalogScore)
      ? params.catalogScore
      : null;
  if (catalogScore === null) return true;
  return defaultScore + Math.max(0, params.tolerance) >= catalogScore;
}

export async function getOrCreateCharacterOutfitTurnaroundImage(params: {
  characterId: string;
  characterName: string;
  outfitTextRaw: string;
  outfitId?: string | null;
  outfitPlateStoragePath: string;
  identityReference: ReferenceImage;
  outfitPlateReference: ReferenceImage;
  imageStyle: string;
  ageGroup: string;
  userId?: string | null;
  storyId?: string | null;
  assetStorage: AssetStorageService;
}): Promise<{
  base64: string;
  mimeType: string;
  storagePath: string;
  fileUri?: string;
} | null> {
  const outfitHash = dressedTurnaroundHash({
    characterId: params.characterId,
    outfitPlateStoragePath: params.outfitPlateStoragePath,
  });
  const repo = getCharacterOutfitTurnaroundCacheRepository();

  const cached = await repo.findByCharacterAndOutfit({
    characterId: params.characterId,
    outfitHash,
    imageStyle: params.imageStyle,
    ageGroup: params.ageGroup,
  });
  if (cached) {
    const buffer = await params.assetStorage.getAssetByPath(cached.storagePath);
    logger.info(
      {
        characterId: params.characterId,
        characterName: params.characterName,
        outfitId: params.outfitId,
        cacheId: cached.id,
      },
      'Character outfit turnaround cache hit',
    );
    return {
      base64: buffer.toString('base64'),
      mimeType: imageMimeTypeFromPath(cached.storagePath),
      storagePath: cached.storagePath,
    };
  }

  try {
    const provider = getEnvironmentImageProvider();
    const prompt = buildCharacterOutfitTurnaroundPrompt({
      characterName: params.characterName,
      imageStyle: params.imageStyle,
      ageGroup: params.ageGroup,
    });
    const usageContext = {
      userId: params.userId ?? null,
      storyId: params.storyId ?? null,
      characterId: params.characterId,
    };
    const identityReferenceBindingId = referenceBindingIdFor({
      ...params.identityReference,
      referenceKind: 'character',
      source: 'character_outfit_turnaround',
      characterName: params.characterName,
    });
    const outfitReferenceBindingId = referenceBindingIdFor({
      ...params.outfitPlateReference,
      referenceKind: 'object',
      source: 'outfit_plate',
      type: 'outfit_plate_reference',
      characterName: params.characterName,
    });
    const result = await provider.generateImage({
      prompt,
      aspectRatio: '16:9',
      systemInstruction: NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE,
      referenceImages: [
        {
          ...params.identityReference,
          referenceKind: 'character',
          characterName: params.characterName,
          referenceBindingId: identityReferenceBindingId,
          instructionText: `${identityReferenceBindingId}: locked identity turnaround.`,
        },
        {
          ...params.outfitPlateReference,
          referenceKind: 'object',
          characterName: params.characterName,
          referenceBindingId: outfitReferenceBindingId,
          instructionText: `${outfitReferenceBindingId}: wardrobe-only outfit reference.`,
        },
      ],
      onUsage: (u) => recordUsage(u, usageContext),
      operation: USAGE_OP_IMAGE_CHARACTER_OUTFIT_TURNAROUND,
    });

    const buffer = Buffer.isBuffer(result.imageData)
      ? result.imageData
      : Buffer.from(result.imageData as string, 'base64');
    const cacheId = crypto.randomUUID();
    const { storagePath, storageUrl } =
      await params.assetStorage.saveCharacterOutfitTurnaroundCacheImage(
        cacheId,
        buffer,
        result.mimeType,
      );

    await repo.create({
      id: cacheId,
      characterId: params.characterId,
      outfitId: params.outfitId ?? null,
      outfitHash,
      outfitText: params.outfitTextRaw.trim(),
      outfitPlateStoragePath: params.outfitPlateStoragePath ?? null,
      imageStyle: params.imageStyle,
      ageGroup: params.ageGroup,
      storagePath,
      storageUrl,
    });

    logger.info(
      {
        characterId: params.characterId,
        characterName: params.characterName,
        outfitId: params.outfitId,
        storagePath,
      },
      'Character outfit turnaround generated and cached',
    );

    return {
      base64: buffer.toString('base64'),
      mimeType: result.mimeType,
      storagePath,
    };
  } catch (err) {
    logger.warn(
      {
        err,
        characterId: params.characterId,
        characterName: params.characterName,
        outfitId: params.outfitId,
      },
      'Character outfit turnaround generation failed',
    );
    return null;
  }
}

/**
 * Load an outfit plate image from the pregenerated catalog, with per-story cache.
 * This intentionally does not generate outfit plates at story/scene runtime.
 */
export async function getCatalogOutfitPlateImage(params: {
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
  defaultOutfitText?: string | null;
  defaultOutfitEmbedding?: number[] | null;
}): Promise<OutfitPlateImageResult | null> {
  const characterKey = normalizeOutfitPlateCharacterKey(params.characterName);
  const storyPlateKey =
    params.outfitId?.trim() ? `${characterKey}::${params.outfitId.trim()}` : characterKey;
  const outfitRepo = getOutfitPlateCacheRepository();
  const storyRepo = getStoryOutfitPlateCacheRepository();
  const staleCacheIds: string[] = [];
  let catalogEmbedding: number[] | null = null;
  const getCatalogEmbedding = async () => {
    if (!catalogEmbedding) {
      catalogEmbedding = await generateEmbedding(params.outfitTextRaw.trim());
    }
    return catalogEmbedding;
  };

  const existingStory = await storyRepo.getByStoryEnvAndCharacter(
    params.storyId,
    params.storyEnvironmentId,
    storyPlateKey,
  );
  if (existingStory) {
    const cached = await outfitRepo.getById(existingStory.cacheId);
    if (cached) {
      const isPregeneratedCatalogPlate = isPregeneratedOutfitPlateCatalogSource(
        cached.catalogSource,
      );
      const exactRequestedTextMatch = requestedOutfitTextMatches(
        existingStory.requestedOutfitText,
        params.outfitTextRaw,
      );
      if (isPregeneratedCatalogPlate && exactRequestedTextMatch) {
        const buffer = await params.assetStorage.getAssetByPath(cached.storagePath);
        return {
          base64: buffer.toString('base64'),
          mimeType: imageMimeTypeFromPath(cached.storagePath),
          storagePath: cached.storagePath,
        };
      }

      const embedding = await getCatalogEmbedding();
      const legacySimilarity =
        existingStory.requestedOutfitText == null
          ? outfitPlateEmbeddingSimilarity(embedding, cached.descriptionEmbedding as number[])
          : null;
      const legacyEmbeddingMatch =
        isPregeneratedCatalogPlate &&
        legacySimilarity != null &&
        legacySimilarity >= config.image.outfitPlateCatalogSimilarityThreshold;

      if (legacyEmbeddingMatch) {
        const buffer = await params.assetStorage.getAssetByPath(cached.storagePath);
        return {
          base64: buffer.toString('base64'),
          mimeType: imageMimeTypeFromPath(cached.storagePath),
          storagePath: cached.storagePath,
        };
      }

      logger.warn(
        {
          storyId: params.storyId,
          characterKey: storyPlateKey,
          outfitId: params.outfitId,
          cacheId: cached.id,
          cachedOutfitText: cached.outfitText,
          requestedOutfitText: params.outfitTextRaw.trim(),
          mappingRequestedOutfitText: existingStory.requestedOutfitText,
          legacySimilarity,
          catalogSource: cached.catalogSource,
          minSimilarity: config.image.outfitPlateCatalogSimilarityThreshold,
        },
        'Ignoring stale story outfit plate cache mapping',
      );
      staleCacheIds.push(cached.id);
    }
  }

  const requestedEmbedding = await getCatalogEmbedding();
  let defaultOutfitScore: number | null = null;
  if (
    params.defaultOutfitText?.trim() &&
    Array.isArray(params.defaultOutfitEmbedding) &&
    params.defaultOutfitEmbedding.length === requestedEmbedding.length
  ) {
    defaultOutfitScore = cosineSimilarity(requestedEmbedding, params.defaultOutfitEmbedding);
  }
  const catalogFilters = inferOutfitCatalogFilters(params.outfitTextRaw);
  const pregenerated =
    (await outfitRepo.findSimilar(
      requestedEmbedding,
      config.image.outfitPlateCatalogSimilarityThreshold,
      {
        filters: catalogFilters,
        plannedCatalogOnly: true,
        relaxedFallback: true,
        excludeIds: staleCacheIds,
      },
    )) ||
    (await outfitRepo.findSimilar(
      requestedEmbedding,
      0,
      {
        filters: catalogFilters,
        plannedCatalogOnly: true,
        relaxedFallback: true,
        excludeIds: staleCacheIds,
      },
    ));

  if (
    shouldKeepDefaultOutfitForScene({
      defaultScore: defaultOutfitScore,
      catalogScore: pregenerated?.score,
      tolerance: config.image.outfitPlateDefaultOutfitTolerance,
    })
  ) {
    logger.info(
      {
        characterKey: storyPlateKey,
        storyId: params.storyId,
        outfitId: params.outfitId,
        defaultOutfitScore: defaultOutfitScore?.toFixed(3),
        catalogScore: pregenerated?.score.toFixed(3),
        catalogCacheId: pregenerated?.id,
        tolerance: config.image.outfitPlateDefaultOutfitTolerance,
      },
      'Keeping character default outfit for scene wardrobe',
    );
    return {
      useDefaultOutfit: true,
      defaultOutfitScore: defaultOutfitScore ?? 0,
      catalogScore: pregenerated?.score,
      catalogCacheId: pregenerated?.id,
    };
  }

  if (!pregenerated) {
    logger.warn(
      {
        characterKey: storyPlateKey,
        storyId: params.storyId,
        outfitId: params.outfitId,
        filters: catalogFilters,
      },
      'No pregenerated outfit plate found in catalog',
    );
    return null;
  }

  try {
    const buffer = await params.assetStorage.getAssetByPath(pregenerated.storagePath);
    await storyRepo.upsert(
      params.storyId,
      params.storyEnvironmentId,
      storyPlateKey,
      pregenerated.id,
      params.outfitTextRaw,
    );
    return {
      base64: buffer.toString('base64'),
      mimeType: imageMimeTypeFromPath(pregenerated.storagePath),
      storagePath: pregenerated.storagePath,
    };
  } catch (err) {
    logger.warn(
      {
        err,
        cacheId: pregenerated.id,
        storagePath: pregenerated.storagePath,
        characterKey: storyPlateKey,
        storyId: params.storyId,
      },
      'Pregenerated outfit plate lookup hit but asset could not be loaded',
    );
    return null;
  }
}
