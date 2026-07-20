import assert from 'node:assert/strict';
import {
  clearRepositoryTestOverrides,
  installRepositoryTestOverrides,
} from '../../repositories';
import { listPublicStoriesForLocaleCatalog } from '../publicStoryService';

const authorId = '11111111-1111-4111-8111-111111111111';

function story(language: string, index: number) {
  const suffix = `${language}-${String(index).padStart(2, '0')}`;
  return {
    id: `story-${suffix}`,
    userId: authorId,
    authorType: 'user',
    authorChildProfileId: null,
    title: `Story ${suffix}`,
    language,
    ageGroup: '6-8',
    scenes: [{ sceneId: 1, text: `Text ${suffix}` }],
    metadata: {},
    publishedAt: new Date(`2026-06-${String(Math.max(1, 30 - index)).padStart(2, '0')}T00:00:00.000Z`),
    publishedSlug: `story-${suffix}`,
    coverAssetId: null,
    audioMetadata: null,
    ratingSum: 0,
    ratingCount: 0,
  } as any;
}

const stories = [
  ...Array.from({ length: 30 }, (_, index) => story('en', index + 1)),
  ...Array.from({ length: 10 }, (_, index) => story('es', index + 1)),
];

function filteredStories(options: {
  language?: string;
  excludeLanguage?: string;
  ageGroup?: string;
}) {
  return stories.filter((candidate) => {
    if (options.language && candidate.language !== options.language) return false;
    if (options.excludeLanguage && candidate.language === options.excludeLanguage) return false;
    if (options.ageGroup && candidate.ageGroup !== options.ageGroup) return false;
    return true;
  });
}

async function main() {
  installRepositoryTestOverrides({
    story: {
      listPublished: async (options: any = {}) => {
        const filtered = filteredStories(options);
        const offset = options.offset ?? 0;
        const limit = options.limit ?? 20;
        return filtered.slice(offset, offset + limit);
      },
      countPublished: async (options: any = {}) => filteredStories(options).length,
    } as any,
    user: {
      findPublicAuthorsByIds: async () => [
        { id: authorId, displayName: 'Catalog Author', pseudonym: null, avatarUrl: null },
      ],
    } as any,
    childProfile: { findPublicChildAuthorsByIds: async () => [] } as any,
    scene: { findByStoryIds: async () => [] } as any,
    asset: {
      findCompletedImagesByStoryIds: async () => [],
      findByIds: async () => [],
    } as any,
  });

  try {
    const transitionPage = await listPublicStoriesForLocaleCatalog({
      locale: 'en',
      limit: 24,
      offset: 24,
    });
    assert.equal(transitionPage.total, 40);
    assert.equal(transitionPage.items.length, 16);
    assert.deepEqual(
      transitionPage.items.slice(0, 6).map((item) => item.language),
      Array(6).fill('en')
    );
    assert.deepEqual(
      transitionPage.items.slice(6).map((item) => item.language),
      Array(10).fill('es')
    );
    assert.equal(transitionPage.fallbackStartIndex, 6);

    const languagePage = await listPublicStoriesForLocaleCatalog({
      locale: 'en',
      language: 'es',
      limit: 5,
      offset: 2,
    });
    assert.equal(languagePage.total, 10);
    assert.equal(languagePage.items.length, 5);
    assert.ok(languagePage.items.every((item) => item.language === 'es'));
    assert.equal(languagePage.fallbackStartIndex, null);
  } finally {
    clearRepositoryTestOverrides();
  }

  console.log('public stories locale catalog pagination tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
