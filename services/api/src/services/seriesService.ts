/**
 * Series Service
 * Business logic for managing story series and continuations
 */

import { getStoryRepository } from '../repositories';
import type { Story } from '../db/schema';
import logger from '../utils/logger';

/**
 * Create or get existing series for a story
 */
export async function getOrCreateSeries(storyId: string): Promise<{
  seriesId: string;
  partNumber: number;
  continuationContext: any;
}> {
  // 1. Get the original story
  const story = await getStoryRepository().findById(storyId);
  
  if (!story) {
    throw new Error(`Story not found: ${storyId}`);
  }
  
  // 2. Check if story already belongs to a series
  if (story.seriesId) {
    const series = await getStoryRepository().findSeriesById(story.seriesId);
    
    if (!series) {
      throw new Error(`Series not found: ${story.seriesId}`);
    }
    
    logger.info({ seriesId: series.id, totalParts: series.totalParts }, 'Found existing series');
    
    return {
      seriesId: series.id,
      partNumber: series.totalParts,
      continuationContext: series.continuationContext,
    };
  }
  
  // 3. Create new series with this story as Part 1
  const baseTitle = story.title.replace(/\s*-\s*Частина\s+\d+/i, ''); // Remove part number if exists
  
  logger.info({ storyId, baseTitle }, 'Creating new series');
  
  const newSeries = await getStoryRepository().createSeries({
    userId: story.userId,
    childProfileId: story.childProfileId,
    baseTitle,
    language: story.language,
    ageGroup: story.ageGroup,
    imageStyle: (story.metadata as any)?.imageStyle || 'watercolor',
    totalParts: 1,
    storyIds: [storyId],
    continuationContext: buildInitialContext(story),
  });
  
  // 4. Update original story with series_id
  await getStoryRepository().updateStory(storyId, { seriesId: newSeries.id, partNumber: 1 });
  
  logger.info({ seriesId: newSeries.id }, 'Created new series');
  
  return {
    seriesId: newSeries.id,
    partNumber: 1,
    continuationContext: newSeries.continuationContext,
  };
}

/**
 * Build initial context from first story
 */
function buildInitialContext(story: Story): any {
  const outline = story.outline as any;
  const metadata = story.metadata as any;
  const scenes = story.scenes as any[]; // Actual scene data with text
  
  // Separate user-provided characters (from wizard) and LLM-generated characters
  const userProvidedCharacters = metadata?.mergedCharacters || []; // From wizard selection
  const llmGeneratedCharacters = metadata?.llmGeneratedCharacters || []; // Created by LLM
  
  // DEBUG: Log raw character data
  logger.debug({
    storyId: story.id,
    userProvidedRaw: userProvidedCharacters.map(c => ({
      name: c.name,
      type: c.type,
      description: c.description,
      appearance: c.appearance,
      personality: c.personality,
      traits: c.traits,
    })),
    llmGeneratedRaw: llmGeneratedCharacters.map(c => ({
      name: c.name,
      type: c.type,
      description: c.description,
      appearance: c.appearance,
      personality: c.personality,
    })),
  }, 'Raw character data before formatting');
  
  // Extract scene summaries - handle both outline mode and direct mode
  const sceneSummaries = [];
  
  // First try to get summaries from outline
  if (outline?.scenes && Array.isArray(outline.scenes)) {
    for (let i = 0; i < outline.scenes.length; i++) {
      const outlineScene = outline.scenes[i];
      const actualScene = scenes?.[i]; // Match by index
      
      // Priority order: goal -> setting -> sceneVisual.setting -> visualPrompt -> first 200 chars of actual scene text
      let summary = outlineScene.goal || outlineScene.setting || outlineScene.sceneVisual?.setting || outlineScene.visualPrompt;
      
      // If no summary fields, use beginning of actual scene text
      if ((!summary || !summary.trim()) && actualScene?.text) {
        summary = actualScene.text.slice(0, 200).trim();
      }
      
      if (summary && summary.trim()) {
        sceneSummaries.push(summary.trim());
      }
    }
  } else if (scenes && Array.isArray(scenes)) {
    // Fallback: if no outline, use actual scenes directly
    for (const scene of scenes) {
      const summary = scene.text ? scene.text.slice(0, 200).trim() : '';
      if (summary) {
        sceneSummaries.push(summary);
      }
    }
  }
  
  // Format character descriptions while preserving reference images for continuation image generation
  const formatCharacters = (chars: any[]) => {
    return chars.map(char => {
      // Build description from available fields, prioritizing description > appearance > personality > traits
      let description = '';
      
      if (char.description && typeof char.description === 'string' && char.description.trim() && char.description !== 'undefined') {
        description = char.description.trim();
      } else if (char.appearance && typeof char.appearance === 'string' && char.appearance.trim() && char.appearance !== 'undefined') {
        description = char.appearance.trim();
      } else if (char.personality && typeof char.personality === 'string' && char.personality.trim() && char.personality !== 'undefined') {
        description = char.personality.trim();
      } else if (char.traits && typeof char.traits === 'string' && char.traits.trim() && char.traits !== 'undefined') {
        description = char.traits.trim();
      }
      
      const base = {
        name: char.name || '',
        type: char.type || 'unknown',
        description: description,
        role: char.role || 'character',
      };
      // Preserve reference images for continuation — required for character consistency across episodes
      if (char.id) (base as any).id = char.id;
      if (char.referencePhotos && Array.isArray(char.referencePhotos)) (base as any).referencePhotos = char.referencePhotos;
      if (char.turnaroundSheet && typeof char.turnaroundSheet === 'object') (base as any).turnaroundSheet = char.turnaroundSheet;
      if (char.appearance && typeof char.appearance === 'string') (base as any).appearance = char.appearance;
      return base;
    });
  };
  
  // Extract environments for continuation (metadata.environments or fallback from scenes)
  let previousEnvironments: Array<{ id: string; name: string; description: string; characterOutfits?: string }> = [];
  if (metadata?.environments && Array.isArray(metadata.environments) && metadata.environments.length > 0) {
    previousEnvironments = metadata.environments.map((e: any) => ({
      id: e.id || '',
      name: e.name || e.id || '',
      description: e.description || '',
      characterOutfits: typeof e.characterOutfits === 'string' ? e.characterOutfits : undefined,
    }));
  } else if (scenes && Array.isArray(scenes)) {
    const envIds = new Set<string>();
    for (const scene of scenes) {
      const envId = (scene as any).environmentId;
      if (envId && !envIds.has(envId)) {
        envIds.add(envId);
        const setting = (scene as any).sceneVisual?.setting?.trim();
        previousEnvironments.push({
          id: envId,
          name: envId.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: setting || `A location described in the story (${envId}).`,
          characterOutfits: '',
        });
      }
    }
  }

  logger.debug({
    userProvidedCount: userProvidedCharacters.length,
    llmGeneratedCount: llmGeneratedCharacters.length,
    sceneSummariesCount: sceneSummaries.length,
    firstSummaryPreview: sceneSummaries[0]?.slice(0, 50),
    previousEnvironmentsCount: previousEnvironments.length,
  }, 'Building initial context');

  return {
    previousOutlines: [{
      title: story.title,
      moral: outline?.moral || '',
      scenes: sceneSummaries.map((summary, idx) => ({
        setting: '', // Not critical for continuation
        goal: summary, // Use summary as goal
      })),
    }],
    requiredCharacters: formatCharacters(userProvidedCharacters), // User-provided = MUST use
    optionalCharacters: formatCharacters(llmGeneratedCharacters), // LLM-generated = MAY use
    usedPlots: sceneSummaries, // Use scene summaries as used plots
    previousEnvironments,
  };
}

/**
 * Extract plot elements to avoid repetition
 */
function extractUsedPlots(outline: any): string[] {
  if (!outline?.scenes) return [];
  
  // Extract high-level plot beats from scene goals
  return outline.scenes.map((s: any) => s.goal.toLowerCase());
}

/**
 * Update series after generating continuation
 */
export async function addContinuationToSeries(
  seriesId: string,
  newStoryId: string,
  newStory: Story
): Promise<void> {
  const series = await getStoryRepository().findSeriesById(seriesId);
  
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }
  
  const metadata = newStory.metadata as any;
  const llmGeneratedCharacters = metadata?.llmGeneratedCharacters || [];
  const outline = newStory.outline as any;
  const scenes = newStory.scenes as any[]; // Actual scene data with text
  
  // Extract scene summaries - handle both outline mode and direct mode
  const sceneSummaries = [];
  if (outline?.scenes && Array.isArray(outline.scenes)) {
    for (let i = 0; i < outline.scenes.length; i++) {
      const outlineScene = outline.scenes[i];
      const actualScene = scenes?.[i]; // Match by index
      
      // Priority order: goal -> setting -> sceneVisual.setting -> visualPrompt -> first 200 chars of actual scene text
      let summary = outlineScene.goal || outlineScene.setting || outlineScene.sceneVisual?.setting || outlineScene.visualPrompt;
      
      // If no summary fields, use beginning of actual scene text
      if ((!summary || !summary.trim()) && actualScene?.text) {
        summary = actualScene.text.slice(0, 200).trim();
      }
      
      if (summary && summary.trim()) {
        sceneSummaries.push(summary.trim());
      }
    }
  } else if (scenes && Array.isArray(scenes)) {
    // Fallback: if no outline, use actual scenes directly
    for (const scene of scenes) {
      const summary = scene.text ? scene.text.slice(0, 200).trim() : '';
      if (summary) {
        sceneSummaries.push(summary);
      }
    }
  }
  
  // Format character descriptions while preserving reference images (same as buildInitialContext)
  const formatCharacters = (chars: any[]) => {
    return chars.map((char: any) => {
      let description = '';
      if (char.description && typeof char.description === 'string' && char.description.trim() && char.description !== 'undefined') {
        description = char.description.trim();
      } else if (char.appearance && typeof char.appearance === 'string' && char.appearance.trim() && char.appearance !== 'undefined') {
        description = char.appearance.trim();
      } else if (char.personality && typeof char.personality === 'string' && char.personality.trim() && char.personality !== 'undefined') {
        description = char.personality.trim();
      } else if (char.traits && typeof char.traits === 'string' && char.traits.trim() && char.traits !== 'undefined') {
        description = char.traits.trim();
      }
      const base = {
        name: char.name || '',
        type: char.type || 'unknown',
        description: description,
        role: char.role || 'character',
      };
      if (char.id) (base as any).id = char.id;
      if (char.referencePhotos && Array.isArray(char.referencePhotos)) (base as any).referencePhotos = char.referencePhotos;
      if (char.turnaroundSheet && typeof char.turnaroundSheet === 'object') (base as any).turnaroundSheet = char.turnaroundSheet;
      if (char.appearance && typeof char.appearance === 'string') (base as any).appearance = char.appearance;
      return base;
    });
  };
  
  const ctx = (series.continuationContext || {}) as {
    previousOutlines: Array<{ title: string; moral: string; scenes: Array<{ setting: string; goal: string }> }>;
    requiredCharacters: any[];
    optionalCharacters: any[];
    usedPlots: string[];
    previousEnvironments?: Array<{ id: string; name: string; description: string; characterOutfits?: string }>;
  };

  // Extract new environments from this episode (metadata.environments or scenes)
  const newEnvs: Array<{ id: string; name: string; description: string; characterOutfits?: string }> = [];
  if (metadata?.environments && Array.isArray(metadata.environments) && metadata.environments.length > 0) {
    for (const e of metadata.environments) {
      newEnvs.push({
        id: e.id || '',
        name: e.name || e.id || '',
        description: e.description || '',
        characterOutfits: typeof e.characterOutfits === 'string' ? e.characterOutfits : undefined,
      });
    }
  } else if (scenes && Array.isArray(scenes)) {
    const envIds = new Set<string>();
    for (const scene of scenes) {
      const envId = (scene as any).environmentId;
      if (envId && !envIds.has(envId)) {
        envIds.add(envId);
        const setting = (scene as any).sceneVisual?.setting?.trim();
        newEnvs.push({
          id: envId,
          name: envId.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: setting || `A location described in the story (${envId}).`,
          characterOutfits: '',
        });
      }
    }
  }

  // Merge previousEnvironments: keep existing, add new (dedupe by id)
  const existingIds = new Set((ctx.previousEnvironments || []).map((e) => e.id));
  const mergedEnvs = [...(ctx.previousEnvironments || [])];
  for (const env of newEnvs) {
    if (env.id && !existingIds.has(env.id)) {
      existingIds.add(env.id);
      mergedEnvs.push(env);
    }
  }

  const updatedContext = {
    ...ctx,
    previousOutlines: [
      ...(ctx.previousOutlines || []),
      {
        title: newStory.title,
        moral: outline?.moral || '',
        scenes: sceneSummaries.map((summary) => ({
          setting: '',
          goal: summary,
        })),
      },
    ],
    // requiredCharacters stay the same (user-provided don't change)
    requiredCharacters: ctx.requiredCharacters || [],
    // Merge new optional characters (LLM-generated from this episode)
    optionalCharacters: mergeCharacters(
      ctx.optionalCharacters || [],
      formatCharacters(llmGeneratedCharacters)
    ),
    usedPlots: [
      ...(ctx.usedPlots || []),
      ...sceneSummaries,
    ],
    previousEnvironments: mergedEnvs,
  };
  
  logger.info({
    seriesId,
    newPartNumber: series.totalParts + 1,
    totalOptionalChars: updatedContext.optionalCharacters.length,
  }, 'Adding continuation to series');
  
  await getStoryRepository().updateSeries(seriesId, {
    totalParts: series.totalParts + 1,
    storyIds: [...(series.storyIds as string[]), newStoryId],
    continuationContext: updatedContext,
    updatedAt: new Date(),
  });
}

/**
 * Merge new characters with existing, avoiding duplicates
 */
function mergeCharacters(existing: any[], newChars: any[]): any[] {
  const merged = [...existing];
  
  for (const char of newChars) {
    if (!merged.find(c => c.name.toLowerCase() === char.name.toLowerCase())) {
      merged.push(char);
    }
  }
  
  return merged;
}

/**
 * Get series information for a story
 */
export async function getSeriesInfo(storyId: string): Promise<{
  seriesId: string;
  baseTitle: string;
  totalParts: number;
  partNumber: number;
  storyIds: string[];
} | null> {
  const story = await getStoryRepository().findById(storyId);
  
  logger.debug({ 
    storyId, 
    foundStory: !!story,
    hasSeriesId: !!story?.seriesId,
    seriesId: story?.seriesId,
    partNumber: story?.partNumber,
  }, 'getSeriesInfo - story lookup');
  
  if (!story || !story.seriesId) {
    return null;
  }
  
  const series = await getStoryRepository().findSeriesById(story.seriesId);
  
  logger.debug({
    storyId,
    seriesId: story.seriesId,
    foundSeries: !!series,
    totalParts: series?.totalParts,
    storyIdsCount: (series?.storyIds as string[])?.length,
  }, 'getSeriesInfo - series lookup');
  
  if (!series) {
    return null;
  }
  
  const result = {
    seriesId: series.id,
    baseTitle: series.baseTitle,
    totalParts: series.totalParts,
    partNumber: story.partNumber || 1,
    storyIds: series.storyIds as string[],
  };
  
  logger.info({
    storyId,
    result,
  }, 'getSeriesInfo - returning result');
  
  return result;
}

/**
 * Remove story from series and update related data
 * Called when a story part is deleted
 */
export async function removeStoryFromSeries(
  storyId: string,
  seriesId: string
): Promise<void> {
  const series = await getStoryRepository().findSeriesById(seriesId);
  
  if (!series) {
    logger.warn({ seriesId, storyId }, 'Series not found when removing story');
    return;
  }
  
  const storyIds = series.storyIds as string[];
  const deletedIndex = storyIds.indexOf(storyId);
  
  if (deletedIndex === -1) {
    logger.warn({ seriesId, storyId }, 'Story not found in series');
    return;
  }
  
  // Remove story from array
  const updatedStoryIds = storyIds.filter(id => id !== storyId);
  
  // If only one story remains, delete the series entirely
  if (updatedStoryIds.length === 1) {
    logger.info({
      seriesId,
      storyId,
      remainingStoryId: updatedStoryIds[0],
    }, 'Only one story remains, deleting series');
    
    // Remove series_id and part_number from remaining story
    await getStoryRepository().updateStory(updatedStoryIds[0], {
      seriesId: null,
      partNumber: null,
    });
    
    // Delete the series
    await getStoryRepository().deleteSeries(seriesId);
    
    logger.info({ seriesId }, 'Series deleted - only one story remained');
    return;
  }
  
  // Update series
  await getStoryRepository().updateSeries(seriesId, {
    totalParts: series.totalParts - 1,
    storyIds: updatedStoryIds,
    updatedAt: new Date(),
  });
  
  // Update part_number for remaining stories
  // Stories after the deleted one need their part_number decremented
  for (let i = deletedIndex; i < updatedStoryIds.length; i++) {
    await getStoryRepository().updateStory(updatedStoryIds[i], { partNumber: i + 1 });
  }
  
  logger.info({
    seriesId,
    storyId,
    newTotalParts: series.totalParts - 1,
    remainingStories: updatedStoryIds.length,
  }, 'Story removed from series');
}
