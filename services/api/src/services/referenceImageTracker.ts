/**
 * Reference Image Tracker
 * Tracks which characters appear in which generated images
 * Selects optimal reference images for new scene generation
 */

import { getSceneRepository } from '../repositories';
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
  const referenceScenes = await getSceneRepository().findReferenceImages(storyId);
  
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
 * Hybrid strategy (Google Asset Graph pattern):
 * 1. Find the LATEST scene with ALL needed characters (recency > earliest)
 * 2. If no perfect match, greedy coverage preferring most recent scenes
 * 3. Add previous scene for style/environment continuity (if slot available)
 * 4. Up to 2 scene references total (alongside turnaround sheets)
 */
export async function selectReferencesForScene(
  storyId: string,
  requiredCharacters: string[], // Normalized names
  currentSceneId: number
): Promise<ReferenceSelection> {
  const availableReferences = await getStoryReferenceImages(storyId);
  return selectReferencesFromPreloaded(availableReferences, requiredCharacters, currentSceneId);
}

/**
 * Select optimal reference images from a pre-loaded set.
 * Use this overload inside per-scene loops to avoid N+1 DB queries.
 *
 * Returns up to 2 scene references:
 *   - Slot 1: latest character-matching scene (best validated version of characters)
 *   - Slot 2: previous scene (style/environment continuity), if different from slot 1
 */
export function selectReferencesFromPreloaded(
  availableReferences: ReferenceImageInfo[],
  requiredCharacters: string[], // Normalized names
  currentSceneId: number
): ReferenceSelection {
  // Filter only references generated BEFORE current scene
  const previousReferences = availableReferences.filter(ref => ref.sceneId < currentSceneId);
  
  if (previousReferences.length === 0) {
    return {
      referenceImages: [],
      newCharactersIntroduced: requiredCharacters,
      shouldMarkAsReference: true, // First scene with these characters
    };
  }
  
  // Track which characters we've seen in any previous reference
  const seenCharacters = new Set<string>();
  previousReferences.forEach(ref => {
    ref.charactersPresent.forEach(char => seenCharacters.add(char));
  });
  
  const newCharacters = requiredCharacters.filter(char => !seenCharacters.has(char));

  const selectedRefs: ReferenceImageInfo[] = [];

  // Strategy 1: Find LATEST perfect match (all required characters in one scene)
  // Reverse iteration: most recent first (previousReferences is sorted by sceneId ASC)
  let latestPerfectMatch: ReferenceImageInfo | undefined;
  for (let i = previousReferences.length - 1; i >= 0; i--) {
    const ref = previousReferences[i];
    if (requiredCharacters.every(char => ref.charactersPresent.includes(char))) {
      latestPerfectMatch = ref;
      break;
    }
  }

  if (latestPerfectMatch) {
    selectedRefs.push(latestPerfectMatch);
    logger.info({
      sceneId: currentSceneId,
      requiredCharacters,
      selectedReference: latestPerfectMatch.sceneId,
    }, 'Found latest perfect reference match');
  } else {
    // Strategy 2: Greedy coverage preferring most recent scenes
    const coveredCharacters = new Set<string>();
    for (const char of requiredCharacters) {
      if (coveredCharacters.has(char)) continue;

      // Reverse search: prefer most recent scene containing this character
      let bestRef: ReferenceImageInfo | undefined;
      for (let i = previousReferences.length - 1; i >= 0; i--) {
        if (previousReferences[i].charactersPresent.includes(char)) {
          bestRef = previousReferences[i];
          break;
        }
      }

      if (bestRef && !selectedRefs.includes(bestRef)) {
        selectedRefs.push(bestRef);
        bestRef.charactersPresent.forEach(c => coveredCharacters.add(c));
      }

      if (selectedRefs.length >= 2) break;
    }

    logger.info({
      sceneId: currentSceneId,
      requiredCharacters,
      selectedReferences: selectedRefs.map(r => r.sceneId),
      coverage: `${coveredCharacters.size}/${requiredCharacters.length}`,
      newCharacters,
    }, 'Selected character-matching references (recency-biased)');
  }

  // Strategy 3: Add previous scene for style/environment continuity
  const previousScene = previousReferences[previousReferences.length - 1];
  if (
    previousScene &&
    !selectedRefs.some(r => r.sceneId === previousScene.sceneId) &&
    selectedRefs.length < 2
  ) {
    selectedRefs.push(previousScene);
    logger.info({
      sceneId: currentSceneId,
      addedPreviousScene: previousScene.sceneId,
    }, 'Added previous scene for style/environment continuity');
  }
  
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
  await getSceneRepository().markAsReference(sceneDbId, charactersPresent, imageUrl);
  
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
  // Strip query parameters (signed URLs contain ?token=...&expires=...)
  const cleanUrl = imageUrl.split('?')[0];
  const imageBuffer = await assetStorage.getAssetByPath(cleanUrl);
  
  if (!imageBuffer) {
    throw new Error(`Failed to load reference image: ${imageUrl}`);
  }
  
  return {
    base64: imageBuffer.toString('base64'),
    mimeType: 'image/png', // Our system stores PNGs
  };
}
