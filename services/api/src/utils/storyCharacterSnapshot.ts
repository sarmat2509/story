import { stripCharacterIdFromName } from '@wondertales/shared';

type StoryCharacterSnapshot = {
  id?: string;
  characterRef?: string;
  childProfileId?: string | null;
  name?: string;
  canonicalName?: string;
};

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = stripCharacterIdFromName(value).trim();
  return clean || null;
}

export function storyCharacterSnapshots(
  metadata: unknown
): Map<string, StoryCharacterSnapshot> {
  if (!metadata || typeof metadata !== 'object') return new Map();
  const merged = (metadata as { mergedCharacters?: unknown }).mergedCharacters;
  if (!Array.isArray(merged)) return new Map();

  const snapshots = new Map<string, StoryCharacterSnapshot>();
  for (const value of merged) {
    if (!value || typeof value !== 'object') continue;
    const snapshot = value as StoryCharacterSnapshot;
    for (const key of [snapshot.id, snapshot.characterRef, snapshot.childProfileId]) {
      if (typeof key === 'string' && key) snapshots.set(key, snapshot);
    }
  }
  return snapshots;
}

export function getStoryCharacterSnapshotName(
  snapshots: Map<string, StoryCharacterSnapshot>,
  character: { id?: string; childProfileId?: string | null }
): string | null {
  const snapshot =
    (character.id ? snapshots.get(character.id) : undefined) ??
    (character.childProfileId ? snapshots.get(character.childProfileId) : undefined);
  // `name` is the localized name actually used by the generated story.
  return cleanName(snapshot?.name) ?? cleanName(snapshot?.canonicalName);
}
