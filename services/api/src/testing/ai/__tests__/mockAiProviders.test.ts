import assert from 'node:assert/strict';
import type { StorySpec } from '../../../ai/types';
import { ImageDomainService } from '../../../domain/image/ImageDomainService';
import {
  MockAlignmentProvider,
  MockAudioProvider,
  MockImageProvider,
  MockTextProvider,
  MOCK_ALIGNMENT,
  MOCK_BATCH_VALIDATION,
  MOCK_DIRECTOR_RESPONSE,
  MOCK_MAP_TILE_BRIEF,
  MOCK_PLAIN_STORY,
  MOCK_REGENERATED_SCENES,
  MOCK_VALID_SCENE,
  mockGeneratedImage,
  mockSynthesizedAudio,
} from '..';

const STORY_SPEC: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [],
  goalName: 'Kindness',
  goalGuidance: 'Friends help one another.',
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

async function testProductionDomainMethodsReceiveFixedMockResponses(): Promise<void> {
  const text = new MockTextProvider()
    .queueText('text_plain', MOCK_PLAIN_STORY)
    .queueStructured('director', MOCK_DIRECTOR_RESPONSE)
    .queueStructured('map_tile_brief', MOCK_MAP_TILE_BRIEF)
    .queueStructured('validateScene', MOCK_VALID_SCENE)
    .queueStructured('validateScene', MOCK_BATCH_VALIDATION)
    .queueStructured('regenerateScene', MOCK_REGENERATED_SCENES);
  const image = new MockImageProvider().queueGenerate('image_map_tile', mockGeneratedImage());
  const turnaroundImage = new MockImageProvider().queueGenerate(
    'image_generate',
    mockGeneratedImage()
  );
  const llmTurnaroundImage = new MockImageProvider().queueGenerate(
    'image_generate',
    mockGeneratedImage()
  );
  const audio = new MockAudioProvider().queueSynthesis(mockSynthesizedAudio());
  const alignment = new MockAlignmentProvider().queueAlignment(MOCK_ALIGNMENT);

  const {
    clearAiServiceTestOverrides,
    getAlignmentProvider,
    getAudioProvider,
    getLlmTurnaroundImageDomainService,
    getStoryDomainService,
    getTurnaroundImageDomainService,
    installAiServiceTestOverrides,
  } = await import('../../../services/aiService');

  installAiServiceTestOverrides({
    textProvider: text,
    directorTextProvider: text,
    validationTextProvider: text,
    imageProvider: image,
    complexImageProvider: image,
    mapTileImageProvider: image,
    turnaroundImageProvider: turnaroundImage,
    llmTurnaroundImageProvider: llmTurnaroundImage,
    environmentImageProvider: image,
    audioProvider: audio,
    alignmentProvider: alignment,
  });

  try {
    const storyDomain = getStoryDomainService();
    const story = await storyDomain.generateTextPlain(STORY_SPEC);
    assert.equal(story.title, 'The Lantern Path');
    assert.equal(story.scenes.length, 2);

    const director = await storyDomain.callDirector({
      blocks: [
        {
          blockIndex: 0,
          sceneStart: 1,
          sceneEnd: 2,
          blockText: story.fullText,
        },
      ],
      imagesPerStory: 1,
      spec: STORY_SPEC,
      userCharacters: [],
    });
    assert.equal(director.illustrations.length, 1);
    assert.equal(director.mapTile.description, MOCK_MAP_TILE_BRIEF.description);

    const mapTileBrief = await storyDomain.generateMapTileBrief({
      blocks: [
        {
          blockIndex: 0,
          sceneStart: 1,
          sceneEnd: 2,
          blockText: story.fullText,
        },
      ],
      imagesPerStory: 1,
      spec: STORY_SPEC,
      userCharacters: [],
    });
    assert.deepEqual(mapTileBrief, {
      description: MOCK_MAP_TILE_BRIEF.description,
      requiredFeatures: ['path'],
    });

    const validation = await storyDomain.validateScene(
      { sceneId: 1, text: story.scenes[0].text } as any,
      STORY_SPEC.policyProfile,
      false
    );
    assert.equal(validation.isValid, true);

    const batchValidation = await storyDomain.validateScenesBatch(
      story.scenes as any,
      STORY_SPEC.policyProfile
    );
    assert.deepEqual(batchValidation.failedScenes, MOCK_BATCH_VALIDATION.failedScenes);
    assert.equal(batchValidation.requestManifest?.operation, 'validateScene');

    const regenerated = await storyDomain.regenerateScenesBatch(
      STORY_SPEC,
      story.scenes.length,
      [{ sceneId: 1, originalText: story.scenes[0].text, feedback: 'Use calmer wording.' }]
    );
    assert.deepEqual(regenerated, MOCK_REGENERATED_SCENES.scenes);

    const imageDomain = new ImageDomainService(image);
    const tile = await imageDomain.generateMapTile({
      prompt: 'Draw the lantern path tile.',
      systemInstruction: 'Preserve the mask geometry.',
      maskImage: {
        buffer: Buffer.from('mask'),
        mimeType: 'image/png',
      },
    });
    assert.deepEqual(tile.imageData, mockGeneratedImage().imageData);

    const referenceTurnaround = await getTurnaroundImageDomainService().generateTurnaroundSheet({
      referenceImageBase64: Buffer.from('fixed-drawing').toString('base64'),
      referenceMimeType: 'image/png',
      characterName: 'Mira',
      characterDescription: 'A child wearing a red scarf.',
    });
    assert.deepEqual(referenceTurnaround.imageData, mockGeneratedImage().imageData);

    const textTurnaround =
      await getLlmTurnaroundImageDomainService().generateTurnaroundSheetFromDescription({
        characterName: 'Glowbug',
        characterDescription: 'A tiny round blue creature with two wings.',
      });
    assert.deepEqual(textTurnaround.imageData, mockGeneratedImage().imageData);

    const audioResult = await getAudioProvider().synthesize({
      text: 'Hello from the story.',
      voiceId: 'mock-narrator',
      language: 'en',
      outputFormat: 'mp3',
    });
    assert.deepEqual(audioResult.audioData, mockSynthesizedAudio().audioData);

    const alignmentResult = await getAlignmentProvider().generateAlignment({
      audioBuffer: audioResult.audioData,
      text: 'Hi',
      language: 'en',
      mimeType: 'audio/mpeg',
    });
    assert.deepEqual(alignmentResult, MOCK_ALIGNMENT);

    assert.equal(text.requests[0].request.operation, 'text_plain');
    assert.equal(image.requests[0].kind, 'generate');
    assert.equal((image.requests[0] as any).request.operation, 'image_map_tile');
    assert.equal(audio.requests[0].voiceId, 'mock-narrator');
    assert.equal(alignment.requests[0].text, 'Hi');

    text.assertExhausted();
    image.assertExhausted();
    turnaroundImage.assertExhausted();
    llmTurnaroundImage.assertExhausted();
    audio.assertExhausted();
    alignment.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
  }
}

async function testUnexpectedAiCallFailsClosed(): Promise<void> {
  const provider = new MockTextProvider();
  await assert.rejects(
    () =>
      provider.generateText({
        prompt: 'This request has no fixture.',
        operation: 'text_plain',
      }),
    /Unexpected text AI call/
  );
}

void (async () => {
  await testProductionDomainMethodsReceiveFixedMockResponses();
  await testUnexpectedAiCallFailsClosed();
  console.log('mock AI providers tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
