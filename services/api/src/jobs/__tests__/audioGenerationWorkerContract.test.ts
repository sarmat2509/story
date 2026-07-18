import assert from 'node:assert/strict';

const userId = 'm1000000-0000-4000-8000-000000000001';
const storyId = 'm2000000-0000-4000-8000-000000000001';
const voiceId = 'm3000000-0000-4000-8000-000000000001';
const planId = 'm4000000-0000-4000-8000-000000000001';
const assetId = 'm5000000-0000-4000-8000-000000000001';

function baseJob() {
  return {
    id: 'audio-job-1',
    type: 'audio_generation' as const,
    storyId,
    userId,
    voiceParams: { voiceId },
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
  const {
    clearAiServiceTestOverrides,
    installAiServiceTestOverrides,
  } = await import('../../services/aiService');
  const { setAudioDomainServiceForTesting } = await import('../../domain/audio');
  const { MockAudioProvider, MockAlignmentProvider } = await import('../../testing/ai');
  const { processAudioGenerationForTesting } = await import('../storyJobProcessor');

  installAiServiceTestOverrides({
    audioProvider: new MockAudioProvider(),
    alignmentProvider: new MockAlignmentProvider().queueAlignment({
      characters: [],
      words: [{ word: 'Mira', start: 0, end: 0.3 }],
      averageConfidence: 0.99,
      language: 'en',
    } as any),
  });

  const now = new Date();
  const story = {
    id: storyId,
    userId,
    storyRequestId: null,
    language: 'en',
    title: 'Lantern Path',
    isPublished: false,
    publishedSlug: null,
    metadata: {},
    audioMetadata: {},
  } as any;

  const subscription = {
    userId,
    planId,
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    resetAt: new Date('2099-01-01T00:00:00.000Z'),
    storiesUsed: 0,
    audioMinutesUsed: 0,
    paymentProvider: 'stripe',
  };

  const storyUpdates: Array<Record<string, unknown>> = [];
  const usageEvents: unknown[] = [];
  const alignments: unknown[] = [];
  let billedThisPeriod = 0;
  let synthCalls = 0;
  let failNextSynth = false;

  installRepositoryTestOverrides({
    story: {
      findById: async () => story,
      updateStory: async (_id: string, patch: Record<string, unknown>) => {
        storyUpdates.push(patch);
        if (patch.audioMetadata) {
          story.audioMetadata = patch.audioMetadata;
        }
        return story;
      },
      incrementPublicRenderVersion: async () => undefined,
    } as any,
    scene: {
      findByStoryId: async () => [
        { sceneId: 1, text: 'Mira found a lantern beside the quiet path.' },
        { sceneId: 2, text: 'Leo shared the light with friends.' },
      ],
    } as any,
    voice: {
      findById: async (id: string) =>
        id === voiceId
          ? {
              id: voiceId,
              providerVoiceId: 'mock-voice',
              name: 'Nora',
              language: 'en',
              supportedLanguages: ['en'],
              gender: 'female',
              provider: 'openai',
              isActive: true,
            }
          : null,
      findFallbackByLanguage: async () => null,
    } as any,
    plan: {
      findSubscriptionByUserId: async () => subscription,
      findPlanById: async () => ({ id: planId, slug: 'plus', name: 'Plus' }),
      updateSubscription: async (_userId: string, patch: Record<string, unknown>) => {
        Object.assign(subscription, patch);
      },
    } as any,
    usageEvents: {
      create: async (input: unknown) => {
        usageEvents.push(input);
        return { id: `usage-${usageEvents.length}` };
      },
      sumAudioSynthesizedForStoryInPeriod: async () => billedThisPeriod,
    } as any,
    alignment: {
      upsert: async (id: string, data: unknown, audioAssetId: string) => {
        alignments.push({ id, data, audioAssetId });
      },
    } as any,
    storyGenerationStageEvent: {
      create: async (row: unknown) => ({ id: 'stage-1', ...(row as object) }),
    } as any,
  });

  setAudioDomainServiceForTesting({
    synthesizeSceneGroups: async () => {
      synthCalls += 1;
      if (failNextSynth) {
        throw new Error('TTS provider unavailable');
      }
      return {
        assetId,
        voiceId,
        voiceName: 'Nora',
        duration: 42,
        numTtsChunks: 1,
      };
    },
    generateAlignmentForStory: async () => ({
      characters: [],
      words: [{ word: 'Mira', start: 0, end: 0.3 }],
      averageConfidence: 0.99,
      language: 'en',
    }),
  } as any);

  try {
    await processAudioGenerationForTesting(baseJob());
    assert.equal(synthCalls, 1);
    assert.equal(usageEvents.length, 1);
    assert.equal((usageEvents[0] as any).eventType, 'audio_synthesized');
    assert.equal(subscription.audioMinutesUsed, 1);
    assert.equal(alignments.length, 1);
    assert.ok(storyUpdates.some((patch) => (patch.audioMetadata as any)?.totalDuration === 42));
    assert.ok(storyUpdates.some((patch) => (patch.audioMetadata as any)?.error === undefined));

    // Regeneration in same period: skip duplicate usage event
    billedThisPeriod = 1;
    const usageBefore = usageEvents.length;
    const audioMinutesBefore = subscription.audioMinutesUsed;
    await processAudioGenerationForTesting(baseJob());
    assert.equal(synthCalls, 2);
    assert.equal(usageEvents.length, usageBefore);
    assert.equal(subscription.audioMinutesUsed, audioMinutesBefore + 1);

    // Failure path: mark audio metadata error and rethrow
    failNextSynth = true;
    storyUpdates.length = 0;
    await assert.rejects(
      () => processAudioGenerationForTesting(baseJob()),
      /TTS provider unavailable/
    );
    assert.ok(storyUpdates.some((patch) => (patch.audioMetadata as any)?.error === true));
  } finally {
    setAudioDomainServiceForTesting(null);
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
  }

  console.log('audio generation worker contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
