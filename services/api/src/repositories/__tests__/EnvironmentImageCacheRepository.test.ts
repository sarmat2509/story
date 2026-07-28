import assert from 'node:assert/strict';
import { EnvironmentImageCacheRepository } from '../EnvironmentImageCacheRepository';

function buildRow(params: { id: string; embedding: number[]; description: string }) {
  return {
    id: params.id,
    description: params.description,
    descriptionEmbedding: params.embedding,
    storagePath: `env_cache/${params.id}.jpg`,
    storageUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createRepository(rows: ReturnType<typeof buildRow>[]) {
  const query: Record<string, unknown> = {};
  query.from = () => query;
  query.then = (
    resolve: (value: ReturnType<typeof buildRow>[]) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject);

  return new EnvironmentImageCacheRepository({ select: () => query } as never);
}

async function run() {
  const repo = createRepository([
    buildRow({ id: 'second', embedding: [0.8, 0.6], description: '[ENV_REF_V2] Second' }),
    buildRow({ id: 'best', embedding: [1, 0], description: '[ENV_REF_V2] Best' }),
    buildRow({ id: 'legacy', embedding: [0.6, 0.8], description: '[ENV_REF_V1] Legacy' }),
    buildRow({ id: 'invalid', embedding: [1], description: '[ENV_REF_V2] Invalid' }),
  ]);

  const matches = await repo.findSimilarMany([1, 0], 0, { limitResults: 3 });
  assert.deepEqual(
    matches.map((item) => item.id),
    ['best', 'second', 'legacy'],
    'admin similarity search ranks all cache versions and respects the result limit'
  );
  assert.equal(matches[0]?.score, 1);
  assert.equal(matches[1]?.score, 0.8);
  assert.equal(matches[2]?.score, 0.6);

  const currentOnly = await repo.findSimilarMany([1, 0], 0, {
    descriptionPrefix: '[ENV_REF_V2]',
  });
  assert.deepEqual(
    currentOnly.map((item) => item.id),
    ['best', 'second'],
    'description prefix filtering remains available for runtime-equivalent searches'
  );
}

void run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('EnvironmentImageCacheRepository tests passed');
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
