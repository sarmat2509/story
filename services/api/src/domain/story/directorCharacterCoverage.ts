import { stripCharacterIdFromName } from '@wondertales/shared';

type SelectedCharacter = { id?: string; name: string };

type DirectorIllustrationLike = {
  sceneVisual?: {
    cameraComposition?: {
      characters?: Array<{ name?: unknown }>;
    };
  };
};

const CHARACTER_ID_PATTERN = /\[ID:\s*([^\]]+)\]/i;

function extractCharacterId(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  return name.match(CHARACTER_ID_PATTERN)?.[1]?.trim() || null;
}

function normalizeCharacterName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return stripCharacterIdFromName(name).trim().normalize('NFC').toLocaleLowerCase('en');
}

function selectedCharacterKey(character: SelectedCharacter): string {
  return character.id?.trim()
    ? `id:${character.id.trim()}`
    : `name:${normalizeCharacterName(character.name)}`;
}

function formatSelectedCharacter(character: SelectedCharacter): string {
  return character.id?.trim() ? `${character.name} [ID: ${character.id.trim()}]` : character.name;
}

/**
 * One-image stories need every selected identity in that single frame. Stories
 * with several images may distribute selected identities across the set.
 */
export function evaluateDirectorSelectedCharacterCoverage(params: {
  userCharacters: SelectedCharacter[];
  illustrations: DirectorIllustrationLike[] | undefined;
  imagesPerStory: number;
}): {
  ok: boolean;
  missingCharacters: string[];
} {
  const selectedCharacters = Array.from(
    new Map(
      params.userCharacters
        .filter((character) => character.name?.trim() || character.id?.trim())
        .map((character) => [selectedCharacterKey(character), character] as const)
    ).values()
  );
  if (selectedCharacters.length === 0) {
    return { ok: true, missingCharacters: [] };
  }

  const relevantIllustrations =
    params.imagesPerStory === 1
      ? (params.illustrations ?? []).slice(0, 1)
      : (params.illustrations ?? []);
  const cameraCharacterNames = relevantIllustrations.flatMap((illustration) => {
    const rows = illustration.sceneVisual?.cameraComposition?.characters;
    return Array.isArray(rows) ? rows.map((row) => row?.name) : [];
  });
  const cameraCharacterIds = new Set(
    cameraCharacterNames.map(extractCharacterId).filter((id): id is string => Boolean(id))
  );
  const normalizedCameraNames = new Set(
    cameraCharacterNames.map(normalizeCharacterName).filter(Boolean)
  );

  const missingCharacters = selectedCharacters
    .filter((character) => {
      const id = character.id?.trim();
      if (id) return !cameraCharacterIds.has(id);
      return !normalizedCameraNames.has(normalizeCharacterName(character.name));
    })
    .map(formatSelectedCharacter);

  return {
    ok: missingCharacters.length === 0,
    missingCharacters,
  };
}
