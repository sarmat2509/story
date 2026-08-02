import assert from 'node:assert/strict';
import type { StorySpec } from '../../ai/types';
import { MockTextProvider } from '../../testing/ai/MockTextProvider';

process.env.NODE_ENV = 'test';

const STORY_SPEC: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [],
  policyProfile: {
    ageGroup: '6-8',
    language: 'en',
    allowedConflicts: [],
    constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
    readability: {
      maxSentenceLen: 18,
      targetWordsRange: [500, 800],
      dialogRatio: 0.5,
    },
    promptGuidelines: '',
  },
};

async function testComicMapTileIsGeneratedAndPersistedForBothFormats(): Promise<void> {
  const [
    { graphicNovelOrchestrationTestSeams },
    { installAiServiceTestOverrides, clearAiServiceTestOverrides },
    { installRepositoryTestOverrides, clearRepositoryTestOverrides },
  ] = await Promise.all([
    import('../graphicNovelOrchestrationService'),
    import('../aiService'),
    import('../../repositories'),
  ]);

  const textProvider = new MockTextProvider()
    .queueStructured('map_tile_brief', {
      description: 'A moonlit garden with an ivy arch, a silver pond, and a narrow bridge.',
      requiredFeatures: ['ivy arch', 'silver pond', 'bridge'],
    })
    .queueStructured('map_tile_brief', {
      description: 'A sunny orchard with a red gate, a winding path, and a wooden cart.',
      requiredFeatures: ['red gate', 'path', 'wooden cart'],
    });
  const storyUpdates: Array<{ storyId: string; update: Record<string, unknown> }> = [];
  const stageEvents: Array<Record<string, unknown>> = [];

  installAiServiceTestOverrides({
    textProvider,
    directorTextProvider: textProvider,
    validationTextProvider: textProvider,
  });
  installRepositoryTestOverrides({
    story: {
      updateStory: async (storyId, update) => {
        storyUpdates.push({ storyId, update: update as Record<string, unknown> });
      },
    } as never,
    storyGenerationStageEvent: {
      create: async (event) => {
        stageEvents.push(event as Record<string, unknown>);
        return { id: `stage-${stageEvents.length}` };
      },
    } as never,
  });

  try {
    const graphicNovelMapTile = await graphicNovelOrchestrationTestSeams.generateComicMapTileBrief({
      storyId: 'graphic-story',
      requestId: 'graphic-request',
      userId: 'user-1',
      generationKind: 'graphic_novel',
      scenes: [
        {
          sceneId: 1,
          text: 'Mira crosses a narrow bridge in the moonlit garden beside a silver pond.',
        },
      ],
      imagesPerStory: 8,
      spec: STORY_SPEC,
      userCharacters: [],
    });
    await graphicNovelOrchestrationTestSeams.persistInitialComicStory({
      storyId: 'graphic-story',
      mapTile: graphicNovelMapTile,
      update: { metadata: { storyFormat: 'graphic_novel', graphicNovelPageCount: 8 } },
    });

    const mixedStoryMapTile = await graphicNovelOrchestrationTestSeams.generateComicMapTileBrief({
      storyId: 'mixed-story',
      requestId: 'mixed-request',
      userId: 'user-1',
      generationKind: 'mixed_story',
      scenes: [
        {
          sceneId: 1,
          text: 'Mira follows a winding path through a sunny orchard to the red gate.',
        },
      ],
      imagesPerStory: 3,
      spec: STORY_SPEC,
      userCharacters: [],
    });
    await graphicNovelOrchestrationTestSeams.persistInitialComicStory({
      storyId: 'mixed-story',
      mapTile: mixedStoryMapTile,
      update: { metadata: { storyFormat: 'mixed_story', mixedStoryComicBlockCount: 3 } },
    });

    assert.deepEqual(storyUpdates, [
      {
        storyId: 'graphic-story',
        update: {
          metadata: {
            storyFormat: 'graphic_novel',
            graphicNovelPageCount: 8,
            mapTile: graphicNovelMapTile,
          },
        },
      },
      {
        storyId: 'mixed-story',
        update: {
          metadata: {
            storyFormat: 'mixed_story',
            mixedStoryComicBlockCount: 3,
            mapTile: mixedStoryMapTile,
          },
        },
      },
    ]);
    assert.deepEqual(
      textProvider.structuredRequests.map((request) => request.operation),
      ['map_tile_brief', 'map_tile_brief']
    );
    assert.match(textProvider.structuredRequests[0].prompt, /moonlit garden/);
    assert.match(textProvider.structuredRequests[1].prompt, /sunny orchard/);
    assert.deepEqual(
      stageEvents.map((event) => [event.generationKind, event.operation, event.status]),
      [
        ['graphic_novel', 'map_tile_brief', 'completed'],
        ['mixed_story', 'map_tile_brief', 'completed'],
      ]
    );
    textProvider.assertExhausted();
  } finally {
    clearRepositoryTestOverrides();
    clearAiServiceTestOverrides();
  }
}

testComicMapTileIsGeneratedAndPersistedForBothFormats()
  .then(() => console.log('graphic novel/mixed mapTile persistence tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
