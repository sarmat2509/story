import assert from 'node:assert/strict';
import { GraphicNovelDomainService } from '../GraphicNovelDomainService';
import type { StorySpec } from '../../../ai/types';
import type { ITextProvider } from '../../../providers/base/ITextProvider';
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
} from '../../../providers/base/JsonSchema';

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
      description:
        'A bright stone hall with a long tapestry on the back wall and open floor space.',
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
                    description:
                      'standing left, pointing gently, curious expression, looking at the tapestry',
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
              setting:
                'A shallow magical pool appears on the floor for a gentle swimming crossing.',
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

const MOKHOVYK_SPEC: StorySpec = {
  ...SPEC,
  characters: [
    {
      id: 'creature-moss',
      name: 'Моховик',
      type: 'imaginary',
      role: 'friend',
      referencePhotos: [{ url: 'characters/mokhovyk.png' }],
      description:
        "Маленька істота з м'якого зеленого моху, крихітними очима і квіткою на маківці.",
    } as any,
    {
      id: 'child-1',
      name: 'Емілія',
      type: 'child',
      role: 'hero',
      referencePhotos: [{ url: 'characters/emilia.png' }],
      description: 'A curious reader.',
    } as any,
  ],
};

const MOKHOVYK_CONFLICT_SCRIPT = {
  title: 'Секретна мова велетенської черепахи',
  description: 'Friends travel on a giant tortoise shell.',
  language: 'uk',
  environments: [
    {
      id: 'env_shell_forest',
      name: 'Ліс на панцирі',
      description: 'A miniature forest growing atop a massive tortoise shell.',
    },
  ],
  outfits: [
    { id: 'mokhovyk_natural', characterName: 'Моховик', description: 'natural appearance' },
    { id: 'emilia_natural', characterName: 'Емілія', description: 'natural appearance' },
  ],
  pages: [
    {
      pageNumber: 1,
      pageRole: 'opening',
      panels: [
        {
          panelId: 'p1-1',
          dialogue: [],
          thoughts: [],
          caption: 'Моховик — найстаріша черепаха у світі.',
          visual: {
            environmentId: 'env_shell_forest',
            primaryRead: 'Mokhovyk the tortoise moves through clouds',
            sceneVisual: {
              setting: 'The giant tortoise moves through soft clouds.',
              lighting: 'warm sunrise',
              cameraComposition: {
                shot: 'wide shot',
                characters: [
                  {
                    name: 'Моховик',
                    position: 'center_background',
                    description: 'The giant tortoise is swimming through the sky.',
                    outfitId: 'mokhovyk_natural',
                  },
                ],
              },
            },
          },
        },
        {
          panelId: 'p1-2',
          dialogue: [{ speaker: 'Емілія', text: 'Ми маємо допомогти мешканцям лісу.' }],
          thoughts: [],
          visual: {
            environmentId: 'env_shell_forest',
            primaryRead: 'Emilia looks across the forest',
            sceneVisual: {
              setting: 'Emilia stands near tiny trees.',
              lighting: 'warm sunrise',
              cameraComposition: {
                shot: 'medium shot',
                characters: [
                  {
                    name: 'Емілія',
                    position: 'left_foreground',
                    description: 'looking gently toward the path',
                    outfitId: 'emilia_natural',
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

const MOKHOVYK_SAFE_SCRIPT = {
  ...MOKHOVYK_CONFLICT_SCRIPT,
  title: 'Секретна мова небесної черепахи',
  pages: [
    {
      ...MOKHOVYK_CONFLICT_SCRIPT.pages[0],
      panels: [
        {
          ...MOKHOVYK_CONFLICT_SCRIPT.pages[0].panels[0],
          caption: 'Небесна черепаха несла на собі цілий ліс.',
          visual: {
            ...MOKHOVYK_CONFLICT_SCRIPT.pages[0].panels[0].visual,
            primaryRead: 'sky tortoise carries a forest',
            sceneVisual: {
              ...MOKHOVYK_CONFLICT_SCRIPT.pages[0].panels[0].visual.sceneVisual,
              cameraComposition: {
                shot: 'wide shot',
                characters: [
                  {
                    name: 'Моховик',
                    position: 'left_foreground',
                    description: 'standing on the moss path, looking up with a thoughtful smile',
                    outfitId: 'mokhovyk_natural',
                  },
                ],
              },
            },
          },
        },
        MOKHOVYK_CONFLICT_SCRIPT.pages[0].panels[1],
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
      throw new Error(
        'Gemini structured generation failed: Content blocked by Gemini: PROHIBITED_CONTENT. Details: none'
      );
    }
    return SCRIPT_FIXTURE as T;
  }
}

class BadNameThenSucceedProvider implements ITextProvider {
  public requests: GenerateStructuredRequest[] = [];

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText should not be called');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.requests.push(request);
    return (this.requests.length === 1 ? MOKHOVYK_CONFLICT_SCRIPT : MOKHOVYK_SAFE_SCRIPT) as T;
  }
}

class ScriptTextValidationProvider implements ITextProvider {
  public requests: GenerateStructuredRequest[] = [];

  constructor(
    private results: Array<{ isValid: boolean; violations?: unknown[] }> = [{ isValid: true }]
  ) {}

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText should not be called');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.requests.push(request);
    const result = this.results[Math.min(this.requests.length - 1, this.results.length - 1)];
    return {
      sceneId: this.requests.length,
      isValid: result.isValid,
      violations: result.violations ?? [],
      correctedCameraComposition: null,
    } as T;
  }
}

async function testGraphicNovelScriptUsesSafetyFallbackAfterProviderBlock() {
  const provider = new BlockThenSucceedProvider();
  const validationProvider = new ScriptTextValidationProvider();
  const service = new GraphicNovelDomainService(provider, validationProvider);

  const script = await service.generateScript({ spec: SPEC, pageCount: 8 });

  assert.equal(script.title, 'Світла стрічка');
  assert.equal(script.pages.length, 8, 'normalization still fills the requested page count');
  assert.equal(provider.requests.length, 2);
  assert.equal(validationProvider.requests.length, 1);
  assert.equal(validationProvider.requests[0].operation, 'validateScene');
  assert.match(validationProvider.requests[0].prompt, /GRAPHIC_NOVEL_PAGE_SCRIPT_JSON/);
  assert.match(validationProvider.requests[0].prompt, /RESERVED CHARACTER IDENTITY VALIDATION/);
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
    assert.ok(emilia?.outfitId, 'human character keeps an outfitId');
    assert.ok(
      flash?.outfitId,
      'missing speaking character is added to visual characters with outfitId'
    );
    const emiliaOutfit = script.outfits?.find((outfit) => outfit.id === emilia.outfitId);
    const flashOutfit = script.outfits?.find((outfit) => outfit.id === flash.outfitId);
    assert.equal(
      emilia.outfitId,
      'o_emilia_jacket',
      'normalization preserves explicit LLM outfitId'
    );
    assert.equal(emiliaOutfit?.description, 'denim jacket, black shirt, patterned pants, sneakers');
    assert.equal(flashOutfit?.description, 'natural appearance');
  }
}

async function testGraphicNovelScriptRetriesWhenReservedCharacterNameIsReused() {
  const provider = new BadNameThenSucceedProvider();
  const validationProvider = new ScriptTextValidationProvider([
    {
      isValid: false,
      violations: [
        {
          category: 'reserved_character_identity_conflict',
          severity: 'high',
          message:
            'The reserved moss-creature character is semantically presented as the giant tortoise.',
          suggestion: 'Rename the giant tortoise or keep Моховик as the small moss creature.',
        },
      ],
    },
    { isValid: true },
  ]);
  const service = new GraphicNovelDomainService(provider, validationProvider);

  const script = await service.generateScript({ spec: MOKHOVYK_SPEC, pageCount: 2 });

  assert.equal(provider.requests.length, 2);
  assert.equal(validationProvider.requests.length, 2);
  assert.equal(provider.requests[0].operation, 'graphic_novel_script');
  assert.equal(provider.requests[1].operation, 'graphic_novel_script_safety_fallback');
  assert.equal(validationProvider.requests[0].operation, 'validateScene');
  assert.match(validationProvider.requests[0].prompt, /RESERVED CHARACTER IDENTITY VALIDATION/);
  assert.match(validationProvider.requests[0].prompt, /GRAPHIC_NOVEL_PAGE_SCRIPT_JSON/);
  assert.match(validationProvider.requests[0].prompt, /reserved_character_identity_conflict/);
  assert.match(validationProvider.requests[0].prompt, /MOKHOVYK|Моховик/i);
  assert.equal(script.title, 'Секретна мова небесної черепахи');

  const firstCharacter =
    script.pages[0].panels[0].visual.sceneVisual.cameraComposition;
  assert.notEqual(typeof firstCharacter, 'string');
  if (typeof firstCharacter !== 'string') {
    const mokhovyk = firstCharacter.characters.find((character) => character.name === 'Моховик');
    assert.match(mokhovyk?.description ?? '', /standing on the moss path/);
  }
}

async function run() {
  await testGraphicNovelScriptUsesSafetyFallbackAfterProviderBlock();
  await testGraphicNovelScriptRetriesWhenReservedCharacterNameIsReused();
  console.log('graphicNovelDomainService tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
