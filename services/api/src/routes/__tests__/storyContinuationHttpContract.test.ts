import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = '81111111-1111-4111-8111-111111111111';
const parentSessionId = '82222222-2222-4222-8222-222222222221';
const childSessionId = '82222222-2222-4222-8222-222222222222';
const childProfileId = '83333333-3333-4333-8333-333333333333';

const seriesStoryId = '84444444-4444-4444-8444-444444444441';
const seriesId = '85555555-5555-4555-8555-555555555551';
const continuationRequestId = '86666666-6666-4666-8666-666666666661';

const noSeriesStoryId = '84444444-4444-4444-8444-444444444442';
const scheduledStoryId = '84444444-4444-4444-8444-444444444443';
const scheduledSeriesId = '85555555-5555-4555-8555-555555555552';
const pendingBatchStoryId = '84444444-4444-4444-8444-444444444444';
const pendingBatchSeriesId = '85555555-5555-4555-8555-555555555553';

const genStatusPendingStoryId = '84444444-4444-4444-8444-444444444445';
const genStatusCompleteStoryId = '84444444-4444-4444-8444-444444444446';

const retryHappyRequestId = '86666666-6666-4666-8666-666666666662';
const retryHappyStoryId = '84444444-4444-4444-8444-444444444447';
const retryMissingRequestId = '86666666-6666-4666-8666-666666666663';
const retryNotFailedRequestId = '86666666-6666-4666-8666-666666666664';

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
  const { clearStoryJobQueueAddJobTestOverride, installStoryJobQueueAddJobTestOverride } =
    await import('../../jobs/storyJobProcessor');

  const now = new Date();
  const user = {
    id: userId,
    email: 'continuation-contract@example.test',
    displayName: 'Continuation Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
    createdAt: now,
    updatedAt: now,
  } as any;
  const parentSession = {
    id: parentSessionId,
    userId,
    mode: 'parent',
    parentUserId: userId,
    childProfileId: null,
    scopes: [],
    token: 'parent-repository-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const childSessionMissingScope = {
    ...parentSession,
    id: childSessionId,
    mode: 'child',
    childProfileId,
    scopes: [],
    token: 'child-repository-token',
  } as any;
  const subscription = {
    id: '87777777-7777-4777-8777-777777777771',
    userId,
    planId: '88888888-8888-4888-8888-888888888881',
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
    ['series_enabled', { enabled: true }],
    ['stories_per_month', { limit: -1 }],
  ]);

  function makeStory(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      userId,
      childProfileId: null,
      createdByChildProfileId: null,
      title: 'A calm lantern adventure',
      language: 'en',
      ageGroup: '6-7',
      moralTheme: null,
      seriesId: null,
      storyRequestId: null,
      metadata: { imageStyle: 'watercolor' },
      ...overrides,
    } as any;
  }

  const storiesById = new Map<string, any>([
    [seriesStoryId, makeStory(seriesStoryId, { seriesId })],
    [noSeriesStoryId, makeStory(noSeriesStoryId)],
    [scheduledStoryId, makeStory(scheduledStoryId, { seriesId: scheduledSeriesId })],
    [pendingBatchStoryId, makeStory(pendingBatchStoryId, { seriesId: pendingBatchSeriesId })],
    [
      genStatusPendingStoryId,
      makeStory(genStatusPendingStoryId, {
        metadata: {
          imageGenerationComplete: false,
          sceneIdsWithImages: [1],
          failedScenes: [],
        },
      }),
    ],
    [genStatusCompleteStoryId, makeStory(genStatusCompleteStoryId, { metadata: {} })],
    [retryHappyStoryId, makeStory(retryHappyStoryId)],
  ]);

  const seriesById = new Map<string, any>([
    [
      seriesId,
      {
        id: seriesId,
        totalParts: 2,
        storyIds: [seriesStoryId],
        continuationContext: {},
        userId,
        childProfileId: null,
      },
    ],
    [
      scheduledSeriesId,
      {
        id: scheduledSeriesId,
        totalParts: 3,
        storyIds: [scheduledStoryId],
        continuationContext: {},
        userId,
        childProfileId: null,
      },
    ],
    [
      pendingBatchSeriesId,
      {
        id: pendingBatchSeriesId,
        totalParts: 1,
        storyIds: [pendingBatchStoryId],
        continuationContext: {},
        userId,
        childProfileId: null,
      },
    ],
  ]);

  let activeRequestCount = 0;
  let scheduleRow: any = null;
  let pendingBatch = false;
  const upsertedSchedules: Array<Record<string, unknown>> = [];
  const deletedScheduleSeriesIds: string[] = [];

  const requestsById = new Map<string, any>([
    [
      retryHappyRequestId,
      { id: retryHappyRequestId, userId, status: 'failed', storyId: retryHappyStoryId, intermediateData: {} },
    ],
    [
      retryNotFailedRequestId,
      {
        id: retryNotFailedRequestId,
        userId,
        status: 'pending',
        storyId: retryHappyStoryId,
        intermediateData: {},
      },
    ],
  ]);

  const persistedRequestUpdates: Array<{ requestId: string; patch: unknown }> = [];
  const createdGenerationJobs: Array<{ queueName: string; jobType: string; payload: unknown }> = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (sessionId: string) => ({
        session: sessionId === childSessionId ? childSessionMissingScope : parentSession,
        user,
      }),
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
    dictionary: {
      findAllGoals: async () => [{ slug: 'kindness', minAge: 0 }],
    } as any,
    story: {
      findByIdAndUser: async (id: string, requestedUserId: string) => {
        const story = storiesById.get(id);
        return story && story.userId === requestedUserId ? story : null;
      },
      findById: async (id: string) => storiesById.get(id) ?? null,
      findSeriesById: async (id: string) => seriesById.get(id) ?? null,
      findLinkedCharactersByStoryId: async () => [],
      countActiveRequestsForUpdate: async () => activeRequestCount,
      transaction: async () => ({ requestId: continuationRequestId, remaining: null, limit: null }),
      hasPendingBatchForSeries: async () => pendingBatch,
      findScheduleBySeriesId: async () => scheduleRow,
      upsertSeriesSchedule: async (input: Record<string, unknown>) => {
        upsertedSchedules.push(input);
        scheduleRow = {
          cadence: input.cadence,
          nextRunAt: input.nextRunAt,
        };
        return scheduleRow;
      },
      deleteScheduleBySeriesId: async (seriesIdValue: string) => {
        deletedScheduleSeriesIds.push(seriesIdValue);
        scheduleRow = null;
      },
      updateSeries: async () => undefined,
      findRequestByIdAndUser: async (id: string, requestedUserId: string) => {
        const request = requestsById.get(id);
        return request && request.userId === requestedUserId ? request : null;
      },
      updateRequest: async (requestId: string, patch: unknown) => {
        persistedRequestUpdates.push({ requestId, patch });
        return undefined;
      },
    } as any,
    scene: {
      findByStoryId: async (storyId: string) =>
        storyId === genStatusPendingStoryId
          ? [{ sceneId: 1, imageUrl: 'scenes/1.jpg' }, { sceneId: 2, imageUrl: null }]
          : [],
    } as any,
    generationJob: {
      create: async (input: any) => {
        createdGenerationJobs.push(input);
        return { ...input, status: 'queued', retries: 0, createdAt: now } as any;
      },
    } as any,
  });

  const queuedContinuationInputs: unknown[] = [];
  installStoryJobQueueAddJobTestOverride(async (input) => {
    queuedContinuationInputs.push(input);
    return `job-${queuedContinuationInputs.length}`;
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const parentAuthorization = `Bearer ${generateToken({ userId, sessionId: parentSessionId })}`;
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;

  const post = (path: string, body: unknown, authorization: string) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const del = (path: string, authorization: string) =>
    fetch(`${origin}${path}`, {
      method: 'DELETE',
      headers: { authorization },
    });
  const get = (path: string, authorization: string) =>
    fetch(`${origin}${path}`, { headers: { authorization } });

  try {
    // 1. Parent continuation of a story already anchoring a series -> 202 accepted.
    const continueResponse = await post(
      `/api/v1/stories/${seriesStoryId}/continue`,
      {},
      parentAuthorization
    );
    assert.equal(continueResponse.status, 202, 'parent continuation is accepted');
    const continueBody = (await continueResponse.json()) as any;
    assert.equal(continueBody.status, 'success');
    assert.equal(continueBody.request.id, continuationRequestId);
    assert.equal(continueBody.request.status, 'pending');
    assert.deepEqual(queuedContinuationInputs, [continuationRequestId]);

    // 2. Child session without the child_mode scope is rejected before any generation work.
    const childDenied = await post(
      `/api/v1/stories/${seriesStoryId}/continue`,
      {},
      childAuthorization
    );
    assert.equal(childDenied.status, 403, 'child session missing scope is denied');
    const childDeniedBody = (await childDenied.json()) as any;
    assert.equal(childDeniedBody.code, 'SESSION_SCOPE_REQUIRED');

    // 3. Concurrent job limit -> 429, without reaching quota reservation.
    activeRequestCount = 3;
    const limited = await post(`/api/v1/stories/${seriesStoryId}/continue`, {}, parentAuthorization);
    assert.equal(limited.status, 429, 'too many active requests returns 429');
    activeRequestCount = 0;
    assert.deepEqual(
      queuedContinuationInputs,
      [continuationRequestId],
      'rate-limited attempt never reaches the queue'
    );

    // 4. Generation status: in-progress story reports per-scene image state.
    const pendingStatus = await get(
      `/api/v1/stories/${genStatusPendingStoryId}/generation-status`,
      parentAuthorization
    );
    assert.equal(pendingStatus.status, 200);
    const pendingStatusBody = (await pendingStatus.json()) as any;
    assert.equal(pendingStatusBody.generationStatus.imageGenerationComplete, false);
    assert.deepEqual(pendingStatusBody.generationStatus.sceneIdsWithImages, [1]);

    const completeStatus = await get(
      `/api/v1/stories/${genStatusCompleteStoryId}/generation-status`,
      parentAuthorization
    );
    assert.equal(completeStatus.status, 200);
    const completeStatusBody = (await completeStatus.json()) as any;
    assert.equal(completeStatusBody.generationStatus.imageGenerationComplete, true);

    // 5. Schedule read: no series, active schedule, pending batch without a schedule row yet.
    const noSeriesSchedule = await get(`/api/v1/stories/${noSeriesStoryId}/schedule`, parentAuthorization);
    assert.equal(noSeriesSchedule.status, 200);
    const noSeriesScheduleBody = (await noSeriesSchedule.json()) as any;
    assert.equal(noSeriesScheduleBody.data, null);

    scheduleRow = { cadence: 'weekly', nextRunAt: new Date('2026-07-22T09:00:00.000Z') };
    pendingBatch = false;
    const activeSchedule = await get(`/api/v1/stories/${scheduledStoryId}/schedule`, parentAuthorization);
    assert.equal(activeSchedule.status, 200);
    const activeScheduleBody = (await activeSchedule.json()) as any;
    assert.equal(activeScheduleBody.data.cadence, 'weekly');
    assert.equal(activeScheduleBody.data.nextRunAt, '2026-07-22T09:00:00.000Z');
    assert.equal(activeScheduleBody.data.inProgress, false);

    scheduleRow = null;
    pendingBatch = true;
    const pendingSchedule = await get(
      `/api/v1/stories/${pendingBatchStoryId}/schedule`,
      parentAuthorization
    );
    assert.equal(pendingSchedule.status, 200);
    const pendingScheduleBody = (await pendingSchedule.json()) as any;
    assert.deepEqual(pendingScheduleBody.data, { inProgress: true });

    // 5b. Schedule write/cancel: POST create, DELETE cancel, DELETE while in-progress, invalid cadence.
    pendingBatch = false;
    upsertedSchedules.length = 0;
    const scheduleCreate = await post(
      `/api/v1/stories/${scheduledStoryId}/schedule-continuation`,
      { cadence: 'weekly' },
      parentAuthorization
    );
    assert.equal(scheduleCreate.status, 200);
    const scheduleCreateBody = (await scheduleCreate.json()) as any;
    assert.equal(scheduleCreateBody.status, 'success');
    assert.equal(scheduleCreateBody.data.cadence, 'weekly');
    assert.equal(typeof scheduleCreateBody.data.nextRunAt, 'string');
    assert.equal(upsertedSchedules.length, 1);
    assert.equal(upsertedSchedules[0].seriesId, scheduledSeriesId);
    assert.equal(upsertedSchedules[0].cadence, 'weekly');
    assert.equal(upsertedSchedules[0].userId, userId);

    const scheduleInvalid = await post(
      `/api/v1/stories/${scheduledStoryId}/schedule-continuation`,
      { cadence: 'hourly' },
      parentAuthorization
    );
    assert.equal(scheduleInvalid.status, 400);

    const scheduleMissing = await post(
      `/api/v1/stories/99999999-9999-4999-8999-999999999999/schedule-continuation`,
      { cadence: 'daily' },
      parentAuthorization
    );
    assert.equal(scheduleMissing.status, 404);

    deletedScheduleSeriesIds.length = 0;
    pendingBatch = false;
    const scheduleCancel = await del(
      `/api/v1/stories/${scheduledStoryId}/schedule-continuation`,
      parentAuthorization
    );
    assert.equal(scheduleCancel.status, 200);
    const scheduleCancelBody = (await scheduleCancel.json()) as any;
    assert.equal(scheduleCancelBody.status, 'success');
    assert.equal(scheduleCancelBody.data, null);
    assert.deepEqual(deletedScheduleSeriesIds, [scheduledSeriesId]);

    pendingBatch = true;
    const scheduleBusy = await del(
      `/api/v1/stories/${pendingBatchStoryId}/schedule-continuation`,
      parentAuthorization
    );
    assert.equal(scheduleBusy.status, 409);
    const scheduleBusyBody = (await scheduleBusy.json()) as any;
    assert.equal(scheduleBusyBody.code, 'IN_PROGRESS');

    pendingBatch = false;
    const scheduleNoSeries = await del(
      `/api/v1/stories/${noSeriesStoryId}/schedule-continuation`,
      parentAuthorization
    );
    assert.equal(scheduleNoSeries.status, 200);
    const scheduleNoSeriesBody = (await scheduleNoSeries.json()) as any;
    assert.equal(scheduleNoSeriesBody.data, null);

    // 6. Retry-images: unknown request, non-failed request, and the happy path.
    const retryMissing = await post(
      `/api/v1/stories/requests/${retryMissingRequestId}/retry-images`,
      {},
      parentAuthorization
    );
    assert.equal(retryMissing.status, 404);

    const retryNotFailed = await post(
      `/api/v1/stories/requests/${retryNotFailedRequestId}/retry-images`,
      {},
      parentAuthorization
    );
    assert.equal(retryNotFailed.status, 400);

    const retryHappy = await post(
      `/api/v1/stories/requests/${retryHappyRequestId}/retry-images`,
      {},
      parentAuthorization
    );
    assert.equal(retryHappy.status, 200, 'retry of a failed request is accepted');
    const retryHappyBody = (await retryHappy.json()) as any;
    assert.equal(retryHappyBody.request.id, retryHappyRequestId);
    assert.equal(retryHappyBody.request.status, 'processing');
    assert.equal(persistedRequestUpdates[0]?.requestId, retryHappyRequestId);
    assert.equal((persistedRequestUpdates[0]?.patch as any)?.status, 'processing');
    assert.equal(createdGenerationJobs.length, 1, 'retry enqueues exactly one image job');
    assert.equal(createdGenerationJobs[0].queueName, 'image');
    assert.equal((createdGenerationJobs[0].payload as any).type, 'image_batch');
    assert.equal((createdGenerationJobs[0].payload as any).requestId, retryHappyRequestId);
  } finally {
    clearStoryJobQueueAddJobTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('story continuation HTTP contract passed (9 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
