import assert from 'node:assert/strict';
import { MockImageProvider, mockGeneratedImage } from '../../testing/ai';

const storyId = '81111111-1111-4111-8111-111111111111';
const userId = '82222222-2222-4222-8222-222222222222';
const characterId = '83333333-3333-4333-8333-333333333333';
const envId = 'env_forest_path';
const plateCacheId = '84444444-4444-4444-8444-444444444444';
const dressedCacheId = '85555555-5555-4555-8555-555555555555';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';
  process.env.ENABLE_OUTFIT_PLATE = 'true';

  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const {
    clearAiServiceTestOverrides,
    installAiServiceTestOverrides,
  } = await import('../../services/aiService');
  const {
    getCatalogOutfitPlateImage,
    getOrCreateCharacterOutfitTurnaroundImage,
  } = await import('../../services/outfitPlateService');
  const {
    applySceneDressedTurnaroundOverrides,
    prepareSceneDressedTurnaroundReferences,
    resolveSceneCharacterOutfits,
  } = await import('../../services/imageReferencePreparationService');

  const assetPaths = new Map<string, Buffer>([
    ['catalog/plates/yellow-raincoat.png', Buffer.from('catalog-plate')],
    ['cache/dressed/mira.png', Buffer.from('dressed-cached')],
  ]);
  const savedDressed: Array<{ cacheId: string; size: number }> = [];
  const storyUpserts: Array<{
    storyId: string;
    envId: string;
    characterKey: string;
    cacheId: string;
    outfitText: string;
  }> = [];
  const dressedCreates: unknown[] = [];
  let findSimilarCalls = 0;
  let generateCalls = 0;

  const assetStorage = {
    getAssetByPath: async (path: string) => {
      const buffer = assetPaths.get(path);
      if (!buffer) throw new Error(`missing asset ${path}`);
      return buffer;
    },
    saveCharacterOutfitTurnaroundCacheImage: async (
      cacheId: string,
      buffer: Buffer,
      mimeType: string
    ) => {
      savedDressed.push({ cacheId, size: buffer.length });
      const storagePath = `cache/dressed/${cacheId}.png`;
      assetPaths.set(storagePath, buffer);
      return { storagePath, storageUrl: `/api/v1/assets/${storagePath}`, mimeType };
    },
  } as any;

  function installBaseOverrides(extra: Record<string, unknown> = {}) {
    installRepositoryTestOverrides({
      outfitPlateCache: {
        getById: async (id: string) =>
          id === plateCacheId
            ? {
                id: plateCacheId,
                outfitText: 'bright yellow raincoat and matching rubber boots',
                storagePath: 'catalog/plates/yellow-raincoat.png',
                storageUrl: null,
                catalogSource: 'outfits.json:planned',
                descriptionEmbedding: [1, 0, 0],
              }
            : null,
        findSimilar: async () => {
          findSimilarCalls += 1;
          return {
            id: plateCacheId,
            outfitText: 'bright yellow raincoat and matching rubber boots',
            storagePath: 'catalog/plates/yellow-raincoat.png',
            storageUrl: null,
            catalogSource: 'outfits.json:planned',
            score: 0.97,
            descriptionEmbedding: [1, 0, 0],
          };
        },
      } as any,
      storyOutfitPlateCache: {
        getByStoryEnvAndCharacter: async () => null,
        upsert: async (
          sid: string,
          eid: string,
          characterKey: string,
          cacheId: string,
          outfitText: string
        ) => {
          storyUpserts.push({ storyId: sid, envId: eid, characterKey, cacheId, outfitText });
        },
      } as any,
      characterOutfitTurnaroundCache: {
        findByCharacterAndOutfit: async () => null,
        create: async (row: unknown) => {
          dressedCreates.push(row);
          return row;
        },
      } as any,
      storyGenerationStageEvent: {
        create: async (row: any) => ({ id: 'stage-1', ...row }),
      } as any,
      ...extra,
    });
  }

  installAiServiceTestOverrides({
    embeddingGenerator: async () => [1, 0, 0],
    environmentImageProvider: {
      async generateImage() {
        generateCalls += 1;
        return mockGeneratedImage();
      },
    } as any,
  });

  try {
    // Pure helpers
    const outfits = resolveSceneCharacterOutfits(
      {
        sceneId: 1,
        characterOutfitIds: { Mira: 'o_mira_1' },
      } as any,
      {
        storyOutfits: [
          {
            id: 'o_mira_1',
            characterName: 'Mira',
            description: 'bright yellow raincoat and matching rubber boots',
          },
        ] as any,
      }
    );
    assert.equal(outfits?.Mira, 'bright yellow raincoat and matching rubber boots');

    const filtered = applySceneDressedTurnaroundOverrides(
      [
        { characterName: 'Mira', url: 'identity.png' },
        { characterName: 'Leo', url: 'leo.png' },
      ],
      [{ characterName: 'Mira' }]
    );
    assert.deepEqual(
      filtered.map((row) => row.characterName),
      ['Leo']
    );
    const localizedAliasFiltered = applySceneDressedTurnaroundOverrides(
      [
        { characterId, characterName: 'Theo', url: 'identity.png' },
        { characterId: 'leo-id', characterName: 'Leo', url: 'leo.png' },
      ],
      [{ characterId, characterName: 'Тато Тео' }]
    );
    assert.deepEqual(
      localizedAliasFiltered.map((row) => row.characterName),
      ['Leo'],
      'dressed turnaround replaces the same stable character even under a localized alias'
    );

    // Catalog plate: story miss → findSimilar → upsert
    installBaseOverrides();
    const catalogPlate = await getCatalogOutfitPlateImage({
      storyId,
      userId,
      storyEnvironmentId: envId,
      characterName: 'Mira',
      outfitTextRaw: 'Bright yellow raincoat and matching rubber boots.',
      outfitId: 'o_mira_1',
      imageStyle: 'soft_watercolor',
      ageGroup: '6-8',
      assetStorage,
    });
    assert.ok(catalogPlate && !('useDefaultOutfit' in catalogPlate && catalogPlate.useDefaultOutfit));
    assert.equal((catalogPlate as any).storagePath, 'catalog/plates/yellow-raincoat.png');
    assert.equal(storyUpserts.length, 1);
    assert.equal(storyUpserts[0].cacheId, plateCacheId);
    assert.ok(findSimilarCalls >= 1);

    // Catalog plate: keep default when default outfit is close enough
    findSimilarCalls = 0;
    installBaseOverrides();
    const keepDefault = await getCatalogOutfitPlateImage({
      storyId,
      userId,
      storyEnvironmentId: envId,
      characterName: 'Mira',
      outfitTextRaw: 'Bright yellow raincoat and matching rubber boots.',
      imageStyle: 'soft_watercolor',
      ageGroup: '6-8',
      assetStorage,
      defaultOutfitText: 'Bright yellow raincoat and matching rubber boots.',
      defaultOutfitEmbedding: [1, 0, 0],
    });
    assert.equal(keepDefault?.useDefaultOutfit, true);

    // Story mapping exact hit without findSimilar
    findSimilarCalls = 0;
    installBaseOverrides({
      storyOutfitPlateCache: {
        getByStoryEnvAndCharacter: async () => ({
          cacheId: plateCacheId,
          requestedOutfitText: 'Bright yellow raincoat and matching rubber boots.',
        }),
        upsert: async () => undefined,
      } as any,
    });
    const storyHit = await getCatalogOutfitPlateImage({
      storyId,
      userId,
      storyEnvironmentId: envId,
      characterName: 'Mira',
      outfitTextRaw: 'Bright yellow raincoat and matching rubber boots.',
      outfitId: 'o_mira_1',
      imageStyle: 'soft_watercolor',
      ageGroup: '6-8',
      assetStorage,
    });
    assert.equal((storyHit as any).storagePath, 'catalog/plates/yellow-raincoat.png');
    assert.equal(findSimilarCalls, 0);

    // Dressed turnaround cache hit
    installBaseOverrides({
      characterOutfitTurnaroundCache: {
        findByCharacterAndOutfit: async () => ({
          id: dressedCacheId,
          storagePath: 'cache/dressed/mira.png',
        }),
        create: async () => {
          throw new Error('should not create on cache hit');
        },
      } as any,
    });
    const dressedHit = await getOrCreateCharacterOutfitTurnaroundImage({
      characterId,
      characterName: 'Mira',
      outfitTextRaw: 'Bright yellow raincoat and matching rubber boots.',
      outfitId: 'o_mira_1',
      outfitPlateStoragePath: 'catalog/plates/yellow-raincoat.png',
      identityReference: {
        base64Data: Buffer.from('identity').toString('base64'),
        mimeType: 'image/png',
      },
      outfitPlateReference: {
        base64Data: Buffer.from('plate').toString('base64'),
        mimeType: 'image/png',
      },
      imageStyle: 'soft_watercolor',
      ageGroup: '6-8',
      userId,
      storyId,
      assetStorage,
    });
    assert.equal(dressedHit?.storagePath, 'cache/dressed/mira.png');
    assert.equal(generateCalls, 0);

    // Dressed turnaround cache miss → generate + persist
    installBaseOverrides();
    generateCalls = 0;
    const dressedMiss = await getOrCreateCharacterOutfitTurnaroundImage({
      characterId,
      characterName: 'Mira',
      outfitTextRaw: 'Bright yellow raincoat and matching rubber boots.',
      outfitId: 'o_mira_1',
      outfitPlateStoragePath: 'catalog/plates/yellow-raincoat.png',
      identityReference: {
        base64Data: Buffer.from('identity').toString('base64'),
        mimeType: 'image/png',
      },
      outfitPlateReference: {
        base64Data: Buffer.from('plate').toString('base64'),
        mimeType: 'image/png',
      },
      imageStyle: 'soft_watercolor',
      ageGroup: '6-8',
      userId,
      storyId,
      assetStorage,
    });
    assert.ok(dressedMiss?.storagePath);
    assert.equal(generateCalls, 1);
    assert.equal(savedDressed.length, 1);
    assert.equal(dressedCreates.length, 1);

    // prepareSceneDressedTurnaroundReferences integrates catalog + dressed path
    installBaseOverrides();
    generateCalls = 0;
    const dressedRefs = await prepareSceneDressedTurnaroundReferences({
      storyId,
      userId,
      normalizedCharacters: ['Mira'],
      characterDescriptionMap: new Map([
        [
          'Mira',
          {
            id: characterId,
            name: 'Mira',
            type: 'person',
            defaultOutfitText: 'everyday sweater',
            defaultOutfitEmbedding: [0, 1, 0],
          } as any,
        ],
      ]),
      characterReferenceData: [
        {
          characterName: 'Mira',
          url: 'identity/mira.png',
          base64: Buffer.from('identity').toString('base64'),
          mimeType: 'image/png',
          type: 'character_reference',
        } as any,
      ],
      scene: {
        sceneId: 1,
        characterOutfitIds: { Mira: 'o_mira_1' },
      } as any,
      currentEnvironmentId: envId,
      currentEnvironment: { id: envId, name: 'Forest Path' } as any,
      storyOutfits: [
        {
          id: 'o_mira_1',
          characterName: 'Mira',
          description: 'bright yellow raincoat and matching rubber boots',
        },
      ] as any,
      imageStyle: 'soft_watercolor',
      ageGroup: '6-8',
      assetStorage,
      imageDomain: { uploadReferenceFile: async () => null } as any,
      outfitPlatePending: new Map(),
      dressedTurnaroundPending: new Map(),
    });

    assert.equal(dressedRefs.length, 1);
    assert.equal(dressedRefs[0].characterName, 'Mira');
    assert.equal(dressedRefs[0].type, 'dressed_turnaround_reference');
    assert.ok(dressedRefs[0].base64);
    assert.equal(generateCalls, 1);

    // Localized page alias keeps the existing non-LLM identity and receives its dressed reference.
    installBaseOverrides();
    generateCalls = 0;
    const localizedAliasRefs = await prepareSceneDressedTurnaroundReferences({
      storyId,
      userId,
      normalizedCharacters: ['Тато Тео', 'Тео'],
      characterDescriptionMap: new Map([
        [
          'Тато Тео',
          {
            id: 'legacy-llm-duplicate',
            characterRef: 'legacy-llm-duplicate',
            name: 'Тато Тео',
            type: 'person',
            source: 'llm_generated',
          } as any,
        ],
        [
          'Тео',
          {
            id: characterId,
            characterRef: characterId,
            name: 'Тео',
            type: 'person',
            source: 'user_provided',
            defaultOutfitText: 'everyday sweater',
            defaultOutfitEmbedding: [0, 1, 0],
          } as any,
        ],
      ]),
      characterReferenceData: [
        {
          characterId,
          characterName: 'Тео',
          url: 'identity/theo.png',
          base64: Buffer.from('identity').toString('base64'),
          mimeType: 'image/png',
          type: 'character_reference',
        } as any,
      ],
      scene: {
        sceneId: 7,
        sceneVisual: {
          setting: 'sports field',
          lighting: 'daylight',
          cameraComposition: {
            shot: 'full comic page',
            characters: [
              {
                characterRef: characterId,
                name: 'Тато Тео',
                description: 'cheering at the finish line',
                outfitId: 'o_theo_sport',
              },
            ],
          },
        },
        characterOutfitIds: { 'Тато Тео': 'o_theo_sport' },
        characterOutfitRefs: { [characterId]: 'o_theo_sport' },
      } as any,
      currentEnvironmentId: envId,
      currentEnvironment: { id: envId, name: 'Sports Field' } as any,
      storyOutfits: [
        {
          id: 'o_theo_sport',
          characterRef: characterId,
          characterName: 'Тато Тео',
          description: 'bright yellow raincoat and matching rubber boots',
        },
      ] as any,
      imageStyle: 'soft_watercolor',
      ageGroup: '6-8',
      assetStorage,
      imageDomain: { uploadReferenceFile: async () => null } as any,
      outfitPlatePending: new Map(),
      dressedTurnaroundPending: new Map(),
    });
    assert.equal(localizedAliasRefs.length, 1);
    assert.equal(localizedAliasRefs[0].characterId, characterId);
    assert.equal(localizedAliasRefs[0].characterName, 'Тато Тео');
    assert.equal(localizedAliasRefs[0].type, 'dressed_turnaround_reference');
    assert.equal(generateCalls, 1);
  } finally {
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
  }

  console.log('outfit plate and dressed turnaround contracts passed (10 cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
