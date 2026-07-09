/**
 * Series Service
 * Business logic for managing story series and continuations
 */

import { getStoryRepository } from '../repositories';
import type { Story } from '../db/schema';
import logger from '../utils/logger';
import { loadStoryCoverAssets } from './storyCoverService';
import { stripCharacterIdFromName } from '@wondertales/shared';

function normalizeContinuationCharacterName(name: unknown): string {
  return typeof name === 'string'
    ? stripCharacterIdFromName(name).trim().normalize('NFC').toLocaleLowerCase()
    : '';
}

function continuationCharacterKeys(char: any): string[] {
  const keys: string[] = [];
  if (typeof char?.id === 'string' && char.id.trim()) keys.push(`id:${char.id.trim()}`);
  const name = normalizeContinuationCharacterName(char?.name);
  if (name) keys.push(`name:${name}`);
  return keys;
}

function pickContinuationDescription(char: any): string {
  for (const value of [char?.description, char?.appearance, char?.personality, char?.traits]) {
    if (typeof value === 'string' && value.trim() && value !== 'undefined') {
      return value.trim();
    }
  }
  return '';
}

function formatContinuationCharacters(chars: any[]): any[] {
  return (chars || [])
    .map((char) => {
      const base = {
        name: char?.name || '',
        type: char?.type || 'unknown',
        description: pickContinuationDescription(char),
        role: char?.role || 'character',
      };
      if (char?.id) (base as any).id = char.id;
      if (char?.subtype) (base as any).subtype = char.subtype;
      if (char?.childProfileId) (base as any).childProfileId = char.childProfileId;
      if (Array.isArray(char?.referencePhotos)) (base as any).referencePhotos = char.referencePhotos;
      if (char?.turnaroundSheet && typeof char.turnaroundSheet === 'object') {
        (base as any).turnaroundSheet = char.turnaroundSheet;
      }
      if (typeof char?.appearance === 'string') (base as any).appearance = char.appearance;
      return base;
    })
    .filter((char) => normalizeContinuationCharacterName(char.name));
}

function mergeContinuationCharacters(preferred: any[], fallback: any[]): any[] {
  const merged: any[] = [];
  const seen = new Set<string>();

  for (const char of [...formatContinuationCharacters(preferred), ...formatContinuationCharacters(fallback)]) {
    const keys = continuationCharacterKeys(char);
    if (keys.some((key) => seen.has(key))) continue;
    merged.push(char);
    for (const key of keys) seen.add(key);
  }

  return merged;
}

function removeCharactersAlreadyRequired(optionalCharacters: any[], requiredCharacters: any[]): any[] {
  const requiredKeys = new Set(requiredCharacters.flatMap(continuationCharacterKeys));
  return formatContinuationCharacters(optionalCharacters).filter(
    (char) => !continuationCharacterKeys(char).some((key) => requiredKeys.has(key))
  );
}

async function buildRequiredCharactersFromLinkedStory(storyId: string): Promise<any[]> {
  const linked = await getStoryRepository().findLinkedCharactersByStoryId(storyId);
  return formatContinuationCharacters(linked.filter((char) => !char.isHidden));
}

async function normalizeExistingContinuationContext(story: Story, series: any): Promise<any> {
  const ctx = (series.continuationContext || {}) as any;
  const storyIds = Array.isArray(series.storyIds) ? (series.storyIds as string[]) : [];
  const anchorStoryId = storyIds[0] || story.id;
  const linkedRequired = await buildRequiredCharactersFromLinkedStory(anchorStoryId);
  if (linkedRequired.length === 0) return ctx;

  const requiredCharacters = mergeContinuationCharacters(linkedRequired, ctx.requiredCharacters || []);
  const optionalCharacters = removeCharactersAlreadyRequired(
    ctx.optionalCharacters || [],
    requiredCharacters
  );
  const normalizedContext = {
    ...ctx,
    requiredCharacters,
    optionalCharacters,
  };

  if (JSON.stringify(normalizedContext) !== JSON.stringify(ctx)) {
    await getStoryRepository().updateSeries(series.id, {
      continuationContext: normalizedContext,
      updatedAt: new Date(),
    });
    logger.info(
      {
        seriesId: series.id,
        anchorStoryId,
        requiredCount: requiredCharacters.length,
        optionalCount: optionalCharacters.length,
      },
      'Normalized existing series continuation character context'
    );
  }

  return normalizedContext;
}

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
    
    const continuationContext = await normalizeExistingContinuationContext(story, series);
    logger.info({ seriesId: series.id, totalParts: series.totalParts }, 'Found existing series');
    
    return {
      seriesId: series.id,
      partNumber: series.totalParts,
      continuationContext,
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
    continuationContext: await buildInitialContext(story),
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
async function buildInitialContext(story: Story): Promise<any> {
  const outline = story.outline as any;
  const metadata = story.metadata as any;
  const scenes = story.scenes as any[]; // Actual scene data with text
  const linkedCharacters = await getStoryRepository().findLinkedCharactersByStoryId(story.id);
  
  // Separate user-provided characters (from wizard) and LLM-generated characters
  const linkedRequiredCharacters = linkedCharacters.filter((char) => !char.isHidden);
  const linkedOptionalCharacters = linkedCharacters.filter((char) => char.isHidden);
  const userProvidedCharacters =
    linkedRequiredCharacters.length > 0 ? linkedRequiredCharacters : metadata?.mergedCharacters || [];
  const llmGeneratedCharacters =
    linkedOptionalCharacters.length > 0 ? linkedOptionalCharacters : metadata?.llmGeneratedCharacters || [];
  
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

  const previousOutfits = Array.isArray(metadata?.outfits) ? metadata.outfits : [];

  return {
    previousOutlines: [{
      title: story.title,
      moral: outline?.moral || '',
      scenes: sceneSummaries.map((summary, idx) => ({
        setting: '', // Not critical for continuation
        goal: summary, // Use summary as goal
      })),
    }],
    requiredCharacters: formatContinuationCharacters(userProvidedCharacters), // User-provided = MUST use
    optionalCharacters: removeCharactersAlreadyRequired(
      llmGeneratedCharacters,
      formatContinuationCharacters(userProvidedCharacters)
    ), // LLM-generated = MAY use
    usedPlots: sceneSummaries, // Use scene summaries as used plots
    previousEnvironments,
    previousOutfits,
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
    previousOutfits?: Array<{ id: string; characterName: string; description: string }>;
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

  const newOutfitRows: Array<{ id: string; characterName: string; description: string }> = Array.isArray(
    metadata?.outfits,
  )
    ? metadata.outfits
    : [];
  const existingOutfitIds = new Set((ctx.previousOutfits || []).map((o) => o.id));
  const mergedOutfits = [...(ctx.previousOutfits || [])];
  for (const o of newOutfitRows) {
    if (o?.id && !existingOutfitIds.has(o.id)) {
      existingOutfitIds.add(o.id);
      mergedOutfits.push({
        id: o.id,
        characterName: o.characterName || '',
        description: o.description || '',
      });
    }
  }

  const requiredCharacters = formatContinuationCharacters(ctx.requiredCharacters || []);
  const existingOptionalCharacters = removeCharactersAlreadyRequired(
    ctx.optionalCharacters || [],
    requiredCharacters
  );
  const newOptionalCharacters = removeCharactersAlreadyRequired(
    formatCharacters(llmGeneratedCharacters),
    requiredCharacters
  );

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
    requiredCharacters,
    // Merge new optional characters (LLM-generated from this episode)
    optionalCharacters: mergeCharacters(existingOptionalCharacters, newOptionalCharacters),
    usedPlots: [
      ...(ctx.usedPlots || []),
      ...sceneSummaries,
    ],
    previousEnvironments: mergedEnvs,
    previousOutfits: mergedOutfits,
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
 * List all series for a user (for series list screen)
 * Returns series with last 3 stories' cover images
 */
export async function listUserSeries(userId: string): Promise<
  Array<{
    id: string;
    baseTitle: string;
    totalParts: number;
    storyIds: string[];
    lastStories: Array<{ id: string; coverImageUrl: string | null; coverThumbnailUrl: string | null }>;
  }>
> {
  const allSeries = await getStoryRepository().findSeriesByUserId(userId);
  if (allSeries.length === 0) {
    return [];
  }

  // Collect all story IDs we need (last 3 per series)
  const storyIdsToFetch: string[] = [];
  const seriesToStoryIds = new Map<string, string[]>();
  for (const series of allSeries) {
    const ids = (series.storyIds as string[]) || [];
    const lastThree = ids.slice(-3);
    seriesToStoryIds.set(series.id, lastThree);
    storyIdsToFetch.push(...lastThree);
  }

  const uniqueStoryIds = [...new Set(storyIdsToFetch)];
  const storyRows = await getStoryRepository().findStoriesByIdsWithScenes(uniqueStoryIds);
  const coverByStoryId = await loadStoryCoverAssets(
    storyRows.map((story) => ({ id: story.id, coverAssetId: story.coverAssetId }))
  );

  const getCoverForStory = (storyId: string) => {
    const cover = coverByStoryId.get(storyId);
    return {
      coverImageUrl: cover?.imageUrl ?? null,
      coverThumbnailUrl: cover?.thumbnailUrl ?? null,
    };
  };

  return allSeries.map((series) => {
    const lastIds = seriesToStoryIds.get(series.id) || [];
    const lastStories = lastIds.map((id) => ({
      id,
      ...getCoverForStory(id),
    }));
    return {
      id: series.id,
      baseTitle: series.baseTitle,
      totalParts: series.totalParts,
      storyIds: series.storyIds as string[],
      lastStories,
    };
  });
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

  const storyIds = series.storyIds as string[];
  const titleRows = await getStoryRepository().findTitlesByIds(storyIds);
  const idToTitle = new Map(titleRows.map((r) => [r.id, r.title]));
  const storyTitles = storyIds.map((id) => idToTitle.get(id) ?? '');

  const result = {
    seriesId: series.id,
    baseTitle: series.baseTitle,
    totalParts: series.totalParts,
    partNumber: story.partNumber || 1,
    storyIds,
    storyTitles,
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
