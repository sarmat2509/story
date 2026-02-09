/**
 * Reference Image Tracker
 * Tracks which characters appear in which generated images
 * Selects optimal reference images for new scene generation
 */

import { db } from '../db';
import { scenes as scenesTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface ReferenceImageInfo {
  sceneId: number;
  sceneDbId: string; // UUID from scenes table
  imageUrl: string;
  charactersPresent: string[]; // Normalized names
}

export interface ReferenceSelection {
  referenceImages: ReferenceImageInfo[]; // Ordered by priority
  newCharactersIntroduced: string[]; // Characters not in any previous reference
  shouldMarkAsReference: boolean; // True if introduces new characters
}

/**
 * Get all reference images for a story (sorted by sceneId)
 */
export async function getStoryReferenceImages(storyId: string): Promise<ReferenceImageInfo[]> {
  const referenceScenes = await db
    .select()
    .from(scenesTable)
    .where(
      and(
        eq(scenesTable.storyId, storyId),
        eq(scenesTable.isReferenceImage, true)
      )
    )
    .orderBy(scenesTable.sceneId);
  
  return referenceScenes
    .filter(scene => scene.imageUrl && scene.charactersPresent)
    .map(scene => ({
      sceneId: scene.sceneId,
      sceneDbId: scene.id,
      imageUrl: scene.imageUrl!,
      charactersPresent: scene.charactersPresent as string[],
    }));
}

/**
 * Select optimal reference images for a scene based on character needs
 * 
 * Strategy:
 * 1. Try to find a single reference with ALL needed characters
 * 2. If not found, combine multiple references (max 3 for performance)
 * 3. Prioritize earlier scenes (more likely to be consistent)
 */
export async function selectReferencesForScene(
  storyId: string,
  requiredCharacters: string[], // Normalized names
  currentSceneId: number
): Promise<ReferenceSelection> {
  const availableReferences = await getStoryReferenceImages(storyId);
  
  // Filter only references generated BEFORE current scene
  const previousReferences = availableReferences.filter(ref => ref.sceneId < currentSceneId);
  
  if (previousReferences.length === 0) {
    return {
      referenceImages: [],
      newCharactersIntroduced: requiredCharacters,
      shouldMarkAsReference: true, // First scene with these characters
    };
  }
  
  // Track which characters we've seen
  const seenCharacters = new Set<string>();
  previousReferences.forEach(ref => {
    ref.charactersPresent.forEach(char => seenCharacters.add(char));
  });
  
  // Find new characters
  const newCharacters = requiredCharacters.filter(char => !seenCharacters.has(char));
  
  // Strategy 1: Try to find single reference with ALL characters
  const perfectMatch = previousReferences.find(ref =>
    requiredCharacters.every(char => ref.charactersPresent.includes(char))
  );
  
  if (perfectMatch) {
    logger.info({
      sceneId: currentSceneId,
      requiredCharacters,
      selectedReference: perfectMatch.sceneId,
    }, 'Found perfect reference match');
    
    return {
      referenceImages: [perfectMatch],
      newCharactersIntroduced: newCharacters,
      shouldMarkAsReference: newCharacters.length > 0,
    };
  }
  
  // Strategy 2: Combine multiple references (greedy algorithm)
  const selectedRefs: ReferenceImageInfo[] = [];
  const coveredCharacters = new Set<string>();
  
  for (const char of requiredCharacters) {
    if (coveredCharacters.has(char)) continue;
    
    // Find best reference for this character
    const bestRef = previousReferences.find(ref => ref.charactersPresent.includes(char));
    
    if (bestRef && !selectedRefs.includes(bestRef)) {
      selectedRefs.push(bestRef);
      bestRef.charactersPresent.forEach(c => coveredCharacters.add(c));
    }
    
    // Limit to 3 references for performance
    if (selectedRefs.length >= 3) break;
  }
  
  logger.info({
    sceneId: currentSceneId,
    requiredCharacters,
    selectedReferences: selectedRefs.map(r => r.sceneId),
    coverage: `${coveredCharacters.size}/${requiredCharacters.length}`,
    newCharacters,
  }, 'Selected multiple references');
  
  return {
    referenceImages: selectedRefs,
    newCharactersIntroduced: newCharacters,
    shouldMarkAsReference: newCharacters.length > 0,
  };
}

/**
 * Mark scene as reference image and save character presence
 */
export async function markSceneAsReference(
  sceneDbId: string,
  charactersPresent: string[],
  imageUrl: string
): Promise<void> {
  await db
    .update(scenesTable)
    .set({
      isReferenceImage: true,
      charactersPresent: charactersPresent,
      imageUrl: imageUrl,
    })
    .where(eq(scenesTable.id, sceneDbId));
  
  logger.info({
    sceneDbId,
    charactersPresent,
    characterCount: charactersPresent.length,
  }, 'Scene marked as reference image');
}

/**
 * Load reference image data (base64) for image generation
 */
export async function loadReferenceImageData(
  imageUrl: string,
  assetStorage: any
): Promise<{ base64: string; mimeType: string }> {
  const imageBuffer = await assetStorage.getAssetByPath(imageUrl);
  
  if (!imageBuffer) {
    throw new Error(`Failed to load reference image: ${imageUrl}`);
  }
  
  return {
    base64: imageBuffer.toString('base64'),
    mimeType: 'image/png', // Our system stores PNGs
  };
}
