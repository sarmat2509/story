import assert from 'node:assert/strict';
import { GraphicNovelDomainService } from '../GraphicNovelDomainService';
import type { StorySpec } from '../../../ai/types';
import type { ITextProvider } from '../../../providers/base/ITextProvider';
import type { GenerateStructuredRequest, GenerateTextRequest } from '../../../providers/base/JsonSchema';

const SPEC: StorySpec = {
  language: 'uk',
  ageGroup: '6-8',
  goal: 'kindness',
  goalName: 'Kindness',
  characters: [
    {
      id: 'child-1',
      name: 'Емілія',
      type: 'child',
      role: 'hero',
      referencePhotos: [{ url: 'characters/emilia.png' }],
      description: 'A curious reader.',
    } as any,
    {
      id: 'creature-1',
      name: 'Флеш',
      type: 'imaginary',
      role: 'friend',
      referencePhotos: [{ url: 'characters/flash.png' }],
      description: 'A tiny friendly flying companion.',
    } as any,
  ],
  policyProfile: {
    ageGroup: '6-8',
    language: 'uk',
    allowedConflicts: [],
    constraints: {
      mustHaveHappyEnding: true,
      noShamingLanguage: true,
    },
    readability: {
      maxSentenceLen: 18,
      targetWordsRange: [750, 1200],
      dialogRatio: 0.8,
    },
    promptGuidelines: '',
  },
  scenarioCard: {
    id: 'medieval_heroes',
    name: 'Medieval Heroes',
    description: 'A gentle medieval adventure.',
    promptGuidance: 'A tapestry in the great hall begins to change.',
  },
};

const SCRIPT_FIXTURE = {
  title: 'Світла стрічка',
  description: 'A warm dialogue-led illustrated story.',
  language: 'uk',
  environments: [
    {
      id: 'env_hall',
      name: 'Great Hall',
      description: 'A bright stone hall with a long tapestry on the back wall and open floor space.',
    },
  ],
  outfits: [
    {
      id: 'o_emilia_jacket',
      characterName: 'Емілія',
      description: 'denim jacket, black shirt, patterned pants, sneakers',
    },
  ],
  pages: [
    {
      pageNumber: 1,
      pageRole: 'opening',
      panels: [
        {
          panelId: 'p1-1',
          dialogue: [
            { speaker: 'Емілія', text: 'Флеше, дивись, нитка на гобелені сяє!' },
            { speaker: 'Флеш', text: 'Тоді ходімо тихенько і роздивімося ближче.' },
          ],
          thoughts: [],
          visual: {
            environmentId: 'env_hall',
            primaryRead: 'glowing thread appears',
            sceneVisual: {
              setting: 'A single thread glows on the tapestry.',
              lighting: 'warm morning light',
              cameraComposition: {
                shot: 'medium two-shot, eye level',
                characters: [
                  {
                    name: 'Емілія',
                    position: 'left_foreground',
                    description: 'standing left, pointing gently, curious expression, looking at the tapestry',
                  },
                  {
                    name: 'Флеш',
                    position: 'right_midground',
                    description: 'hovering right, leaning forward, bright curious expression',
                  },
                ],
              },
            },
          },
        },
        {
          panelId: 'p1-2',
          dialogue: [
            { speaker: 'Емілія', text: 'Я переодягнулася і можу переплисти тиху воду.' },
            { speaker: 'Флеш', text: 'Я полечу поруч і підсвічу шлях.' },
          ],
          thoughts: [],
          visual: {
            environmentId: 'env_hall',
            primaryRead: 'Emilia swims across shallow water',
            sceneVisual: {
              setting: 'A shallow magical pool appears on the floor for a gentle swimming crossing.',
              lighting: 'soft golden light',
              cameraComposition: {
                shot: 'wide shot, eye level',
                characters: [
                  {
                    name: 'Емілія',
                    position: 'center_foreground',
                    description: 'standing near the doorway, hopeful expression, one hand open',
                    outfitId: 'o_emilia_jacket',
                  },
                ],
              },
            },
          },
        },
      ],
    },
  ],
} as any;

class BlockThenSucceedProvider implements ITextProvider {
  public requests: GenerateStructuredRequest[] = [];

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText should not be called');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.requests.push(request);
    if (this.requests.length === 1) {
      throw new Error('Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT. Details: none');
    }
    return SCRIPT_FIXTURE as T;
  }
}

async function testGraphicNovelScriptUsesSafetyFallbackAfterProviderBlock() {
  const provider = new BlockThenSucceedProvider();
  const service = new GraphicNovelDomainService(provider);

  const script = await service.generateScript({ spec: SPEC, pageCount: 8 });

  assert.equal(script.title, 'Світла стрічка');
  assert.equal(script.pages.length, 8, 'normalization still fills the requested page count');
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[0].operation, 'graphic_novel_script');
  assert.equal(provider.requests[1].operation, 'graphic_novel_script_safety_fallback');
  assert.match(provider.requests[0].prompt, /Емілія \(person, role: hero, visual reference: yes\)/);
  assert.doesNotMatch(provider.requests[0].prompt, /\(child[,)]/);
  assert.doesNotMatch(provider.requests[0].prompt, /face\/mouth\/head/);
  assert.doesNotMatch(provider.requests[0].prompt, /anchor/);
  assert.doesNotMatch(provider.requests[0].prompt, /speechTarget/);
  assert.match(provider.requests[1].prompt, /SAFETY AND TONE/);
  assert.match(provider.requests[1].prompt, /Емілія \(person, role: hero\)/);
  assert.doesNotMatch(provider.requests[1].prompt, /\(child[,)]/);
  assert.doesNotMatch(provider.requests[1].prompt, /anchor/);
  assert.doesNotMatch(provider.requests[1].prompt, /speechTarget/);
  assert.doesNotMatch(provider.requests[1].prompt, /Bad for a referenced child/);

  const panelTwoCharacters = script.pages[0].panels[1].visual.sceneVisual.cameraComposition;
  assert.notEqual(typeof panelTwoCharacters, 'string');
  if (typeof panelTwoCharacters !== 'string') {
    const emilia = panelTwoCharacters.characters.find((character) => character.name === 'Емілія');
    const flash = panelTwoCharacters.characters.find((character) => character.name === 'Флеш');
    assert.ok(emilia?.outfitId, 'human swimmer gets an outfitId');
    assert.ok(flash?.outfitId, 'missing speaking character is added to visual characters with outfitId');
    const emiliaOutfit = script.outfits?.find((outfit) => outfit.id === emilia.outfitId);
    const flashOutfit = script.outfits?.find((outfit) => outfit.id === flash.outfitId);
    assert.notEqual(emilia.outfitId, 'o_emilia_jacket', 'swimming human panel overrides stale non-swim outfit');
    assert.match(emiliaOutfit?.description || '', /swimwear/i);
    assert.equal(flashOutfit?.description, 'natural appearance');
  }
}

async function run() {
  await testGraphicNovelScriptUsesSafetyFallbackAfterProviderBlock();
  console.log('graphicNovelDomainService tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
