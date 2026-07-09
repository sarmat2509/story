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

const OVERCROWDED_PANEL_SCRIPT = {
  ...SCRIPT_FIXTURE,
  title: 'Занадто багато героїв',
  pages: [
    {
      pageNumber: 1,
      pageRole: 'opening',
      panels: [
        {
          panelId: 'p1-1',
          dialogue: [
            { speaker: 'Емілія', text: 'Друзі, подивіться на нитку!' },
            { speaker: 'Флеш', text: 'Вона показує нам новий шлях.' },
          ],
          thoughts: [],
          visual: {
            environmentId: 'env_hall',
            primaryRead: 'too many heroes gather',
            sceneVisual: {
              setting: 'Five named heroes crowd around the glowing tapestry.',
              lighting: 'warm morning light',
              cameraComposition: {
                shot: 'wide group shot',
                characters: ['Емілія', 'Флеш', 'Міра', 'Тік', 'Лео'].map((name, index) => ({
                  name,
                  position: `slot_${index}`,
                  description: 'visible in the group with a readable reaction',
                  outfitId: name === 'Емілія' ? 'o_emilia_jacket' : `o_${index}`,
                })),
              },
            },
          },
        },
        {
          panelId: 'p1-2',
          dialogue: [{ speaker: 'Емілія', text: 'Спершу підемо маленькою командою.' }],
          thoughts: [],
          visual: {
            environmentId: 'env_hall',
            primaryRead: 'Emilia chooses a smaller team',
            sceneVisual: {
              setting: 'Emilia points toward the calmer doorway.',
              lighting: 'warm morning light',
              cameraComposition: {
                shot: 'medium shot',
                characters: [
                  {
                    name: 'Емілія',
                    position: 'center_foreground',
                    description: 'pointing gently toward the doorway',
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

const STORM_SCRIPT = {
  title: 'Безпечне світло',
  description: 'Friends learn to stay safe during a storm.',
  language: 'uk',
  environments: [
    {
      id: 'env_room',
      name: 'Safe Room',
      description: 'A warm room with a wide window and a soft rug.',
    },
  ],
  outfits: [
    {
      id: 'o_emilia_jacket',
      characterName: 'Емілія',
      description: 'denim jacket, black shirt, patterned pants, sneakers',
    },
    { id: 'o_flash_natural', characterName: 'Флеш', description: 'natural appearance' },
  ],
  pages: [
    {
      pageNumber: 1,
      pageRole: 'opening',
      panels: [
        {
          panelId: 'p1-1',
          dialogue: [
            { speaker: 'Емілія', text: 'Шторм наближається, я сама побіжу в сад!' },
            { speaker: 'Флеш', text: 'Я полечу за тобою просто зараз.' },
          ],
          thoughts: [],
          visual: {
            environmentId: 'env_room',
            primaryRead: 'Emilia runs toward storm',
            sceneVisual: {
              setting: 'The door is open and the storm is visible outside.',
              lighting: 'stormy blue light',
              cameraComposition: {
                shot: 'medium shot',
                characters: [
                  {
                    name: 'Емілія',
                    position: 'left_foreground',
                    description: 'running toward the open door with urgent expression',
                    outfitId: 'o_emilia_jacket',
                  },
                  {
                    name: 'Флеш',
                    position: 'right_midground',
                    description: 'hovering after Emilia with worried eyes',
                    outfitId: 'o_flash_natural',
                  },
                ],
              },
            },
          },
        },
        {
          panelId: 'p1-2',
          dialogue: [{ speaker: 'Емілія', text: 'Я швидко все виправлю надворі.' }],
          thoughts: [],
          visual: {
            environmentId: 'env_room',
            primaryRead: 'Emilia reaches doorway',
            sceneVisual: {
              setting: 'Rain blows near the doorway.',
              lighting: 'stormy blue light',
              cameraComposition: {
                shot: 'wide shot',
                characters: [
                  {
                    name: 'Емілія',
                    position: 'center_foreground',
                    description: 'standing at the threshold, looking outside',
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

const STORM_REPAIRED_PAGE = {
  ...STORM_SCRIPT.pages[0],
  panels: [
    {
      ...STORM_SCRIPT.pages[0].panels[0],
      dialogue: [
        { speaker: 'Емілія', text: 'Шторм сильний, тож ми залишимося біля вікна.' },
        { speaker: 'Флеш', text: 'Я покличу дорослих, а ми спостерігатимемо звідси.' },
      ],
      visual: {
        ...STORM_SCRIPT.pages[0].panels[0].visual,
        primaryRead: 'Emilia stays safely inside',
        sceneVisual: {
          ...STORM_SCRIPT.pages[0].panels[0].visual.sceneVisual,
          setting: 'The door is closed; the storm is safely watched through the window.',
          cameraComposition: {
            shot: 'medium shot',
            characters: STORM_SCRIPT.pages[0].panels[0].visual.sceneVisual.cameraComposition.characters,
          },
        },
      },
    },
    {
      ...STORM_SCRIPT.pages[0].panels[1],
      dialogue: [{ speaker: 'Емілія', text: 'Почекаємо тут, поки надворі стане спокійно.' }],
      visual: {
        ...STORM_SCRIPT.pages[0].panels[1].visual,
        primaryRead: 'friends wait by window',
        sceneVisual: {
          ...STORM_SCRIPT.pages[0].panels[1].visual.sceneVisual,
          setting: 'Emilia and Flash sit on the rug away from the window.',
          cameraComposition: {
            shot: 'wide shot',
            characters: STORM_SCRIPT.pages[0].panels[0].visual.sceneVisual.cameraComposition.characters,
          },
        },
      },
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
    if (request.operation === 'graphic_novel_page_repair') {
      return { page: MOKHOVYK_SAFE_SCRIPT.pages[0] } as T;
    }
    return MOKHOVYK_CONFLICT_SCRIPT as T;
  }
}

class OvercrowdedPanelThenSucceedProvider implements ITextProvider {
  public requests: GenerateStructuredRequest[] = [];

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText should not be called');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.requests.push(request);
    return (this.requests.length === 1 ? OVERCROWDED_PANEL_SCRIPT : SCRIPT_FIXTURE) as T;
  }
}

class StormPageRepairProvider implements ITextProvider {
  public requests: GenerateStructuredRequest[] = [];

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText should not be called');
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.requests.push(request);
    if (request.operation === 'graphic_novel_page_repair') {
      return { page: STORM_REPAIRED_PAGE } as T;
    }
    return STORM_SCRIPT as T;
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
  assert.ok(script.outfits?.length, 'graphic novel script keeps outfit rows for dressed turnarounds');

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

  const fallbackPageCharacters = script.pages[1].panels[0].visual.sceneVisual.cameraComposition;
  assert.notEqual(typeof fallbackPageCharacters, 'string');
  if (typeof fallbackPageCharacters !== 'string') {
    assert.ok(
      fallbackPageCharacters.characters.some((character) => character.name === 'Емілія'),
      'normalization fallback pages keep the child anchor visible'
    );
  }
}

async function testGraphicNovelScriptRepairsPageWhenReservedCharacterNameIsReused() {
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
  assert.equal(provider.requests[1].operation, 'graphic_novel_page_repair');
  assert.match(provider.requests[1].prompt, /reserved moss-creature character/);
  assert.equal(validationProvider.requests[0].operation, 'validateScene');
  assert.match(validationProvider.requests[0].prompt, /RESERVED CHARACTER IDENTITY VALIDATION/);
  assert.match(validationProvider.requests[0].prompt, /GRAPHIC_NOVEL_PAGE_SCRIPT_JSON/);
  assert.match(validationProvider.requests[0].prompt, /reserved_character_identity_conflict/);
  assert.match(validationProvider.requests[0].prompt, /MOKHOVYK|Моховик/i);

  const firstCharacter =
    script.pages[0].panels[0].visual.sceneVisual.cameraComposition;
  assert.notEqual(typeof firstCharacter, 'string');
  if (typeof firstCharacter !== 'string') {
    const mokhovyk = firstCharacter.characters.find((character) => character.name === 'Моховик');
    assert.match(mokhovyk?.description ?? '', /standing on the moss path/);
  }
}

async function testGraphicNovelScriptRetriesWhenPanelCastExceedsLimit() {
  const provider = new OvercrowdedPanelThenSucceedProvider();
  const validationProvider = new ScriptTextValidationProvider();
  const service = new GraphicNovelDomainService(provider, validationProvider);

  const script = await service.generateScript({ spec: SPEC, pageCount: 8 });

  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[0].operation, 'graphic_novel_script');
  assert.equal(provider.requests[1].operation, 'graphic_novel_script_safety_fallback');
  assert.equal(
    validationProvider.requests.length,
    1,
    'overcrowded panel primary script is rejected before LLM text validation'
  );
  assert.equal(script.title, 'Світла стрічка');
}

async function testGraphicNovelScriptRepairsFailedPageBeforeWholeFallback() {
  const provider = new StormPageRepairProvider();
  const validationProvider = new ScriptTextValidationProvider([
    {
      isValid: false,
      violations: [
        {
          category: 'content_policy',
          severity: 'medium',
          message:
            'A strong storm is approaching, and the child decides to run outside alone.',
          suggestion: 'Keep the child sheltered and ask for help.',
        },
      ],
    },
    { isValid: true },
  ]);
  const service = new GraphicNovelDomainService(provider, validationProvider);

  const script = await service.generateScript({ spec: SPEC, pageCount: 1 });

  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[0].operation, 'graphic_novel_script');
  assert.equal(provider.requests[1].operation, 'graphic_novel_page_repair');
  assert.match(provider.requests[1].prompt, /A strong storm is approaching/);
  assert.equal(validationProvider.requests.length, 2);
  assert.equal(script.pages[0].panels[0].dialogue[0].text, 'Шторм сильний, тож ми залишимося біля вікна.');
}

async function run() {
  await testGraphicNovelScriptUsesSafetyFallbackAfterProviderBlock();
  await testGraphicNovelScriptRepairsPageWhenReservedCharacterNameIsReused();
  await testGraphicNovelScriptRetriesWhenPanelCastExceedsLimit();
  await testGraphicNovelScriptRepairsFailedPageBeforeWholeFallback();
  console.log('graphicNovelDomainService tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
