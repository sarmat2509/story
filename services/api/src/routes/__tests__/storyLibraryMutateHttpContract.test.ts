import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'e1111111-1111-4111-8111-111111111111';
const sessionId = 'e2222222-2222-4222-8222-222222222222';
const storyId = 'e3333333-3333-4333-8333-333333333331';
const reviewStoryId = 'e3333333-3333-4333-8333-333333333332';
const reviewedStoryId = 'e3333333-3333-4333-8333-333333333333';
const missingStoryId = 'e9999999-9999-4999-8999-999999999999';

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
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { clearAssetStorageServiceTestOverride, installAssetStorageServiceTestOverride } =
    await import('../../services/assetStorageService');

  const now = new Date();
  const user = {
    id: userId,
    email: 'story-mutate@example.test',
    displayName: 'Story Mutate',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    createdAt: now,
    updatedAt: now,
  } as any;
  const session = {
    id: sessionId,
    userId,
    mode: 'parent',
    parentUserId: userId,
    childProfileId: null,
    scopes: [],
    token: 'story-mutate-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  function makeStory(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      userId,
      childProfileId: null,
      createdByChildProfileId: null,
      createdByMode: 'parent',
      parentReviewStatus: 'not_required',
      storyRequestId: null,
      seriesId: null,
      title: 'The Quiet Lantern Trail',
      language: 'en',
      ageGroup: '6-8',
      fullText: 'Mira found a lantern beside the quiet path and shared its light with Leo.',
      scenes: [{ sceneId: 1, text: 'Mira found a lantern beside the quiet path.' }],
      policyChecks: { textValidated: true },
      isPublished: false,
      publishedSlug: null,
      shareToken: null,
      visibility: null,
      publishCharacters: false,
      coverAssetId: null,
      audioMetadata: null,
      metadata: {},
      hidden: false,
      showOnHomePage: false,
      closingArtifactId: null,
      closingKeepsakeLabel: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as any;
  }

  const storiesById = new Map<string, any>([
    [storyId, makeStory(storyId)],
    [
      reviewStoryId,
      makeStory(reviewStoryId, {
        createdByMode: 'child',
        createdByChildProfileId: 'e4444444-4444-4444-8444-444444444444',
        parentReviewStatus: 'pending',
      }),
    ],
    [
      reviewedStoryId,
      makeStory(reviewedStoryId, {
        createdByMode: 'child',
        createdByChildProfileId: 'e4444444-4444-4444-8444-444444444444',
        parentReviewStatus: 'approved',
      }),
    ],
  ]);
  let deletedStoryId: string | null = null;
  let publishedStoriesCount = 0;

  installAssetStorageServiceTestOverride({
    generateSignedUrl: async (storagePath: string) => ({
      signedUrl: `/api/v1/assets/${storagePath}?signed=1`,
    }),
    deleteAsset: async () => undefined,
  } as any);

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
      revokeById: async () => undefined,
    } as any,
    opsRuntime: {
      getGlobalState: async () => ({
        mode: 'normal',
        message: null,
        startsAt: null,
        endsAt: null,
        updatedAt: now,
      }),
    } as any,
    story: {
      findById: async (id: string) => storiesById.get(id) ?? null,
      findByIdAndUser: async (id: string, ownerId: string) => {
        const story = storiesById.get(id);
        return story && story.userId === ownerId ? story : null;
      },
      findLinkedCharactersByStoryId: async () => [],
      findRequestById: async () => null,
      findByPublishedSlug: async () => null,
      updateStory: async (id: string, patch: Record<string, unknown>) => {
        const story = storiesById.get(id);
        if (!story) return null;
        Object.assign(story, patch, { updatedAt: new Date() });
        return story;
      },
      incrementPublicRenderVersion: async () => undefined,
      countPublishedByUser: async () => publishedStoriesCount,
      deleteStory: async (id: string, ownerId: string) => {
        const story = storiesById.get(id);
        if (!story || story.userId !== ownerId) return;
        storiesById.delete(id);
        deletedStoryId = id;
      },
    } as any,
    scene: {
      findByStoryId: async () => [],
    } as any,
    asset: {
      findByStoryId: async () => [],
    } as any,
    imageValidation: {
      listAllByStoryId: async () => [],
      listByStoragePaths: async () => [],
    } as any,
    dictionary: {
      findTranslations: async () => [],
      findTranslationsForEntities: async () => [],
      findScenarioCardById: async () => null,
    } as any,
    alignment: {
      findByStoryId: async () => null,
    } as any,
    childProfile: {
      findById: async () => null,
    } as any,
    storyArtifact: {
      findById: async () => null,
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (method: string, path: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    const meStoryOk = await request('GET', `/api/v1/me/stories/${storyId}`);
    assert.equal(meStoryOk.status, 200, 'GET me story returns 200');
    const meStoryOkBody = (await meStoryOk.json()) as any;
    assert.equal(meStoryOkBody.status, 'success');
    assert.equal(meStoryOkBody.manifest.storyId, storyId);
    assert.equal(meStoryOkBody.manifest.title, 'The Quiet Lantern Trail');

    const meStoryMissing = await request('GET', `/api/v1/me/stories/${missingStoryId}`);
    assert.equal(meStoryMissing.status, 404, 'GET missing me story returns 404');

    const manifestOk = await request('GET', `/api/v1/stories/${storyId}/manifest`);
    assert.equal(manifestOk.status, 200, 'GET manifest returns 200');
    const manifestOkBody = (await manifestOk.json()) as any;
    assert.equal(manifestOkBody.manifest.storyId, storyId);
    assert.equal(manifestOkBody.manifest.scenes.length, 1);

    const publishOk = await request('PATCH', `/api/v1/stories/${storyId}`, {
      isPublished: true,
      visibility: 'unlisted',
    });
    assert.equal(publishOk.status, 200, 'publish unlisted returns 200');
    const publishOkBody = (await publishOk.json()) as any;
    assert.equal(publishOkBody.status, 'success');
    assert.ok(publishOkBody.shareUrl);
    assert.equal(storiesById.get(storyId)?.isPublished, true);
    assert.equal(storiesById.get(storyId)?.visibility, 'unlisted');
    assert.equal(
      storiesById.get(storyId)?.publishCharacters,
      true,
      'character sharing defaults to enabled on publish'
    );
    publishedStoriesCount = 1;

    const unpublishOk = await request('PATCH', `/api/v1/stories/${storyId}`, {
      isPublished: false,
    });
    assert.equal(unpublishOk.status, 200, 'unpublish returns 200');
    const unpublishOkBody = (await unpublishOk.json()) as any;
    assert.equal(unpublishOkBody.message, 'Story unpublished');
    assert.equal(storiesById.get(storyId)?.isPublished, false);
    assert.equal(storiesById.get(storyId)?.publishCharacters, false);

    const reviewOk = await request('PATCH', `/api/v1/stories/${reviewStoryId}/parent-review`, {
      status: 'approved',
    });
    assert.equal(reviewOk.status, 200, 'parent review returns 200');
    const reviewOkBody = (await reviewOk.json()) as any;
    assert.equal(reviewOkBody.story.parentReviewStatus, 'approved');

    const reviewConflict = await request(
      'PATCH',
      `/api/v1/stories/${reviewedStoryId}/parent-review`,
      { status: 'approved' }
    );
    assert.equal(reviewConflict.status, 409, 'already reviewed returns 409');
    const reviewConflictBody = (await reviewConflict.json()) as any;
    assert.equal(reviewConflictBody.code, 'STORY_REVIEW_ALREADY_COMPLETED');

    const deleteOk = await request('DELETE', `/api/v1/stories/${storyId}`);
    assert.equal(deleteOk.status, 200, 'delete story returns 200');
    const deleteOkBody = (await deleteOk.json()) as any;
    assert.equal(deleteOkBody.message, 'Story deleted successfully');
    assert.equal(deletedStoryId, storyId);
    assert.equal(storiesById.has(storyId), false);
  } finally {
    clearRepositoryTestOverrides();
    clearAssetStorageServiceTestOverride();
    await close(server);
  }

  console.log('story library mutate HTTP contract passed (9 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
