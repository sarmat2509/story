import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const authorId = 'a1111111-1111-4111-8111-111111111111';
const publishedStoryId = 'a2222222-2222-4222-8222-222222222221';
const unlistedStoryId = 'a2222222-2222-4222-8222-222222222222';
const publishedSlug = 'lantern-path';
const shareToken = 'share-token-lantern-abc';
const unknownAuthorId = 'a9999999-9999-4999-8999-999999999999';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test HTTP server did not expose a TCP port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<void> {
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { default: app } = await import('../../index');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date('2026-07-01T12:00:00.000Z');
  const author = {
    id: authorId,
    displayName: 'Lantern Author',
    pseudonym: null,
    aboutMe: 'Writes quiet woodland tales.',
    avatarUrl: null,
  } as any;

  function makePublishedStory(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      userId: authorId,
      childProfileId: null,
      createdByChildProfileId: null,
      authorType: 'user',
      authorChildProfileId: null,
      title: 'The Lantern Path',
      language: 'en',
      ageGroup: '6-8',
      fullText: 'Mira found a lantern beside the quiet path and shared its light.',
      scenes: [{ sceneId: 1, text: 'Mira found a lantern beside the quiet path.' }],
      isPublished: true,
      publishedSlug,
      publishedAt: now,
      shareToken: null,
      coverAssetId: null,
      audioMetadata: null,
      metadata: {},
      ratingSum: 0,
      ratingCount: 0,
      publicRenderVersion: 1,
      ...overrides,
    } as any;
  }

  const publishedStory = makePublishedStory(publishedStoryId);
  const unlistedStory = makePublishedStory(unlistedStoryId, {
    publishedSlug: null,
    shareToken,
  });

  const votedKeys = new Set<string>();
  const insertedRatings: Array<{ storyId: string; voterId: string; rating: number }> = [];

  installRepositoryTestOverrides({
    story: {
      findByPublishedSlug: async (slug: string) =>
        slug === publishedSlug ? publishedStory : null,
      findByShareToken: async (token: string) =>
        token === shareToken ? unlistedStory : null,
      listPublished: async (opts: { authorId?: string } = {}) => {
        if (opts.authorId && opts.authorId !== authorId) return [];
        return [publishedStory];
      },
      countPublished: async (opts: { authorId?: string } = {}) => {
        if (opts.authorId && opts.authorId !== authorId) return 0;
        return 1;
      },
    } as any,
    user: {
      findPublicAuthorById: async (id: string) => (id === authorId ? author : null),
      findPublicAuthorsByIds: async (ids: string[]) =>
        ids.includes(authorId) ? [author] : [],
    } as any,
    childProfile: {
      findPublicChildAuthorById: async () => null,
      findPublicChildAuthorsByIds: async () => [],
    } as any,
    scene: {
      findByStoryIds: async () => [],
    } as any,
    asset: {
      findCompletedImagesByStoryIds: async () => [],
      findFinalCompletedAudioByStoryId: async () => null,
      findByIds: async () => [],
    } as any,
    alignment: {
      findByStoryId: async () => null,
    } as any,
    storyRating: {
      hasVotedByVoterId: async (storyId: string, voterId: string) =>
        votedKeys.has(`${storyId}:voter:${voterId}`),
      hasVotedByIp: async (storyId: string, ipAddress: string) =>
        votedKeys.has(`${storyId}:ip:${ipAddress}`),
      insertRating: async (storyId: string, voterId: string, _ip: string, rating: number) => {
        votedKeys.add(`${storyId}:voter:${voterId}`);
        insertedRatings.push({ storyId, voterId, rating });
      },
      incrementStoryAggregates: async () => undefined,
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const get = (path: string) => fetch(`${origin}${path}`);
  const post = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify(body),
    });

  try {
    const catalogOk = await get('/api/v1/public/stories');
    assert.equal(catalogOk.status, 200, 'public catalog returns 200');
    const catalogOkBody = (await catalogOk.json()) as any;
    assert.equal(catalogOkBody.status, 'success');
    assert.equal(catalogOkBody.stories.length, 1);
    assert.equal(catalogOkBody.stories[0].id, publishedStoryId);
    assert.equal(catalogOkBody.pagination.total, 1);

    const detailOk = await get(`/api/v1/public/stories/${publishedSlug}`);
    assert.equal(detailOk.status, 200, 'published slug returns 200');
    const detailOkBody = (await detailOk.json()) as any;
    assert.equal(detailOkBody.status, 'success');
    assert.equal(detailOkBody.story.id, publishedStoryId);
    assert.equal(detailOkBody.story.title, 'The Lantern Path');
    assert.equal(detailOkBody.story.author?.id, authorId);

    const detailMissing = await get('/api/v1/public/stories/missing-slug');
    assert.equal(detailMissing.status, 404, 'unknown slug returns 404');

    const unlistedOk = await get(`/api/v1/public/u/${shareToken}`);
    assert.equal(unlistedOk.status, 200, 'valid share token returns 200');
    const unlistedOkBody = (await unlistedOk.json()) as any;
    assert.equal(unlistedOkBody.story.id, unlistedStoryId);

    const unlistedMissing = await get('/api/v1/public/u/unknown-token');
    assert.equal(unlistedMissing.status, 404, 'invalid share token returns 404');

    const authorOk = await get(`/api/v1/public/authors/${authorId}`);
    assert.equal(authorOk.status, 200, 'known author returns 200');
    const authorOkBody = (await authorOk.json()) as any;
    assert.equal(authorOkBody.author.id, authorId);
    assert.equal(authorOkBody.stories.length, 1);
    assert.equal(authorOkBody.pagination.total, 1);

    const authorMissing = await get(`/api/v1/public/authors/${unknownAuthorId}`);
    assert.equal(authorMissing.status, 404, 'unknown author returns 404');

    const ratingOk = await post(`/api/v1/public/stories/${publishedSlug}/rating`, {
      rating: 5,
      voterId: 'voter-1',
    });
    assert.equal(ratingOk.status, 200, 'valid rating returns 200');
    assert.equal(insertedRatings.length, 1);
    assert.equal(insertedRatings[0].storyId, publishedStoryId);

    const ratingInvalid = await post(`/api/v1/public/stories/${publishedSlug}/rating`, {
      rating: 9,
      voterId: 'voter-2',
    });
    assert.equal(ratingInvalid.status, 400, 'invalid rating body returns 400');

    const ratingMissing = await post('/api/v1/public/stories/missing-slug/rating', {
      rating: 4,
      voterId: 'voter-3',
    });
    assert.equal(ratingMissing.status, 404, 'rating for missing story returns 404');

    const ratingDuplicate = await post(`/api/v1/public/stories/${publishedSlug}/rating`, {
      rating: 3,
      voterId: 'voter-1',
    });
    assert.equal(ratingDuplicate.status, 409, 'duplicate rating returns 409');

    const unlistedRatingOk = await post(`/api/v1/public/u/${shareToken}/rating`, {
      rating: 4,
      voterId: 'voter-unlisted-1',
    });
    assert.equal(unlistedRatingOk.status, 200, 'unlisted rating returns 200');
    assert.equal(insertedRatings[1]?.storyId, unlistedStoryId);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('public stories HTTP contract passed (12 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
