/**
 * Utility functions for story orchestration
 */

import { getStoryRepository, getSceneRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import {
  cameraCompositionOutfitsToRecord,
  outfitBindingsToRecord,
} from '../../utils/characterOutfits';
import { normalizeCharacterName } from '../../utils/characterNormalization';
import { stripAllTags, stripCharacterIds } from '../../utils/audioTags';
import { flattenCameraComposition } from '../types';

/**
 * Extract character ID from name string like "Mokhovyk [ID: uuid]"
 */
function extractCharacterId(name: string): { name: string; id: string | null } {
  const idMatch = name.match(/^(.+?)\s*\[ID:\s*([a-f0-9-]+)\]\s*$/i);
  if (idMatch) {
    return {
      name: idMatch[1].trim(),
      id: idMatch[2].trim(),
    };
  }
  return { name, id: null };
}

/**
 * Extract LLM-generated characters from text
 */
export function extractLlmCharactersFromText(text: any): any[] {
  return (text.characters || []).map((char: any) => {
    const { name, id } = extractCharacterId(char.name);
    return {
      name,
      originalCharacterId: id, // Extracted ID for matching
      type: char.type,
      description: char.description,
      role: char.role,
      personality: char.personality,
      appearance: char.description,
    };
  });
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
    text.scenes.map(scene => {
      // Strip [ID: uuid] from cameraComposition character names before normalization
      const cam = scene.sceneVisual?.cameraComposition;
      if (cam && typeof cam !== 'string' && Array.isArray(cam.characters)) {
        for (const ch of cam.characters) {
          if (ch.name) ch.name = stripCharacterIds(ch.name);
        }
      }

      const charNames = (cam && typeof cam !== 'string')
        ? flattenCameraComposition(cam).characterNames
        : (scene as any).characters || [];
      const normalizedCharacters = charNames.map((name: string) => normalizeCharacterName(name));
      
      const cleanText = stripCharacterIds(scene.text);

      const sceneData: any = {
        storyId,
        sceneId: scene.sceneId,
        text: cleanText,
        visualPrompt: scene.sceneVisual 
          ? JSON.stringify(scene.sceneVisual) 
          : (scene.visualPrompt ?? ''),
        charactersPresent: normalizedCharacters,
      };
      
      if (options?.includeWordCount) {
        sceneData.generationParams = {
          wordCount: cleanText.split(/\s+/).length,
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
  logger.error({
    error,
    requestId,
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context?.extraFields,
  }, context?.logMessage ?? 'Story request failed');

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
 * Get scene IDs for illustration placement (Director flow).
 * First image always before scene 1; rest evenly distributed.
 * E.g. 3 images in 9 scenes → [1, 4, 7]; 5 images in 9 → [1, 3, 5, 7, 9]
 */
export function getIllustrationSceneIds(totalScenes: number, imagesPerStory: number): number[] {
  if (imagesPerStory <= 0 || totalScenes <= 0) return [];
  if (imagesPerStory === 1) return [1];
  const step = Math.floor((totalScenes - 1) / (imagesPerStory - 1));
  const ids: number[] = [];
  for (let i = 0; i < imagesPerStory; i++) {
    ids.push(Math.min(1 + i * step, totalScenes));
  }
  return ids;
}

/**
 * Block-start placement for Director flow: image i appears before scene (1 + i*blockSize), covers that block.
 * E.g. 9 scenes, 3 images → [1, 4, 7] (block 1: scenes 1-3, block 2: 4-6, block 3: 7-9).
 */
export function getIllustrationBlockStartSceneIds(totalScenes: number, imagesPerStory: number): number[] {
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
    const blockScenes = scenes.filter(s => s.sceneId >= sceneStart && s.sceneId <= sceneEnd);
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
  plainText: { title: string; description: string; fullText: string; wordCount: number; scenes: Array<{ sceneId: number; text: string }> },
  directorResult: {
    characters: any[];
    environments: any[];
    outfits?: any[];
    illustrations: Array<{
      environmentId: string;
      /** @deprecated LLM legacy; prefer sceneVisual.cameraComposition.characters[].outfitId */
      outfitBindings?: Array<{ characterName?: string; outfitId?: string }>;
      characterOutfitIds?: Record<string, string>;
      sceneVisual: any;
    }>;
  },
  imagesPerStory: number
): any {
  const sceneIds = getIllustrationBlockStartSceneIds(plainText.scenes.length, imagesPerStory);
  const blockSize = Math.ceil(plainText.scenes.length / imagesPerStory) || 1;
  const sceneMap = new Map(plainText.scenes.map(s => [s.sceneId, { ...s }]));

  for (let i = 0; i < directorResult.illustrations.length && i < sceneIds.length; i++) {
    const anchor = sceneIds[i];
    const sceneEnd = Math.min(anchor + blockSize - 1, plainText.scenes.length);
    const ill = directorResult.illustrations[i];
    const outfitRecord =
      cameraCompositionOutfitsToRecord(ill?.sceneVisual?.cameraComposition) ??
      outfitBindingsToRecord(ill?.outfitBindings) ??
      (ill?.characterOutfitIds && Object.keys(ill.characterOutfitIds).length > 0
        ? { ...ill.characterOutfitIds }
        : undefined);
    for (let sid = anchor; sid <= sceneEnd; sid++) {
      const sc = sceneMap.get(sid);
      if (!sc || !ill) continue;
      (sc as any).environmentId = ill.environmentId;
      if (outfitRecord && Object.keys(outfitRecord).length > 0) {
        (sc as any).characterOutfitIds = { ...outfitRecord };
      }
      if (sid === anchor) {
        (sc as any).sceneVisual = ill.sceneVisual;
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
    scenes: Array.from(sceneMap.values()).sort((a, b) => a.sceneId - b.sceneId),
    fullText: plainText.fullText,
    wordCount: plainText.wordCount,
  };
}

/**
 * Helper: Migrate old visualPrompt to structured sceneVisual
 */
function migrateVisualPrompt(scene: any): any {
  if (scene.sceneVisual) return scene.sceneVisual;

  const vp = scene.visualPrompt || '';

  if (vp.startsWith('{')) {
    try {
      const parsed = JSON.parse(vp);
      if (parsed && typeof parsed.setting === 'string' && parsed.cameraComposition !== undefined) {
        return parsed;
      }
    } catch (_) {
      // Not valid JSON
    }
  }

  return {
    setting: '',
    cameraComposition: vp,
    lighting: '',
  };
}
