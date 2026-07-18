import assert from 'node:assert/strict';
import type { Story } from '../../../db/schema';
import {
  clearRepositoryTestOverrides,
  installRepositoryTestOverrides,
} from '../../../repositories';
import {
  clearAiServiceTestOverrides,
  installAiServiceTestOverrides,
} from '../../../services/aiService';
import { MockAudioProvider, mockSynthesizedAudio } from '../../../testing/ai';
import type { AudioDomainInfrastructure } from '../AudioDomainService';
import { AudioDomainService } from '../AudioDomainService';

const storyId = 'a1000000-0000-4000-8000-000000000001';
const userId = 'a2000000-0000-4000-8000-000000000001';
const voiceDbId = 'a3000000-0000-4000-8000-000000000001';
const providerVoiceId = 'mock-narrator-en';
const assetId = 'a4000000-0000-4000-8000-000000000001';
const audioAssetId = 'a5000000-0000-4000-8000-000000000001';

async function testSynthesizeStoryPersistsOnCacheMiss(): Promise<void> {
  const synth = mockSynthesizedAudio();
  const audio = new MockAudioProvider().queueSynthesis(synth);
  const uploads: Array<{ storagePath: string; mimeType: string; size: number }> = [];
  const createdAssets: unknown[] = [];
  const createdAudioAssets: unknown[] = [];
  const cacheChecks: Array<{ voiceId: string; textLength: number }> = [];
  const hashes: string[] = [];

  const infrastructure: AudioDomainInfrastructure = {
    cacheService: {
      async checkCache(text: string, voiceId: string) {
        cacheChecks.push({
          voiceId,
          textLength: text.length,
        });
        return null;
      },
      generateTextHash(text: string) {
        const hash = `hash:${text.length}`;
        hashes.push(hash);
        return hash;
      },
    },
    storageService: {
      async uploadAsset(input) {
        const storagePath = `audio/${storyId}/narration.mp3`;
        uploads.push({
          storagePath,
          mimeType: input.mimeType,
          size: input.data.length,
        });
        return {
          storagePath,
          storageUrl: `/api/v1/assets/${storagePath}`,
          signedUrl: null,
          signedUrlExpiresAt: null,
        };
      },
      async getAssetBuffer() {
        throw new Error('Unexpected getAssetBuffer during synthesize persistence');
      },
    },
    rateLimiter: {
      async execute<T>(fn: () => Promise<T>): Promise<T> {
        return fn();
      },
    },
  };

  installRepositoryTestOverrides({
    voice: {
      findById: async (id: string) =>
        id === voiceDbId
          ? {
              id: voiceDbId,
              providerVoiceId,
              name: 'Mock Narrator',
              language: 'en',
              supportedLanguages: ['en'],
              gender: 'neutral',
              provider: 'openai',
              isActive: true,
            }
          : null,
    } as any,
    asset: {
      create: async (row: Record<string, unknown>) => {
        createdAssets.push(row);
        return {
          id: assetId,
          storageUrl: row.storageUrl,
          signedUrl: row.signedUrl ?? null,
          ...row,
        };
      },
      createAudioAsset: async (row: Record<string, unknown>) => {
        createdAudioAssets.push(row);
        return { id: audioAssetId, ...row };
      },
      findLatestTaggedAudioInputByStoryAndVoice: async () => null,
    } as any,
  });
  installAiServiceTestOverrides({ audioProvider: audio });

  const story = {
    id: storyId,
    userId,
    fullText: 'Mira shared the lantern light with Leo.',
    language: 'en',
  } as Story;

  try {
    const service = new AudioDomainService(audio, infrastructure);
    const result = await service.synthesizeStory(story, { voiceId: voiceDbId }, 'premium');

    assert.equal(result.cached, false);
    assert.equal(result.assetId, assetId);
    assert.equal(result.voiceId, providerVoiceId);
    assert.equal(result.duration, synth.durationSeconds);
    assert.equal(result.audioUrl, `/api/v1/assets/audio/${storyId}/narration.mp3`);

    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].mimeType, 'audio/mpeg');
    assert.equal(uploads[0].size, synth.audioData.length);

    assert.equal(createdAssets.length, 1);
    assert.equal((createdAssets[0] as { assetType: string }).assetType, 'audio');
    assert.equal((createdAssets[0] as { storyId: string }).storyId, storyId);
    assert.equal((createdAssets[0] as { status: string }).status, 'completed');

    assert.equal(createdAudioAssets.length, 1);
    assert.equal((createdAudioAssets[0] as { assetId: string }).assetId, assetId);
    assert.equal((createdAudioAssets[0] as { voiceId: string }).voiceId, voiceDbId);
    assert.equal((createdAudioAssets[0] as { textHash: string }).textHash, hashes[0]);
    assert.equal((createdAudioAssets[0] as { status: string }).status, 'completed');

    assert.equal(cacheChecks.length, 1);
    assert.equal(audio.requests.length, 1);
    assert.equal(audio.requests[0].voiceId, providerVoiceId);
    assert.match(audio.requests[0].text, /lantern/);
    audio.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
  }
}

async function testSynthesizeStoryReturnsCachedAssetWithoutProviderCall(): Promise<void> {
  const audio = new MockAudioProvider();
  let uploadCalls = 0;
  let createCalls = 0;

  const infrastructure: AudioDomainInfrastructure = {
    cacheService: {
      async checkCache() {
        return {
          assetId: 'cached-asset-1',
          audioUrl: '/api/v1/assets/audio/cached.mp3',
          duration: 3.5,
          voiceId: providerVoiceId,
          voiceName: 'Mock Narrator',
        };
      },
      generateTextHash() {
        return 'unused-on-hit';
      },
    },
    storageService: {
      async uploadAsset() {
        uploadCalls += 1;
        throw new Error('Unexpected upload on cache hit');
      },
      async getAssetBuffer() {
        throw new Error('Unexpected getAssetBuffer on cache hit');
      },
    },
    rateLimiter: {
      async execute<T>(fn: () => Promise<T>): Promise<T> {
        return fn();
      },
    },
  };

  installRepositoryTestOverrides({
    voice: {
      findById: async () => ({
        id: voiceDbId,
        providerVoiceId,
        name: 'Mock Narrator',
        language: 'en',
        supportedLanguages: ['en'],
        gender: 'neutral',
        provider: 'openai',
        isActive: true,
      }),
    } as any,
    asset: {
      create: async () => {
        createCalls += 1;
        throw new Error('Unexpected asset create on cache hit');
      },
      createAudioAsset: async () => {
        createCalls += 1;
        throw new Error('Unexpected audio asset create on cache hit');
      },
    } as any,
  });
  installAiServiceTestOverrides({ audioProvider: audio });

  try {
    const service = new AudioDomainService(audio, infrastructure);
    const result = await service.synthesizeStory(
      {
        id: storyId,
        userId,
        fullText: 'Cached narration should skip TTS.',
        language: 'en',
      } as Story,
      { voiceId: voiceDbId }
    );

    assert.equal(result.cached, true);
    assert.equal(result.assetId, 'cached-asset-1');
    assert.equal(result.duration, 3.5);
    assert.equal(uploadCalls, 0);
    assert.equal(createCalls, 0);
    assert.equal(audio.requests.length, 0);
    audio.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
  }
}

void (async () => {
  process.env.NODE_ENV = 'test';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';
  await testSynthesizeStoryPersistsOnCacheMiss();
  await testSynthesizeStoryReturnsCachedAssetWithoutProviderCall();
  console.log('audio synthesize persistence contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
