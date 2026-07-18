import assert from 'node:assert/strict';
import {
  createScriptedTransaction,
  createTransactionRunner,
} from '../../testing/scriptedTransaction';

const userId = '81111111-1111-4111-8111-111111111111';
const childProfileId = '82222222-2222-4222-8222-222222222222';
const storyRequestId = '83333333-3333-4333-8333-333333333333';
const audioStoryId = '84444444-4444-4444-8444-444444444444';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const schema = await import('../../db/schema');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { createStoryRequestWithQuotaReservation, releaseStoryQuotaReservationForRequest } =
    await import('../storyQuotaService');
  const { reserveAudioQuotaForStory, releaseAudioQuotaReservationForStory } =
    await import('../audioQuotaReservationService');

  const subscription = {
    planId: '85555555-5555-4555-8555-555555555555',
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    resetAt: new Date('2099-01-01T00:00:00.000Z'),
    paymentProvider: 'stripe',
  };
  const storyRequest = {
    id: storyRequestId,
    userId,
    childProfileId,
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
        rows: [{ extraStories: 1 }],
      },
      { label: 'story current usage', table: schema.usageEvents, rows: [{ total: 2 }] },
    ],
    inserts: [
      {
        label: 'pending story request',
        table: schema.storyRequests,
        returningRows: [{ id: storyRequestId }],
      },
      { label: 'story quota reservation', table: schema.usageEvents },
    ],
  });
  const storyRelease = createScriptedTransaction({
    selects: [
      { label: 'reserved story request', table: schema.storyRequests, rows: [storyRequest] },
      { label: 'completed story guard', table: schema.stories, rows: [] },
      { label: 'active story reservation', table: schema.usageEvents, rows: [{ netReserved: 1 }] },
    ],
    inserts: [{ label: 'story quota release', table: schema.usageEvents }],
  });
  const storyReleaseAgain = createScriptedTransaction({
    selects: [
      { label: 'reserved story request', table: schema.storyRequests, rows: [storyRequest] },
      { label: 'completed story guard', table: schema.stories, rows: [] },
      {
        label: 'released story reservation',
        table: schema.usageEvents,
        rows: [{ netReserved: 0 }],
      },
    ],
  });

  const audioReservation = createScriptedTransaction({
    selects: [
      { label: 'audio subscription', table: schema.userSubscriptions, rows: [subscription] },
      {
        label: 'audio plan limit',
        table: schema.planFeatures,
        rows: [{ value: { limit: 2 } }],
      },
      { label: 'audio usage for story', table: schema.usageEvents, rows: [{ total: 0 }] },
      {
        label: 'audio bundle bonus',
        table: schema.userBundleGrants,
        rows: [{ extraAudio: 1 }],
      },
      { label: 'audio current usage', table: schema.usageEvents, rows: [{ total: 1 }] },
    ],
    inserts: [{ label: 'audio quota reservation', table: schema.usageEvents }],
  });
  const audioReservationAgain = createScriptedTransaction({
    selects: [
      { label: 'audio subscription', table: schema.userSubscriptions, rows: [subscription] },
      {
        label: 'audio plan limit',
        table: schema.planFeatures,
        rows: [{ value: { limit: 2 } }],
      },
      { label: 'audio usage for story', table: schema.usageEvents, rows: [{ total: 1 }] },
      {
        label: 'audio bundle bonus',
        table: schema.userBundleGrants,
        rows: [{ extraAudio: 1 }],
      },
      { label: 'audio current usage', table: schema.usageEvents, rows: [{ total: 2 }] },
    ],
  });
  const audioRelease = createScriptedTransaction({
    selects: [
      { label: 'active audio reservation', table: schema.usageEvents, rows: [{ netReserved: 1 }] },
    ],
    inserts: [{ label: 'audio quota release', table: schema.usageEvents }],
  });
  const audioReleaseAgain = createScriptedTransaction({
    selects: [
      {
        label: 'released audio reservation',
        table: schema.usageEvents,
        rows: [{ netReserved: 0 }],
      },
    ],
  });

  const runner = createTransactionRunner([
    storyReservation,
    storyRelease,
    storyReleaseAgain,
    audioReservation,
    audioReservationAgain,
    audioRelease,
    audioReleaseAgain,
  ]);

  installRepositoryTestOverrides({
    story: {
      transaction: runner.transaction,
    } as any,
  });

  try {
    const reservation = await createStoryRequestWithQuotaReservation(
      userId,
      {
        userId,
        childProfileId,
        uiLocale: 'en',
        storyLanguage: 'en',
        goal: 'kindness',
        scenarioCardId: 'forest-path',
        imageStyle: 'soft_watercolor',
        userNotes: null,
        selectedCharacters: null,
        selectedChildren: null,
        status: 'pending',
        progress: 0,
      } as any,
      { source: 'wizard' }
    );
    assert.deepEqual(reservation, { requestId: storyRequestId, limit: 6, remaining: 3 });

    assert.equal(storyReservation.inserts.length, 2);
    const storyUsage = storyReservation.inserts[1].values as any;
    assert.deepEqual(
      {
        userId: storyUsage.userId,
        childProfileId: storyUsage.childProfileId,
        eventType: storyUsage.eventType,
        resourceType: storyUsage.resourceType,
        quantity: storyUsage.quantity,
        requestId: storyUsage.metadata.requestId,
        quotaReservation: storyUsage.metadata.quotaReservation,
        reservationSource: storyUsage.metadata.reservationSource,
        reservationBehavior: storyUsage.metadata.reservationBehavior,
      },
      {
        userId,
        childProfileId,
        eventType: 'story_created',
        resourceType: 'story',
        quantity: 1,
        requestId: storyRequestId,
        quotaReservation: true,
        reservationSource: 'wizard',
        reservationBehavior: 'consumed_on_queue_acceptance',
      }
    );

    const releasedStory = await releaseStoryQuotaReservationForRequest(storyRequestId, {
      reason: 'queue_enqueue_failed',
      errorMessage: 'queue unavailable',
    });
    assert.deepEqual(releasedStory, { released: true, netReserved: 1, userId });
    const storyReleaseUsage = storyRelease.inserts[0].values as any;
    assert.deepEqual(
      {
        eventType: storyReleaseUsage.eventType,
        resourceType: storyReleaseUsage.resourceType,
        quantity: storyReleaseUsage.quantity,
        requestId: storyReleaseUsage.metadata.requestId,
        quotaReservationRelease: storyReleaseUsage.metadata.quotaReservationRelease,
        releaseReason: storyReleaseUsage.metadata.releaseReason,
        errorMessage: storyReleaseUsage.metadata.errorMessage,
      },
      {
        eventType: 'story_created',
        resourceType: 'story',
        quantity: -1,
        requestId: storyRequestId,
        quotaReservationRelease: true,
        releaseReason: 'queue_enqueue_failed',
        errorMessage: 'queue unavailable',
      }
    );

    const releasedStoryAgain = await releaseStoryQuotaReservationForRequest(storyRequestId, {
      reason: 'queue_enqueue_failed',
    });
    assert.deepEqual(releasedStoryAgain, {
      released: false,
      netReserved: 0,
      userId,
      skippedReason: 'no_active_reservation',
    });

    const reservedAudio = await reserveAudioQuotaForStory(userId, audioStoryId, {
      source: 'manual',
      childProfileId,
    });
    assert.deepEqual(reservedAudio, {
      reserved: true,
      alreadyReservedForStory: false,
      limit: 3,
      used: 2,
      remaining: 1,
      resetsAt: subscription.currentPeriodEnd,
    });
    const audioUsage = audioReservation.inserts[0].values as any;
    assert.deepEqual(
      {
        userId: audioUsage.userId,
        childProfileId: audioUsage.childProfileId,
        eventType: audioUsage.eventType,
        resourceType: audioUsage.resourceType,
        quantity: audioUsage.quantity,
        storyId: audioUsage.metadata.storyId,
        quotaReservation: audioUsage.metadata.quotaReservation,
        reservationSource: audioUsage.metadata.reservationSource,
        reservationBehavior: audioUsage.metadata.reservationBehavior,
      },
      {
        userId,
        childProfileId,
        eventType: 'audio_synthesized',
        resourceType: 'audio',
        quantity: 1,
        storyId: audioStoryId,
        quotaReservation: true,
        reservationSource: 'manual',
        reservationBehavior: 'consumed_on_queue_acceptance',
      }
    );

    const reservedAudioAgain = await reserveAudioQuotaForStory(userId, audioStoryId, {
      source: 'manual',
      childProfileId,
    });
    assert.deepEqual(reservedAudioAgain, {
      reserved: false,
      alreadyReservedForStory: true,
      limit: 3,
      used: 2,
      remaining: 1,
      resetsAt: subscription.currentPeriodEnd,
    });
    assert.equal(audioReservationAgain.inserts.length, 0);

    const releasedAudio = await releaseAudioQuotaReservationForStory(userId, audioStoryId, {
      reason: 'queue_enqueue_failed',
      childProfileId,
      errorMessage: 'queue unavailable',
    });
    assert.deepEqual(releasedAudio, { released: true, netReserved: 1 });
    const audioReleaseUsage = audioRelease.inserts[0].values as any;
    assert.deepEqual(
      {
        childProfileId: audioReleaseUsage.childProfileId,
        eventType: audioReleaseUsage.eventType,
        resourceType: audioReleaseUsage.resourceType,
        quantity: audioReleaseUsage.quantity,
        storyId: audioReleaseUsage.metadata.storyId,
        quotaReservationRelease: audioReleaseUsage.metadata.quotaReservationRelease,
        releaseReason: audioReleaseUsage.metadata.releaseReason,
        errorMessage: audioReleaseUsage.metadata.errorMessage,
      },
      {
        childProfileId,
        eventType: 'audio_synthesized',
        resourceType: 'audio',
        quantity: -1,
        storyId: audioStoryId,
        quotaReservationRelease: true,
        releaseReason: 'queue_enqueue_failed',
        errorMessage: 'queue unavailable',
      }
    );

    const releasedAudioAgain = await releaseAudioQuotaReservationForStory(userId, audioStoryId, {
      reason: 'queue_enqueue_failed',
      childProfileId,
    });
    assert.deepEqual(releasedAudioAgain, {
      released: false,
      netReserved: 0,
      skippedReason: 'no_active_reservation',
    });

    runner.assertExhausted();
  } finally {
    clearRepositoryTestOverrides();
  }

  console.log('quota service side-effects contract passed (story + audio reservation/release)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
