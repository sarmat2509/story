import assert from 'node:assert';
import type { StorySpec } from '../../../ai/types';
import { MockTextProvider } from '../../../testing/ai';
import {
  GRAPHIC_NOVEL_LINE_MAX_CHARS,
  graphicNovelPanelCountRange,
} from '../../../prompts/text';
import {
  GRAPHIC_NOVEL_PAGE_SIZE,
  planGraphicNovelLayouts,
} from '../../graphicNovel';
import { buildMixedStoryTextManifest } from '../../../services/graphicNovelOrchestrationService';
import { imageJobTypeForGenerationKind } from '../../../services/generationKindRouting';
import { getIllustrationBlockStartSceneIds } from '../../../services/storyOrchestration/utilities';
import {
  MixedStoryDomainService,
  MixedStoryScriptValidationError,
  mixedStoryComicPages,
  normalizeMixedStoryScript,
} from '../MixedStoryDomainService';
import type { MixedStoryScript } from '../types';

const STATIC_SPEC: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  characters: [
    {
      id: 'mira-id',
      characterRef: 'mira-id',
      name: 'Mira',
      type: 'child',
      description: 'A curious reader.',
      role: 'hero',
    } as any,
  ],
  policyProfile: {
    ageGroup: '6-8',
    language: 'en',
    allowedConflicts: [],
    constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
    readability: { maxSentenceLen: 18, targetWordsRange: [500, 800], dialogRatio: 0.5 },
    promptGuidelines: '',
  },
  goalName: 'Courage',
  goalGuidance: 'Show a small brave choice.',
};

function specForAge(ageGroup: string): StorySpec {
  return {
    ...STATIC_SPEC,
    ageGroup,
    policyProfile: {
      ...STATIC_SPEC.policyProfile,
      ageGroup,
    },
  };
}

function panel(pageNumber: number, panelNumber: number, text: string) {
  return {
    panelId: `m${pageNumber}-${panelNumber}`,
    dialogue: [{ characterRef: 'mira-id', speaker: 'Mira', text }],
    thoughts: [],
    visual: {
      environmentId: 'env_main',
      primaryRead: `Beat ${pageNumber}-${panelNumber}`,
      sceneVisual: {
        setting: 'A cozy path with one visible story clue.',
        lighting: 'warm clear light',
        cameraComposition: {
          shot: 'medium shot, eye level',
          characters: [
            {
              characterRef: 'mira-id',
              name: 'Mira',
              position: 'left_foreground',
              description: 'looking toward the clue with a readable curious expression',
              outfitId: 'o_mira',
            },
          ],
        },
      },
    },
  };
}

function rawScript(
  comicCount: number,
  sceneCount = 8,
  comicSceneIds = getIllustrationBlockStartSceneIds(sceneCount, comicCount),
  panelCount = 4
): MixedStoryScript {
  const comicPageBySceneId = new Map<number, number>();
  comicSceneIds.slice(0, comicCount).forEach((sceneId, index) => {
    comicPageBySceneId.set(sceneId, index + 1);
  });

  return {
    title: 'The Mixed Path',
    description: 'A mixed prose and comic story.',
    language: 'en',
    characters: [
      {
        characterRef: 'mira-id',
        name: 'Mira',
        type: 'human',
        description: 'A curious reader.',
      },
    ],
    environments: [
      {
        id: 'env_main',
        name: 'Path',
        description: 'A friendly path with soft grass and clear open space.',
      },
    ],
    outfits: [
      {
        id: 'o_mira',
        characterRef: 'mira-id',
        characterName: 'Mira',
        description: 'everyday play clothes',
      },
    ],
    readingBlocks: Array.from({ length: sceneCount }, (_, index) => {
      const sceneId = index + 1;
      const page = comicPageBySceneId.get(sceneId);
      if (page) {
        return {
          kind: 'comic' as const,
          screenOrder: sceneId,
          sceneId,
          comicPageNumber: page,
          panels: Array.from({ length: panelCount }, (_, panelIndex) =>
            panel(page, panelIndex + 1, `Comic ${page} panel ${panelIndex + 1} text`)
          ),
        };
      }
      return {
        kind: 'prose' as const,
        screenOrder: sceneId,
        sceneIds: [sceneId],
        text: `Prose scene ${sceneId} text carries the story forward.`,
      };
    }),
  };
}

function badComicTextOnlyScript(): MixedStoryScript {
  const raw = rawScript(3);
  const firstBlock = raw.readingBlocks[0] as any;
  delete firstBlock.panels;
  firstBlock.text = 'Mira notices the clue, but this prose was incorrectly placed inside a comic block.';
  return raw;
}

function ukrainianScript(): MixedStoryScript {
  const raw = rawScript(3);
  raw.language = 'uk';
  raw.title = 'Таємна стежка';
  raw.description = 'Мішана історія з коміксами й прозою.';
  raw.characters![0].name = 'Міра';
  raw.outfits = [
    {
      id: 'o_mira',
      characterRef: 'mira-id',
      characterName: 'Міра',
      description: 'everyday play clothes',
    },
  ];
  for (const block of raw.readingBlocks) {
    if (block.kind === 'comic') {
      for (const panelScript of block.panels) {
        panelScript.dialogue = [
          { characterRef: 'mira-id', speaker: 'Міра', text: 'Я бачу знак!' },
        ];
        const composition = panelScript.visual.sceneVisual.cameraComposition;
        if (typeof composition !== 'string') {
          composition.characters = composition.characters.map((character) => ({
            ...character,
            name: 'Міра',
          }));
        }
      }
    } else {
      block.text = 'Міра спокійно йде далі, уважно дивиться на дорогу і радіє, що друзі поруч.';
    }
  }
  return raw;
}

class FakeTextProvider extends MockTextProvider {
  constructor(responses: MixedStoryScript[]) {
    super(
      responses.map((response, index) => ({
        kind: 'structured' as const,
        operation: index === 0 ? 'mixed_story_script' : 'mixed_story_script_retry',
        response,
      }))
    );
  }
}

async function testComicCountAndSceneOrder() {
  const sceneCount = 8;
  const imagesPerStory = 5;
  const comicSceneIds = getIllustrationBlockStartSceneIds(sceneCount, imagesPerStory);
  const { script } = normalizeMixedStoryScript({
    raw: rawScript(imagesPerStory),
    spec: STATIC_SPEC,
    sceneCount,
    comicSceneIds,
    comicBlockCount: imagesPerStory,
  });

  assert.strictEqual(script.readingBlocks.filter((block) => block.kind === 'comic').length, 5);
  assert.strictEqual(script.readingBlocks.length, sceneCount);
  assert.strictEqual(script.readingBlocks[0].kind, 'comic');
  const comicSceneSet = new Set(comicSceneIds);
  script.readingBlocks.forEach((block, index) => {
    const sceneId = index + 1;
    assert.strictEqual(block.screenOrder, index + 1);
    assert.strictEqual(block.kind, comicSceneSet.has(sceneId) ? 'comic' : 'prose');
    if (block.kind === 'comic') {
      assert.strictEqual(block.sceneId, sceneId);
    } else {
      assert.deepStrictEqual(block.sceneIds, [sceneId]);
    }
  });

  const coveredSceneIds = new Set<number>();
  for (const block of script.readingBlocks) {
    if (block.kind === 'comic') coveredSceneIds.add(block.sceneId);
    else block.sceneIds.forEach((sceneId) => coveredSceneIds.add(sceneId));
  }
  for (let sceneId = 1; sceneId <= sceneCount; sceneId += 1) {
    assert.ok(coveredSceneIds.has(sceneId), `scene ${sceneId} preserved in reading blocks`);
  }
}

async function testDisplayTextEqualsAudioOrderText() {
  const sceneCount = 8;
  const imagesPerStory = 3;
  const comicSceneIds = getIllustrationBlockStartSceneIds(sceneCount, imagesPerStory);
  const { script } = normalizeMixedStoryScript({
    raw: rawScript(imagesPerStory),
    spec: STATIC_SPEC,
    sceneCount,
    comicSceneIds,
    comicBlockCount: imagesPerStory,
  });
  const plannedPages = planGraphicNovelLayouts({
    ageGroup: STATIC_SPEC.ageGroup,
    pages: mixedStoryComicPages(script),
    outfits: script.outfits,
  });
  const manifest = buildMixedStoryTextManifest({ script, plannedPages });

  assert.deepStrictEqual(
    manifest.scenes.map((scene) => scene.mixedStoryBlockKind),
    ['comic', 'prose', 'prose', 'comic', 'prose', 'prose', 'comic', 'prose']
  );
  assert.strictEqual(
    manifest.scenes.filter((scene) => scene.mixedStoryBlockKind === 'prose').length,
    5
  );
  assert.strictEqual(
    manifest.fullText,
    manifest.scenes.map((scene) => scene.text).join('\n\n'),
    'fullText must be the exact ordered screen/audio text'
  );
  assert.ok(manifest.scenes[0].text.includes('Comic 1 panel 1 text'));
  assert.ok(manifest.scenes[1].text.includes('Prose scene 2 text'));
  assert.deepStrictEqual(
    manifest.readingOrder.map((entry) => entry.screenOrder),
    [1, 2, 3, 4, 5, 6, 7, 8]
  );
}

async function testComicBubbleLimitRepair() {
  const longText = 'A'.repeat(GRAPHIC_NOVEL_LINE_MAX_CHARS + 25);
  const raw = rawScript(3);
  const firstComic = raw.readingBlocks[0];
  assert.strictEqual(firstComic.kind, 'comic');
  firstComic.panels[0].dialogue[0].text = longText;

  const { script, repairs } = normalizeMixedStoryScript({
    raw,
    spec: STATIC_SPEC,
    sceneCount: 8,
    comicSceneIds: getIllustrationBlockStartSceneIds(8, 3),
    comicBlockCount: 3,
  });
  const firstBlock = script.readingBlocks[0];
  assert.strictEqual(firstBlock.kind, 'comic');
  assert.ok(firstBlock.panels[0].dialogue[0].text.length <= GRAPHIC_NOVEL_LINE_MAX_CHARS);
  assert.ok(repairs.some((repair) => repair.path.includes('.text')));
}

async function testRejectsComicTextWithoutPanels() {
  assert.throws(
    () => normalizeMixedStoryScript({
      raw: badComicTextOnlyScript(),
      spec: STATIC_SPEC,
      sceneCount: 8,
      comicSceneIds: getIllustrationBlockStartSceneIds(8, 3),
      comicBlockCount: 3,
    }),
    (error) =>
      error instanceof MixedStoryScriptValidationError &&
      error.issues.some((issue) => issue.path.includes('.panels')) &&
      error.issues.some((issue) => issue.message.includes('Comic block contains prose text'))
  );
}

async function testRejectsOffTopicOrWrongLanguageProse() {
  const spec: StorySpec = {
    ...STATIC_SPEC,
    language: 'uk',
    characters: [
      {
        name: 'Міра',
        type: 'child',
        description: 'Уважна читачка.',
        role: 'hero',
      } as any,
    ],
    policyProfile: {
      ...STATIC_SPEC.policyProfile,
      language: 'uk',
    },
  };
  const raw = ukrainianScript();
  const firstProse = raw.readingBlocks[1];
  assert.strictEqual(firstProse.kind, 'prose');
  firstProse.text =
    'The 2021 Climate Risk Analysis (DCRA) provides a framework for the department to understand and manage climate-related national security planning.';

  assert.throws(
    () => normalizeMixedStoryScript({
      raw,
      spec,
      sceneCount: 8,
      comicSceneIds: getIllustrationBlockStartSceneIds(8, 3),
      comicBlockCount: 3,
    }),
    (error) =>
      error instanceof MixedStoryScriptValidationError &&
      error.issues.some((issue) => issue.message.includes('requested language uk')) &&
      error.issues.some((issue) => issue.message.includes('off-topic'))
  );
}

async function testRejectsPlaceholderComicBubble() {
  const raw = rawScript(3);
  const firstComic = raw.readingBlocks[0];
  assert.strictEqual(firstComic.kind, 'comic');
  firstComic.panels[0].dialogue = [{ speaker: 'Hero', text: 'Look!' }];
  firstComic.panels[0].visual.primaryRead = 'Characters notice a new clue';

  assert.throws(
    () => normalizeMixedStoryScript({
      raw,
      spec: STATIC_SPEC,
      sceneCount: 8,
      comicSceneIds: getIllustrationBlockStartSceneIds(8, 3),
      comicBlockCount: 3,
    }),
    (error) =>
      error instanceof MixedStoryScriptValidationError &&
      error.issues.some((issue) => issue.message.includes('generic placeholder speaker')) &&
      error.issues.some((issue) => issue.message.includes('generic placeholder visual read'))
  );
}

async function testAllowsReferenceLabelsOnlyInVisualFields() {
  const raw = rawScript(3);
  const firstComic = raw.readingBlocks[0];
  assert.strictEqual(firstComic.kind, 'comic');
  firstComic.panels[0].visual.primaryRead = 'REF_CH_MIRA_ABC123 finds the clue';
  firstComic.panels[0].visual.sceneVisual.setting =
    'REF_CH_MIRA_ABC123 kneels beside the glowing clue';
  const composition = firstComic.panels[0].visual.sceneVisual.cameraComposition;
  assert.notStrictEqual(composition, 'string');
  if (typeof composition !== 'string') {
    composition.characters[0].description =
      'left foreground, REF_CH_MIRA_ABC123 reaches toward the clue with clear focus';
  }

  const { script } = normalizeMixedStoryScript({
    raw,
    spec: STATIC_SPEC,
    sceneCount: 8,
    comicSceneIds: getIllustrationBlockStartSceneIds(8, 3),
    comicBlockCount: 3,
  });

  const normalizedFirstComic = script.readingBlocks[0];
  assert.strictEqual(normalizedFirstComic.kind, 'comic');
  assert.match(normalizedFirstComic.panels[0].visual.primaryRead, /REF_CH_MIRA_ABC123/);
}

async function testRejectsReferenceLabelsInReadableMixedText() {
  const raw = rawScript(3);
  raw.title = 'REF_CH_MIRA_ABC123 Adventure';
  raw.description = 'A story about REF_CH_MIRA_ABC123.';
  const firstComic = raw.readingBlocks[0];
  assert.strictEqual(firstComic.kind, 'comic');
  firstComic.panels[0].dialogue[0].speaker = 'REF_CH_MIRA_ABC123';
  firstComic.panels[0].dialogue[0].text = 'REF_CH_MIRA_ABC123 says hello.';
  firstComic.panels[0].caption = 'REF_CH_MIRA_ABC123 smiles.';
  const firstProse = raw.readingBlocks[1];
  assert.strictEqual(firstProse.kind, 'prose');
  firstProse.text = 'REF_CH_MIRA_ABC123 walks along the path with courage.';

  assert.throws(
    () =>
      normalizeMixedStoryScript({
        raw,
        spec: STATIC_SPEC,
        sceneCount: 8,
        comicSceneIds: getIllustrationBlockStartSceneIds(8, 3),
        comicBlockCount: 3,
      }),
    (error) =>
      error instanceof MixedStoryScriptValidationError &&
      error.issues.some((issue) => issue.path === 'title') &&
      error.issues.some((issue) => issue.path === 'description') &&
      error.issues.some((issue) => issue.path.includes('.dialogue[0].speaker')) &&
      error.issues.some((issue) => issue.path.includes('.dialogue[0].text')) &&
      error.issues.some((issue) => issue.path.includes('.caption')) &&
      error.issues.some((issue) => issue.path.includes('prose:2')) &&
      error.issues.every(
        (issue) =>
          !issue.message.includes('REF_CH') ||
          issue.message.includes('Readable mixed-story text')
      )
  );
}

async function testComicPanelCountUsesGraphicNovelAgeRules() {
  const sceneCount = 8;
  const comicBlockCount = 3;
  const comicSceneIds = getIllustrationBlockStartSceneIds(sceneCount, comicBlockCount);

  assert.throws(
    () => normalizeMixedStoryScript({
      raw: rawScript(comicBlockCount, sceneCount, comicSceneIds, 2),
      spec: STATIC_SPEC,
      sceneCount,
      comicSceneIds,
      comicBlockCount,
    }),
    (error) =>
      error instanceof MixedStoryScriptValidationError &&
      error.issues.some((issue) => issue.message.includes('fewer than 3 panels for age 6-8')) &&
      error.issues.some((issue) => issue.message.includes('requires at least 3 comic pages with 4-6 panels'))
  );

  const easierReadingLevel = normalizeMixedStoryScript({
    raw: rawScript(comicBlockCount, sceneCount, comicSceneIds, 2),
    spec: {
      ...STATIC_SPEC,
      storyComplexityAgeGroup: '2-3',
      storyComplexityAdjustment: -2,
    },
    sceneCount,
    comicSceneIds,
    comicBlockCount,
  });
  assert.ok(
    easierReadingLevel.script.readingBlocks
      .filter((block) => block.kind === 'comic')
      .every((block) => block.panels.length === 2)
  );

  const sixPanelOlder = normalizeMixedStoryScript({
    raw: rawScript(comicBlockCount, sceneCount, comicSceneIds, 6),
    spec: STATIC_SPEC,
    sceneCount,
    comicSceneIds,
    comicBlockCount,
  });
  assert.deepStrictEqual(
    sixPanelOlder.script.readingBlocks
      .filter((block) => block.kind === 'comic')
      .map((block) => block.panels.length),
    [6, 6, 6]
  );

  const youngerSpec = specForAge('2-3');
  const younger = normalizeMixedStoryScript({
    raw: rawScript(comicBlockCount, sceneCount, comicSceneIds, 2),
    spec: youngerSpec,
    sceneCount,
    comicSceneIds,
    comicBlockCount,
  });
  assert.deepStrictEqual(
    younger.script.readingBlocks
      .filter((block) => block.kind === 'comic')
      .map((block) => block.panels.length),
    [2, 2, 2]
  );
}

async function testMixedWriterRetriesInvalidScript() {
  const provider = new FakeTextProvider([badComicTextOnlyScript(), rawScript(3)]);
  const service = new MixedStoryDomainService(provider as any);
  const result = await service.generateScript({
    spec: STATIC_SPEC,
    sceneCount: 8,
    comicSceneIds: getIllustrationBlockStartSceneIds(8, 3),
    comicBlockCount: 3,
  });

  assert.strictEqual(result.script.readingBlocks.length, 8);
  assert.strictEqual(provider.requests.length, 2);
  const firstRequest = provider.requests[0].request as any;
  const retryRequest = provider.requests[1].request as any;
  assert.strictEqual(firstRequest.operation, 'mixed_story_script');
  assert.strictEqual(retryRequest.operation, 'mixed_story_script_retry');
  assert.match(retryRequest.prompt, /PREVIOUS ATTEMPT FAILED VALIDATION/);
  assert.match(retryRequest.prompt, /Comic block contains prose text/);
  assert.strictEqual(firstRequest.schema.properties.readingBlocks.minItems, 8);
  assert.strictEqual(firstRequest.schema.properties.readingBlocks.maxItems, 8);
  assert.strictEqual(
    firstRequest.schema.properties.readingBlocks.items.properties.panels.minItems,
    graphicNovelPanelCountRange(STATIC_SPEC.ageGroup).min
  );
  assert.strictEqual(
    firstRequest.schema.properties.readingBlocks.items.properties.panels.maxItems,
    graphicNovelPanelCountRange(STATIC_SPEC.ageGroup).max
  );
}

async function testMixedUsesTemplateGraphicNovelPages() {
  const sceneCount = 8;
  const comicBlockCount = 3;
  const comicSceneIds = getIllustrationBlockStartSceneIds(sceneCount, comicBlockCount);
  const { script } = normalizeMixedStoryScript({
    raw: rawScript(comicBlockCount, sceneCount, comicSceneIds, 4),
    spec: STATIC_SPEC,
    sceneCount,
    comicSceneIds,
    comicBlockCount,
  });
  const plannedPages = planGraphicNovelLayouts({
    ageGroup: STATIC_SPEC.ageGroup,
    pages: mixedStoryComicPages(script),
    outfits: script.outfits,
  });

  assert.strictEqual(plannedPages.length, comicBlockCount);
  for (const page of plannedPages) {
    assert.deepStrictEqual(page.pageSize, GRAPHIC_NOVEL_PAGE_SIZE);
    assert.strictEqual(page.template.templateFamily, 'graphic_novel_page');
    assert.ok(page.template.panelCount >= 4, 'age 6-8 mixed comic pages use dense graphic-novel layouts');
  }
}

async function testMixedSkipsOrdinaryImageBatch() {
  assert.strictEqual(imageJobTypeForGenerationKind('mixed_story'), 'graphic_novel_pages');
  assert.notStrictEqual(imageJobTypeForGenerationKind('mixed_story'), 'image_batch');
  assert.strictEqual(imageJobTypeForGenerationKind('story'), 'image_batch');
}

async function main() {
  await testComicCountAndSceneOrder();
  await testDisplayTextEqualsAudioOrderText();
  await testComicBubbleLimitRepair();
  await testRejectsComicTextWithoutPanels();
  await testRejectsOffTopicOrWrongLanguageProse();
  await testRejectsPlaceholderComicBubble();
  await testAllowsReferenceLabelsOnlyInVisualFields();
  await testRejectsReferenceLabelsInReadableMixedText();
  await testComicPanelCountUsesGraphicNovelAgeRules();
  await testMixedWriterRetriesInvalidScript();
  await testMixedUsesTemplateGraphicNovelPages();
  await testMixedSkipsOrdinaryImageBatch();
  console.log('mixedStoryDomain tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
