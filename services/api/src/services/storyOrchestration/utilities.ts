/**
 * Utility functions for story orchestration
 */

import { getStoryRepository, getSceneRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import {
  cameraCompositionOutfitRefsToRecord,
  cameraCompositionOutfitsToRecord,
  outfitBindingsToRecord,
} from '../../utils/characterOutfits';
import { normalizeCharacterName } from '../../utils/characterNormalization';
import { stripAllTags, stripCharacterIds } from '../../utils/audioTags';
import { flattenCameraComposition } from '../types';
import {
  getSceneVisualCharacterCount,
  limitSceneVisualCharacters,
  MAX_SCENE_IMAGE_CHARACTERS,
} from '../../domain/story/sceneCharacterLimits';
import {
  isPersistedCharacterRef,
  isTemporaryCharacterRef,
  normalizeCharacterRef,
  replaceTemporaryCharacterRefs,
} from '../../utils/characterIdentity';

/**
 * Extract LLM-generated characters from text
 */
export function extractLlmCharactersFromText(text: any): any[] {
  return (text.characters || []).map((char: any) => {
    const characterRef = normalizeCharacterRef(char.characterRef);
    return {
      characterRef,
      name: stripCharacterIds(char.name),
      ...(isPersistedCharacterRef(characterRef)
        ? { originalCharacterId: characterRef }
        : {}),
      type: char.type,
      description: char.description,
      role: char.role,
      personality: char.personality,
      appearance: char.description,
    };
  });
}

/**
 * Attach persisted IDs to generated characters and rewrite every NEW_CH_n occurrence in the
 * structured result. Name lookup is retained only for legacy checkpoints without characterRef.
 */
export function bindPersistedCharacterRefs(params: {
  text: any;
  mergedCharacters: any[];
  persistenceResults: ReadonlyMap<
    string,
    { characterId: string; isNew: boolean; hasTurnaround: boolean }
  >;
}): Map<string, string> {
  const replacements = new Map<string, string>();
  for (const character of params.mergedCharacters) {
    if (character.source !== 'llm_generated' || character.id) continue;
    const structuralRef = normalizeCharacterRef(character.characterRef);
    const lookupKey = structuralRef || normalizeCharacterName(character.name);
    const result = params.persistenceResults.get(lookupKey);
    if (!result) {
      throw new Error(
        `No persisted character result for ${structuralRef || `legacy name "${character.name}"`}`
      );
    }
    character.id = result.characterId;
    character.characterRef = result.characterId;
    character._llmIsNew = result.isNew;
    character._llmHasTurnaround = result.hasTurnaround;
    if (isTemporaryCharacterRef(structuralRef)) {
      replacements.set(structuralRef, result.characterId);
    }
  }
  replaceTemporaryCharacterRefs(params.text, replacements);
  return replacements;
}

/**
 * Create scene records in database
 */
export async function createSceneRecords(
  storyId: string,
  text: { scenes: any[] },
  options?: {
    tx?: any;
    includeWordCount?: boolean;
  }
): Promise<void> {
  await Promise.all(
    text.scenes.map((scene) => {
      const sceneVisual = limitSceneVisualCharacters(scene.sceneVisual);
      const cam = sceneVisual?.cameraComposition;

      const charNames =
        cam && typeof cam !== 'string'
          ? flattenCameraComposition(cam).characterNames
          : (scene as any).characters || [];
      const normalizedCharacters = charNames.map((name: string) => normalizeCharacterName(name));

      const cleanText = stripCharacterIds(scene.text);

      const sceneData: any = {
        storyId,
        sceneId: scene.sceneId,
        text: cleanText,
        visualPrompt: sceneVisual ? JSON.stringify(sceneVisual) : (scene.visualPrompt ?? ''),
        charactersPresent: normalizedCharacters,
      };

      if (options?.includeWordCount) {
        const characterRefs =
          cam && typeof cam !== 'string' && Array.isArray(cam.characters)
            ? cam.characters
                .map((character: any) => normalizeCharacterRef(character?.characterRef))
                .filter(Boolean)
            : [];
        sceneData.generationParams = {
          wordCount: cleanText.split(/\s+/).length,
          ...(characterRefs.length > 0 ? { characterRefsPresent: characterRefs } : {}),
        };
      }

      return getSceneRepository().create(sceneData, options?.tx);
    })
  );
}

/**
 * Unified error handling for story requests
 */
export async function handleRequestError(
  requestId: string,
  error: unknown,
  context?: {
    logMessage?: string;
    extraFields?: Record<string, any>;
  }
): Promise<never> {
  logger.error(
    {
      error,
      requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...context?.extraFields,
    },
    context?.logMessage ?? 'Story request failed'
  );

  await getStoryRepository().updateRequest(requestId, {
    status: 'failed',
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
    updatedAt: new Date(),
  });

  throw error;
}

/**
 * Build initial context from request and checkpoints
 */
export function buildInitialContext(
  request: any,
  checkpoints: any
): {
  storyId: string;
  text: any;
  spec: any;
  mergedCharacters: any[];
} {
  const storyId = checkpoints.storyId;
  const text = checkpoints.validatedText || checkpoints.text;
  const spec = checkpoints.spec;
  const mergedCharacters = checkpoints.mergedCharacters || [];

  if (!storyId || !text) {
    throw new Error(`Missing storyId or text in intermediateData for request ${request.id}`);
  }

  return { storyId, text, spec, mergedCharacters };
}

export { parsePlainTextToScenes } from '../../domain/story/parsePlainText';

/**
 * Block-start placement for Director flow: image i appears before scene (1 + i*blockSize), covers that block.
 * E.g. 9 scenes, 3 images → [1, 4, 7] (block 1: scenes 1-3, block 2: 4-6, block 3: 7-9).
 */
export function getIllustrationBlockStartSceneIds(
  totalScenes: number,
  imagesPerStory: number
): number[] {
  if (imagesPerStory <= 0 || totalScenes <= 0) return [];
  if (imagesPerStory === 1) return [1];
  const blockSize = Math.ceil(totalScenes / imagesPerStory);
  return Array.from({ length: imagesPerStory }, (_, i) => Math.min(1 + i * blockSize, totalScenes));
}

/**
 * Compose scenes into blocks for Director flow. One block per illustration.
 */
export function composeScenesIntoBlocks(
  scenes: Array<{ sceneId: number; text: string }>,
  imagesPerStory: number
): Array<{ blockIndex: number; sceneStart: number; sceneEnd: number; blockText: string }> {
  const sceneIds = getIllustrationBlockStartSceneIds(scenes.length, imagesPerStory);
  const blockSize = Math.ceil(scenes.length / imagesPerStory);
  return sceneIds.map((anchor, i) => {
    const sceneStart = anchor;
    const sceneEnd = Math.min(anchor + blockSize - 1, scenes.length);
    const blockScenes = scenes.filter((s) => s.sceneId >= sceneStart && s.sceneId <= sceneEnd);
    const blockText = blockScenes
      .map((s) => `Scene ${s.sceneId}:\n${stripAllTags(s.text)}`)
      .join('\n\n');
    return { blockIndex: i, sceneStart, sceneEnd, blockText };
  });
}

/**
 * Merge Director output into plain text result.
 * Produces EpisodeText-like structure for downstream pipeline.
 */
export function mergeDirectorIntoText(
  plainText: {
    title: string;
    description: string;
    fullText: string;
    wordCount: number;
    scenes: Array<{ sceneId: number; text: string }>;
  },
  directorResult: {
    characters: any[];
    environments: any[];
    outfits?: any[];
    mapTile?: any;
    illustrations: Array<{
      environmentId: string;
      primaryRead?: string;
      /** @deprecated LLM legacy; prefer sceneVisual.cameraComposition.characters[].outfitId */
      outfitBindings?: Array<{ characterName?: string; outfitId?: string }>;
      characterOutfitIds?: Record<string, string>;
      characterOutfitRefs?: Record<string, string>;
      sceneVisual: any;
    }>;
  },
  imagesPerStory: number,
  options?: { preferredCharacterNames?: string[] }
): any {
  const sceneIds = getIllustrationBlockStartSceneIds(plainText.scenes.length, imagesPerStory);
  const blockSize = Math.ceil(plainText.scenes.length / imagesPerStory) || 1;
  const sceneMap = new Map(plainText.scenes.map((s) => [s.sceneId, { ...s }]));

  for (let i = 0; i < directorResult.illustrations.length && i < sceneIds.length; i++) {
    const anchor = sceneIds[i];
    const sceneEnd = Math.min(anchor + blockSize - 1, plainText.scenes.length);
    const ill = directorResult.illustrations[i];
    const sceneVisual = limitSceneVisualCharacters(
      ill?.sceneVisual,
      MAX_SCENE_IMAGE_CHARACTERS,
      options?.preferredCharacterNames ?? []
    );
    const originalCharacterCount = getSceneVisualCharacterCount(ill?.sceneVisual);
    const limitedCharacterCount = getSceneVisualCharacterCount(sceneVisual);
    if (originalCharacterCount > limitedCharacterCount) {
      logger.warn(
        {
          illustrationIndex: i,
          anchorSceneId: anchor,
          originalCharacterCount,
          limitedCharacterCount,
          maxSceneImageCharacters: MAX_SCENE_IMAGE_CHARACTERS,
        },
        'Trimmed Director cameraComposition characters to scene image maximum'
      );
    }
    const outfitRecord =
      cameraCompositionOutfitsToRecord(sceneVisual?.cameraComposition) ??
      outfitBindingsToRecord(ill?.outfitBindings) ??
      (ill?.characterOutfitIds && Object.keys(ill.characterOutfitIds).length > 0
        ? { ...ill.characterOutfitIds }
        : undefined);
    const outfitRefRecord =
      cameraCompositionOutfitRefsToRecord(sceneVisual?.cameraComposition) ??
      (ill?.characterOutfitRefs && Object.keys(ill.characterOutfitRefs).length > 0
        ? { ...ill.characterOutfitRefs }
        : undefined);
    for (let sid = anchor; sid <= sceneEnd; sid++) {
      const sc = sceneMap.get(sid);
      if (!sc || !ill) continue;
      (sc as any).environmentId = ill.environmentId;
      if (outfitRecord && Object.keys(outfitRecord).length > 0) {
        (sc as any).characterOutfitIds = { ...outfitRecord };
      }
      if (outfitRefRecord && Object.keys(outfitRefRecord).length > 0) {
        (sc as any).characterOutfitRefs = { ...outfitRefRecord };
      }
      if (sid === anchor) {
        if (ill.primaryRead) {
          (sc as any).primaryRead = ill.primaryRead;
        }
        (sc as any).sceneVisual = sceneVisual;
      }
    }
  }

  return {
    title: plainText.title,
    language: '', // Will be set by spec
    description: plainText.description,
    characters: directorResult.characters,
    environments: directorResult.environments,
    outfits: Array.isArray(directorResult.outfits) ? directorResult.outfits : [],
    mapTile: directorResult.mapTile,
    scenes: Array.from(sceneMap.values()).sort((a, b) => a.sceneId - b.sceneId),
    fullText: plainText.fullText,
    wordCount: plainText.wordCount,
  };
}
