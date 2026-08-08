import type { StoryCharacter } from '@/components/StoryCharactersSection';

type GraphicNovelManifestCharacter = {
  id?: unknown;
  characterRef?: unknown;
  name?: unknown;
  canonicalName?: unknown;
  type?: unknown;
  description?: unknown;
  references?: unknown;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function graphicNovelReferenceToUrl(reference: unknown): string | null {
  if (!reference || typeof reference !== 'object') return null;
  const value = reference as Record<string, unknown>;
  return (
    nonEmptyString(value.url) ??
    nonEmptyString(value.imageUrl) ??
    nonEmptyString(value.fullImageUrl) ??
    nonEmptyString(value.storagePath) ??
    nonEmptyString(value.path)
  );
}

function manifestCharacterToStoryCharacter(
  character: GraphicNovelManifestCharacter,
  index: number,
  storyCharactersById: ReadonlyMap<string, StoryCharacter>
): StoryCharacter | null {
  const name = nonEmptyString(character.name);
  if (!name) return null;

  const sourceCharacterId = nonEmptyString(character.id) ?? nonEmptyString(character.characterRef);
  const storyCharacter = sourceCharacterId ? storyCharactersById.get(sourceCharacterId) : undefined;
  const references = Array.isArray(character.references) ? character.references : [];
  const manifestReferenceUrl = references
    .map(graphicNovelReferenceToUrl)
    .find((value): value is string => !!value);
  const idSource = sourceCharacterId ?? nonEmptyString(character.canonicalName) ?? name;

  return {
    id: `graphic-novel-${idSource}-${index}`,
    name,
    localizedName: nonEmptyString(character.canonicalName),
    type: nonEmptyString(character.type) ?? 'person',
    // The story API resolves turnaround.frontUrl first. Manifest references are
    // generation inputs and intentionally point at the full turnaround sheet.
    referencePhotoUrl: storyCharacter?.referencePhotoUrl || manifestReferenceUrl || null,
    isHidden: false,
    description: nonEmptyString(character.description),
  };
}

export function getStoryCharactersForSection(params: {
  storyCharacters: readonly StoryCharacter[];
  manifestCharacters: readonly unknown[];
  hasGraphicNovelPages: boolean;
}): StoryCharacter[] {
  if (!params.hasGraphicNovelPages || params.manifestCharacters.length === 0) {
    return [...params.storyCharacters];
  }

  const storyCharactersById = new Map(
    params.storyCharacters.map((character) => [character.id, character])
  );

  return params.manifestCharacters
    .map((character, index) =>
      manifestCharacterToStoryCharacter(
        (character && typeof character === 'object'
          ? character
          : {}) as GraphicNovelManifestCharacter,
        index,
        storyCharactersById
      )
    )
    .filter((character): character is StoryCharacter => !!character);
}
