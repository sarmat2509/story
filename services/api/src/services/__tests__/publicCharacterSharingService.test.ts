import assert from 'node:assert/strict';
import {
  clearRepositoryTestOverrides,
  installRepositoryTestOverrides,
} from '../../repositories';
import {
  getPublishedStoryCharacterPreview,
  getSavedCharacterPreview,
  saveCharacterFromPublishedStory,
} from '../publicCharacterSharingService';
import {
  clearAssetStorageServiceTestOverride,
  installAssetStorageServiceTestOverride,
} from '../assetStorageService';

const ownerId = '11111111-1111-4111-8111-111111111111';
const readerId = '22222222-2222-4222-8222-222222222222';
const storyId = '33333333-3333-4333-8333-333333333333';
const characterId = '44444444-4444-4444-8444-444444444444';

async function main(): Promise<void> {
  let publishCharacters = true;
  let isPublished = true;
  const saved = new Set<string>();
  const story = {
    id: storyId,
    userId: ownerId,
    isPublished,
    visibility: 'public',
    publishedSlug: 'shared-story',
    publishCharacters,
  } as any;

  installRepositoryTestOverrides({
    story: {
      findByPublishedSlug: async () => ({ ...story, isPublished, publishCharacters }),
      findByShareToken: async () => null,
      findLinkedCharactersByStoryId: async () => [{
        id: characterId,
        name: 'Nova',
        type: 'imaginary',
        isHidden: true,
      }],
    } as any,
    character: {
      saveForUser: async (userId: string, id: string) => {
        saved.add(`${userId}:${id}`);
      },
      update: async () => undefined,
      findAccessibleById: async (id: string, userId: string) =>
        saved.has(`${userId}:${id}`)
          ? {
              id,
              userId: ownerId,
              turnaroundSheet: { frontUrl: '/api/v1/assets/llm_turnaround_cache/nova.webp' },
              referencePhotos: null,
            }
          : null,
    } as any,
  });
  installAssetStorageServiceTestOverride({
    getAssetByPath: async (storagePath: string) => {
      assert.equal(storagePath, 'llm_turnaround_cache/nova.webp');
      return Buffer.from('saved-character-image');
    },
  } as any);

  try {
    const first = await saveCharacterFromPublishedStory({
      lookup: { kind: 'public', value: 'shared-story' },
      characterId,
      userId: readerId,
    });
    assert.deepEqual(first, { characterId, isSaved: true });
    assert.equal(saved.has(`${readerId}:${characterId}`), true);

    // The repository relation is idempotent in production; repeated saves keep the same identity.
    const second = await saveCharacterFromPublishedStory({
      lookup: { kind: 'public', value: 'shared-story' },
      characterId,
      userId: readerId,
    });
    assert.deepEqual(second, first);

    publishCharacters = false;
    isPublished = false;
    const blocked = await saveCharacterFromPublishedStory({
      lookup: { kind: 'public', value: 'shared-story' },
      characterId,
      userId: '55555555-5555-4555-8555-555555555555',
    });
    assert.equal(blocked, null, 'direct API access is blocked when sharing is disabled');

    const publicPreviewAfterUnpublish = await getPublishedStoryCharacterPreview({
      lookup: { kind: 'public', value: 'shared-story' },
      characterId,
    });
    assert.equal(
      publicPreviewAfterUnpublish,
      null,
      'the old public-story image endpoint stops exposing the character after unpublishing'
    );

    const unsavedPreview = await getSavedCharacterPreview({
      characterId,
      userId: '55555555-5555-4555-8555-555555555555',
    });
    assert.equal(
      unsavedPreview,
      null,
      'an authenticated user without a saved-character grant cannot access the character'
    );

    const retainedPreview = await getSavedCharacterPreview({
      characterId,
      userId: readerId,
    });
    assert.equal(
      retainedPreview?.buffer.toString(),
      'saved-character-image',
      'a previously saved character remains accessible after unpublishing'
    );
    assert.equal(retainedPreview?.mimeType, 'image/webp');
  } finally {
    clearRepositoryTestOverrides();
    clearAssetStorageServiceTestOverride();
  }

  console.log('public character sharing service tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
