type SelectedCharacter = { id?: string; characterRef?: string; name: string };

type DirectorIllustrationLike = {
  sceneVisual?: {
    cameraComposition?: {
      characters?: Array<{ characterRef?: unknown; name?: unknown }>;
    };
  };
};

function normalizedCharacterRef(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function selectedCharacterRef(character: SelectedCharacter): string {
  return normalizedCharacterRef(character.characterRef || character.id);
}

function formatSelectedCharacter(character: SelectedCharacter): string {
  const ref = selectedCharacterRef(character);
  return ref ? `${character.name} (${ref})` : character.name;
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
        .filter((character) => selectedCharacterRef(character))
        .map((character) => [selectedCharacterRef(character), character] as const)
    ).values()
  );
  if (selectedCharacters.length === 0) {
    return { ok: true, missingCharacters: [] };
  }

  const relevantIllustrations =
    params.imagesPerStory === 1
      ? (params.illustrations ?? []).slice(0, 1)
      : (params.illustrations ?? []);
  const cameraRefs = new Set(
    relevantIllustrations
      .flatMap((illustration) => {
        const rows = illustration.sceneVisual?.cameraComposition?.characters;
        return Array.isArray(rows)
          ? rows.map((row) => normalizedCharacterRef(row?.characterRef))
          : [];
      })
      .filter(Boolean)
  );

  const missingCharacters = selectedCharacters
    .filter((character) => !cameraRefs.has(selectedCharacterRef(character)))
    .map(formatSelectedCharacter);

  return {
    ok: missingCharacters.length === 0,
    missingCharacters,
  };
}
