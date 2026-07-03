import { stripCharacterIdFromName } from '@wondertales/shared';
import { logger } from '../utils/logger';
import type { ReferenceImageKind } from '../utils/referenceImageKind';
import { inferReferenceKind } from '../utils/referenceImageKind';

export type { ReferenceImageKind };

export function isPlaceholderReferenceName(name?: string | null): boolean {
  const base = stripCharacterIdFromName(name || '')
    .trim()
    .toLowerCase();
  return base === 'unknown' || base === 'unnamed';
}

/**
 * Resolve a single placeholder ref name (e.g. "unknown") to the one scene character
 * that is still unmatched by explicit reference names. Returns a map keyed by the
 * original placeholder token so call sites can preserve existing imageIndex lookup.
 */
export function buildPlaceholderReferenceNameMap(
  referenceNames: Array<string | undefined | null>,
  candidateCharacterNames: Array<string | undefined | null>
): Map<string, string> {
  const explicitReferenceNames = new Set(
    referenceNames
      .filter(
        (name): name is string => typeof name === 'string' && !isPlaceholderReferenceName(name)
      )
      .map((name) => stripCharacterIdFromName(name).trim().toLowerCase())
      .filter(Boolean)
  );

  const placeholderRefs = referenceNames.filter(
    (name): name is string => typeof name === 'string' && isPlaceholderReferenceName(name)
  );

  const unmatchedCandidates: string[] = [];
  const seenCandidates = new Set<string>();
  for (const candidate of candidateCharacterNames) {
    if (typeof candidate !== 'string') continue;
    const normalized = stripCharacterIdFromName(candidate).trim().toLowerCase();
    if (!normalized || seenCandidates.has(normalized) || explicitReferenceNames.has(normalized))
      continue;
    seenCandidates.add(normalized);
    unmatchedCandidates.push(candidate);
  }

  const resolved = new Map<string, string>();
  if (placeholderRefs.length === 1 && unmatchedCandidates.length === 1) {
    resolved.set(placeholderRefs[0], unmatchedCandidates[0]);
  }
  return resolved;
}

/**
 * In-memory reference row before / after bucket trimming (orchestration → image provider).
 */
export type ReferenceImageDataEntry = {
  base64: string;
  mimeType: string;
  fileUri?: string;
  source?: string;
  type?: string;
  characterName?: string;
  imageIndex?: number;
  referenceKind?: ReferenceImageKind;
  isTurnaround?: boolean;
  charactersPresent?: string[];
  sceneId?: number;
  referenceEnvironmentId?: string;
  outfitId?: string;
  storagePath?: string;
};

/**
 * Apply Gemini 3.1–style buckets: keep up to maxCharacter identity refs and maxObject env/plates.
 * Order preserved: environment, character turnarounds, outfit plates, then any other refs.
 * Objects are trimmed from the end of the object sequence (plates before environment).
 */
export function applyReferenceBucketLimits<T extends ReferenceImageDataEntry>(
  refs: T[],
  maxCharacter: number,
  maxObject: number
): {
  trimmed: T[];
  droppedCharacterCount: number;
  droppedObjectCount: number;
  characterCount: number;
  objectCount: number;
} {
  const env = refs.filter((r) => r.source === 'environment');
  const plates = refs.filter((r) => r.source === 'outfit_plate');
  const chars = refs.filter((r) => inferReferenceKind(r) === 'character');
  const other = refs.filter(
    (r) =>
      inferReferenceKind(r) !== 'character' &&
      r.source !== 'environment' &&
      r.source !== 'outfit_plate'
  );

  const charsKept = chars.slice(0, Math.max(0, maxCharacter));
  const droppedCharacterCount = chars.length - charsKept.length;

  const objectSeq = [...env, ...plates, ...other];
  const objectsKept = objectSeq.slice(0, Math.max(0, maxObject));
  const droppedObjectCount = objectSeq.length - objectsKept.length;

  const envKept = objectsKept.filter((r) => r.source === 'environment');
  const platesKept = objectsKept.filter((r) => r.source === 'outfit_plate');
  const otherKept = objectsKept.filter(
    (r) => r.source !== 'environment' && r.source !== 'outfit_plate'
  );

  const trimmed = [...envKept, ...charsKept, ...platesKept, ...otherKept] as T[];

  return {
    trimmed,
    droppedCharacterCount,
    droppedObjectCount,
    characterCount: charsKept.length,
    objectCount: objectsKept.length,
  };
}

/**
 * Assign sequential 1-based imageIndex and character name → index map (first sheet per name).
 */
export function assignSequentialImageIndices(refs: ReferenceImageDataEntry[]): Map<string, number> {
  const imageIndexMap = new Map<string, number>();
  let imageIndex = 1;
  for (const ref of refs) {
    if (ref.source === 'environment') {
      ref.imageIndex = imageIndex;
      imageIndex++;
      continue;
    }
    if (
      ref.type === 'imaginary' ||
      ref.type === 'child_reference' ||
      ref.type === 'character_reference'
    ) {
      if (ref.characterName && !imageIndexMap.has(ref.characterName)) {
        imageIndexMap.set(ref.characterName, imageIndex);
      }
    }
    ref.imageIndex = imageIndex;
    imageIndex++;
  }
  return imageIndexMap;
}

/**
 * Map character display name → outfit plate "Image N" index (after assignSequentialImageIndices).
 * Stores both full name and ID-stripped base when they differ (matches lookupOutfitForCharacterName keys).
 */
export function collectOutfitPlateImageIndices(
  refs: Array<{ source?: string; characterName?: string; imageIndex?: number }> | undefined
): Map<string, number> {
  const m = new Map<string, number>();
  if (!refs) return m;
  for (const r of refs) {
    if (r.source !== 'outfit_plate' || !r.characterName || typeof r.imageIndex !== 'number')
      continue;
    m.set(r.characterName, r.imageIndex);
    const base = stripCharacterIdFromName(r.characterName).trim();
    if (base && base !== r.characterName) {
      m.set(base, r.imageIndex);
    }
  }
  return m;
}

export function logReferenceBucketDelivery(params: {
  storyId: string;
  sceneId?: number;
  characterCount: number;
  objectCount: number;
  droppedCharacterCount: number;
  droppedObjectCount: number;
  totalAfterTrim: number;
}): void {
  logger.info(
    {
      storyId: params.storyId,
      sceneId: params.sceneId,
      referenceDelivery: {
        characterCount: params.characterCount,
        objectCount: params.objectCount,
        droppedCharacters: params.droppedCharacterCount,
        droppedObjects: params.droppedObjectCount,
        totalAfterTrim: params.totalAfterTrim,
      },
    },
    'Reference images delivered to image provider (bucket policy)'
  );
}
