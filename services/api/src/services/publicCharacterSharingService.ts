import { getCharacterRepository, getStoryRepository } from '../repositories';
import { getAssetStorageService } from './assetStorageService';
import { normalizeAssetStoragePath } from './entityAssetCleanupService';

export type SharedStoryLookup =
  | { kind: 'public'; value: string }
  | { kind: 'unlisted'; value: string };

async function resolveSharedStory(lookup: SharedStoryLookup) {
  const storyRepo = getStoryRepository();
  const story = lookup.kind === 'public'
    ? await storyRepo.findByPublishedSlug(lookup.value)
    : await storyRepo.findByShareToken(lookup.value);
  if (!story || !story.isPublished || story.publishCharacters !== true) return null;
  if (lookup.kind === 'public' && story.visibility !== 'public') return null;
  if (lookup.kind === 'unlisted' && story.visibility !== 'unlisted') return null;
  return story;
}

function characterPreviewPath(character: { turnaroundSheet?: unknown; referencePhotos?: unknown }) {
  const turnaround = character.turnaroundSheet as {
    frontThumbnailUrl?: string;
    frontUrl?: string;
    url?: string;
  } | null;
  const photos = Array.isArray(character.referencePhotos)
    ? character.referencePhotos as Array<{ url?: string }>
    : [];
  const raw = turnaround?.frontThumbnailUrl || turnaround?.frontUrl || turnaround?.url || photos[0]?.url;
  return raw ? normalizeAssetStoragePath(raw) : null;
}

function mimeTypeForPath(storagePath: string): string {
  const extension = storagePath.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/png';
}

export async function getPublishedStoryCharacterPreview(params: {
  lookup: SharedStoryLookup;
  characterId: string;
}): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const story = await resolveSharedStory(params.lookup);
  if (!story) return null;
  const linked = await getStoryRepository().findLinkedCharactersByStoryId(story.id);
  const character = linked.find((candidate) => candidate.id === params.characterId);
  if (!character) return null;
  const storagePath = characterPreviewPath(character);
  if (!storagePath) return null;
  return {
    buffer: await getAssetStorageService().getAssetByPath(storagePath),
    mimeType: mimeTypeForPath(storagePath),
  };
}

export async function getSavedCharacterPreview(params: {
  characterId: string;
  userId: string;
}): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const character = await getCharacterRepository().findAccessibleById(
    params.characterId,
    params.userId
  );
  if (!character || character.userId === params.userId) return null;
  const storagePath = characterPreviewPath(character);
  if (!storagePath) return null;
  return {
    buffer: await getAssetStorageService().getAssetByPath(storagePath),
    mimeType: mimeTypeForPath(storagePath),
  };
}

export async function saveCharacterFromPublishedStory(params: {
  lookup: SharedStoryLookup;
  characterId: string;
  userId: string;
}): Promise<{ characterId: string; isSaved: true } | null> {
  const story = await resolveSharedStory(params.lookup);
  if (!story) return null;

  const linked = await getStoryRepository().findLinkedCharactersByStoryId(story.id);
  const character = linked.find((candidate) => candidate.id === params.characterId);
  if (!character) return null;

  const characterRepo = getCharacterRepository();
  if (story.userId === params.userId) {
    if (character.isHidden) {
      await characterRepo.update(character.id, params.userId, { isHidden: false });
    }
  } else {
    await characterRepo.saveForUser(params.userId, character.id, story.id);
  }

  return { characterId: character.id, isSaved: true };
}
