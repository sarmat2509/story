import assert from 'node:assert/strict';

const userId = 'j1000000-0000-4000-8000-000000000001';
const requestId = 'j2000000-0000-4000-8000-000000000001';
const storyId = 'j3000000-0000-4000-8000-000000000001';
const scheduleId = 'j4000000-0000-4000-8000-000000000001';

function baseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'text-job-1',
    type: 'text_generation' as const,
    requestId,
    isContinuation: false,
    status: 'processing' as const,
    retries: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';
  process.env.SKIP_IMAGE_GENERATION = 'true';

  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const {
    clearStoryTextPhaseTestOverride,
    imageQueue,
    installStoryTextPhaseTestOverride,
    processImageGenerationForTesting,
    processTextGenerationForTesting,
  } = await import('../storyJobProcessor');

  const originalAddJob = imageQueue.addJob.bind(imageQueue);
  const flushImmediate = () => new Promise<void>((resolve) => setImmediate(resolve));

  async function withImageQueueStub<T>(
    run: (enqueued: unknown[], failNext: () => void) => Promise<T>
  ): Promise<T> {
    const enqueued: unknown[] = [];
    let shouldFail = false;
    (imageQueue as { addJob: typeof imageQueue.addJob }).addJob = async (job) => {
      if (shouldFail) {
        throw new Error('image queue unavailable');
      }
      enqueued.push(job);
      return 'image-job-stub-1';
    };
    try {
      return await run(enqueued, () => {
        shouldFail = true;
      });
    } finally {
      (imageQueue as { addJob: typeof imageQueue.addJob }).addJob = originalAddJob;
    }
  }

  // --- Happy path: text phase → image_batch enqueue ---
  {
    const requestUpdates: Array<Record<string, unknown>> = [];
    const batchPending: unknown[] = [];

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => ({
          id: requestId,
          userId,
          intermediateData: {},
          status: 'processing',
        }),
        findById: async () => null,
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          requestUpdates.push(patch);
          return undefined;
        },
        insertBatchImagePending: async (row: unknown) => {
          batchPending.push(row);
        },
      } as any,
    });
    installStoryTextPhaseTestOverride(async (id) => {
      assert.equal(id, requestId);
      return { storyId };
    });

    try {
      await withImageQueueStub(async (enqueued) => {
        await processTextGenerationForTesting(baseJob({ isContinuation: true }));
        assert.equal(enqueued.length, 1);
        assert.deepEqual(enqueued[0], {
          type: 'image_batch',
          requestId,
          storyId,
          isContinuation: true,
        });
        assert.equal(batchPending.length, 0);
        assert.equal(requestUpdates.length, 0);
      });
    } finally {
      await flushImmediate();
      clearStoryTextPhaseTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  // --- Scheduled continuation: batch_image_pending, no imageQueue ---
  {
    const batchPending: unknown[] = [];
    const enqueued: unknown[] = [];

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => ({
          id: requestId,
          userId,
          intermediateData: { isScheduledContinuation: true },
          status: 'processing',
        }),
        findById: async () => null,
        insertBatchImagePending: async (row: unknown) => {
          batchPending.push(row);
        },
      } as any,
    });
    installStoryTextPhaseTestOverride(async () => ({
      storyId,
      isScheduledContinuation: true,
      scheduleId,
    }));

    (imageQueue as { addJob: typeof imageQueue.addJob }).addJob = async (job) => {
      enqueued.push(job);
      return 'should-not-run';
    };

    try {
      await processTextGenerationForTesting(baseJob());
      assert.equal(enqueued.length, 0);
      assert.deepEqual(batchPending, [
        {
          storyId,
          requestId,
          scheduleId,
          purpose: 'scheduled_scene',
        },
      ]);
    } finally {
      await flushImmediate();
      (imageQueue as { addJob: typeof imageQueue.addJob }).addJob = originalAddJob;
      clearStoryTextPhaseTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  // --- Scheduled family story: batch only the missing environment plates ---
  {
    const batchPending: unknown[] = [];
    const enqueued: unknown[] = [];

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => ({
          id: requestId,
          userId,
          intermediateData: { isScheduledStory: true },
          status: 'processing',
        }),
        findById: async () => null,
        insertBatchImagePending: async (row: unknown) => {
          batchPending.push(row);
        },
      } as any,
    });
    installStoryTextPhaseTestOverride(async () => ({ storyId, isScheduledStory: true }));
    (imageQueue as { addJob: typeof imageQueue.addJob }).addJob = async (job) => {
      enqueued.push(job);
      return 'should-not-run';
    };

    try {
      await processTextGenerationForTesting(baseJob());
      assert.equal(enqueued.length, 0, 'Seedream scene rendering waits for the environment batch');
      assert.deepEqual(batchPending, [
        {
          storyId,
          requestId,
          scheduleId: null,
          purpose: 'scheduled_environment',
        },
      ]);
    } finally {
      await flushImmediate();
      (imageQueue as { addJob: typeof imageQueue.addJob }).addJob = originalAddJob;
      clearStoryTextPhaseTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  // --- Image enqueue failure: story still marked completed ---
  {
    const requestUpdates: Array<Record<string, unknown>> = [];

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => ({
          id: requestId,
          userId,
          intermediateData: {},
          status: 'processing',
        }),
        findById: async () => null,
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          requestUpdates.push(patch);
          return undefined;
        },
      } as any,
    });
    installStoryTextPhaseTestOverride(async () => ({ storyId }));

    try {
      await withImageQueueStub(async (_enqueued, failNext) => {
        failNext();
        await processTextGenerationForTesting(baseJob());
        assert.equal(requestUpdates.length, 1);
        assert.equal(requestUpdates[0].status, 'completed');
        assert.equal(requestUpdates[0].storyId, storyId);
        assert.equal(requestUpdates[0].errorMessage, null);
      });
    } finally {
      await flushImmediate();
      clearStoryTextPhaseTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  // --- Production image-batch lifecycle: progress, completion, metadata, checkpoint cleanup ---
  {
    const { MockImageProvider, MockTextProvider } = await import('../../testing/ai');
    const { clearAiServiceTestOverrides, installAiServiceTestOverrides } =
      await import('../../services/aiService');
    const now = new Date();
    const request = {
      id: requestId,
      userId,
      status: 'processing',
      progress: 0,
      progressData: null,
      createdAt: now,
      intermediateData: {
        storyId,
        validatedText: {
          title: 'Worker lifecycle',
          scenes: [{ sceneId: 1, text: 'A lantern glows.' }],
          characters: [],
          environments: [],
          outfits: [],
        },
        spec: {
          ageGroup: '6-8',
          language: 'en',
          imageStyle: 'soft_watercolor',
          characters: [],
          childProfile: null,
        },
        mergedCharacters: [],
      },
    } as any;
    const story = {
      id: storyId,
      userId,
      coverAssetId: null,
      metadata: {},
    } as any;
    const requestUpdates: Array<Record<string, unknown>> = [];
    const storyUpdates: Array<Record<string, unknown>> = [];
    const stageEvents: Array<Record<string, unknown>> = [];

    installAiServiceTestOverrides({
      imageProvider: new MockImageProvider(),
      complexImageProvider: new MockImageProvider(),
      validationTextProvider: new MockTextProvider(),
    });
    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => request,
        findRequestForUpdate: async () => request,
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(request, patch);
          requestUpdates.push(structuredClone(patch));
        },
        transaction: async (callback: (tx: any) => Promise<unknown>) => callback({}),
        findRecentWithMetadata: async () => [],
        findRecentWithAudioMetadata: async () => [],
        findById: async () => story,
        updateStory: async (_id: string, patch: Record<string, unknown>) => {
          if (patch.metadata) {
            story.metadata = { ...story.metadata, ...(patch.metadata as object) };
          }
          Object.assign(story, patch, { metadata: story.metadata });
          storyUpdates.push(structuredClone(patch));
          return story;
        },
      } as any,
      plan: { findSubscriptionByUserId: async () => null } as any,
      asset: {
        findRecentImageGenerationTimes: async () => [],
        findCompletedImagesByStoryIds: async () => [],
      } as any,
      scene: { findByStoryId: async () => [] } as any,
      storyGenerationStageEvent: {
        create: async (row: Record<string, unknown>) => {
          stageEvents.push(structuredClone(row));
          return { id: `stage-${stageEvents.length}`, ...row };
        },
      } as any,
    });

    try {
      await processImageGenerationForTesting({
        id: 'image-job-1',
        type: 'image_batch',
        requestId,
        storyId,
        status: 'processing',
        retries: 0,
        createdAt: now,
      });

      assert.equal(request.status, 'completed');
      assert.equal(request.intermediateData, null, 'image checkpoint is cleared');
      assert.equal(story.metadata.imageGenerationComplete, true);
      assert.ok(
        requestUpdates.some((patch) => patch.status === 'completed' && patch.storyId === storyId)
      );
      assert.ok(storyUpdates.some((patch) => (patch.metadata as any)?.imageGenerationComplete));
      assert.ok(
        stageEvents.some(
          (event) => event.operation === 'image_batch' && event.status === 'skipped'
        )
      );
      assert.ok(stageEvents.some((event) => event.operation === 'story_ready'));
    } finally {
      clearAiServiceTestOverrides();
      clearRepositoryTestOverrides();
    }
  }

  console.log('story text→images worker contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
