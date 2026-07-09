import { stripCharacterIdFromName } from '@wondertales/shared';
import { logger } from '../utils/logger';
import type { ReferenceImageKind } from '../utils/referenceImageKind';
import { inferReferenceKind } from '../utils/referenceImageKind';
import { ensureReferenceBindingId } from './referenceBinding';

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
  referenceBindingId?: string;
  referenceKind?: ReferenceImageKind;
  isTurnaround?: boolean;
  charactersPresent?: string[];
  sceneId?: number;
  referenceEnvironmentId?: string;
  outfitId?: string;
  storagePath?: string;
  characterId?: string;
  identitySource?: string;
};

/**
 * Apply Gemini 3.1–style buckets: keep up to maxCharacter full-character refs and maxObject
 * environment/object refs. Dressed turnarounds are character refs; raw outfit plates should
 * only be used while creating those dressed turnarounds, not as final scene references.
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
  const rawOutfitPlates = refs.filter((r) => r.source === 'outfit_plate');
  const chars = refs.filter((r) => inferReferenceKind(r) === 'character');
  const other = refs.filter(
    (r) =>
      inferReferenceKind(r) !== 'character' &&
      r.source !== 'environment' &&
      r.source !== 'outfit_plate'
  );

  const charsKept = chars.slice(0, Math.max(0, maxCharacter));
  const droppedCharacterCount = chars.length - charsKept.length;

  const objectSeq = [...env, ...other];
  const objectsKept = objectSeq.slice(0, Math.max(0, maxObject));
  const droppedObjectCount = objectSeq.length - objectsKept.length + rawOutfitPlates.length;

  const envKept = objectsKept.filter((r) => r.source === 'environment');
  const otherKept = objectsKept.filter(
    (r) => r.source !== 'environment'
  );

  const trimmed = [...envKept, ...charsKept, ...otherKept] as T[];

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
      ensureReferenceBindingId(ref);
      imageIndex++;
      continue;
    }
    if (
      ref.type === 'imaginary' ||
      ref.type === 'child_reference' ||
      ref.type === 'character_reference' ||
      ref.type === 'dressed_turnaround_reference'
    ) {
      if (ref.characterName && !imageIndexMap.has(ref.characterName)) {
        imageIndexMap.set(ref.characterName, imageIndex);
      }
    }
    ref.imageIndex = imageIndex;
    ensureReferenceBindingId(ref);
    imageIndex++;
  }
  return imageIndexMap;
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
