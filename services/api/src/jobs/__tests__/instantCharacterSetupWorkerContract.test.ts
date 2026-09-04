import assert from 'node:assert/strict';
import {
  MOCK_CHARACTER_ANALYSIS,
  MOCK_FACE_DEDUPLICATION,
  MockImageProvider,
  MockTextProvider,
  mockGeneratedImage,
} from '../../testing/ai';

const userId = 'b1000000-0000-4000-8000-000000000001';
const requestId = 'b2000000-0000-4000-8000-000000000001';
const storyId = 'b3000000-0000-4000-8000-000000000001';
const characterId = 'b4000000-0000-4000-8000-000000000001';
const photoUrl = `/api/v1/assets/test/${userId}/photos/character/photo.jpg`;

function baseJob() {
  return {
    id: 'instant-job-1',
    type: 'instant_character_setup' as const,
    requestId,
    status: 'processing' as const,
    retries: 0,
    createdAt: new Date(),
  };
}

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { clearAiServiceTestOverrides, installAiServiceTestOverrides } =
    await import('../../services/aiService');
  const { clearAssetStorageServiceTestOverride, installAssetStorageServiceTestOverride } =
    await import('../../services/assetStorageService');
  const { setEmbeddingGeneratorForTesting } = await import('../../services/embeddingService');
  const { processInstantCharacterSetupForTesting, textQueue } =
    await import('../storyJobProcessor');

  const originalAddJob = textQueue.addJob.bind(textQueue);

  async function withTextQueueStub<T>(run: (enqueued: unknown[]) => Promise<T>): Promise<T> {
    const enqueued: unknown[] = [];
    (textQueue as { addJob: typeof textQueue.addJob }).addJob = async (job) => {
      enqueued.push(job);
      return 'text-job-stub-1';
    };
    try {
      return await run(enqueued);
    } finally {
      (textQueue as { addJob: typeof textQueue.addJob }).addJob = originalAddJob;
    }
  }

  // --- Idempotent skip: already complete → re-enqueue text only ---
  {
    const request = {
      id: requestId,
      userId,
      childProfileId: null,
      storyLanguage: 'en',
      intermediateData: {
        photos: [photoUrl],
        storyId,
        characterSetupComplete: true,
        instantMode: true,
      },
      progressData: null,
      progress: 0,
      status: 'processing',
    };

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => request,
        updateRequest: async () => request,
      } as any,
      plan: {
        findSubscriptionByUserId: async () => ({
          userId,
          planId: 'plan-premium',
          status: 'active',
        }),
        findFeatureValue: async (_planId: string, slug: string) =>
          slug === 'story_from_drawing' ? { enabled: true } : null,
      } as any,
    });

    try {
      await withTextQueueStub(async (enqueued) => {
        await processInstantCharacterSetupForTesting(baseJob());
        assert.equal(enqueued.length, 1);
        assert.deepEqual(enqueued[0], {
          type: 'text_generation',
          requestId,
          isContinuation: false,
        });
      });
    } finally {
      clearRepositoryTestOverrides();
    }
  }

  // --- Empty photos → fail request ---
  {
    const updates: Array<Record<string, unknown>> = [];
    const request = {
      id: requestId,
      userId,
      childProfileId: null,
      storyLanguage: 'en',
      intermediateData: { photos: [], instantMode: true },
      progressData: null,
      progress: 0,
      status: 'processing',
    };

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => request,
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          updates.push(patch);
          Object.assign(request, patch);
          return request;
        },
        findById: async () => null,
      } as any,
    });

    try {
      await assert.rejects(
        () => processInstantCharacterSetupForTesting(baseJob()),
        /No photos found in intermediate data/
      );
      assert.ok(updates.some((patch) => patch.status === 'failed'));
    } finally {
      clearRepositoryTestOverrides();
    }
  }

  // --- Happy path: face_dedup → analysis → create → turnaround → enqueue text ---
  {
    const request: Record<string, any> = {
      id: requestId,
      userId,
      childProfileId: null,
      storyLanguage: 'en',
      selectedCharacters: [],
      intermediateData: {
        photos: [photoUrl],
        storyId,
        instantMode: true,
      },
      progressData: null,
      progress: 0,
      status: 'processing',
    };
    const createdCharacters: unknown[] = [];
    const turnaroundUploads: Array<{ photoType: string }> = [];
    const usageEvents: unknown[] = [];
    const stageEvents: unknown[] = [];
    const characterSheets: unknown[] = [];

    installAssetStorageServiceTestOverride({
      getAssetByPath: async () => Buffer.from('mock-character-photo'),
      uploadUserPhoto: async (input: { photoType: string; buffer: Buffer }) => {
        turnaroundUploads.push({ photoType: input.photoType });
        return {
          storagePath: `test/${userId}/photos/${input.photoType}/sheet.png`,
          storageUrl: `/api/v1/assets/test/${userId}/photos/${input.photoType}/sheet.png`,
          signedUrl: null,
        };
      },
      generateAvatarThumbnail: async (buffer: Buffer) => buffer,
    } as any);

    const textProvider = new MockTextProvider()
      .queueStructured('face_dedup', MOCK_FACE_DEDUPLICATION)
      .queueStructured('character_analysis', {
        ...MOCK_CHARACTER_ANALYSIS,
        appearanceTraits: { age: 'child' },
      });
    const imageProvider = new MockImageProvider().queueGenerate(
      'image_generate',
      mockGeneratedImage()
    );

    installAiServiceTestOverrides({
      textProvider,
      turnaroundImageProvider: imageProvider,
      embeddingGenerator: async () => [1, 0, 0],
    });
    setEmbeddingGeneratorForTesting(async () => [1, 0, 0]);

    installRepositoryTestOverrides({
      plan: {
        findSubscriptionByUserId: async () => ({
          userId,
          planId: 'plan-premium',
          status: 'active',
        }),
        findFeatureValue: async (_planId: string, slug: string) =>
          slug === 'story_from_drawing' ? { enabled: true } : null,
        findAllFeaturesForPlan: async () => [
          { slug: 'images_per_story', value: 3 },
          { slug: 'story_from_drawing', value: { enabled: true } },
        ],
      } as any,
      story: {
        findRequestById: async () => request,
        findRequestForUpdate: async () => request,
        transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          if (patch.intermediateData) {
            request.intermediateData = {
              ...request.intermediateData,
              ...(patch.intermediateData as Record<string, unknown>),
            };
          }
          if (patch.selectedCharacters) {
            request.selectedCharacters = patch.selectedCharacters;
          }
          if (patch.progressData !== undefined) {
            request.progressData = patch.progressData;
          }
          if (patch.progress !== undefined) {
            request.progress = patch.progress;
          }
          if (patch.status) {
            request.status = patch.status;
          }
          return request;
        },
        findRecentWithMetadata: async () => [],
        findRecentWithAudioMetadata: async () => [],
        findById: async (id: string) =>
          id === storyId ? { id: storyId, title: 'Generating...', userId } : null,
        createStory: async () => {
          throw new Error('createStory should not run when storyId already exists');
        },
      } as any,
      asset: {
        findRecentImageGenerationTimes: async () => [],
      } as any,
      character: {
        findByUserId: async () => [],
        create: async (row: Record<string, unknown>) => {
          const character = {
            id: characterId,
            name: row.name,
            type: row.type,
            subtype: row.subtype,
            description: row.description,
            aiGeneratedDescription: row.aiGeneratedDescription,
            turnaroundSheet: null,
            ...row,
          };
          createdCharacters.push(character);
          return character;
        },
        updateTurnaroundSheet: async (_id: string, sheet: unknown) => {
          characterSheets.push(sheet);
        },
        hardDelete: async () => {
          throw new Error('hardDelete should not run on successful turnaround');
        },
      } as any,
      usageEvents: {
        create: async (row: unknown) => {
          usageEvents.push(row);
          return row;
        },
      } as any,
      storyGenerationStageEvent: {
        create: async (row: unknown) => {
          stageEvents.push(row);
          return { id: 'stage-1', ...(row as object) };
        },
      } as any,
    });

    try {
      await withTextQueueStub(async (enqueued) => {
        await processInstantCharacterSetupForTesting(baseJob());

        assert.equal(createdCharacters.length, 1);
        assert.equal((createdCharacters[0] as { id: string }).id, characterId);
        assert.equal((createdCharacters[0] as { name: string }).name, 'Mira');
        assert.equal((createdCharacters[0] as { subtype: string }).subtype, 'other_child');

        assert.equal(characterSheets.length, 1);
        assert.ok(turnaroundUploads.some((row) => row.photoType === 'character_turnaround'));

        assert.equal(request.intermediateData.characterSetupComplete, true);
        assert.deepEqual(request.selectedCharacters, [characterId]);
        assert.deepEqual(request.intermediateData.selectedCharacterIds, [characterId]);
        assert.deepEqual(request.intermediateData.createdCharacterIds, [characterId]);

        assert.equal(enqueued.length, 1);
        assert.deepEqual(enqueued[0], {
          type: 'text_generation',
          requestId,
          isContinuation: false,
        });

        assert.ok(usageEvents.length >= 1);
        assert.ok(
          stageEvents.some((event) => {
            const row = event as { operation?: string };
            return row.operation === 'character_identity_match';
          })
        );

        textProvider.assertExhausted();
        imageProvider.assertExhausted();
      });
    } finally {
      setEmbeddingGeneratorForTesting(null);
      clearAiServiceTestOverrides();
      clearAssetStorageServiceTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  // --- A failed photo group must fail the request instead of silently omitting a character ---
  {
    const request: Record<string, any> = {
      id: requestId,
      userId,
      childProfileId: null,
      storyLanguage: 'en',
      selectedCharacters: [],
      intermediateData: { photos: [photoUrl], storyId, instantMode: true },
      progressData: null,
      progress: 0,
      status: 'processing',
    };
    const textProvider = new MockTextProvider()
      .queueStructured('face_dedup', MOCK_FACE_DEDUPLICATION)
      .queueError(
        'structured',
        'character_analysis',
        'Gemini structured generation failed: Empty response from Gemini'
      )
      .queueError(
        'structured',
        'character_analysis',
        'Gemini structured generation failed: Empty response from Gemini'
      );
    const updates: Array<Record<string, unknown>> = [];

    installAiServiceTestOverrides({ textProvider });
    installAssetStorageServiceTestOverride({
      getAssetByPath: async () => Buffer.from('mock-character-photo'),
    } as any);
    installRepositoryTestOverrides({
      plan: {
        findSubscriptionByUserId: async () => ({
          userId,
          planId: 'plan-premium',
          status: 'active',
        }),
        findFeatureValue: async (_planId: string, slug: string) =>
          slug === 'story_from_drawing' ? { enabled: true } : null,
        findAllFeaturesForPlan: async () => [
          { slug: 'images_per_story', value: 1 },
          { slug: 'story_from_drawing', value: { enabled: true } },
        ],
      } as any,
      story: {
        findRequestById: async () => request,
        findRequestForUpdate: async () => request,
        transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          updates.push(patch);
          if (patch.intermediateData) {
            request.intermediateData = {
              ...request.intermediateData,
              ...(patch.intermediateData as object),
            };
          }
          Object.assign(request, patch);
          return request;
        },
        findById: async () => ({ id: storyId, title: 'Generating...', userId }),
        deleteStory: async () => undefined,
      } as any,
      asset: { findRecentImageGenerationTimes: async () => [] } as any,
    });

    try {
      await withTextQueueStub(async (enqueued) => {
        await assert.rejects(
          () => processInstantCharacterSetupForTesting(baseJob()),
          /could not analyze one or more photos/i
        );
        assert.equal(enqueued.length, 0);
      });
      assert.equal(request.status, 'failed');
      assert.match(request.errorMessage, /could not analyze one or more photos/i);
      const failureCheckpoint = updates.find(
        (patch) => (patch.intermediateData as any)?.failedPhotoGroups
      ) as { intermediateData?: any };
      assert.equal(
        failureCheckpoint?.intermediateData?.failedPhotoGroups?.[0]?.errorCode,
        'CHARACTER_ANALYSIS_FAILED'
      );
      textProvider.assertExhausted();
    } finally {
      clearAiServiceTestOverrides();
      clearAssetStorageServiceTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  console.log('instant character setup worker contract tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
