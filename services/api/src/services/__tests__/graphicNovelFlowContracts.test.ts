import assert from 'node:assert/strict';
import { CreateStoryRequestSchema } from '@wondertales/shared';
import { calculateGraphicNovelQuota } from '../graphicNovelQuotaService';
import {
  augmentGraphicNovelPagesWithMentionedCharacters,
  buildGraphicNovelCharacterAliasMap,
  buildGraphicNovelTextManifest,
  buildGraphicNovelGenerationStatus,
  getGraphicNovelStoryCharacterLinks,
  extractLlmCharactersFromComicScript,
  graphicNovelPanelNeedsStoryArtifactReference,
  selectGraphicNovelPanelReferenceImagesForGeneration,
  selectGraphicNovelCoverPanel,
  shouldCompleteGraphicNovelRequestAfterPage,
} from '../graphicNovelOrchestrationService';
import { planGraphicNovelLayouts } from '../../domain/graphicNovel';

function testWizardPayloadContract(): void {
  const payload = CreateStoryRequestSchema.parse({
    childProfileId: '11111111-1111-4111-8111-111111111111',
    uiLocale: 'en',
    storyLanguage: 'en',
    goal: 'friendship',
    scenarioCardId: 'space-rescue',
    imageStyle: 'comic_watercolor',
    userNotes: 'Make it conversational and funny.',
    selectedCharacters: ['22222222-2222-4222-8222-222222222222'],
    selectedChildren: ['11111111-1111-4111-8111-111111111111'],
  });

  assert.equal(payload.storyLanguage, 'en');
  assert.equal(payload.imageStyle, 'comic_watercolor');
  assert.deepEqual(payload.selectedCharacters, ['22222222-2222-4222-8222-222222222222']);
}

function testGraphicNovelQuotaCalculation(): void {
  assert.deepEqual(calculateGraphicNovelQuota({ limit: 2, used: 1 }), {
    allowed: true,
    limit: 2,
    used: 1,
    remaining: 1,
  });
  assert.deepEqual(calculateGraphicNovelQuota({ limit: 2, used: 2 }), {
    allowed: false,
    limit: 2,
    used: 2,
    remaining: 0,
  });
  assert.deepEqual(calculateGraphicNovelQuota({ limit: -1, used: 99 }), {
    allowed: true,
    limit: null,
    used: 99,
    remaining: null,
  });
}

function testGenerationStatusAfterFirstPage(): void {
  const status = buildGraphicNovelGenerationStatus({
    storyId: 'story-1',
    projectId: 'project-1',
    pages: [
      { pageNumber: 1, status: 'completed', imageUrl: '/page-1.png', imageAssetId: 'asset-1' },
      { pageNumber: 2, status: 'generating', imageUrl: null, imageAssetId: null },
      { pageNumber: 3, status: 'pending', imageUrl: null, imageAssetId: null },
    ],
  });

  assert.equal(status.firstPageReady, true);
  assert.equal(status.generationComplete, false);
  assert.deepEqual(status.readyPageNumbers, [1]);
  assert.deepEqual(status.panelsNeedingRepair, []);
  assert.deepEqual(status.pagesWithImages, [
    {
      pageNumber: 1,
      imageUrl: '/page-1.png',
      assetId: 'asset-1',
      textOverlayMode: 'html_overlay',
    },
  ]);
  assert.equal(status.textOverlayMode, 'html_overlay');
}

function testGenerationStatusReportsPanelsNeedingRepair(): void {
  const status = buildGraphicNovelGenerationStatus({
    storyId: 'story-1',
    projectId: 'project-1',
    pages: [
      {
        pageNumber: 2,
        status: 'completed',
        imageUrl: '/page-2.png',
        imageAssetId: 'asset-2',
        generationParams: {
          panelRepair: {
            failedPanelCount: 1,
            failedPanels: [
              {
                panelNumber: 3,
                panelId: 'p2-3',
                score: 92,
                failureReasons: ['duplicated_character:Amara'],
              },
            ],
          },
        },
      },
    ],
  });

  assert.deepEqual(status.panelsNeedingRepair, [
    {
      pageNumber: 2,
      panelNumber: 3,
      panelId: 'p2-3',
      score: 92,
      failureReasons: ['duplicated_character:Amara'],
    },
  ]);
}

function testFirstPageCompletionRule(): void {
  assert.equal(
    shouldCompleteGraphicNovelRequestAfterPage({ pageNumber: 1, firstPageReady: false }),
    true,
    'request completes as soon as page 1 is ready'
  );
  assert.equal(
    shouldCompleteGraphicNovelRequestAfterPage({ pageNumber: 2, firstPageReady: false }),
    false,
    'background pages do not control request completion'
  );
  assert.equal(
    shouldCompleteGraphicNovelRequestAfterPage({ pageNumber: 1, firstPageReady: true }),
    false,
    'page 1 completion is idempotent'
  );
}

function testGenerationStatusWithBackgroundFailure(): void {
  const status = buildGraphicNovelGenerationStatus({
    storyId: 'story-1',
    projectId: 'project-1',
    pages: [
      { pageNumber: 1, status: 'completed', imageUrl: '/page-1.png', imageAssetId: 'asset-1' },
      { pageNumber: 2, status: 'completed', imageUrl: '/page-2.png', imageAssetId: 'asset-2' },
      {
        pageNumber: 3,
        status: 'failed',
        imageUrl: null,
        imageAssetId: null,
        errorMessage: 'edit failed',
      },
    ],
  });

  assert.equal(status.firstPageReady, true);
  assert.equal(status.generationComplete, true);
  assert.deepEqual(status.readyPageNumbers, [1, 2]);
  assert.deepEqual(status.failedPages, [{ pageNumber: 3, errorMessage: 'edit failed' }]);
}

function testTextManifestFeedsStoryTextAndOverlay(): void {
  const visual = (primaryRead: string) => ({
    environmentId: 'env_gate',
    primaryRead,
    sceneVisual: {
      setting: primaryRead,
      lighting: 'soft evening light',
      cameraComposition: {
        shot: 'medium two-shot, eye level',
        characters: [
          {
            name: 'Mira',
            description: 'foreground left, whispering, curious face, looking at the gate',
          },
          {
            name: 'Leo',
            description: 'foreground right, pointing, surprised face, looking at the keyhole',
          },
        ],
      },
    },
  });
  const planned = planGraphicNovelLayouts({
    ageGroup: '6-8',
    pages: [
      {
        pageNumber: 1,
        pageRole: 'conversation',
        panels: [
          {
            panelId: 'p1-1',
            beatType: 'conversation',
            dialogue: [{ speaker: 'Mira', text: 'The {Star Key} is humming.' }],
            thoughts: [],
            visual: visual('Two friends whisper near a glowing gate'),
          },
          {
            panelId: 'p1-2',
            beatType: 'response',
            dialogue: [{ speaker: 'Leo', text: 'Then it wants a song.' }],
            thoughts: [],
            visual: visual('Leo points at a tiny keyhole'),
          },
        ],
      },
    ],
  });
  const manifest = buildGraphicNovelTextManifest(planned);

  assert.equal(manifest.textMode, 'html_overlay');
  assert.equal(manifest.fullText, 'The {Star Key} is humming.\nThen it wants a song.');
  assert.equal(manifest.pages[0].items[0].text, 'The Star Key is humming.');
  assert.equal(manifest.pages[0].items[0].ariaLabel, 'Mira says: The Star Key is humming.');
  assert.equal(manifest.pages[0].plainText.includes('{Star Key}'), false);
  assert.equal(manifest.scenes[0].text, manifest.fullText);
  assert.deepEqual(
    manifest.scenes[0].graphicNovelTextSegmentIds,
    manifest.pages[0].items.map((item) => item.segmentId)
  );
}

function testCoverPanelSelectionUsesFirstMatchingStandalonePanel(): void {
  assert.deepEqual(
    selectGraphicNovelCoverPanel([
      { panelIndex: 1, imageWidth: 1024, imageHeight: 768 },
      { panelIndex: 2, imageWidth: 1344, imageHeight: 768 },
      { panelIndex: 3, imageWidth: 1376, imageHeight: 768 },
    ]),
    {
      panelIndex: 2,
      imageWidth: 1344,
      imageHeight: 768,
      source: 'matching_story_card_aspect_ratio_panel',
    },
    'the first standalone panel near the 16:9 story-card ratio should be selected'
  );

  assert.equal(
    selectGraphicNovelCoverPanel([
      { panelIndex: 1, imageWidth: 1024, imageHeight: 768 },
      { panelIndex: 2, imageWidth: 768, imageHeight: 1024 },
    ]),
    null,
    'a page without a matching panel should leave cover selection open for later pages'
  );
}

function testGraphicNovelStoryCharacterLinksMatchStorybookFlow(): void {
  const links = getGraphicNovelStoryCharacterLinks([
    { id: 'character-1', type: 'imaginary', role: 'hero' },
    { id: 'child-1', type: 'child', role: 'hero' },
    { id: 'character-2', type: 'animal' },
    { id: 'character-1', type: 'imaginary', role: 'duplicate' },
    { type: 'imaginary' },
  ]);

  assert.deepEqual(links, [
    { characterId: 'character-1', role: 'hero' },
    { characterId: 'character-2', role: 'supporting' },
  ]);
}

function testComicScriptExtractsLlmRobotCharacter(): void {
  const llmCharacters = extractLlmCharactersFromComicScript({
    initialCharacters: [
      { id: 'emilia-id', characterRef: 'emilia-id', name: 'Emilia', type: 'child' } as any,
    ],
    script: {
      title: 'Robot Helper',
      description: 'A comic page',
      language: 'en',
      characters: [
        {
          characterRef: 'NEW_CH_1',
          name: 'Copper Bot',
          type: 'object',
          description: 'A small friendly copper robot with round glowing eyes and jointed arms.',
        },
        {
          characterRef: 'emilia-id',
          name: 'Emilia',
          type: 'human',
          description: 'Preselected child, should not be persisted as an LLM character.',
        },
      ],
      environments: [],
      pages: [
        {
          pageNumber: 1,
          pageRole: 'opening',
          panels: [
            {
              panelId: 'p1-1',
              dialogue: [
                { characterRef: 'NEW_CH_1', speaker: 'Copper Bot', text: 'I can light the way!' },
              ],
              thoughts: [],
              visual: {
                environmentId: 'env',
                primaryRead: 'Copper Bot opens a glowing hatch',
                sceneVisual: {
                  setting:
                    'A small copper robot named REF_CH_COPPER_BOT rolls beside Emilia near a moonlit door.',
                  lighting: 'warm glow',
                  cameraComposition: {
                    shot: 'medium shot',
                    characters: [
                      {
                        characterRef: 'emilia-id',
                        name: 'Emilia',
                        description: 'watching the helper',
                      },
                      {
                        characterRef: 'NEW_CH_1',
                        name: 'Copper Bot',
                        description:
                          'small round copper robot, glowing blue eyes, tiny wheels, hinged arms',
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(llmCharacters.length, 1);
  assert.equal(llmCharacters[0].name, 'Copper Bot');
  assert.equal(llmCharacters[0].characterRef, 'NEW_CH_1');
  assert.equal(llmCharacters[0].type, 'object');
  assert.match(llmCharacters[0].description, /copper robot/i);
  assert.doesNotMatch(llmCharacters[0].description, /REF_CH_/);
}

function testMentionedLlmComicCharacterIsAddedToPanelComposition(): void {
  const [page] = planGraphicNovelLayouts({
    ageGroup: '6-8',
    outfits: [
      {
        id: 'out_griffin',
        characterName: 'Малюк-Грифон',
        description: 'natural appearance',
      },
    ],
    pages: [
      {
        pageNumber: 1,
        pageRole: 'action',
        panels: [
          {
            panelId: 'p1-1',
            dialogue: [{ speaker: 'Emilia', text: 'Look, he is coming down!' }],
            thoughts: [],
            caption: 'The little friend gathers courage.',
            visual: {
              environmentId: 'env_square',
              primaryRead: 'The small griffin hops down the stone steps.',
              sceneVisual: {
                setting: 'The small griffin is hopping down from the tower ledge to the square.',
                lighting: 'Soft shadows in the square',
                cameraComposition: {
                  shot: 'Long shot',
                  characters: [
                    {
                      name: 'Emilia',
                      position: 'left_foreground',
                      description: 'Peering from behind a bench, whispering to Dogikhant.',
                      outfitId: 'out_emilia',
                    },
                    {
                      name: 'Dogikhant',
                      position: 'right_foreground',
                      description: 'Staying low to the ground, watching the griffin.',
                      outfitId: 'out_dogikhant',
                    },
                  ],
                },
              },
            },
          },
          {
            panelId: 'p1-2',
            dialogue: [],
            thoughts: [],
            visual: {
              environmentId: 'env_square',
              primaryRead: 'Emilia watches the griffin from a safe distance.',
              sceneVisual: {
                setting: 'The small griffin sits on the cobblestones, looking lost.',
                lighting: 'Warm sunset glow',
                cameraComposition: {
                  shot: 'Medium shot',
                  characters: [
                    {
                      name: 'Малюк-Грифон',
                      position: 'center_midground',
                      description: 'sitting on the cobblestones, head tilted',
                      outfitId: 'out_griffin',
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  });
  const characters = [
    {
      name: 'Малюк-Грифон',
      type: 'creature',
      description:
        'A small fantasy creature with golden feathers and tiny wings. The small griffin sits on cobblestones.',
      nameAliases: ['Малюк-Грифон'],
    },
  ] as any;
  const aliases = buildGraphicNovelCharacterAliasMap(characters);
  const [augmented] = augmentGraphicNovelPagesWithMentionedCharacters({
    pages: [{ ...page, characterAliases: aliases }],
    characters,
    aliases,
    outfits: [
      {
        id: 'out_griffin',
        characterName: 'Малюк-Грифон',
        description: 'natural appearance',
      },
    ],
  });

  const composition = augmented.panels[0].script.visual.sceneVisual.cameraComposition;
  assert.notEqual(typeof composition, 'string');
  if (typeof composition !== 'string') {
    const griffin = composition.characters.find((character) => character.name === 'Малюк-Грифон');
    assert.ok(griffin, 'mentioned LLM character is added to panel composition');
    assert.equal(griffin.outfitId, 'out_griffin');
  }
  assert.ok(
    aliases['Малюк-Грифон'].some((alias) => alias.toLowerCase() === 'small griffin'),
    'alias map includes English visual subject phrase'
  );
}

function testStoryArtifactReferenceIsTriggeredByCompositionRefLabel(): void {
  const refId = 'REF_OBJ_VESELKOVA_LUSOCHKA_142FD9';
  const page = planGraphicNovelLayouts({
    ageGroup: '6-8',
    pages: [
      {
        pageNumber: 1,
        pageRole: 'closing',
        panels: [
          {
            panelId: 'p1-1',
            beatType: 'closing',
            dialogue: [],
            thoughts: [],
            visual: {
              environmentId: 'env_beach',
              primaryRead: `${refId} close to heart`,
              sceneVisual: {
                setting: 'The sun paints the clouds gold and orange.',
                lighting: 'warm sunset',
                cameraComposition: {
                  shot: 'medium wide shot',
                  characters: [
                    {
                      name: 'Емілія',
                      position: 'center_foreground',
                      description: `Holding ${refId} close to her heart, smiling warmly.`,
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  });

  assert.equal(
    graphicNovelPanelNeedsStoryArtifactReference(page[0].panels[0], {
      id: 'artifact-1',
      artifactCode: 'rainbow-scale',
      title: 'Веселкова лусочка',
      description: 'Одна крупная радужная чешуйка с фиолетово-зеленым переливом.',
      imagePath: 'artifact/rainbow-scale.png',
      storagePath: 'artifact/rainbow-scale.png',
      referenceBindingId: refId,
    }),
    true,
    'REF_OBJ label in composition is enough to pass the story artifact reference image'
  );
}

function testPanelReferenceSelectionFiltersBeforeBucketLimit(): void {
  const characters = [
    {
      id: 'emilia-id',
      name: 'Емілія',
      canonicalName: 'Емілія',
      nameAliases: ['Emilia'],
      referenceBindingId: 'REF_CH_EMILIYA_6AC078',
    },
    {
      id: 'gromik-id',
      name: 'Громик',
      canonicalName: 'Громик',
      referenceBindingId: 'REF_CH_GROMIK_C909E6',
    },
    { id: 'keyki-id', name: 'Кейкі', referenceBindingId: 'REF_CH_KEYKI_071EE9' },
    {
      id: 'pani-id',
      name: 'Пані Пелюстка',
      referenceBindingId: 'REF_CH_PANI_PELYUSTKA_4BCF4E',
    },
    { id: 'aydragon-id', name: 'Айдрагон', referenceBindingId: 'REF_CH_AYDRAGON_934A60' },
  ] as any;

  const characterReferences = characters.map((character: any) => ({
    characterName: character.name,
    characterId: character.id,
    referenceKind: 'character' as const,
    source: 'character_reference',
    type: 'character_reference',
    isTurnaround: true,
    storagePath: `${character.id}.png`,
    base64Data: 'aW1hZ2U=',
    mimeType: 'image/png',
    referenceBindingId: character.referenceBindingId,
  }));

  const selected = selectGraphicNovelPanelReferenceImagesForGeneration({
    storyId: 'story-1',
    pageNumber: 3,
    environmentReferences: [],
    characterReferences,
    expectedCharacters: [
      { name: 'Емілія', characterKind: 'human', validateOutfit: false },
      { name: 'Громик', characterKind: 'imaginary', validateOutfit: false },
    ],
    characters,
  });

  const characterLabels = selected
    .filter((ref) => ref.referenceKind === 'character')
    .map((ref) => ref.referenceBindingId)
    .sort();

  assert.deepEqual(characterLabels, ['REF_CH_EMILIYA_6AC078', 'REF_CH_GROMIK_C909E6']);
}

function main(): void {
  testWizardPayloadContract();
  testGraphicNovelQuotaCalculation();
  testGenerationStatusAfterFirstPage();
  testGenerationStatusReportsPanelsNeedingRepair();
  testFirstPageCompletionRule();
  testGenerationStatusWithBackgroundFailure();
  testTextManifestFeedsStoryTextAndOverlay();
  testCoverPanelSelectionUsesFirstMatchingStandalonePanel();
  testGraphicNovelStoryCharacterLinksMatchStorybookFlow();
  testComicScriptExtractsLlmRobotCharacter();
  testMentionedLlmComicCharacterIsAddedToPanelComposition();
  testStoryArtifactReferenceIsTriggeredByCompositionRefLabel();
  testPanelReferenceSelectionFiltersBeforeBucketLimit();
  console.log('graphicNovelFlowContracts tests passed');
}

main();
