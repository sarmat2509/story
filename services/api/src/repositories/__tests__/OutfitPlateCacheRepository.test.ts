import assert from 'node:assert/strict';
import { OutfitPlateCacheRepository } from '../OutfitPlateCacheRepository';

function buildRow(params: {
  id: string;
  embedding: number[];
  description: string;
  componentTags?: string[];
}) {
  return {
    id: params.id,
    outfitText: params.description,
    descriptionEmbedding: params.embedding,
    imageStyle: 'soft_3d',
    ageGroup: '6-8',
    storagePath: `outfit_plate_cache/${params.id}.jpg`,
    storageUrl: null,
    catalogSource: 'outfits.json:planned',
    formality: 'casual',
    presentationGroups: [],
    purposeTags: [],
    seasonTags: [],
    climateTags: [],
    eraTags: [],
    settingTags: [],
    activityTags: [],
    silhouetteTags: [],
    footwearTags: [],
    componentTags: params.componentTags ?? [],
    colorPalette: [],
    materials: [],
    patterns: [],
    detailTags: [],
    coverageTags: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createRepository(rows: ReturnType<typeof buildRow>[]) {
  const query: Record<string, unknown> = {};
  query.from = () => query;
  query.$dynamic = () => query;
  query.where = () => query;
  query.limit = (limit: number) => Promise.resolve(rows.slice(0, limit));
  query.then = (
    resolve: (value: ReturnType<typeof buildRow>[]) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject);

  return new OutfitPlateCacheRepository({ select: () => query } as never);
}

async function run() {
  const repo = createRepository([
    buildRow({ id: 'second', embedding: [0.8, 0.6], description: 'Second' }),
    buildRow({
      id: 'best',
      embedding: [1, 0],
      description: 'Best',
      componentTags: ['jacket'],
    }),
    buildRow({ id: 'below', embedding: [0, 1], description: 'Below' }),
  ]);

  const matches = await repo.findSimilarMany([1, 0], 0.5, {
    filters: { componentTags: ['jacket'] },
    plannedCatalogOnly: true,
    limitResults: 2,
  });

  assert.deepEqual(
    matches.map((item) => item.id),
    ['best', 'second'],
    'similarity results are sorted best-first and respect the result limit'
  );
  assert.equal(matches[0]?.score, 1);
  assert.equal(matches[0]?.tagScore, 1);
  assert.equal(matches[1]?.score, 0.8);

  const best = await repo.findSimilar([1, 0], 0.5, {
    plannedCatalogOnly: true,
  });
  assert.equal(best?.id, 'best', 'single-result runtime lookup still returns the top match');

  const strict = await repo.findSimilarMany([1, 0], 1.01, {
    plannedCatalogOnly: true,
  });
  assert.deepEqual(strict, [], 'threshold filters out weaker candidates');

  const fullCatalogRows = Array.from({ length: 583 }, (_, index) =>
    buildRow({
      id: `weak-${String(index + 1).padStart(3, '0')}`,
      embedding: [0, 1],
      description: `Weak ${index + 1}`,
    })
  );
  fullCatalogRows.push(
    buildRow({
      id: 'best-after-300',
      embedding: [1, 0],
      description: 'Global best after the old candidate boundary',
    })
  );
  const fullCatalogRepo = createRepository(fullCatalogRows);
  const globalBest = await fullCatalogRepo.findSimilar([1, 0], 0, {
    plannedCatalogOnly: true,
  });
  assert.equal(
    globalBest?.id,
    'best-after-300',
    'runtime similarity scans the full planned catalog before selecting the best result'
  );
}

void run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('OutfitPlateCacheRepository tests passed');
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
