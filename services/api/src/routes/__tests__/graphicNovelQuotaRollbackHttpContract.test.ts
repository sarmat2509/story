import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import {
  createScriptedTransaction,
  createTransactionRunner,
} from '../../testing/scriptedTransaction';

const userId = '91111111-1111-4111-8111-111111111111';
const sessionId = '92222222-2222-4222-8222-222222222222';
const requestId = '93333333-3333-4333-8333-333333333333';

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
  process.env.NODE_ENV = 'test';
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const schema = await import('../../db/schema');
  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { clearStoryJobQueueAddJobTestOverride, installStoryJobQueueAddJobTestOverride } =
    await import('../../jobs/storyJobProcessor');

  const now = new Date();
  const user = {
    id: userId,
    email: 'graphic-quota-rollback@example.test',
    displayName: 'Graphic Quota Rollback',
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
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const subscription = {
    id: '94444444-4444-4444-8444-444444444444',
    userId,
    planId: '95555555-5555-4555-8555-555555555555',
    status: 'active',
    paymentProvider: 'stripe',
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    resetAt: new Date('2099-01-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  } as any;
  const requestRow = {
    id: requestId,
    userId,
    childProfileId: null,
    status: 'pending',
    storyId: null,
  };

  const storyReservation = createScriptedTransaction({
    selects: [
      { label: 'story subscription', table: schema.userSubscriptions, rows: [subscription] },
      {
        label: 'story plan limit',
        table: schema.planFeatures,
        rows: [{ value: { limit: 5 } }],
      },
      {
        label: 'story bundle bonus',
        table: schema.userBundleGrants,
        rows: [{ extraStories: 0 }],
      },
      { label: 'story current usage', table: schema.usageEvents, rows: [{ total: 0 }] },
    ],
    inserts: [
      {
        label: 'pending graphic novel request',
        table: schema.storyRequests,
        returningRows: [{ id: requestId }],
      },
      { label: 'story quota reservation', table: schema.usageEvents },
    ],
  });
  const storyRelease = createScriptedTransaction({
    selects: [
      {
        label: 'graphic novel request for story release',
        table: schema.storyRequests,
        rows: [requestRow],
      },
      { label: 'completed story guard', table: schema.stories, rows: [] },
      { label: 'active story reservation', table: schema.usageEvents, rows: [{ netReserved: 1 }] },
    ],
    inserts: [{ label: 'story quota release', table: schema.usageEvents }],
  });
  const graphicRelease = createScriptedTransaction({
    selects: [
      {
        label: 'graphic novel request for format release',
        table: schema.storyRequests,
        rows: [requestRow],
      },
      {
        label: 'active graphic novel reservation',
        table: schema.usageEvents,
        rows: [{ netReserved: 1 }],
      },
    ],
    inserts: [{ label: 'graphic novel quota release', table: schema.usageEvents }],
  });
  const runner = createTransactionRunner([storyReservation, storyRelease, graphicRelease]);
  const usageEvents: any[] = [];
  const requestUpdates: any[] = [];
  const featureValues = new Map<string, unknown>([
    ['images_per_story', { limit: 4 }],
    ['stories_per_month', { limit: 5 }],
    ['graphic_novels_per_month', { limit: -1 }],
  ]);

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
      transaction: runner.transaction,
      updateRequest: async (id: string, patch: unknown) => {
        requestUpdates.push({ id, patch });
      },
    } as any,
    usageEvents: {
      create: async (input: any) => {
        usageEvents.push(input);
        return { id: `usage-${usageEvents.length}`, ...input };
      },
    } as any,
  });

  installStoryJobQueueAddJobTestOverride(async () => {
    throw new Error('queue unavailable');
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const token = generateToken({ userId, sessionId });

  try {
    const response = await fetch(`${origin}/api/v1/graphic-novels`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.241',
      },
      body: JSON.stringify({
        uiLocale: 'en',
        storyLanguage: 'en',
        goal: 'kindness',
        scenarioCardId: 'forest-path',
        imageStyle: 'soft_watercolor',
        userNotes: 'A lantern adventure.',
        selectedCharacters: [],
        selectedChildren: [],
      }),
    });
    assert.equal(response.status, 500, 'queue failure is returned only after quota rollback');

    assert.equal(requestUpdates.length, 1);
    assert.equal(requestUpdates[0].id, requestId);
    assert.equal(requestUpdates[0].patch.intermediateData.generationKind, 'graphic_novel');

    assert.equal(usageEvents.length, 1);
    const graphicReservation = usageEvents[0];
    assert.deepEqual(
      {
        userId: graphicReservation.userId,
        childProfileId: graphicReservation.childProfileId,
        eventType: graphicReservation.eventType,
        resourceType: graphicReservation.resourceType,
        quantity: graphicReservation.quantity,
        requestId: graphicReservation.metadata.requestId,
        quotaReservation: graphicReservation.metadata.quotaReservation,
        reservationSource: graphicReservation.metadata.reservationSource,
        reservationBehavior: graphicReservation.metadata.reservationBehavior,
      },
      {
        userId,
        childProfileId: null,
        eventType: 'graphic_novel_created',
        resourceType: 'graphic_novel',
        quantity: 1,
        requestId,
        quotaReservation: true,
        reservationSource: 'graphic_novel',
        reservationBehavior: 'consumed_on_queue_acceptance',
      }
    );

    const storyReservationUsage = storyReservation.inserts[1].values as any;
    assert.deepEqual(
      {
        eventType: storyReservationUsage.eventType,
        quantity: storyReservationUsage.quantity,
        requestId: storyReservationUsage.metadata.requestId,
        reservationSource: storyReservationUsage.metadata.reservationSource,
      },
      {
        eventType: 'story_created',
        quantity: 1,
        requestId,
        reservationSource: 'graphic_novel',
      }
    );

    const storyReleaseUsage = storyRelease.inserts[0].values as any;
    assert.deepEqual(
      {
        eventType: storyReleaseUsage.eventType,
        quantity: storyReleaseUsage.quantity,
        requestId: storyReleaseUsage.metadata.requestId,
        quotaReservationRelease: storyReleaseUsage.metadata.quotaReservationRelease,
        releaseReason: storyReleaseUsage.metadata.releaseReason,
      },
      {
        eventType: 'story_created',
        quantity: -1,
        requestId,
        quotaReservationRelease: true,
        releaseReason: 'queue_enqueue_failed',
      }
    );

    const graphicReleaseUsage = graphicRelease.inserts[0].values as any;
    assert.deepEqual(
      {
        eventType: graphicReleaseUsage.eventType,
        resourceType: graphicReleaseUsage.resourceType,
        quantity: graphicReleaseUsage.quantity,
        requestId: graphicReleaseUsage.metadata.requestId,
        quotaReservationRelease: graphicReleaseUsage.metadata.quotaReservationRelease,
        releaseReason: graphicReleaseUsage.metadata.releaseReason,
      },
      {
        eventType: 'graphic_novel_created',
        resourceType: 'graphic_novel',
        quantity: -1,
        requestId,
        quotaReservationRelease: true,
        releaseReason: 'queue_enqueue_failed',
      }
    );

    runner.assertExhausted();
  } finally {
    clearStoryJobQueueAddJobTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('graphic novel quota rollback HTTP contract passed (+1 reservation, -1 rollback)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
