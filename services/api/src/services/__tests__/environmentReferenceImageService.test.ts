import assert from 'node:assert/strict';
import { ENVIRONMENT_REFERENCE_CACHE_PREFIX } from '../../prompts/image';
import {
  getOrCreateEnvironmentImageCore,
  type EnvironmentImageRequest,
} from '../environmentReferenceImageService';

const environment = {
  id: 'env_moon_garden',
  name: 'Moon Garden',
  description: 'A silver garden with glass flowers and a round stone fountain.',
};

function createBaseRequest(events: string[]): EnvironmentImageRequest {
  return {
    storyId: 'story-1',
    userId: 'user-1',
    storyEnvironmentId: environment.id,
    environment,
    assetStorage: {
      async getAssetByPath(path: string) {
        events.push(`asset:get:${path}`);
        return Buffer.from(`asset:${path}`);
      },
      async saveEnvironmentCacheImage(cacheId: string, buffer: Buffer, mimeType: string) {
        events.push(`asset:save:${cacheId}:${buffer.toString('utf8')}:${mimeType}`);
        return {
          storagePath: `environment-cache/${cacheId}.png`,
          storageUrl: `/api/v1/assets/environment-cache/${cacheId}.png`,
        };
      },
    } as any,
  };
}

function createDeps(
  events: string[],
  options: {
    similar?: { id: string; storagePath: string; storageUrl?: string | null };
    storyMapping?: { cacheId: string } | null;
    cacheMappings?: Array<{ storyId: string; storyEnvironmentId: string; cacheId: string }>;
  } = {}
) {
  return {
    enabled: true,
    similarityThreshold: 0.91,
    envCacheRepo: {
      async getById(id: string) {
        events.push(`cache:getById:${id}`);
        return null;
      },
      async findSimilar(embedding: number[], threshold: number, findOptions?: { descriptionPrefix?: string }) {
        events.push(
          `cache:findSimilar:${embedding.join(',')}:${threshold}:${findOptions?.descriptionPrefix ?? ''}`
        );
        return options.similar
          ? {
              description: `${ENVIRONMENT_REFERENCE_CACHE_PREFIX} cached moon garden`,
              storageUrl: null,
              score: 0.96,
              ...options.similar,
            }
          : null;
      },
      async create(data: { id: string; descriptionEmbedding: number[]; storagePath: string }) {
        events.push(`cache:create:${data.descriptionEmbedding.join(',')}:${data.storagePath}`);
        return data;
      },
    } as any,
    storyEnvRepo: {
      async getByStoryAndEnvId(storyId: string, storyEnvironmentId: string) {
        events.push(`storyEnv:get:${storyId}:${storyEnvironmentId}`);
        return options.storyMapping ?? null;
      },
      async listByCacheId(cacheId: string) {
        events.push(`storyEnv:listByCache:${cacheId}`);
        return options.cacheMappings ?? [];
      },
      async upsert(storyId: string, storyEnvironmentId: string, cacheId: string) {
        events.push(`storyEnv:upsert:${storyId}:${storyEnvironmentId}:${cacheId}`);
        return { storyId, storyEnvironmentId, cacheId };
      },
    } as any,
    async generateEmbedding(text: string) {
      events.push(`embedding:${text.startsWith(ENVIRONMENT_REFERENCE_CACHE_PREFIX)}`);
      return [1, 0, 0];
    },
    getEnvironmentImageProvider() {
      return {
        async generateImage() {
          events.push('provider:generateImage');
          return {
            imageData: Buffer.from('generated-environment'),
            mimeType: 'image/png',
          };
        },
      };
    },
    async recordUsage() {
      events.push('usage:record');
    },
  } as any;
}

async function testVectorCacheHitSkipsGeneration() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(createBaseRequest(events), createDeps(events, {
    similar: { id: 'cache-hit', storagePath: 'environment-cache/cache-hit.png' },
  }));

  assert.equal(result?.storagePath, 'environment-cache/cache-hit.png');
  assert.ok(events.includes(`cache:findSimilar:1,0,0:0.91:${ENVIRONMENT_REFERENCE_CACHE_PREFIX}`));
  assert.equal(events.includes('provider:generateImage'), false);
  assert.deepEqual(events, [
    'storyEnv:get:story-1:env_moon_garden',
    'embedding:true',
    `cache:findSimilar:1,0,0:0.91:${ENVIRONMENT_REFERENCE_CACHE_PREFIX}`,
    'storyEnv:listByCache:cache-hit',
    'asset:get:environment-cache/cache-hit.png',
    'storyEnv:upsert:story-1:env_moon_garden:cache-hit',
  ]);
}

async function testVectorCacheHitIsSkippedWhenAnotherStoryEnvironmentUsesIt() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(
    createBaseRequest(events),
    createDeps(events, {
      similar: { id: 'shared-cache', storagePath: 'environment-cache/shared-cache.png' },
      cacheMappings: [
        {
          storyId: 'story-1',
          storyEnvironmentId: 'env_other_place',
          cacheId: 'shared-cache',
        },
      ],
    })
  );

  assert.match(result?.storagePath ?? '', /^environment-cache\/[a-f0-9-]+\.png$/);
  assert.ok(events.includes('provider:generateImage'));
  assert.equal(events.includes('asset:get:environment-cache/shared-cache.png'), false);
  assert.equal(events.includes('storyEnv:upsert:story-1:env_moon_garden:shared-cache'), false);
}

async function testVectorSearchHappensBeforeGenerationOnMiss() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(createBaseRequest(events), createDeps(events));

  assert.match(result?.storagePath ?? '', /^environment-cache\/[a-f0-9-]+\.png$/);
  const vectorSearchIndex = events.findIndex((event) => event.startsWith('cache:findSimilar:'));
  const generationIndex = events.indexOf('provider:generateImage');
  const createIndex = events.findIndex((event) => event.startsWith('cache:create:1,0,0:'));

  assert.ok(vectorSearchIndex >= 0, 'expected vector similarity lookup');
  assert.ok(generationIndex > vectorSearchIndex, 'expected image generation after vector lookup miss');
  assert.ok(createIndex > generationIndex, 'expected generated image to be cached with the same embedding');
}

async function main() {
  await testVectorCacheHitSkipsGeneration();
  await testVectorCacheHitIsSkippedWhenAnotherStoryEnvironmentUsesIt();
  await testVectorSearchHappensBeforeGenerationOnMiss();
  console.log('environmentReferenceImageService tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
