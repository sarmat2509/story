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
    similarCandidates?: Array<{
      id: string;
      storagePath: string;
      storageUrl?: string | null;
      description?: string;
      score?: number;
    }>;
    storyMapping?: { cacheId: string } | null;
    storyMappings?: Record<string, { cacheId: string }>;
    cachedRows?: Record<string, { description: string; storagePath: string }>;
  } = {}
) {
  return {
    enabled: true,
    similarityThreshold: 0.91,
    envCacheRepo: {
      async getById(id: string) {
        events.push(`cache:getById:${id}`);
        return options.cachedRows?.[id] ?? null;
      },
      async findSimilarMany(
        embedding: number[],
        threshold: number,
        findOptions?: { descriptionPrefix?: string }
      ) {
        events.push(
          `cache:findSimilarMany:${embedding.join(',')}:${threshold}:${findOptions?.descriptionPrefix ?? ''}`
        );
        return (options.similarCandidates ?? []).map((candidate) => ({
          description: `${ENVIRONMENT_REFERENCE_CACHE_PREFIX}[viewpoint=exterior] cached moon garden`,
          storageUrl: null,
          score: 0.96,
          ...candidate,
        }));
      },
      async create(data: { id: string; descriptionEmbedding: number[]; storagePath: string }) {
        events.push(`cache:create:${data.descriptionEmbedding.join(',')}:${data.storagePath}`);
        return data;
      },
    } as any,
    storyEnvRepo: {
      async getByStoryAndEnvId(storyId: string, storyEnvironmentId: string) {
        events.push(`storyEnv:get:${storyId}:${storyEnvironmentId}`);
        return (
          options.storyMappings?.[`${storyId}:${storyEnvironmentId}`] ??
          options.storyMapping ??
          null
        );
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
  const result = await getOrCreateEnvironmentImageCore(
    createBaseRequest(events),
    createDeps(events, {
      similarCandidates: [
        { id: 'cache-hit', storagePath: 'environment-cache/cache-hit.png', score: 0.96 },
      ],
    })
  );

  assert.equal(result?.storagePath, 'environment-cache/cache-hit.png');
  assert.ok(
    events.includes(`cache:findSimilarMany:1,0,0:0.91:${ENVIRONMENT_REFERENCE_CACHE_PREFIX}`)
  );
  assert.equal(events.includes('provider:generateImage'), false);
  assert.deepEqual(events, [
    'storyEnv:get:story-1:env_moon_garden',
    'embedding:true',
    `cache:findSimilarMany:1,0,0:0.91:${ENVIRONMENT_REFERENCE_CACHE_PREFIX}`,
    'asset:get:environment-cache/cache-hit.png',
    'storyEnv:upsert:story-1:env_moon_garden:cache-hit',
  ]);
}

async function testHighConfidenceCrossEnvironmentHitReusesImage() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(
    createBaseRequest(events),
    createDeps(events, {
      similarCandidates: [
        { id: 'shared-cache', storagePath: 'environment-cache/shared-cache.png', score: 0.96 },
      ],
    })
  );

  assert.equal(result?.storagePath, 'environment-cache/shared-cache.png');
  assert.equal(events.includes('provider:generateImage'), false);
  assert.ok(events.includes('asset:get:environment-cache/shared-cache.png'));
  assert.ok(events.includes('storyEnv:upsert:story-1:env_moon_garden:shared-cache'));
}

async function testCurrentStoryEnvironmentCacheHitTakesPriority() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(
    createBaseRequest(events),
    createDeps(events, {
      storyMappings: {
        [`story-1:${environment.id}`]: { cacheId: 'current-story-cache' },
      },
      cachedRows: {
        'current-story-cache': {
          description: `${ENVIRONMENT_REFERENCE_CACHE_PREFIX}[viewpoint=exterior] cached moon garden`,
          storagePath: 'environment-cache/current-story-cache.png',
        },
      },
      similarCandidates: [
        { id: 'global-cache', storagePath: 'environment-cache/global-cache.png', score: 0.99 },
      ],
    })
  );

  assert.equal(result?.storagePath, 'environment-cache/current-story-cache.png');
  assert.ok(events.includes('asset:get:environment-cache/current-story-cache.png'));
  assert.equal(
    events.some((event) => event.startsWith('cache:findSimilarMany:')),
    false
  );
}

async function testSeriesEnvironmentCacheHitTakesPriority() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(
    {
      ...createBaseRequest(events),
      previousStoryIds: ['story-0'],
    },
    createDeps(events, {
      storyMappings: {
        [`story-0:${environment.id}`]: { cacheId: 'series-cache' },
      },
      cachedRows: {
        'series-cache': {
          description: `${ENVIRONMENT_REFERENCE_CACHE_PREFIX}[viewpoint=exterior] cached moon garden`,
          storagePath: 'environment-cache/series-cache.png',
        },
      },
      similarCandidates: [
        { id: 'global-cache', storagePath: 'environment-cache/global-cache.png', score: 0.99 },
      ],
    })
  );

  assert.equal(result?.storagePath, 'environment-cache/series-cache.png');
  assert.ok(events.includes('asset:get:environment-cache/series-cache.png'));
  assert.equal(
    events.some((event) => event.startsWith('cache:findSimilarMany:')),
    false
  );
}

async function testCrossEnvironmentHitAt95IsSkipped() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(
    createBaseRequest(events),
    createDeps(events, {
      similarCandidates: [
        {
          id: 'threshold-cache',
          storagePath: 'environment-cache/threshold-cache.png',
          score: 0.95,
        },
      ],
    })
  );

  assert.match(result?.storagePath ?? '', /^environment-cache\/[a-f0-9-]+\.png$/);
  assert.ok(events.includes('provider:generateImage'));
  assert.equal(events.includes('asset:get:environment-cache/threshold-cache.png'), false);
}

async function testUnderwaterInteriorNeverReusesExteriorPlateAcrossEnvironmentIds() {
  const events: string[] = [];
  const underwaterEnvironment = {
    id: 'underwater_fountain_basin',
    name: 'Underwater fountain basin interior',
    description:
      'Fully submerged underwater interior of a stone fountain basin, with curved stone floor and walls. The exterior rim and plaza are outside frame.',
  };
  const result = await getOrCreateEnvironmentImageCore(
    {
      ...createBaseRequest(events),
      storyEnvironmentId: underwaterEnvironment.id,
      environment: underwaterEnvironment,
    },
    createDeps(events, {
      similarCandidates: [
        {
          id: 'exterior-fountain',
          storagePath: 'environment-cache/exterior-fountain.png',
          description: `${ENVIRONMENT_REFERENCE_CACHE_PREFIX}[viewpoint=exterior] exterior fountain`,
          score: 0.99,
        },
      ],
    })
  );

  assert.match(result?.storagePath ?? '', /^environment-cache\/[a-f0-9-]+\.png$/);
  assert.ok(events.includes('provider:generateImage'));
  assert.equal(events.includes('asset:get:environment-cache/exterior-fountain.png'), false);
  assert.equal(
    events.some((event) => event.startsWith('cache:findSimilarMany:')),
    true,
    'An underwater plate may search the cache, but it must reject a candidate from another viewpoint kind'
  );
}

async function testCurrentStoryCacheRejectsMismatchedViewpointKind() {
  const events: string[] = [];
  const underwaterEnvironment = {
    id: 'fountain_basin',
    name: 'Underwater fountain basin',
    viewpointKind: 'submerged' as const,
    description: 'Submerged stone basin interior under blue water.',
  };
  const result = await getOrCreateEnvironmentImageCore(
    {
      ...createBaseRequest(events),
      storyEnvironmentId: underwaterEnvironment.id,
      environment: underwaterEnvironment,
    },
    createDeps(events, {
      storyMappings: {
        [`story-1:${underwaterEnvironment.id}`]: { cacheId: 'old-exterior-cache' },
      },
      cachedRows: {
        'old-exterior-cache': {
          description: `${ENVIRONMENT_REFERENCE_CACHE_PREFIX}[viewpoint=exterior] fountain exterior`,
          storagePath: 'environment-cache/old-exterior-cache.png',
        },
      },
    })
  );

  assert.match(result?.storagePath ?? '', /^environment-cache\/[a-f0-9-]+\.png$/);
  assert.ok(events.includes('provider:generateImage'));
  assert.equal(events.includes('asset:get:environment-cache/old-exterior-cache.png'), false);
}

async function testVectorSearchHappensBeforeGenerationOnMiss() {
  const events: string[] = [];
  const result = await getOrCreateEnvironmentImageCore(
    createBaseRequest(events),
    createDeps(events)
  );

  assert.match(result?.storagePath ?? '', /^environment-cache\/[a-f0-9-]+\.png$/);
  const vectorSearchIndex = events.findIndex((event) => event.startsWith('cache:findSimilarMany:'));
  const generationIndex = events.indexOf('provider:generateImage');
  const createIndex = events.findIndex((event) => event.startsWith('cache:create:1,0,0:'));

  assert.ok(vectorSearchIndex >= 0, 'expected vector similarity lookup');
  assert.ok(
    generationIndex > vectorSearchIndex,
    'expected image generation after vector lookup miss'
  );
  assert.ok(
    createIndex > generationIndex,
    'expected generated image to be cached with the same embedding'
  );
}

async function main() {
  await testVectorCacheHitSkipsGeneration();
  await testHighConfidenceCrossEnvironmentHitReusesImage();
  await testCurrentStoryEnvironmentCacheHitTakesPriority();
  await testSeriesEnvironmentCacheHitTakesPriority();
  await testCrossEnvironmentHitAt95IsSkipped();
  await testUnderwaterInteriorNeverReusesExteriorPlateAcrossEnvironmentIds();
  await testCurrentStoryCacheRejectsMismatchedViewpointKind();
  await testVectorSearchHappensBeforeGenerationOnMiss();
  console.log('environmentReferenceImageService tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
