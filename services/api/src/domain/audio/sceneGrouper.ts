/**
 * Scene Grouper for Optimal Parallel Audio Generation
 *
 * Groups scenes into optimal number of chunks to maximize parallel generation
 * while respecting provider char limit per request.
 *
 * Algorithm:
 * 1. Expand long scenes into sentence-bounded fragments (never split mid-sentence)
 * 2. Calculate optimal chunks = max(concurrencyLimit, ceil(totalChars / maxCharsPerChunk))
 * 3. Distribute scenes/fragments evenly across chunks
 * 4. Respect scene boundaries for short scenes; split long scenes by sentences
 */

import { logger } from '../../utils/logger';

export interface SceneGroup {
  scenes: Array<{ sceneId: number; text: string }>;
  text: string;
  totalChars: number;
}

/** Split text by sentence boundaries (. ! ? … ;) — keeps punctuation with sentence */
const SENTENCE_END_RE = /(?<=[.!?…;])\s+/;

/**
 * Split a long scene into sentence-bounded fragments under maxChars.
 * If a single sentence exceeds max, split by comma/semicolon; last resort: by char count.
 */
function splitSceneBySentences(
  text: string,
  sceneId: number,
  maxCharsPerChunk: number
): Array<{ sceneId: number; text: string }> {
  if (text.length <= maxCharsPerChunk) {
    return [{ sceneId, text: text.trim() }];
  }
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = trimmed.split(SENTENCE_END_RE).map((s) => s.trim()).filter(Boolean);
  const result: Array<{ sceneId: number; text: string }> = [];
  let current = '';

  for (const sent of sentences) {
    const withSpace = current ? ' ' + sent : sent;
    if (current.length + withSpace.length <= maxCharsPerChunk) {
      current = current ? current + ' ' + sent : sent;
    } else {
      if (current) {
        result.push({ sceneId, text: current });
      }
      // Single sentence exceeds max — split by comma or fixed length
      if (sent.length > maxCharsPerChunk) {
        const parts = splitLongFragment(sent, maxCharsPerChunk);
        for (let i = 0; i < parts.length; i++) {
          result.push({ sceneId, text: parts[i] });
        }
        current = '';
      } else {
        current = sent;
      }
    }
  }
  if (current) result.push({ sceneId, text: current });
  return result;
}

/** Split a fragment that exceeds maxChars — by comma/semicolon, then by spaces, last resort by char */
function splitLongFragment(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const byClause = text.split(/(?<=[,;:])\s+/);
  const result: string[] = [];
  let current = '';
  for (const part of byClause) {
    const withSpace = current ? ' ' + part : part;
    if (current.length + withSpace.length <= maxChars) {
      current = current ? current + ' ' + part : part;
    } else {
      if (current) result.push(current);
      if (part.length > maxChars) {
        const words = part.split(/\s+/);
        let buf = '';
        for (const w of words) {
          const withSpace = buf ? ' ' + w : w;
          if (buf.length + withSpace.length <= maxChars) {
            buf = buf ? buf + ' ' + w : w;
          } else {
            if (buf) result.push(buf);
            buf = w.length <= maxChars ? w : '';
            if (w.length > maxChars) {
              for (let i = 0; i < w.length; i += maxChars) {
                result.push(w.slice(i, i + maxChars));
              }
            }
          }
        }
        current = buf;
      } else {
        current = part;
      }
    }
  }
  if (current) result.push(current);
  return result;
}

/**
 * Expand scenes into atomic units: whole scene or sentence-bounded fragments for long scenes.
 */
function expandScenesToAtomicUnits(
  scenes: Array<{ sceneId: number; text: string }>,
  maxCharsPerChunk: number
): Array<{ sceneId: number; text: string }> {
  const units: Array<{ sceneId: number; text: string }> = [];
  for (const scene of scenes) {
    const fragments = splitSceneBySentences(scene.text, scene.sceneId, maxCharsPerChunk);
    units.push(...fragments);
  }
  return units;
}

/**
 * Calculate optimal number of chunks for parallel generation
 * @param totalChars - Total character count across all scenes
 * @param concurrencyLimit - User's plan concurrency limit (2-30)
 * @param maxCharsPerChunk - Max chars per chunk (provider-specific; Google TTS: 4000 bytes ≈ 2000 chars for UTF-8)
 * @returns Optimal number of chunks
 */
function calculateOptimalChunks(
  totalChars: number,
  concurrencyLimit: number,
  maxCharsPerChunk: number = 4500
): number {
  // Minimum chunks needed to stay under char limit
  const minChunksForCharLimit = Math.ceil(totalChars / maxCharsPerChunk);

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
 * @param maxCharsPerChunk - Max chars per chunk (default 4500 for ElevenLabs; use 2000 for Google TTS 4000-byte limit)
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
  concurrencyLimit: number,
  maxCharsPerChunk: number = 4500
): SceneGroup[] {
  if (scenes.length === 0) {
    return [];
  }

  // CRITICAL: Sort scenes by sceneId to ensure correct narrative order in audio
  const sortedScenes = [...scenes].sort((a, b) => a.sceneId - b.sceneId);

  // Expand long scenes into sentence-bounded fragments (never split mid-sentence)
  const atomicUnits = expandScenesToAtomicUnits(sortedScenes, maxCharsPerChunk);
  const totalChars = atomicUnits.reduce((sum, u) => sum + u.text.length, 0);

  const targetChunks = calculateOptimalChunks(totalChars, concurrencyLimit, maxCharsPerChunk);
  const targetCharsPerChunk = Math.min(Math.ceil(totalChars / targetChunks), maxCharsPerChunk);

  const splitCount = atomicUnits.length - sortedScenes.length;
  logger.info(
    {
      totalScenes: sortedScenes.length,
      atomicUnits: atomicUnits.length,
      scenesSplitBySentences: splitCount > 0 ? splitCount : 0,
      totalChars,
      concurrencyLimit,
      targetChunks,
      targetCharsPerChunk,
    },
    'Calculating optimal scene groups (sentence-bounded)'
  );

  const groups: SceneGroup[] = [];
  let currentGroup: SceneGroup = {
    scenes: [],
    text: '',
    totalChars: 0,
  };

  for (const unit of atomicUnits) {
    const unitLength = unit.text.length;

    if (
      currentGroup.totalChars > 0 &&
      currentGroup.totalChars + unitLength > targetCharsPerChunk
    ) {
      groups.push(currentGroup);
      currentGroup = { scenes: [], text: '', totalChars: 0 };
    }

    currentGroup.scenes.push(unit);
    currentGroup.text += (currentGroup.text ? ' ' : '') + unit.text;
    currentGroup.totalChars += unitLength;
  }

  if (currentGroup.scenes.length > 0) {
    groups.push(currentGroup);
  }

  logger.info(
    {
      actualGroups: groups.length,
      groupSizes: groups.map((g) => g.totalChars),
      maxGroupSize: groups.length > 0 ? Math.max(...groups.map((g) => g.totalChars)) : 0,
    },
    'Scene groups created (sentence-bounded, under char limit)'
  );

  return groups;
}
