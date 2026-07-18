import assert from 'node:assert/strict';
import type { Story } from '../../../db/schema';
import type {
  AssetRepository,
  StoryRepository,
} from '../../../repositories';
import {
  clearRepositoryTestOverrides,
  installRepositoryTestOverrides,
} from '../../../repositories';
import {
  clearAiServiceTestOverrides,
  installAiServiceTestOverrides,
} from '../../../services/aiService';
import {
  MOCK_ALIGNMENT,
  MockAlignmentProvider,
  MockAudioProvider,
} from '../../../testing/ai';
import type { AudioDomainInfrastructure } from '../AudioDomainService';
import {
  AudioDomainService,
  getAudioDomainService,
  setAudioDomainServiceForTesting,
} from '../AudioDomainService';

function noExternalInfrastructure(audioBuffer: Buffer): {
  infrastructure: AudioDomainInfrastructure;
  storageAssetIds: string[];
  unexpectedCacheCalls: string[];
  unexpectedRateLimiterCalls: string[];
} {
  const storageAssetIds: string[] = [];
  const unexpectedCacheCalls: string[] = [];
  const unexpectedRateLimiterCalls: string[] = [];

  return {
    infrastructure: {
      cacheService: {
        async checkCache() {
          unexpectedCacheCalls.push('checkCache');
          throw new Error('Unexpected audio cache call');
        },
        generateTextHash() {
          unexpectedCacheCalls.push('generateTextHash');
          throw new Error('Unexpected audio cache hash call');
        },
      },
      storageService: {
        async uploadAsset() {
          throw new Error('Unexpected audio storage upload');
        },
        async getAssetBuffer(assetId: string) {
          storageAssetIds.push(assetId);
          return Buffer.from(audioBuffer);
        },
      },
      rateLimiter: {
        async execute<T>(): Promise<T> {
          unexpectedRateLimiterCalls.push('execute');
          throw new Error('Unexpected audio rate limiter call');
        },
      },
    },
    storageAssetIds,
    unexpectedCacheCalls,
    unexpectedRateLimiterCalls,
  };
}

async function testAvailableVoicesUsesAudioDomainAndMockProvider(): Promise<void> {
  const audio = new MockAudioProvider([], [
    {
      id: 'narrator-en',
      name: 'English Narrator',
      language: 'en',
      provider: 'openai',
    },
    {
      id: 'narrator-uk',
      name: 'Ukrainian Narrator',
      language: 'uk',
      provider: 'openai',
    },
  ]);

  installAiServiceTestOverrides({ audioProvider: audio });
  setAudioDomainServiceForTesting(null);

  try {
    const service = getAudioDomainService();
    const voices = await service.getAvailableVoices('en');

    assert.deepEqual(voices, [
      {
        id: 'narrator-en',
        name: 'English Narrator',
        language: 'en',
        provider: 'openai',
      },
    ]);
    assert.deepEqual(audio.voiceQueries, ['en']);
    audio.assertExhausted();
  } finally {
    setAudioDomainServiceForTesting(null);
    clearAiServiceTestOverrides();
  }
}

async function testForcedAlignmentUsesProductionDomainMethod(): Promise<void> {
  const storyId = '10000000-0000-4000-8000-000000000001';
  const audioAssetId = '20000000-0000-4000-8000-000000000001';
  const assetId = '30000000-0000-4000-8000-000000000001';
  const audioBuffer = Buffer.from('fixed-mocked-audio');
  const story = {
    id: storyId,
    fullText: 'Fallback story text that should not replace the synthesis input.',
    language: 'en',
  } as Story;
  const audioAsset = {
    id: audioAssetId,
    assetId,
    voiceId: null,
    provider: 'openai',
    synthesisTaggedText: 'Hi',
  };
  const asset = {
    id: assetId,
    mimeType: 'audio/mpeg',
    generationParams: { ttsSynthesisText: 'Unused fallback text' },
  };
  const storyLookups: string[] = [];
  const finalAudioLookups: string[] = [];
  const fallbackAudioLookups: string[] = [];

  const storyRepository = {
    async findById(id: string) {
      storyLookups.push(id);
      return story;
    },
  } as unknown as StoryRepository;
  const assetRepository = {
    async findFinalAudioAssetWithAsset(id: string) {
      finalAudioLookups.push(id);
      return { audioAsset, asset };
    },
    async findFinalAudioAssetWithAssetByAssetId(id: string) {
      fallbackAudioLookups.push(id);
      return null;
    },
  } as unknown as AssetRepository;

  const audio = new MockAudioProvider();
  const alignment = new MockAlignmentProvider().queueAlignment(MOCK_ALIGNMENT);
  const noExternal = noExternalInfrastructure(audioBuffer);
  const service = new AudioDomainService(audio, noExternal.infrastructure);

  installRepositoryTestOverrides({ story: storyRepository, asset: assetRepository });
  installAiServiceTestOverrides({ audioProvider: audio, alignmentProvider: alignment });

  try {
    const result = await service.generateAlignmentForStory(
      storyId,
      audioAssetId,
      alignment
    );

    assert.deepEqual(result, MOCK_ALIGNMENT);
    assert.deepEqual(storyLookups, [storyId]);
    assert.deepEqual(finalAudioLookups, [audioAssetId]);
    assert.deepEqual(fallbackAudioLookups, []);
    assert.deepEqual(noExternal.storageAssetIds, [assetId]);
    assert.deepEqual(noExternal.unexpectedCacheCalls, []);
    assert.deepEqual(noExternal.unexpectedRateLimiterCalls, []);
    assert.equal(alignment.requests.length, 1);
    assert.deepEqual(alignment.requests[0], {
      audioBuffer,
      text: 'Hi',
      language: 'en',
      mimeType: 'audio/mpeg',
    });

    audio.assertExhausted();
    alignment.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
  }
}

void (async () => {
  await testAvailableVoicesUsesAudioDomainAndMockProvider();
  await testForcedAlignmentUsesProductionDomainMethod();
  console.log('audio and follow-along AI contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
