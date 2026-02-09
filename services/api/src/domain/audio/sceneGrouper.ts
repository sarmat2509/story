/**
 * Scene Grouper for Optimal Parallel Audio Generation
 * 
 * Groups scenes into optimal number of chunks to maximize parallel generation
 * while respecting ElevenLabs 4500 character limit per request.
 * 
 * Algorithm:
 * 1. Calculate optimal chunks = max(concurrencyLimit, ceil(totalChars / 4500))
 * 2. Distribute scenes evenly across chunks
 * 3. Respect scene boundaries (never split a scene)
 */

import { logger } from '../../utils/logger';

export interface SceneGroup {
  scenes: Array<{ sceneId: number; text: string }>;
  text: string;
  totalChars: number;
}

/**
 * Calculate optimal number of chunks for parallel generation
 * @param totalChars - Total character count across all scenes
 * @param concurrencyLimit - User's plan concurrency limit (2-30)
 * @returns Optimal number of chunks
 */
function calculateOptimalChunks(
  totalChars: number,
  concurrencyLimit: number
): number {
  const MAX_CHARS_PER_CHUNK = 4500; // Safety margin under ElevenLabs 5000 limit

  // Minimum chunks needed to stay under char limit
  const minChunksForCharLimit = Math.ceil(totalChars / MAX_CHARS_PER_CHUNK);

  // Use at least concurrency limit (to maximize parallelism)
  // But respect char limit if it requires more chunks
  return Math.max(concurrencyLimit, minChunksForCharLimit);
}

/**
 * Group scenes into optimal chunks for parallel generation
 * 
 * Maximizes parallelism while respecting 4500 char limit per chunk.
 * Distributes scenes evenly across chunks.
 * 
 * @param scenes - Array of scene objects with sceneId and text
 * @param concurrencyLimit - User's plan concurrency limit (2-30)
 * @returns Array of scene groups optimized for parallel generation
 * 
 * @example
 * // 4K chars, 5 concurrent → 5 chunks × 800 chars (maximize parallelism!)
 * groupScenesIntoChunks(scenes_4000, 5) // → 5 groups
 * 
 * // 20K chars, 5 concurrent → 5 chunks × 4K chars (perfect!)
 * groupScenesIntoChunks(scenes_20000, 5) // → 5 groups
 * 
 * // 40K chars, 5 concurrent → 9 chunks × 4.4K chars (char limit wins)
 * groupScenesIntoChunks(scenes_40000, 5) // → 9 groups
 */
export function groupScenesIntoChunks(
  scenes: Array<{ sceneId: number; text: string }>,
  concurrencyLimit: number
): SceneGroup[] {
  if (scenes.length === 0) {
    return [];
  }

  // CRITICAL: Sort scenes by sceneId to ensure correct narrative order in audio
  // Without sorting, audio may start from middle of story
  const sortedScenes = [...scenes].sort((a, b) => a.sceneId - b.sceneId);

  // Calculate total characters
  const totalChars = sortedScenes.reduce((sum, scene) => sum + scene.text.length, 0);

  // Calculate optimal number of chunks
  const targetChunks = calculateOptimalChunks(totalChars, concurrencyLimit);
  const targetCharsPerChunk = Math.ceil(totalChars / targetChunks);

  logger.info(
    {
      totalScenes: sortedScenes.length,
      sceneIds: sortedScenes.map(s => s.sceneId),
      totalChars,
      concurrencyLimit,
      targetChunks,
      targetCharsPerChunk,
    },
    'Calculating optimal scene groups (sorted by sceneId)'
  );

  const groups: SceneGroup[] = [];
  let currentGroup: SceneGroup = {
    scenes: [],
    text: '',
    totalChars: 0,
  };

  for (const scene of sortedScenes) {
    const sceneLength = scene.text.length;

    // If adding this scene would exceed target AND we have scenes in current group,
    // start new group
    if (
      currentGroup.totalChars > 0 &&
      currentGroup.totalChars + sceneLength > targetCharsPerChunk
    ) {
      groups.push(currentGroup);
      currentGroup = {
        scenes: [],
        text: '',
        totalChars: 0,
      };
    }

    // Add scene to current group
    currentGroup.scenes.push(scene);
    currentGroup.text += (currentGroup.text ? ' ' : '') + scene.text;
    currentGroup.totalChars += sceneLength;
  }

  // Add final group if it has content
  if (currentGroup.scenes.length > 0) {
    groups.push(currentGroup);
  }

  logger.info(
    {
      actualGroups: groups.length,
      groupSizes: groups.map((g) => g.totalChars),
      groupSceneIds: groups.map((g) => g.scenes.map(s => s.sceneId)),
    },
    'Scene groups created with sorted scenes'
  );

  return groups;
}
