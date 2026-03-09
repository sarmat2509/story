/**
 * Utility functions for story orchestration
 */

import { getStoryRepository, getSceneRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import { normalizeCharacterName } from '../../utils/characterNormalization';
import { stripCharacterIds } from '../../utils/audioTags';
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
          : scene.visualPrompt,
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
