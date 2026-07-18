import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = '11111111-1111-4111-8111-111111111111';
const childProfileId = '22222222-2222-4222-8222-222222222222';
const childSessionId = '33333333-3333-4333-8333-333333333333';
const parentSessionId = '33333333-3333-4333-8333-333333333334';
const childStoryRequestId = '44444444-4444-4444-8444-444444444441';
const childInstantRequestId = '44444444-4444-4444-8444-444444444442';
const parentInstantRequestId = '44444444-4444-4444-8444-444444444443';

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
  const { DEFAULT_CHILD_MODE_SETTINGS } = await import('../../services/childModeControlsService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { clearStoryJobQueueAddJobTestOverride, installStoryJobQueueAddJobTestOverride } =
    await import('../../jobs/storyJobProcessor');

  const now = new Date();
  const user = {
    id: userId,
    email: 'child-generation-contract@example.test',
    displayName: 'Child Generation Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    createdAt: now,
    updatedAt: now,
  } as any;
  const childSession = {
    id: childSessionId,
    userId,
    mode: 'child',
    parentUserId: userId,
    childProfileId,
    scopes: ['child_mode', 'story:free_text'],
    token: 'child-repository-token',
    deviceName: null,
    deviceType: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const parentSession = {
    ...childSession,
    id: parentSessionId,
    mode: 'parent',
    childProfileId: null,
    scopes: [],
    token: 'parent-repository-token',
  } as any;
  const childProfile = {
    id: childProfileId,
    userId,
    name: 'Mira',
    birthDate: '2018-01-01',
    childModeEnabled: true,
    childModeSettings: DEFAULT_CHILD_MODE_SETTINGS,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as any;
  let childModeSettings = DEFAULT_CHILD_MODE_SETTINGS;
  const subscription = {
    id: '55555555-5555-4555-8555-555555555555',
    userId,
    planId: '66666666-6666-4666-8666-666666666666',
    status: 'active',
    paymentProvider: 'stripe',
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
    ['story_from_drawing', { enabled: true }],
  ]);
  const requestIds = [childStoryRequestId, childInstantRequestId, parentInstantRequestId];
  const persistedRequestUpdates: Array<{ requestId: string; patch: any }> = [];
  const recordedConsents: any[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (sessionId: string) => ({
        session: sessionId === parentSessionId ? parentSession : childSession,
        user,
      }),
      updateLastActive: async () => undefined,
    } as any,
    childProfile: {
      findById: async () => ({ ...childProfile, childModeSettings }),
    } as any,
    plan: {
      findSubscriptionByUserId: async () => subscription,
      findAllFeaturesForPlan: async () =>
        Array.from(featureValues, ([slug, value]) => ({ slug, value })),
      findFeatureValue: async (_planId: string, slug: string) => featureValues.get(slug) ?? null,
    } as any,
    userConsent: {
      record: async (input: any) => {
        recordedConsents.push(input);
      },
    } as any,
    story: {
      countChildCreatedRequestsSince: async () => 0,
      countActiveRequestsForUpdate: async () => 0,
      transaction: async () => {
        const requestId = requestIds.shift();
        assert.ok(requestId, 'unexpected story quota reservation');
        return { requestId, remaining: null, limit: null };
      },
      updateRequest: async (requestId: string, patch: any) => {
        persistedRequestUpdates.push({ requestId, patch });
        return undefined;
      },
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
  });

  const queuedRequestIds: unknown[] = [];
  installStoryJobQueueAddJobTestOverride(async (input) => {
    queuedRequestIds.push(input);
    return `job-${queuedRequestIds.length}`;
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;
  const parentAuthorization = `Bearer ${generateToken({ userId, sessionId: parentSessionId })}`;

  const post = (path: string, body: unknown, authorization: string) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.90',
      },
      body: JSON.stringify(body),
    });

  try {
    childModeSettings = {
      ...DEFAULT_CHILD_MODE_SETTINGS,
      storyGenerationEnabled: false,
    };
    const deniedChildInstantStory = await post(
      '/api/v1/stories/instant',
      {
        photos: [`/api/v1/assets/test/${userId}/photos/child/photo.jpg`],
        ageGroup: '6-7',
        scenario: 'free',
        language: 'en',
      },
      childAuthorization
    );
    assert.equal(deniedChildInstantStory.status, 403);
    const deniedChildInstantBody = (await deniedChildInstantStory.json()) as any;
    assert.equal(deniedChildInstantBody.code, 'CHILD_STORY_GENERATION_DISABLED');

    childModeSettings = DEFAULT_CHILD_MODE_SETTINGS;
    const createChildStory = await post(
      '/api/v1/stories/child-mode',
      {
        childProfileId,
        uiLocale: 'en',
        storyLanguage: 'en',
        goal: 'kindness',
        imageStyle: 'soft_watercolor',
        selectedCharacters: [],
        selectedChildren: [],
      },
      childAuthorization
    );
    assert.equal(createChildStory.status, 201);
    const childStoryBody = (await createChildStory.json()) as any;
    assert.equal(childStoryBody.status, 'success');
    assert.equal(childStoryBody.request.id, childStoryRequestId);
    assert.equal(childStoryBody.request.createdByMode, 'child');
    assert.equal(childStoryBody.request.createdByChildProfileId, childProfileId);

    const createChildInstantStory = await post(
      '/api/v1/stories/instant',
      {
        photos: [`/api/v1/assets/test/${userId}/photos/child/photo.jpg`],
        ageGroup: '6-7',
        scenario: 'free',
        language: 'en',
        goals: ['kindness'],
        imageStyle: 'soft_watercolor',
      },
      childAuthorization
    );
    assert.equal(createChildInstantStory.status, 201);
    const childInstantBody = (await createChildInstantStory.json()) as any;
    assert.equal(childInstantBody.status, 'success');
    assert.equal(childInstantBody.request.id, childInstantRequestId);

    const createParentInstantStory = await post(
      '/api/v1/stories/instant',
      {
        photos: [`/api/v1/assets/test/${userId}/photos/child/photo.jpg`],
        ageGroup: '6-7',
        scenario: 'free',
        language: 'en',
        goals: ['kindness'],
        imageStyle: 'soft_watercolor',
        childDataConsentAccepted: true,
      },
      parentAuthorization
    );
    assert.equal(createParentInstantStory.status, 201);
    const parentInstantBody = (await createParentInstantStory.json()) as any;
    assert.equal(parentInstantBody.status, 'success');
    assert.equal(parentInstantBody.request.id, parentInstantRequestId);

    assert.deepEqual(queuedRequestIds, [
      childStoryRequestId,
      childInstantRequestId,
      parentInstantRequestId,
    ]);
    assert.equal(requestIds.length, 0);
    assert.equal(persistedRequestUpdates.length, 2);
    assert.equal(persistedRequestUpdates[0].requestId, childInstantRequestId);
    assert.deepEqual(persistedRequestUpdates[0].patch.intermediateData, {
      instantMode: true,
      photos: [`/api/v1/assets/test/${userId}/photos/child/photo.jpg`],
      ageGroup: '6-7',
      characterSetupComplete: false,
    });
    assert.equal(persistedRequestUpdates[1].requestId, parentInstantRequestId);
    assert.equal(recordedConsents.length, 1);
    assert.equal(recordedConsents[0].userId, userId);
    assert.equal(recordedConsents[0].consentType, 'child_data_processing');
  } finally {
    clearStoryJobQueueAddJobTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('child/instant generation HTTP contract passed (3 success, 1 policy deny)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
