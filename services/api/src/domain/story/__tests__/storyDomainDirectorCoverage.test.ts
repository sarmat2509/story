import assert from 'node:assert/strict';
import type { StorySpec } from '../../../ai/types';
import type { ITextProvider } from '../../../providers/base/ITextProvider';
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
} from '../../../providers/base/JsonSchema';
import { StoryDomainService } from '../StoryDomainService';

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

function directorResult(...characters: Array<{ characterRef: string; name: string }>) {
  return {
    characters: characters.map((character) => ({
      ...character,
      type: 'person',
      description: 'Reference-defined character',
    })),
    environments: [{ id: 'room', name: 'Room', description: 'A bright room.' }],
    outfits: characters.map((character, index) => ({
      id: `outfit-${index}`,
      characterRef: character.characterRef,
      characterName: character.name,
      description: 'Simple clothes.',
    })),
    mapTile: { description: 'A bright room and a path.', requiredFeatures: ['path'] },
    illustrations: [
      {
        environmentId: 'room',
        primaryRead: 'Friends celebrate together',
        sceneVisual: {
          setting: 'A bright room.',
          cameraComposition: {
            shot: 'Medium-wide group shot.',
            characters: characters.map((character, index) => ({
              ...character,
              description: 'Smiling toward the group.',
              outfitId: `outfit-${index}`,
            })),
          },
          lighting: 'Soft daylight.',
        },
      },
    ],
  };
}

class DirectorStubProvider implements ITextProvider {
  readonly prompts: string[] = [];

  constructor(private readonly results: unknown[]) {}

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText must not be called');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.prompts.push(request.prompt);
    const result = this.results.shift();
    if (!result) throw new Error('No Director fixture remains');
    return result as T;
  }
}

const params = {
  blocks: [
    {
      blockIndex: 0,
      sceneStart: 1,
      sceneEnd: 3,
      blockText: 'Emily and Roma prepare a celebration together.',
    },
  ],
  imagesPerStory: 1,
  spec: STORY_SPEC,
  userCharacters: [
    { id: 'emily-id', name: 'Emily' },
    { id: 'roma-id', name: 'Roma' },
  ],
};

async function testDirectorRetriesMissingSelectedCharacter() {
  const provider = new DirectorStubProvider([
    directorResult(
      { characterRef: 'emily-id', name: 'Emily' },
      { characterRef: 'NEW_CH_1', name: 'Neighbor' }
    ),
    directorResult(
      { characterRef: 'emily-id', name: 'Emily' },
      { characterRef: 'roma-id', name: 'Roma' }
    ),
  ]);
  const domain = new StoryDomainService(provider, provider, provider);

  const result = await domain.callDirector(params);

  assert.equal(provider.prompts.length, 2);
  assert.match(provider.prompts[1], /CORRECTION REQUIRED — SELECTED CHARACTERS WERE OMITTED/);
  assert.match(provider.prompts[1], /Roma \(roma-id\)/);
  assert.equal(result.illustrations[0].sceneVisual.cameraComposition.characters.length, 2);
}

async function testDirectorFailsClosedAfterInvalidRetry() {
  const provider = new DirectorStubProvider([
    directorResult(
      { characterRef: 'emily-id', name: 'Emily' },
      { characterRef: 'NEW_CH_1', name: 'Neighbor' }
    ),
    directorResult(
      { characterRef: 'emily-id', name: 'Emily' },
      { characterRef: 'NEW_CH_1', name: 'Neighbor' }
    ),
  ]);
  const domain = new StoryDomainService(provider, provider, provider);

  await assert.rejects(
    () => domain.callDirector(params),
    /Selected characters are missing from the Director image plan: Roma \(roma-id\)/
  );
  assert.equal(provider.prompts.length, 2);
}

void (async () => {
  await testDirectorRetriesMissingSelectedCharacter();
  await testDirectorFailsClosedAfterInvalidRetry();
  console.log('storyDomainDirectorCoverage tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
