import { stripCharacterIdFromName } from '@wondertales/shared';
import type { StoryEnvironment } from '../ai/types';
import { config } from '../config';
import {
  getOutfitPlateCacheRepository,
  getStoryOutfitPlateCacheRepository,
} from '../repositories';
import {
  lookupOutfitForCharacterName,
  lookupOutfitIdForCharacterName,
  parseCharacterOutfitsString,
  resolveOutfitDescriptionsFromSceneIds,
  type StoryOutfitDefinition,
} from '../utils/characterOutfits';
import { logger } from '../utils/logger';
import { type AssetStorageService } from './assetStorageService';
import { recordStageTiming, type StoryGenerationKind } from './generationStageTimingService';
import {
  getCatalogOutfitPlateImage,
  getOrCreateCharacterOutfitTurnaroundImage,
  isPregeneratedOutfitPlateCatalogSource,
  isDefaultOutfitPlateSelection,
  isDefaultTurnaroundOutfit,
  normalizeOutfitPlateCharacterKey,
  requestedOutfitTextMatches,
  sceneCharacterHasVisualReference,
  shouldGenerateOutfitPlateForCharacter,
} from './outfitPlateService';
import type { CharacterData, SceneData, StoryOutfitEntry } from './types';

type OutfitPlateImageData = NonNullable<Awaited<ReturnType<typeof getCatalogOutfitPlateImage>>>;

export type SceneDressedTurnaroundData = NonNullable<
  Awaited<ReturnType<typeof getOrCreateCharacterOutfitTurnaroundImage>>
>;

export type SceneOutfitPlatePending = Map<string, Promise<OutfitPlateImageData | null>>;
export type SceneDressedTurnaroundPending = Map<
  string,
  Promise<SceneDressedTurnaroundData | null>
>;

export type SceneCharacterReferenceData = {
  base64: string;
  mimeType: string;
  fileUri?: string;
  source?: string;
  characterId?: string;
  characterName?: string;
  type?: string;
  isTurnaround?: boolean;
  url?: string;
  index?: number;
  imageIndex?: number;
  storagePath?: string;
  referenceBindingId?: string;
};

export type SceneDressedTurnaroundReference = {
  base64: string;
  mimeType: string;
  fileUri?: string;
  source: string;
  type: string;
  characterName: string;
  isTurnaround: boolean;
  storagePath?: string;
  referenceBindingId?: string;
  characterId?: string;
  outfitId?: string;
};

type ReferenceFileUploader = {
  uploadReferenceFile(
    buffer: Buffer,
    mimeType: string,
    displayName?: string,
    cacheKey?: string,
  ): Promise<{ uri: string } | null | undefined>;
};

function buildStoryOutfitPlateCacheKey(characterName: string, outfitId?: string | null): string {
  const characterKey = normalizeOutfitPlateCharacterKey(characterName);
  return outfitId?.trim() ? `${characterKey}::${outfitId.trim()}` : characterKey;
}

async function loadExistingOutfitPlateImage(params: {
  storyId: string;
  storyEnvironmentId: string;
  characterName: string;
  outfitTextRaw: string;
  outfitId?: string | null;
  assetStorage: AssetStorageService;
}): Promise<OutfitPlateImageData | null> {
  const storyPlateKey = buildStoryOutfitPlateCacheKey(params.characterName, params.outfitId);
  const mapping = await getStoryOutfitPlateCacheRepository().getByStoryEnvAndCharacter(
    params.storyId,
    params.storyEnvironmentId,
    storyPlateKey,
  );
  if (!mapping) return null;

  const cached = await getOutfitPlateCacheRepository().getById(mapping.cacheId);
  if (!cached) return null;
  if (!isPregeneratedOutfitPlateCatalogSource(cached.catalogSource)) {
    logger.warn(
      {
        storyId: params.storyId,
        characterName: params.characterName,
        storyEnvironmentId: params.storyEnvironmentId,
        outfitId: params.outfitId,
        cacheId: mapping.cacheId,
        catalogSource: cached.catalogSource,
        storagePath: cached.storagePath,
      },
      'Skipping non-planned outfit plate mapping',
    );
    return null;
  }
  const mappingMatches = requestedOutfitTextMatches(
    mapping.requestedOutfitText,
    params.outfitTextRaw,
  );
  const legacyCacheTextMatches =
    mapping.requestedOutfitText == null &&
    requestedOutfitTextMatches(cached.outfitText, params.outfitTextRaw);
  if (!mappingMatches && !legacyCacheTextMatches) {
    logger.warn(
      {
        storyId: params.storyId,
        characterName: params.characterName,
        storyEnvironmentId: params.storyEnvironmentId,
        outfitId: params.outfitId,
        cacheId: mapping.cacheId,
        requestedOutfitText: params.outfitTextRaw.trim(),
        mappingRequestedOutfitText: mapping.requestedOutfitText,
        cachedOutfitText: cached.outfitText,
      },
      'Skipping stale existing outfit plate mapping',
    );
    return null;
  }

  const buffer = await params.assetStorage.getAssetByPath(cached.storagePath);
  return {
    base64: buffer.toString('base64'),
    mimeType: 'image/png',
    storagePath: cached.storagePath,
  };
}

function findSceneCharacterReferenceData(
  characterName: string,
  refs: SceneCharacterReferenceData[],
  characterId?: string,
): SceneCharacterReferenceData | undefined {
  if (characterId) {
    const byId = refs.find((ref) => ref.characterId === characterId);
    if (byId) return byId;
  }
  const target = stripCharacterIdFromName(characterName).trim().toLowerCase();
  return refs.find(
    (ref) =>
      stripCharacterIdFromName(ref.characterName || '')
        .trim()
        .toLowerCase() === target,
  );
}

function mergeCharacterOutfitRecords(
  env: Record<string, string> | undefined,
  scene: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const e = env && Object.keys(env).length ? env : undefined;
  const s = scene && Object.keys(scene).length ? scene : undefined;
  if (!e && !s) return undefined;
  return { ...(e || {}), ...(s || {}) };
}

function resolveOutfitDescriptionsFromSceneRefs(
  scene: SceneData,
  outfits: StoryOutfitEntry[] | undefined,
): Record<string, string> | undefined {
  if (!scene.characterOutfitRefs || !outfits?.length) return undefined;
  const byId = new Map(outfits.map((outfit) => [outfit.id, outfit]));
  const composition = scene.sceneVisual?.cameraComposition;
  const rows =
    composition && typeof composition !== 'string' && Array.isArray(composition.characters)
      ? composition.characters
      : [];
  const result: Record<string, string> = {};
  for (const [characterRef, outfitId] of Object.entries(scene.characterOutfitRefs)) {
    const outfit = byId.get(outfitId);
    if (!outfit?.description?.trim()) continue;
    const displayName =
      rows.find((row) => row.characterRef === characterRef)?.name || outfit.characterName;
    if (displayName?.trim()) result[displayName.trim()] = outfit.description.trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Resolve character outfits for image generation and validation (same source).
 * New format: storyOutfits[] + scene.characterOutfitIds -> descriptions (wins over legacy).
 * Legacy: environment characterOutfits + scene-level characterOutfits overlay.
 */
export function resolveSceneCharacterOutfits(
  scene: SceneData,
  context: {
    currentEnvironment?: { id: string; characterOutfits?: string | Record<string, string> };
    storyOutfits?: StoryOutfitEntry[];
  },
): Record<string, string> | undefined {
  let fromEnv: Record<string, string> | undefined;
  const co = context.currentEnvironment?.characterOutfits;
  if (co) {
    fromEnv = typeof co === 'string' ? parseCharacterOutfitsString(co) : co;
  }
  const rawScene =
    (scene.sceneVisual as { characterOutfits?: string | Record<string, string> } | undefined)
      ?.characterOutfits ??
    (scene as { characterOutfits?: string | Record<string, string> }).characterOutfits;
  let fromScene: Record<string, string> | undefined;
  if (rawScene) {
    fromScene = typeof rawScene === 'string' ? parseCharacterOutfitsString(rawScene) : rawScene;
  }
  const legacy = mergeCharacterOutfitRecords(fromEnv, fromScene);

  const rawIds = scene.characterOutfitIds;
  const fromRefs = resolveOutfitDescriptionsFromSceneRefs(scene, context.storyOutfits);
  if (context.storyOutfits?.length && rawIds && Object.keys(rawIds).length > 0) {
    const fromIds = resolveOutfitDescriptionsFromSceneIds(
      rawIds,
      context.storyOutfits as StoryOutfitDefinition[],
    );
    if (fromIds && Object.keys(fromIds).length > 0) {
      return { ...(legacy || {}), ...fromIds, ...(fromRefs || {}) };
    }
  }

  return fromRefs ? { ...(legacy || {}), ...fromRefs } : legacy;
}

export async function prepareSceneDressedTurnaroundReferences(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  generationKind?: StoryGenerationKind;
  normalizedCharacters: string[];
  characterDescriptionMap: Map<string, CharacterData>;
  characterReferenceData: SceneCharacterReferenceData[];
  scene: SceneData;
  currentEnvironmentId?: string;
  currentEnvironment?: StoryEnvironment;
  storyOutfits?: StoryOutfitEntry[];
  imageStyle?: string;
  ageGroup: string;
  scenarioCardId?: string;
  assetStorage: AssetStorageService;
  imageDomain: ReferenceFileUploader;
  outfitPlatePending: SceneOutfitPlatePending;
  dressedTurnaroundPending: SceneDressedTurnaroundPending;
  defaultOutfitCharacterKeys?: Set<string>;
  reuseExistingOnly?: boolean;
}): Promise<SceneDressedTurnaroundReference[]> {
  const {
    storyId,
    storyRequestId,
    userId,
    generationKind,
    normalizedCharacters,
    characterDescriptionMap,
    characterReferenceData,
    scene,
    currentEnvironmentId,
    currentEnvironment,
    storyOutfits,
    imageStyle,
    ageGroup,
    scenarioCardId,
    assetStorage,
    imageDomain,
    outfitPlatePending,
    dressedTurnaroundPending,
    defaultOutfitCharacterKeys,
    reuseExistingOnly,
  } = params;

  if (!config.image.enableOutfitPlate || !currentEnvironmentId || !currentEnvironment) {
    return [];
  }

  const outfitsMerged =
    resolveSceneCharacterOutfits(scene, {
      currentEnvironment,
      ...(storyOutfits && storyOutfits.length > 0 ? { storyOutfits } : {}),
    }) || {};
  const maxPlates = config.image.outfitPlateMaxPerScene;
  const candidates: Array<{
    charData: CharacterData;
    displayName: string;
    outfitText: string;
    outfitId?: string;
    outfitPendingKey: string;
    characterReference: SceneCharacterReferenceData;
  }> = [];

  const characterDataByRef = new Map<string, CharacterData>();
  for (const character of characterDescriptionMap.values()) {
    const characterRef = character.characterRef || character.id;
    if (characterRef) characterDataByRef.set(characterRef, character);
  }
  const candidateInputs = new Map<
    string,
    { displayName: string; charData?: CharacterData }
  >();
  const composition = scene.sceneVisual?.cameraComposition;
  if (composition && typeof composition !== 'string') {
    for (const row of composition.characters || []) {
      const characterRef = row.characterRef?.trim();
      const charData = characterRef ? characterDataByRef.get(characterRef) : undefined;
      if (!characterRef || !charData) continue;
      candidateInputs.set(characterRef, {
        displayName: row.name,
        charData,
      });
    }
  }
  for (const mapKey of normalizedCharacters) {
    const charData = characterDescriptionMap.get(mapKey);
    const candidateKey = charData?.characterRef || charData?.id || `legacy:${mapKey}`;
    if (!candidateInputs.has(candidateKey)) {
      candidateInputs.set(candidateKey, {
        displayName: charData?.name || mapKey,
        charData,
      });
    }
  }

  for (const { displayName, charData } of candidateInputs.values()) {
    if (candidates.length >= maxPlates) break;
    if (!shouldGenerateOutfitPlateForCharacter(charData)) continue;
    if (!charData?.id) {
      logger.warn(
        { storyId, sceneId: scene.sceneId, characterName: displayName },
        'Skipping dressed turnaround: character has no id',
      );
      continue;
    }
    if (
      !characterReferenceData.some((reference) => reference.characterId === charData.id) &&
      !sceneCharacterHasVisualReference(displayName, characterReferenceData)
    ) {
      continue;
    }
    const outfitText = lookupOutfitForCharacterName(displayName, outfitsMerged);
    if (!outfitText?.trim()) continue;
    const structuralRef = charData.characterRef || charData.id;
    const outfitId =
      (structuralRef ? scene.characterOutfitRefs?.[structuralRef] : undefined) ||
      lookupOutfitIdForCharacterName(displayName, scene.characterOutfitIds);
    if (isDefaultTurnaroundOutfit(outfitText, outfitId)) continue;
    const characterReference = findSceneCharacterReferenceData(
      displayName,
      characterReferenceData,
      charData.id
    );
    if (!characterReference) continue;
    const storyPlateKey = buildStoryOutfitPlateCacheKey(displayName, outfitId);
    candidates.push({
      charData,
      displayName,
      outfitText,
      outfitId: outfitId ?? undefined,
      outfitPendingKey: `${storyId}\x1f${currentEnvironmentId}\x1f${storyPlateKey}`,
      characterReference,
    });
  }

  return Promise.all(
    candidates.map(async ({
      charData,
      displayName,
      outfitText,
      outfitId,
      outfitPendingKey,
      characterReference,
    }) => {
      let outfitPromise = outfitPlatePending.get(outfitPendingKey);
      if (!outfitPromise) {
        const outfitStartedAt = new Date();
        outfitPromise = (async () => {
          try {
            const plate = reuseExistingOnly
              ? await loadExistingOutfitPlateImage({
                  storyId,
                  storyEnvironmentId: currentEnvironmentId,
                  characterName: displayName,
                  outfitTextRaw: outfitText,
                  outfitId,
                  assetStorage,
                })
              : await getCatalogOutfitPlateImage({
                  storyId,
                  userId,
                  storyEnvironmentId: currentEnvironmentId,
                  characterName: displayName,
                  outfitTextRaw: outfitText,
                  outfitId,
                  imageStyle: imageStyle || 'soft_watercolor',
                  ageGroup,
                  scenarioCardId,
                  assetStorage,
                  defaultOutfitText: charData.defaultOutfitText,
                  defaultOutfitEmbedding: charData.defaultOutfitEmbedding,
                });
            await recordStageTiming({
              storyId,
              storyRequestId,
              userId,
              generationKind: generationKind ?? 'story',
              pipelinePhase: 'asset_generation',
              operation: 'outfit_plate_image',
              targetType: 'outfit_plate',
              targetKey: `${currentEnvironmentId}:${normalizeOutfitPlateCharacterKey(displayName)}:${outfitId ?? ''}`,
              status: plate && !plate.useDefaultOutfit ? 'completed' : 'skipped',
              startedAt: outfitStartedAt,
              completedAt: new Date(),
              metadata: {
                characterName: displayName,
                storyEnvironmentId: currentEnvironmentId,
                outfitId: outfitId ?? null,
                imageStyle: imageStyle || 'soft_watercolor',
                scenarioCardId,
                reuseExistingOnly: !!reuseExistingOnly,
                cacheStatus: reuseExistingOnly ? (plate ? 'hit' : 'miss') : undefined,
                usedDefaultOutfit: !!plate?.useDefaultOutfit,
                defaultOutfitScore: plate?.useDefaultOutfit
                  ? plate.defaultOutfitScore
                  : undefined,
                catalogScore: plate?.useDefaultOutfit ? plate.catalogScore : undefined,
              },
            });
            return plate;
          } catch (error) {
            await recordStageTiming({
              storyId,
              storyRequestId,
              userId,
              generationKind: generationKind ?? 'story',
              pipelinePhase: 'asset_generation',
              operation: 'outfit_plate_image',
              targetType: 'outfit_plate',
              targetKey: `${currentEnvironmentId}:${normalizeOutfitPlateCharacterKey(displayName)}:${outfitId ?? ''}`,
              status: 'failed',
              startedAt: outfitStartedAt,
              completedAt: new Date(),
              metadata: {
                characterName: displayName,
                storyEnvironmentId: currentEnvironmentId,
                outfitId: outfitId ?? null,
                imageStyle: imageStyle || 'soft_watercolor',
                errorMessage: error instanceof Error ? error.message : String(error),
              },
            });
            throw error;
          } finally {
            outfitPlatePending.delete(outfitPendingKey);
          }
        })();
        outfitPlatePending.set(outfitPendingKey, outfitPromise);
      }

      const plate = await outfitPromise;
      if (isDefaultOutfitPlateSelection(plate)) {
        defaultOutfitCharacterKeys?.add(normalizeOutfitPlateCharacterKey(displayName));
        return null;
      }
      if (!plate) return null;
      const dressedPendingKey = [
        charData.id,
        plate.storagePath,
        imageStyle || 'soft_watercolor',
        ageGroup,
      ].join('\x1f');

      let plateFileUri = plate.fileUri;
      if (config.nanoBanana?.enableFilesApi === true && plate.base64) {
        try {
          const buf = Buffer.from(plate.base64, 'base64');
          const uploaded = await imageDomain.uploadReferenceFile(
            buf,
            plate.mimeType,
            `outfit_${normalizeOutfitPlateCharacterKey(displayName)}`,
            plate.storagePath,
          );
          if (uploaded) plateFileUri = uploaded.uri;
        } catch (err) {
          logger.warn(
            { err, storyId, characterName: displayName },
            'Failed to upload outfit plate to Files API',
          );
        }
      }

      let dressedPromise = dressedTurnaroundPending.get(dressedPendingKey);
      if (!dressedPromise) {
        const dressedStartedAt = new Date();
        dressedPromise = (async () => {
          try {
            const dressed = await getOrCreateCharacterOutfitTurnaroundImage({
              characterId: charData.id!,
              characterName: displayName,
              outfitTextRaw: outfitText,
              outfitId,
              outfitPlateStoragePath: plate.storagePath,
              identityReference: {
                base64Data: characterReference.fileUri ? undefined : characterReference.base64,
                fileUri: characterReference.fileUri,
                mimeType: characterReference.mimeType,
                characterName: displayName,
                storagePath: characterReference.url,
                referenceKind: 'character',
                referenceBindingId: characterReference.referenceBindingId,
              },
              outfitPlateReference: {
                base64Data: plateFileUri ? undefined : plate.base64,
                fileUri: plateFileUri,
                mimeType: plate.mimeType,
                characterName: displayName,
                storagePath: plate.storagePath,
                referenceKind: 'object',
              },
              imageStyle: imageStyle || 'soft_watercolor',
              ageGroup,
              userId,
              storyId,
              assetStorage,
            });
            await recordStageTiming({
              storyId,
              storyRequestId,
              userId,
              generationKind: generationKind ?? 'story',
              pipelinePhase: 'asset_generation',
              operation: 'character_outfit_turnaround_image',
              targetType: 'character_outfit_turnaround',
              targetKey: `${charData.id}:${outfitId ?? ''}`,
              status: dressed ? 'completed' : 'skipped',
              startedAt: dressedStartedAt,
              completedAt: new Date(),
              metadata: {
                characterName: displayName,
                characterId: charData.id,
                outfitId: outfitId ?? null,
                outfitPlateStoragePath: plate.storagePath,
                imageStyle: imageStyle || 'soft_watercolor',
                reuseExistingOnly: !!reuseExistingOnly,
              },
            });
            return dressed;
          } catch (error) {
            await recordStageTiming({
              storyId,
              storyRequestId,
              userId,
              generationKind: generationKind ?? 'story',
              pipelinePhase: 'asset_generation',
              operation: 'character_outfit_turnaround_image',
              targetType: 'character_outfit_turnaround',
              targetKey: `${charData.id}:${outfitId ?? ''}`,
              status: 'failed',
              startedAt: dressedStartedAt,
              completedAt: new Date(),
              metadata: {
                characterName: displayName,
                characterId: charData.id,
                outfitId: outfitId ?? null,
                errorMessage: error instanceof Error ? error.message : String(error),
              },
            });
            throw error;
          } finally {
            dressedTurnaroundPending.delete(dressedPendingKey);
          }
        })();
        dressedTurnaroundPending.set(dressedPendingKey, dressedPromise);
      }

      const dressed = await dressedPromise;
      if (!dressed) return null;

      let dressedFileUri = dressed.fileUri;
      if (config.nanoBanana?.enableFilesApi === true && dressed.base64) {
        try {
          const buf = Buffer.from(dressed.base64, 'base64');
          const uploaded = await imageDomain.uploadReferenceFile(
            buf,
            dressed.mimeType,
            `dressed_turnaround_${normalizeOutfitPlateCharacterKey(displayName)}`,
            dressed.storagePath,
          );
          if (uploaded) dressedFileUri = uploaded.uri;
        } catch (err) {
          logger.warn(
            { err, storyId, characterName: displayName },
            'Failed to upload dressed turnaround to Files API',
          );
        }
      }

      return {
        base64: dressedFileUri ? '' : dressed.base64,
        mimeType: dressed.mimeType,
        ...(dressedFileUri ? { fileUri: dressedFileUri } : {}),
        source: 'character_outfit_turnaround',
        type: 'dressed_turnaround_reference',
        characterName: displayName,
        isTurnaround: true,
        storagePath: dressed.storagePath,
        referenceBindingId: characterReference.referenceBindingId,
        characterId: charData.id,
        outfitId,
      };
    }),
  ).then((refs) => refs.filter(Boolean) as SceneDressedTurnaroundReference[]);
}

export function applySceneDressedTurnaroundOverrides<
  T extends { characterName?: string; characterId?: string },
>(
  characterReferenceData: T[],
  dressedReferences: Array<{ characterName?: string; characterId?: string }>,
): T[] {
  if (dressedReferences.length === 0) return characterReferenceData;
  const dressedCharacterIds = new Set(
    dressedReferences.map((ref) => ref.characterId?.trim()).filter(Boolean),
  );
  const dressedNames = new Set(
    dressedReferences
      .map((ref) => stripCharacterIdFromName(ref.characterName || '').trim().toLowerCase())
      .filter(Boolean),
  );
  return characterReferenceData.filter((ref) => {
    const characterId = ref.characterId?.trim();
    if (characterId && dressedCharacterIds.has(characterId)) return false;
    const key = stripCharacterIdFromName(ref.characterName || '').trim().toLowerCase();
    return !dressedNames.has(key);
  });
}
