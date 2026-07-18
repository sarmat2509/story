import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = '10111111-1111-4111-8111-111111111111';
const sessionId = '10222222-2222-4222-8222-222222222222';
const storyId = '10333333-3333-4333-8333-333333333333';
const requestId = '10444444-4444-4444-8444-444444444444';

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

  const now = new Date();
  const user = {
    id: userId,
    email: 'story-read-regeneration@example.test',
    displayName: 'Story Read Regeneration',
    role: 'user',
    status: 'active',
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
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const story = {
    id: storyId,
    userId,
    childProfileId: null,
    createdByChildProfileId: null,
    storyRequestId: null,
    title: 'The Lantern Contract',
    language: 'en',
    ageGroup: '6-7',
    moralTheme: 'kindness',
    scenes: [{ sceneId: 1, text: '<voice>Once upon a contract.</voice>', imageUrl: null }],
    fullText: '<voice>Once upon a contract.</voice>',
    wordCount: 4,
    outline: null,
    audioMetadata: { generatedAt: now.toISOString(), totalDuration: 4.2 },
    metadata: {},
    isFavorite: false,
    isPublished: false,
    createdAt: now,
    seriesId: null,
    partNumber: null,
  } as any;
  const requestRow = {
    id: requestId,
    userId,
    status: 'completed',
    progress: 100,
    progressData: null,
    storyId,
    intermediateData: {},
    errorMessage: null,
    createdAt: now,
  } as any;

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: { findById: async () => user } as any,
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
      findRequestByIdAndUser: async (id: string, requestedUserId: string) =>
        id === requestId && requestedUserId === userId ? requestRow : null,
      findByIdAndUser: async (id: string, requestedUserId: string) =>
        id === storyId && requestedUserId === userId ? story : null,
      findById: async (id: string) => (id === storyId ? story : null),
      findLinkedCharactersByStoryId: async () => [],
      findByUser: async () => [story],
      countByUser: async () => 1,
      listPublished: async () => [],
      countPublished: async () => 0,
      findByPublishedSlug: async () => null,
    } as any,
    scene: { findByStoryIds: async () => [] } as any,
    asset: { findCompletedImagesByStoryIds: async () => [] } as any,
    aiUsage: { listByStoryId: async () => [] } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const authenticated = (method: string, path: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    const requestStatus = await authenticated(
      'GET',
      `/api/v1/stories/requests/${requestId}/status`
    );
    assert.equal(requestStatus.status, 200);
    const requestStatusBody = (await requestStatus.json()) as any;
    assert.equal(requestStatusBody.request.storyId, storyId);
    assert.equal(requestStatusBody.request.progress, 100);

    const storyResponse = await authenticated('GET', `/api/v1/stories/${storyId}`);
    assert.equal(storyResponse.status, 200);
    const storyBody = (await storyResponse.json()) as any;
    assert.equal(storyBody.story.title, story.title);
    assert.equal(storyBody.story.fullText, 'Once upon a contract.');

    const stories = await authenticated('GET', '/api/v1/stories?limit=10&offset=0');
    assert.equal(stories.status, 200);
    const storiesBody = (await stories.json()) as any;
    assert.equal(storiesBody.pagination.total, 1);
    assert.equal(storiesBody.stories[0].status, 'draft');

    const series = await authenticated('GET', `/api/v1/stories/${storyId}/series`);
    assert.equal(series.status, 200);
    assert.equal(((await series.json()) as any).data, null);

    const generationStatus = await authenticated('GET', `/api/v1/stories/${requestId}/status`);
    assert.equal(generationStatus.status, 200);
    assert.equal(((await generationStatus.json()) as any).generationStatus, 'completed');

    const cost = await authenticated('GET', `/api/v1/stories/${storyId}/cost`);
    assert.equal(cost.status, 200);
    const costBody = (await cost.json()) as any;
    assert.equal(costBody.data.costUsd, 0);
    assert.deepEqual(costBody.data.breakdown, []);

    const legacyPublished = await fetch(`${origin}/api/v1/stories/published`);
    assert.equal(legacyPublished.status, 200);
    assert.equal(((await legacyPublished.json()) as any).pagination.total, 0);
    assert.match(legacyPublished.headers.get('deprecation') ?? '', /true/i);

    const missingPublished = await fetch(`${origin}/api/v1/stories/published/not-public`);
    assert.equal(missingPublished.status, 404);

    const invalidRegeneration = await authenticated(
      'POST',
      `/api/v1/stories/${storyId}/scenes/1/regenerate`,
      { visualPrompt: 'x'.repeat(2001) }
    );
    assert.equal(invalidRegeneration.status, 400);

    const cachedLegacyTts = await authenticated('POST', `/api/v1/stories/${storyId}/tts`, {});
    assert.equal(cachedLegacyTts.status, 200);
    const cachedLegacyTtsBody = (await cachedLegacyTts.json()) as any;
    assert.equal(cachedLegacyTtsBody.message, 'Audio already exists');
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('story read and regeneration HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
