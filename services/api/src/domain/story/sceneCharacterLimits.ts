import { stripCharacterIdFromName } from '@wondertales/shared';

export const TARGET_SCENE_IMAGE_CHARACTERS = 3;
export const MAX_SCENE_IMAGE_CHARACTERS = 3;

type CameraCompositionLike = {
  characters?: unknown;
  [key: string]: unknown;
};

type SceneVisualLike = {
  cameraComposition?: unknown;
  [key: string]: unknown;
};

function isCameraCompositionLike(value: unknown): value is CameraCompositionLike {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function characterLimitKey(name: unknown): string {
  if (typeof name !== 'string') return '';
  return stripCharacterIdFromName(name).trim().normalize('NFC').toLowerCase();
}

function limitCharacterRows<T>(
  characters: T[],
  maxCharacters: number,
  preferredCharacterNames: string[],
): T[] {
  if (characters.length <= maxCharacters) return characters;

  const preferredKeys = new Set(
    preferredCharacterNames.map(characterLimitKey).filter(Boolean),
  );
  const selectedIndexes = new Set<number>();
  const selected: Array<{ character: T; index: number }> = [];

  const addAt = (character: T, index: number) => {
    if (selected.length >= maxCharacters || selectedIndexes.has(index)) return;
    selected.push({ character, index });
    selectedIndexes.add(index);
  };

  if (preferredKeys.size > 0) {
    characters.forEach((character, index) => {
      const key = characterLimitKey((character as { name?: unknown })?.name);
      if (key && preferredKeys.has(key)) {
        addAt(character, index);
      }
    });
  }

  characters.forEach(addAt);

  return selected
    .sort((a, b) => a.index - b.index)
    .map(({ character }) => character);
}

export function getSceneVisualCharacterCount(sceneVisual: unknown): number {
  if (!sceneVisual || typeof sceneVisual !== 'object') return 0;
  const cameraComposition = (sceneVisual as SceneVisualLike).cameraComposition;
  if (!isCameraCompositionLike(cameraComposition) || !Array.isArray(cameraComposition.characters)) {
    return 0;
  }
  return cameraComposition.characters.length;
}

export function limitCameraCompositionCharacters<T>(
  cameraComposition: T,
  maxCharacters = MAX_SCENE_IMAGE_CHARACTERS,
  preferredCharacterNames: string[] = [],
): T {
  if (!isCameraCompositionLike(cameraComposition) || !Array.isArray(cameraComposition.characters)) {
    return cameraComposition;
  }
  if (cameraComposition.characters.length <= maxCharacters) {
    return cameraComposition;
  }
  return {
    ...cameraComposition,
    characters: limitCharacterRows(
      cameraComposition.characters,
      maxCharacters,
      preferredCharacterNames,
    ),
  } as T;
}

export function limitSceneVisualCharacters<T>(
  sceneVisual: T,
  maxCharacters = MAX_SCENE_IMAGE_CHARACTERS,
  preferredCharacterNames: string[] = [],
): T {
  if (!sceneVisual || typeof sceneVisual !== 'object') {
    return sceneVisual;
  }
  const cameraComposition = (sceneVisual as SceneVisualLike).cameraComposition;
  const limitedCameraComposition = limitCameraCompositionCharacters(
    cameraComposition,
    maxCharacters,
    preferredCharacterNames,
  );
  if (limitedCameraComposition === cameraComposition) {
    return sceneVisual;
  }
  return {
    ...sceneVisual,
    cameraComposition: limitedCameraComposition,
  } as T;
}
