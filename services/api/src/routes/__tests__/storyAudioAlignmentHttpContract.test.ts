import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = '71111111-1111-4111-8111-111111111111';
const sessionId = '72222222-2222-4222-8222-222222222222';
const newAudioStoryId = '73333333-3333-4333-8333-333333333331';
const cachedAudioStoryId = '73333333-3333-4333-8333-333333333332';
const noAudioStoryId = '73333333-3333-4333-8333-333333333333';
const missingStoryId = '74444444-4444-4444-8444-444444444444';
const newAlignmentStoryId = '73333333-3333-4333-8333-333333333334';
const audioStatusPendingStoryId = '73333333-3333-4333-8333-333333333335';
const quotaUnavailableStoryId = '73333333-3333-4333-8333-333333333336';
const quotaExceededStoryId = '73333333-3333-4333-8333-333333333337';
const newAlignmentAudioAssetId = '77777777-7777-4777-8777-777777777771';
const newAlignmentUnderlyingAssetId = '77777777-7777-4777-8777-777777777772';

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
  const { installAiServiceTestOverrides, clearAiServiceTestOverrides } =
    await import('../../services/aiService');
  const { AudioDomainService, setAudioDomainServiceForTesting } = await import(
    '../../domain/audio/AudioDomainService'
  );
  const { MockAudioProvider } = await import('../../testing/ai/MockAudioProvider');
  const { MockAlignmentProvider } = await import('../../testing/ai/MockAlignmentProvider');
  const { createScriptedTransaction } = await import('../../testing/scriptedTransaction');
  const schema = await import('../../db/schema');

  const now = new Date();
  const subscription = {
    planId: '78888888-8888-4888-8888-888888888881',
    currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2099-08-01T00:00:00.000Z'),
    resetAt: new Date('2099-08-01T00:00:00.000Z'),
    paymentProvider: 'stripe',
  };
  const user = {
    id: userId,
    email: 'audio-contract@example.test',
    displayName: 'Audio Contract',
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
  const cachedAudioMetadata = {
    generatedAt: now.toISOString(),
    provider: 'mock',
    voiceId: null,
  };
  const stories = new Map<string, any>([
    [
      newAudioStoryId,
      {
        id: newAudioStoryId,
        userId,
        childProfileId: null,
        createdByChildProfileId: null,
        storyRequestId: null,
        title: 'The Quiet Lantern',
        language: 'en',
        ageGroup: '6-8',
        moralTheme: 'kindness',
        scenes: [],
        fullText: 'A lantern glowed beside the quiet path.',
        wordCount: 8,
        outline: null,
        metadata: {},
        audioMetadata: null,
        isFavorite: false,
        createdAt: now,
        seriesId: null,
        partNumber: null,
      },
    ],
    [
      cachedAudioStoryId,
      {
        id: cachedAudioStoryId,
        userId,
        childProfileId: null,
        createdByChildProfileId: null,
        storyRequestId: null,
        title: 'The Moon Bell',
        language: 'en',
        ageGroup: '6-8',
        moralTheme: 'courage',
        scenes: [],
        fullText: 'The moon bell rang softly.',
        wordCount: 6,
        outline: null,
        metadata: {},
        audioMetadata: cachedAudioMetadata,
        isFavorite: false,
        createdAt: now,
        seriesId: null,
        partNumber: null,
      },
    ],
    [
      noAudioStoryId,
      {
        id: noAudioStoryId,
        userId,
        childProfileId: null,
        createdByChildProfileId: null,
        storyRequestId: null,
        title: 'The Paper Boat',
        language: 'en',
        ageGroup: '6-8',
        moralTheme: 'curiosity',
        scenes: [],
        fullText: 'A paper boat crossed the pond.',
        wordCount: 7,
        outline: null,
        metadata: {},
        audioMetadata: null,
        isFavorite: false,
        createdAt: now,
        seriesId: null,
        partNumber: null,
      },
    ],
    [
      newAlignmentStoryId,
      {
        id: newAlignmentStoryId,
        userId,
        childProfileId: null,
        createdByChildProfileId: null,
        storyRequestId: null,
        title: 'The Silver Compass',
        language: 'en',
        ageGroup: '6-8',
        moralTheme: 'courage',
        scenes: [],
        fullText: 'A silver compass pointed toward home.',
        wordCount: 6,
        outline: null,
        metadata: {},
        audioMetadata: { generatedAt: now.toISOString(), provider: 'mock', voiceId: null },
        isFavorite: false,
        isPublished: false,
        publishedSlug: null,
        createdAt: now,
        seriesId: null,
        partNumber: null,
      },
    ],
    [
      audioStatusPendingStoryId,
      {
        id: audioStatusPendingStoryId,
        userId,
        childProfileId: null,
        createdByChildProfileId: null,
        storyRequestId: null,
        title: 'The Waiting Room',
        language: 'en',
        ageGroup: '6-8',
        moralTheme: 'patience',
        scenes: [],
        fullText: 'The story waited for its voice.',
        wordCount: 6,
        outline: null,
        metadata: {},
        audioMetadata: null,
        isFavorite: false,
        createdAt: now,
        seriesId: null,
        partNumber: null,
      },
    ],
    [
      quotaUnavailableStoryId,
      {
        id: quotaUnavailableStoryId,
        userId,
        childProfileId: null,
        createdByChildProfileId: null,
        storyRequestId: null,
        title: 'The Silent Grove',
        language: 'en',
        ageGroup: '6-8',
        moralTheme: 'patience',
        scenes: [],
        fullText: 'The grove had no narrator yet.',
        wordCount: 6,
        outline: null,
        metadata: {},
        audioMetadata: null,
        isFavorite: false,
        createdAt: now,
        seriesId: null,
        partNumber: null,
      },
    ],
    [
      quotaExceededStoryId,
      {
        id: quotaExceededStoryId,
        userId,
        childProfileId: null,
        createdByChildProfileId: null,
        storyRequestId: null,
        title: 'The Crowded Library',
        language: 'en',
        ageGroup: '6-8',
        moralTheme: 'sharing',
        scenes: [],
        fullText: 'Every shelf already had a spoken tale.',
        wordCount: 7,
        outline: null,
        metadata: {},
        audioMetadata: null,
        isFavorite: false,
        createdAt: now,
        seriesId: null,
        partNumber: null,
      },
    ],
  ]);
  const audioAsset = {
    asset: { storagePath: 'audio/moon-bell.mp3' },
    audioAsset: {
      id: '75555555-5555-4555-8555-555555555555',
      assetId: '76666666-6666-4666-8666-666666666666',
      durationSeconds: '42.5',
      voiceId: 'mock-voice',
      voiceName: 'Mock Narrator',
      language: 'en',
      nightMode: false,
    },
  } as any;
  let quotaReservations = 0;
  const persistedAlignments: Array<{ storyId: string; data: unknown; assetId: string }> = [];
  let audioStatusJobRows: any[] = [];
  let transactionImpl: (callback: (tx: any) => Promise<unknown>) => Promise<unknown> =
    async () => {
      quotaReservations += 1;
      return {
        reserved: true,
        alreadyReservedForStory: false,
        limit: 5,
        used: 1,
        remaining: 4,
        resetsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      };
    };

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
      findByIdAndUser: async (storyId: string) => stories.get(storyId) ?? null,
      findById: async (storyId: string) => stories.get(storyId) ?? null,
      findLinkedCharactersByStoryId: async () => [],
      countActiveRequestsForUpdate: async () => 0,
      transaction: async (callback: (tx: any) => Promise<unknown>) => transactionImpl(callback),
    } as any,
    dictionary: {
      findTranslationsForEntities: async () => [],
    } as any,
    asset: {
      findFinalCompletedAudioByStoryId: async (storyId: string) => {
        if (storyId === cachedAudioStoryId) return audioAsset;
        if (storyId === newAlignmentStoryId) {
          return {
            asset: { storagePath: 'audio/silver-compass.mp3' },
            audioAsset: {
              id: newAlignmentAudioAssetId,
              assetId: newAlignmentUnderlyingAssetId,
              durationSeconds: '18.0',
              voiceId: null,
              voiceName: 'Mock Narrator',
              language: 'en',
              nightMode: false,
              provider: 'elevenlabs',
            },
          };
        }
        return null;
      },
      findFinalAudioAssetWithAsset: async (id: string) =>
        id === newAlignmentAudioAssetId
          ? {
              audioAsset: {
                id: newAlignmentAudioAssetId,
                assetId: newAlignmentUnderlyingAssetId,
                provider: 'elevenlabs',
                voiceId: null,
                synthesisTaggedText: null,
              },
              asset: {
                id: newAlignmentUnderlyingAssetId,
                mimeType: 'audio/mpeg',
                generationParams: null,
              },
            }
          : null,
      findFinalAudioAssetWithAssetByAssetId: async () => null,
    } as any,
    alignment: {
      findByStoryId: async (storyId: string) =>
        storyId === cachedAudioStoryId
          ? {
              data: {
                characters: [],
                words: [{ text: 'The', start: 0, end: 0.2 }],
                averageConfidence: 0.99,
              },
            }
          : null,
      upsert: async (storyId: string, data: unknown, assetId: string) => {
        persistedAlignments.push({ storyId, data, assetId });
      },
    } as any,
    generationJob: {
      listRecentForQueue: async () => audioStatusJobRows,
    } as any,
  });

  const mockAudioProvider = new MockAudioProvider();
  const mockAlignmentProvider = new MockAlignmentProvider().queueAlignment({
    characters: [],
    words: [
      { text: 'A', start: 0, end: 0.3 },
      { text: 'silver', start: 0.3, end: 0.7 },
    ],
    averageConfidence: 0.97,
    language: 'en',
  });
  installAiServiceTestOverrides({
    audioProvider: mockAudioProvider,
    alignmentProvider: mockAlignmentProvider,
  });
  setAudioDomainServiceForTesting(
    new AudioDomainService(mockAudioProvider, {
      storageService: {
        getAssetBuffer: async () => Buffer.from('mock-audio-bytes'),
        uploadAsset: async () => {
          throw new Error('uploadAsset should not be called by alignment generation');
        },
      } as any,
    })
  );

  const queuedInputs: unknown[] = [];
  installStoryJobQueueAddJobTestOverride(async (input) => {
    queuedInputs.push(input);
    return 'audio-job-1';
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const token = generateToken({ userId, sessionId });

  try {
    const queuedAudio = await postJson(origin, token, `/api/v1/stories/${newAudioStoryId}/audio`, {
      speed: 1,
      night_mode: false,
    });
    assert.equal(queuedAudio.status, 202, 'new audio generation returns 202');
    const queuedAudioBody = (await queuedAudio.json()) as any;
    assert.equal(queuedAudioBody.status, 'success');
    assert.equal(queuedAudioBody.jobId, 'audio-job-1');

    assert.deepEqual(queuedInputs, [
      {
        type: 'audio_generation',
        storyId: newAudioStoryId,
        userId,
        voiceParams: { voiceId: undefined, speed: 1, nightMode: false },
      },
    ]);
    assert.equal(quotaReservations, 1, 'audio quota is reserved before queue acceptance');

    const cachedAudio = await postJson(
      origin,
      token,
      `/api/v1/stories/${cachedAudioStoryId}/audio`,
      {}
    );
    assert.equal(cachedAudio.status, 200, 'existing audio returns 200 without queueing');
    const cachedAudioBody = (await cachedAudio.json()) as any;
    assert.deepEqual(cachedAudioBody.audio, cachedAudioMetadata);
    assert.equal(queuedInputs.length, 1, 'cached audio does not enqueue another job');

    const invalidAudio = await postJson(origin, token, `/api/v1/stories/${newAudioStoryId}/audio`, {
      speed: 3,
    });
    assert.equal(invalidAudio.status, 400, 'invalid audio parameters return 400');

    const missingAudio = await postJson(
      origin,
      token,
      `/api/v1/stories/${missingStoryId}/audio`,
      {}
    );
    assert.equal(missingAudio.status, 404, 'unknown story audio request returns 404');

    const cachedAlignment = await postJson(
      origin,
      token,
      `/api/v1/stories/${cachedAudioStoryId}/alignment`,
      {}
    );
    assert.equal(cachedAlignment.status, 200, 'existing alignment returns 200');
    const cachedAlignmentBody = (await cachedAlignment.json()) as any;
    assert.equal(cachedAlignmentBody.alignment.words[0].text, 'The');

    const alignmentWithoutAudio = await postJson(
      origin,
      token,
      `/api/v1/stories/${noAudioStoryId}/alignment`,
      {}
    );
    assert.equal(alignmentWithoutAudio.status, 400, 'alignment without audio metadata returns 400');
    const alignmentWithoutAudioBody = (await alignmentWithoutAudio.json()) as any;
    assert.equal(alignmentWithoutAudioBody.code, 'NO_AUDIO_METADATA');

    const missingAlignment = await postJson(
      origin,
      token,
      `/api/v1/stories/${missingStoryId}/alignment`,
      {}
    );
    assert.equal(missingAlignment.status, 404, 'unknown story alignment returns 404');

    const audioRead = await fetch(`${origin}/api/v1/stories/${cachedAudioStoryId}/audio`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(audioRead.status, 200, 'completed story audio returns 200');
    const audioReadBody = (await audioRead.json()) as any;
    assert.equal(audioReadBody.data.audioUrl, '/api/v1/assets/audio/moon-bell.mp3');
    assert.equal(audioReadBody.data.duration, 42.5);

    const audioNotReady = await fetch(`${origin}/api/v1/stories/${noAudioStoryId}/audio`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(audioNotReady.status, 404, 'story without completed audio returns 404');
    const audioNotReadyBody = (await audioNotReady.json()) as any;
    assert.equal(audioNotReadyBody.code, 'AUDIO_NOT_READY');

    // New alignment generation: no cached alignment, real AudioDomainService + alignment
    // provider run end-to-end and persist through the alignment repository boundary.
    audioStatusJobRows = [];
    const newAlignment = await postJson(
      origin,
      token,
      `/api/v1/stories/${newAlignmentStoryId}/alignment`,
      {}
    );
    assert.equal(newAlignment.status, 201, 'first-time alignment generation returns 201');
    const newAlignmentBody = (await newAlignment.json()) as any;
    assert.equal(newAlignmentBody.status, 'success');
    assert.equal(newAlignmentBody.alignment.wordCount, 2);
    assert.equal(newAlignmentBody.alignment.averageConfidence, 0.97);
    assert.equal(newAlignmentBody.alignment.provider, 'mockalignment');
    assert.equal(persistedAlignments.length, 1, 'alignment is persisted exactly once');
    assert.equal(persistedAlignments[0].storyId, newAlignmentStoryId);
    assert.equal(persistedAlignments[0].assetId, newAlignmentUnderlyingAssetId);
    assert.equal(mockAlignmentProvider.requests[0]?.language, 'en');
    mockAlignmentProvider.assertExhausted();

    // Audio status: ready story surfaces audioUrl/duration with no active job.
    audioStatusJobRows = [];
    const readyStatus = await fetch(`${origin}/api/v1/stories/${cachedAudioStoryId}/audio-status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(readyStatus.status, 200);
    const readyStatusBody = (await readyStatus.json()) as any;
    assert.equal(readyStatusBody.jobStatus, null);
    assert.equal(readyStatusBody.audioUrl, '/api/v1/assets/audio/moon-bell.mp3');
    assert.equal(readyStatusBody.duration, 42.5);

    // Audio status: an actively processing job reports jobStatus without audioUrl yet.
    audioStatusJobRows = [
      {
        id: 'audio-job-pending',
        status: 'processing',
        retries: 0,
        createdAt: now,
        startedAt: now,
        estimatedTotalMs: 12_000,
        payload: {
          type: 'audio_generation',
          storyId: audioStatusPendingStoryId,
          userId,
        },
      },
    ];
    const pendingStatus = await fetch(
      `${origin}/api/v1/stories/${audioStatusPendingStoryId}/audio-status`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    assert.equal(pendingStatus.status, 200);
    const pendingStatusBody = (await pendingStatus.json()) as any;
    assert.equal(pendingStatusBody.jobStatus, 'processing');
    assert.equal(pendingStatusBody.audioUrl, null);

    // Plan quota: audio unavailable (limit 0) maps to HTTP 403 through production reservation.
    const unavailableTx = createScriptedTransaction({
      selects: [
        { label: 'audio subscription', table: schema.userSubscriptions, rows: [subscription] },
        {
          label: 'audio plan limit',
          table: schema.planFeatures,
          rows: [{ value: { limit: 0 } }],
        },
      ],
    });
    transactionImpl = async (callback) => {
      const result = await callback(unavailableTx.tx);
      unavailableTx.assertExhausted();
      return result;
    };
    const unavailableAudio = await postJson(
      origin,
      token,
      `/api/v1/stories/${quotaUnavailableStoryId}/audio`,
      { speed: 1, night_mode: false }
    );
    assert.equal(unavailableAudio.status, 403, 'plan without audio returns 403');
    const unavailableBody = (await unavailableAudio.json()) as any;
    assert.equal(unavailableBody.code, 'AUDIO_NOT_AVAILABLE');

    // Plan quota: monthly audio limit exceeded maps to HTTP 429.
    const exceededTx = createScriptedTransaction({
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
          rows: [{ extraAudio: 0 }],
        },
        { label: 'audio current usage', table: schema.usageEvents, rows: [{ total: 2 }] },
      ],
    });
    transactionImpl = async (callback) => {
      const result = await callback(exceededTx.tx);
      exceededTx.assertExhausted();
      return result;
    };
    const exceededAudio = await postJson(
      origin,
      token,
      `/api/v1/stories/${quotaExceededStoryId}/audio`,
      { speed: 1, night_mode: false }
    );
    assert.equal(exceededAudio.status, 429, 'exhausted audio quota returns 429');
    const exceededBody = (await exceededAudio.json()) as any;
    assert.equal(exceededBody.code, 'AUDIO_LIMIT_EXCEEDED');
  } finally {
    clearStoryJobQueueAddJobTestOverride();
    clearRepositoryTestOverrides();
    clearAiServiceTestOverrides();
    setAudioDomainServiceForTesting(null);
    await close(server);
  }

  console.log('story audio/alignment HTTP contract passed (14 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
