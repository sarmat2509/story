import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const storyRequestId = '33333333-3333-4333-8333-333333333331';
const graphicNovelRequestId = '33333333-3333-4333-8333-333333333332';
const mixedStoryRequestId = '33333333-3333-4333-8333-333333333333';
const missingStoryId = '44444444-4444-4444-8444-444444444444';
const childProfileId = '77777777-7777-4777-8777-777777777777';
const childCharacterId = '88888888-8888-4888-8888-888888888888';

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

async function postJson(origin: string, token: string, path: string, body: unknown) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
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
  const { clearStoryJobQueueAddJobTestOverride, installStoryJobQueueAddJobTestOverride } =
    await import('../../jobs/storyJobProcessor');

  const now = new Date();
  const user = {
    id: userId,
    email: 'generation-contract@example.test',
    displayName: 'Generation Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
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
    token: 'repository-token',
    deviceName: null,
    deviceType: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const subscription = {
    id: '55555555-5555-4555-8555-555555555555',
    userId,
    planId: '66666666-6666-4666-8666-666666666666',
    status: 'active',
    paymentProvider: 'stripe',
    storiesUsed: 0,
    audioMinutesUsed: 0,
    currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
    resetAt: new Date('2026-08-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  } as any;
  const featureValues = new Map<string, unknown>([
    ['images_per_story', { limit: 4 }],
    ['stories_per_month', { limit: -1 }],
    ['graphic_novels_per_month', { limit: -1 }],
    ['mixed_stories_per_month', { limit: 2 }],
  ]);
  const requestIds = [storyRequestId, graphicNovelRequestId, mixedStoryRequestId];
  const persistedRequestUpdates: Array<{ requestId: string; patch: unknown }> = [];
  const recordedUsageEvents: unknown[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: {
      findById: async () => user,
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
    plan: {
      findSubscriptionByUserId: async () => subscription,
      findAllFeaturesForPlan: async () =>
        Array.from(featureValues, ([slug, value]) => ({ slug, value })),
      findFeatureValue: async (_planId: string, slug: string) => featureValues.get(slug) ?? null,
    } as any,
    story: {
      countActiveRequestsForUpdate: async () => 0,
      transaction: async () => {
        const requestId = requestIds.shift();
        assert.ok(requestId, 'unexpected story quota reservation');
        return { requestId, remaining: null, limit: null };
      },
      updateRequest: async (requestId: string, patch: unknown) => {
        persistedRequestUpdates.push({ requestId, patch });
        return undefined;
      },
      findByIdAndUser: async () => null,
    } as any,
    usageEvents: {
      create: async (input: unknown) => {
        recordedUsageEvents.push(input);
        return { id: `usage-${recordedUsageEvents.length}`, ...(input as object) };
      },
    } as any,
    childProfile: {
      findById: async (id: string, ownerId: string) =>
        id === childProfileId && ownerId === userId
          ? { id: childProfileId, userId, isActive: true, turnaroundSheet: null }
          : null,
    } as any,
    character: {
      findByIds: async (_ownerId: string, ids: string[]) =>
        ids.includes(childCharacterId)
          ? [{ id: childCharacterId, childProfileId, turnaroundSheet: null }]
          : [],
    } as any,
  });

  const expectedQueueInputs = [storyRequestId, graphicNovelRequestId, mixedStoryRequestId];
  const queuedInputs: unknown[] = [];
  installStoryJobQueueAddJobTestOverride(async (input) => {
    const expected = expectedQueueInputs.shift();
    assert.equal(input, expected, 'route must enqueue the request returned by production service');
    queuedInputs.push(input);
    return `job-${queuedInputs.length}`;
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const token = generateToken({ userId, sessionId });
  const validStoryInput = {
    ui_locale: 'en',
    story_language: 'en',
    goal: 'kindness',
    scenario_card_id: 'forest_path',
    image_style: 'soft_watercolor',
    user_notes: 'A calm lantern adventure.',
    selected_characters: [],
    selected_children: [],
    child_profile_id: childProfileId,
  };

  try {
    const createStory = await postJson(origin, token, '/api/v1/stories', validStoryInput);
    assert.equal(
      createStory.status,
      201,
      'story is queued when the audience child has no turnaround but is not selected as a character'
    );
    const storyBody = (await createStory.json()) as any;
    assert.equal(storyBody.status, 'success');
    assert.equal(storyBody.request.id, storyRequestId);
    assert.equal(storyBody.request.status, 'pending');

    const selectedChildWithoutTurnaround = await postJson(origin, token, '/api/v1/stories', {
      ...validStoryInput,
      selected_characters: [childCharacterId],
    });
    assert.equal(
      selectedChildWithoutTurnaround.status,
      400,
      'selected child character without a turnaround is rejected before queueing'
    );
    const selectedChildError = (await selectedChildWithoutTurnaround.json()) as any;
    assert.equal(selectedChildError.code, 'CHILD_TURNAROUND_REQUIRED');
    assert.equal(selectedChildError.childProfileId, childProfileId);

    const invalidStory = await postJson(origin, token, '/api/v1/stories', {});
    assert.equal(invalidStory.status, 400, 'invalid ordinary story input returns 400');

    const createGraphicNovel = await postJson(
      origin,
      token,
      '/api/v1/graphic-novels',
      validStoryInput
    );
    assert.equal(createGraphicNovel.status, 201, 'graphic novel request returns 201');
    const graphicBody = (await createGraphicNovel.json()) as any;
    assert.equal(graphicBody.request.id, graphicNovelRequestId);

    const invalidGraphicNovel = await postJson(origin, token, '/api/v1/graphic-novels', {});
    assert.equal(invalidGraphicNovel.status, 400, 'invalid graphic novel input returns 400');

    const createMixedStory = await postJson(
      origin,
      token,
      '/api/v1/mixed-stories',
      validStoryInput
    );
    assert.equal(createMixedStory.status, 201, 'mixed story request returns 201');
    const mixedBody = (await createMixedStory.json()) as any;
    assert.equal(mixedBody.request.id, mixedStoryRequestId);

    const invalidMixedStory = await postJson(origin, token, '/api/v1/mixed-stories', {});
    assert.equal(invalidMixedStory.status, 400, 'invalid mixed story input returns 400');

    const invalidInstantStory = await postJson(origin, token, '/api/v1/stories/instant', {});
    assert.equal(invalidInstantStory.status, 400, 'invalid instant story input returns 400');

    const missingContinuation = await postJson(
      origin,
      token,
      `/api/v1/stories/${missingStoryId}/continue`,
      {}
    );
    assert.equal(missingContinuation.status, 404, 'continuation for an unknown story returns 404');

    assert.deepEqual(queuedInputs, [storyRequestId, graphicNovelRequestId, mixedStoryRequestId]);
    assert.equal(expectedQueueInputs.length, 0, 'all expected queue fixtures were consumed');
    assert.equal(requestIds.length, 0, 'all repository request fixtures were consumed');
    assert.deepEqual(
      persistedRequestUpdates.map((entry) => entry.requestId),
      [graphicNovelRequestId, mixedStoryRequestId],
      'comic formats persist their generation kind through the real service'
    );
    assert.equal(recordedUsageEvents.length, 1, 'graphic novel reservation records usage once');
  } finally {
    clearStoryJobQueueAddJobTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('core generation HTTP contract passed (8 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
