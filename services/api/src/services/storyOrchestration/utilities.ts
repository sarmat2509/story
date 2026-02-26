/**
 * Utility functions for story orchestration
 */

import { getStoryRepository, getSceneRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import { normalizeCharacterName } from '../../utils/characterNormalization';
import { flattenCameraComposition } from '../types';

/**
 * Build outline structure from text response
 */
export function buildOutlineFromText(
  text: { title: string; moral: string; language?: string; scenes: any[] },
  languageOverride?: string
): any {
  return {
    title: text.title,
    language: languageOverride ?? text.language,
    moral: text.moral,
    scenes: text.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      setting: '',
      goal: '',
      emotion: 'neutral' as const,
      beats: [],
      sceneVisual: scene.sceneVisual || migrateVisualPrompt(scene),
      visualPrompt: scene.visualPrompt,
    })),
    safetyNotes: [],
  };
}

/**
 * Extract LLM-generated characters from text
 */
export function extractLlmCharactersFromText(text: any): any[] {
  return (text.characters || []).map((char: any) => ({
    name: char.name,
    type: char.type,
    description: char.description,
    role: char.role,
    personality: char.personality,
    appearance: char.description,
  }));
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
      const cam = scene.sceneVisual?.cameraComposition;
      const charNames = (cam && typeof cam !== 'string')
        ? flattenCameraComposition(cam).characterNames
        : (scene as any).characters || [];
      const normalizedCharacters = charNames.map((name: string) => normalizeCharacterName(name));
      
      const sceneData: any = {
        storyId,
        sceneId: scene.sceneId,
        text: scene.text,
        visualPrompt: scene.sceneVisual 
          ? JSON.stringify(scene.sceneVisual) 
          : scene.visualPrompt,
        charactersPresent: normalizedCharacters,
      };
      
      if (options?.includeWordCount) {
        sceneData.generationParams = {
          wordCount: scene.text.split(/\s+/).length,
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
  outline: any;
  spec: any;
  mergedCharacters: any[];
} {
  const storyId = checkpoints.storyId;
  const text = checkpoints.validatedText || checkpoints.text;
  const outline = checkpoints.outline;
  const spec = checkpoints.spec;
  const mergedCharacters = checkpoints.mergedCharacters || [];
  
  if (!storyId || !text) {
    throw new Error(`Missing storyId or text in intermediateData for request ${request.id}`);
  }
  
  return { storyId, text, outline, spec, mergedCharacters };
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
