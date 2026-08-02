import assert from 'node:assert/strict';
import { MockTextProvider } from '../../testing/ai/MockTextProvider';

// Must be set before importing config through the orchestration service.
process.env.NODE_ENV = 'test';
process.env.ENABLE_ENVIRONMENT_REFERENCE = 'false';

type StoredUpdate = {
  storyId: string;
  update: Record<string, unknown>;
};

function validSceneValidation() {
  return { sceneId: 1, isValid: true, violations: [] };
}

function graphicNovelScriptFixture() {
  return {
    title: 'The Lantern Garden',
    description: 'A gentle comic about finding a lantern in a moonlit garden.',
    language: 'en',
    characters: [],
    environments: [
      {
        id: 'env_garden',
        name: 'Lantern Garden',
        description: 'A moonlit garden with an ivy arch, a silver pond, and a narrow bridge.',
      },
    ],
    outfits: [],
    pages: [
      {
        pageNumber: 1,
        pageRole: 'opening',
        panels: [
          {
            panelId: 'p1-1',
            dialogue: [],
            thoughts: [],
            visual: {
              environmentId: 'env_garden',
              primaryRead: 'A small lantern glows beside the silver pond.',
              sceneVisual: {
                setting: 'The ivy arch opens toward the narrow bridge.',
                lighting: 'soft moonlight',
                cameraComposition: { shot: 'wide shot', characters: [] },
              },
            },
          },
          {
            panelId: 'p1-2',
            dialogue: [],
            thoughts: [],
            visual: {
              environmentId: 'env_garden',
              primaryRead: 'The lantern shows the way across the bridge.',
              sceneVisual: {
                setting: 'Silver reflections lead from the pond to the bridge.',
                lighting: 'warm lantern light',
                cameraComposition: { shot: 'medium shot', characters: [] },
              },
            },
          },
        ],
      },
    ],
  };
}

function mixedStoryScriptFixture() {
  const comicSceneIds = [1, 4, 7];
  return {
    title: 'The Orchard Path',
    description: 'A gentle mixed story about following a path through an orchard.',
    language: 'en',
    characters: [],
    environments: [
      {
        id: 'env_orchard',
        name: 'Sunny Orchard',
        description: 'A sunny orchard with a red gate, a winding path, and a wooden cart.',
      },
    ],
    outfits: [],
    readingBlocks: Array.from({ length: 8 }, (_, index) => {
      const sceneId = index + 1;
      const comicPageNumber = comicSceneIds.indexOf(sceneId) + 1;
      if (comicPageNumber > 0) {
        return {
          kind: 'comic',
          screenOrder: sceneId,
          sceneId,
          comicPageNumber,
          panels: [
            {
              panelId: `p${comicPageNumber}-1`,
              dialogue: [],
              thoughts: [],
              caption: `A clue appears beside the orchard path on page ${comicPageNumber}.`,
              visual: {
                environmentId: 'env_orchard',
                primaryRead: `A clue appears beside the orchard path on comic page ${comicPageNumber}.`,
                sceneVisual: {
                  setting: 'The red gate and wooden cart remain visible behind the path.',
                  lighting: 'clear morning sunlight',
                  cameraComposition: { shot: 'wide shot', characters: [] },
                },
              },
            },
            {
              panelId: `p${comicPageNumber}-2`,
              dialogue: [],
              thoughts: [],
              caption: `The friends follow the path onward on page ${comicPageNumber}.`,
              visual: {
                environmentId: 'env_orchard',
                primaryRead: `The path guides the friends onward from comic page ${comicPageNumber}.`,
                sceneVisual: {
                  setting: 'Apple trees frame the winding path near the red gate.',
                  lighting: 'soft sunny light',
                  cameraComposition: { shot: 'medium shot', characters: [] },
                },
              },
            },
          ],
        };
      }
      return {
        kind: 'prose',
        screenOrder: sceneId,
        sceneIds: [sceneId],
        text: `The friends calmly follow the orchard path in prose scene ${sceneId}.`,
      };
    }),
  };
}

function requestFixture(id: string) {
  return {
    id,
    userId: 'user-1',
    childProfileId: null,
    createdByChildProfileId: null,
    createdByMode: null,
    parentReviewRequired: false,
    goal: null,
    storyLanguage: 'en',
    selectedCharacters: [],
    selectedChildren: [],
    scenarioCardId: null,
    userNotes: null,
    intermediateData: {},
  };
}

function installProcessRepositories(params: {
  requestId: string;
  planImagesPerStory?: number;
  updates: StoredUpdate[];
}) {
  const requests = new Map([[params.requestId, requestFixture(params.requestId)]]);
  let storyNumber = 0;
  let projectNumber = 0;

  return {
    story: {
      findRequestById: async (requestId: string) => requests.get(requestId) ?? null,
      findRequestForUpdate: async (requestId: string) => requests.get(requestId) ?? null,
      transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback({}),
      updateRequest: async (requestId: string, patch: Record<string, unknown>) => {
        const current = requests.get(requestId);
        if (current) Object.assign(current, patch);
      },
      createStory: async () => ({ id: `story-${++storyNumber}` }),
      findById: async () => null,
      updateStory: async (storyId: string, update: Record<string, unknown>) => {
        params.updates.push({ storyId, update });
      },
      createStoryCharacter: async () => undefined,
    } as never,
    graphicNovel: {
      findProjectByRequestId: async () => null,
      createProject: async () => ({ id: `project-${++projectNumber}` }),
      createPage: async (_input: unknown) => ({ id: `page-${projectNumber}` }),
      createPanels: async () => undefined,
    } as never,
    scene: {
      findByStoryId: async () => [],
      createMany: async () => undefined,
    } as never,
    policy: {
      findAgeEngineRules: async () => ({
        allowedConflicts: '[]',
        additionalRules: '',
        maxSentenceLength: 18,
        wordRangeMin: 500,
        wordRangeMax: 800,
        dialogRatio: '0.5',
      }),
      findContentPolicyRules: async () => [],
    } as never,
    storyArtifact: {
      findBestForStoryContext: async () => null,
    } as never,
    storyGenerationStageEvent: {
      create: async () => ({ id: 'stage-1' }),
    } as never,
    ...(params.planImagesPerStory
      ? {
          plan: {
            findSubscriptionByUserId: async () => ({ planId: 'plan-1' }),
            findAllFeaturesForPlan: async () => [
              { slug: 'images_per_story', value: { limit: params.planImagesPerStory } },
            ],
          } as never,
        }
      : {}),
  };
}

function mapTileFromUpdate(update: StoredUpdate): Record<string, unknown> | null {
  const metadata = update.update.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const mapTile = (metadata as Record<string, unknown>).mapTile;
  return mapTile && typeof mapTile === 'object' ? (mapTile as Record<string, unknown>) : null;
}

async function testGraphicNovelProcessPersistsMapTile(): Promise<void> {
  const [
    { processGraphicNovelRequest },
    { installAiServiceTestOverrides, clearAiServiceTestOverrides },
    { installRepositoryTestOverrides, clearRepositoryTestOverrides },
  ] = await Promise.all([
    import('../graphicNovelOrchestrationService'),
    import('../aiService'),
    import('../../repositories'),
  ]);
  const updates: StoredUpdate[] = [];
  const textProvider = new MockTextProvider().queueStructured(
    'graphic_novel_script',
    graphicNovelScriptFixture()
  );
  const validationProvider = new MockTextProvider(
    Array.from({ length: 1 }, () => ({
      kind: 'structured' as const,
      operation: 'validateScene',
      response: validSceneValidation(),
    }))
  );
  const directorProvider = new MockTextProvider().queueStructured('map_tile_brief', {
    description: 'A moonlit garden with an ivy arch, silver pond, narrow bridge, and lantern.',
    requiredFeatures: ['ivy arch', 'silver pond', 'bridge', 'lantern'],
  });

  installAiServiceTestOverrides({
    textProvider,
    directorTextProvider: directorProvider,
    validationTextProvider: validationProvider,
  });
  installRepositoryTestOverrides(
    installProcessRepositories({ requestId: 'graphic-request', updates })
  );

  try {
    await processGraphicNovelRequest('graphic-request');

    const persisted = updates.find(
      (entry) =>
        (entry.update.metadata as Record<string, unknown> | undefined)?.storyFormat ===
        'graphic_novel'
    );
    assert.ok(persisted, 'graphic_novel process must persist its initial story payload');
    assert.deepEqual(mapTileFromUpdate(persisted), {
      description: 'A moonlit garden with an ivy arch, silver pond, narrow bridge, and lantern.',
      requiredFeatures: ['path', 'pond', 'bridge', 'portal'],
    });
    assert.deepEqual(
      directorProvider.structuredRequests.map((request) => request.operation),
      ['map_tile_brief']
    );
    assert.match(directorProvider.structuredRequests[0].prompt, /Lantern Garden/);
    textProvider.assertExhausted();
    validationProvider.assertExhausted();
    directorProvider.assertExhausted();
  } finally {
    clearRepositoryTestOverrides();
    clearAiServiceTestOverrides();
  }
}

async function testMixedStoryProcessPersistsMapTile(): Promise<void> {
  const [
    { processMixedStoryRequest },
    { installAiServiceTestOverrides, clearAiServiceTestOverrides },
    { installRepositoryTestOverrides, clearRepositoryTestOverrides },
  ] = await Promise.all([
    import('../graphicNovelOrchestrationService'),
    import('../aiService'),
    import('../../repositories'),
  ]);
  const updates: StoredUpdate[] = [];
  const directorProvider = new MockTextProvider()
    .queueStructured('mixed_story_script', mixedStoryScriptFixture())
    .queueStructured('map_tile_brief', {
      description: 'A sunny orchard with a red gate, winding path, wooden cart, and apple trees.',
      requiredFeatures: ['red gate', 'path', 'wooden cart', 'apple trees'],
    });

  installAiServiceTestOverrides({
    textProvider: directorProvider,
    directorTextProvider: directorProvider,
  });
  installRepositoryTestOverrides(
    installProcessRepositories({
      requestId: 'mixed-request',
      planImagesPerStory: 3,
      updates,
    })
  );

  try {
    await processMixedStoryRequest('mixed-request');

    const persisted = updates.find(
      (entry) =>
        (entry.update.metadata as Record<string, unknown> | undefined)?.storyFormat ===
        'mixed_story'
    );
    assert.ok(persisted, 'mixed_story process must persist its initial story payload');
    assert.deepEqual(mapTileFromUpdate(persisted), {
      description: 'A sunny orchard with a red gate, winding path, wooden cart, and apple trees.',
      requiredFeatures: ['path', 'portal'],
    });
    assert.deepEqual(
      directorProvider.structuredRequests.map((request) => request.operation),
      ['mixed_story_script', 'map_tile_brief']
    );
    assert.match(directorProvider.structuredRequests[1].prompt, /Sunny Orchard/);
    directorProvider.assertExhausted();
  } finally {
    clearRepositoryTestOverrides();
    clearAiServiceTestOverrides();
  }
}

Promise.resolve()
  .then(testGraphicNovelProcessPersistsMapTile)
  .then(testMixedStoryProcessPersistsMapTile)
  .then(() => console.log('comic mapTile process regression tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
