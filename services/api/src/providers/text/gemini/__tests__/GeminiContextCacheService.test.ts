import assert from 'node:assert/strict';
import {
  GeminiContextCacheService,
  estimateGeminiTokens,
  shouldUseGeminiContextCache,
} from '../GeminiContextCacheService';

function createFakeClient() {
  let createCount = 0;
  const created = new Map<string, { name: string; expireTime: string }>();

  return {
    client: {
      caches: {
        async create(params: any) {
          createCount += 1;
          const key = `${params.model}:${params.config.displayName}`;
          const value = {
            name: `cachedContents/${createCount}`,
            expireTime: new Date(Date.now() + 5 * 60_000).toISOString(),
          };
          created.set(key, value);
          return value;
        },
        async get({ name }: { name: string }) {
          const found = Array.from(created.values()).find((item) => item.name === name);
          if (!found) {
            throw new Error('not found');
          }
          return found;
        },
      },
    } as any,
    getCreateCount() {
      return createCount;
    },
    deleteByName(name: string) {
      for (const [key, value] of created.entries()) {
        if (value.name === name) created.delete(key);
      }
    },
  };
}

async function run() {
  const fake = createFakeClient();
  const service = new GeminiContextCacheService(fake.client);

  const first = await service.getOrCreate({
    model: 'gemini-2.5-flash',
    key: 'image_validation_rules_full_v1',
    content: 'STATIC RULES',
  });
  assert.ok(first);
  assert.equal(fake.getCreateCount(), 1);

  const second = await service.getOrCreate({
    model: 'gemini-2.5-flash',
    key: 'image_validation_rules_full_v1',
    content: 'STATIC RULES',
  });
  assert.equal(second, first);
  assert.equal(fake.getCreateCount(), 1);

  fake.deleteByName(first!);
  const recreated = await service.getOrCreate({
    model: 'gemini-2.5-flash',
    key: 'image_validation_rules_full_v1',
    content: 'STATIC RULES',
  });
  assert.ok(recreated);
  assert.notEqual(recreated, first);
  assert.equal(fake.getCreateCount(), 2);

  assert.equal(estimateGeminiTokens('abcd'), 1);
  assert.equal(estimateGeminiTokens('abcdefgh'), 2);

  const tooSmall = shouldUseGeminiContextCache({
    cachedContent: 'short rules',
    runtimeContent: 'runtime content',
    minEstimatedTokens: 1024,
    minShare: 0.5,
  });
  assert.equal(tooSmall.useCache, false);
  assert.equal(tooSmall.reason, 'too_small');

  const shareTooLow = shouldUseGeminiContextCache({
    cachedContent: 'x'.repeat(4096),
    runtimeContent: 'y'.repeat(20000),
    minEstimatedTokens: 256,
    minShare: 0.5,
  });
  assert.equal(shareTooLow.useCache, false);
  assert.equal(shareTooLow.reason, 'share_too_low');

  const shouldCache = shouldUseGeminiContextCache({
    cachedContent: 'x'.repeat(6000),
    runtimeContent: 'y'.repeat(2000),
    minEstimatedTokens: 1024,
    minShare: 0.5,
  });
  assert.equal(shouldCache.useCache, true);
}

run().then(() => console.log('GeminiContextCacheService tests passed'));
