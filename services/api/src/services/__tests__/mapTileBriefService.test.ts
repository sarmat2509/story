import assert from 'node:assert/strict';
import type { StorySpec } from '../../ai/types';
import { MockTextProvider } from '../../testing/ai';
import { clearAiServiceTestOverrides, installAiServiceTestOverrides } from '../aiService';
import {
  buildMapTileBriefInputForScenes,
  generateMapTileBriefForScenes,
  resolveMapTileBriefImageCount,
} from '../mapTileBriefService';

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

function testBuildInputNormalizesComicScenesAndVisualCount(): void {
  const input = buildMapTileBriefInputForScenes({
    scenes: [
      { sceneId: 10, text: 'The friends enter a stone garden.' },
      { sceneId: 20, text: '   ' },
      { sceneId: 30, text: 'They cross a bridge and find a round pond.' },
    ],
    imagesPerStory: 8,
    spec: STORY_SPEC,
    userCharacters: [
      { id: 'character-1', name: 'Mira' },
      { id: 'character-2', name: ' ' },
    ],
  });

  assert.equal(input.imagesPerStory, 2);
  assert.equal(input.blocks.length, 2);
  assert.equal(input.blocks[0].sceneStart, 1);
  assert.equal(input.blocks[1].sceneStart, 2);
  assert.match(input.blocks[0].blockText, /stone garden/);
  assert.match(input.blocks[1].blockText, /round pond/);
  assert.deepEqual(input.userCharacters, [{ id: 'character-1', name: 'Mira' }]);
}

function testBackfillImageCountUsesComicMetadata(): void {
  assert.equal(
    resolveMapTileBriefImageCount({
      sceneCount: 8,
      metadata: { mixedStoryComicBlockCount: 5, sceneIdsWithImages: [] },
    }),
    5
  );
  assert.equal(
    resolveMapTileBriefImageCount({
      sceneCount: 8,
      metadata: { graphicNovelPlannedPageCount: 8 },
    }),
    8
  );
  assert.equal(
    resolveMapTileBriefImageCount({
      sceneCount: 2,
      metadata: { graphicNovelPageCount: 8 },
    }),
    2
  );
}

async function testGenerateBriefUsesMapTileOnlyDirectorContract(): Promise<void> {
  const textProvider = new MockTextProvider().queueStructured('map_tile_brief', {
    description: 'A stone garden with a round pond and a narrow wooden bridge.',
    requiredFeatures: ['bridge', 'path', 'bridge'],
  });
  installAiServiceTestOverrides({
    textProvider,
    directorTextProvider: textProvider,
    validationTextProvider: textProvider,
  });

  try {
    const result = await generateMapTileBriefForScenes({
      scenes: [
        { sceneId: 1, text: 'The friends enter a stone garden.' },
        { sceneId: 2, text: 'They cross a bridge beside a round pond.' },
      ],
      imagesPerStory: 2,
      spec: STORY_SPEC,
      userCharacters: [{ id: 'character-1', name: 'Mira' }],
    });

    assert.equal(
      result.description,
      'A stone garden with a round pond and a narrow wooden bridge.'
    );
    assert.deepEqual(result.requiredFeatures, ['path', 'bridge']);
    assert.equal(textProvider.structuredRequests.length, 1);
    assert.equal(textProvider.structuredRequests[0].operation, 'map_tile_brief');
    assert.match(textProvider.structuredRequests[0].prompt, /stone garden/);
    assert.match(textProvider.structuredRequests[0].prompt, /round pond/);
    textProvider.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
  }
}

async function run(): Promise<void> {
  testBuildInputNormalizesComicScenesAndVisualCount();
  testBackfillImageCountUsesComicMetadata();
  await testGenerateBriefUsesMapTileOnlyDirectorContract();
  console.log('mapTileBriefService tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
