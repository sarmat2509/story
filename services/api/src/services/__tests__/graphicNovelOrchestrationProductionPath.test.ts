import assert from 'node:assert/strict';
import sharp from 'sharp';
import type { GeneratedImage } from '../../providers/base/IImageProvider';
import { MockImageProvider } from '../../testing/ai/MockImageProvider';
import { MockTextProvider } from '../../testing/ai/MockTextProvider';

process.env.NODE_ENV = 'test';
process.env.ENABLE_IMAGE_VALIDATION = 'true';
process.env.IMAGE_VALIDATION_USE_EDIT_REPAIR = 'true';
process.env.IMAGE_VALIDATION_MIN_ACCEPT_SCORE = '99';
process.env.SKIP_IMAGE_GENERATION = 'false';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function solidImage(color: string): Promise<GeneratedImage> {
  const imageData = await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
  return {
    imageData,
    mimeType: 'image/png',
    width: 96,
    height: 96,
    format: 'png',
  };
}

function sceneValidation(hasRenderingArtifacts: boolean) {
  return {
    missingExpectedCharacters: [],
    characterBoundingBoxes: [],
    hasUnexpectedCharacters: false,
    unexpectedCharacterNotes: null,
    hasTextOrLetters: false,
    hasRenderingArtifacts,
    overallFeedback: hasRenderingArtifacts ? 'Visible rendering artifacts.' : 'Panel is clean.',
  };
}

function bubbleVision(panelIndex: number, panelId: string) {
  return {
    panels: [
      {
        panelIndex,
        panelId,
        detectedCharacters: [],
        occupiedZones: [],
        emptyZones: [
          {
            x: 0.05,
            y: 0.05,
            width: 0.35,
            height: 0.2,
            confidence: 0.95,
            description: 'clear sky',
          },
        ],
      },
    ],
  };
}

async function testProductionRendererConcurrencyRepairAndPersistence(): Promise<void> {
  const [
    { planGraphicNovelLayouts, pageSizeForGraphicNovelPage },
    { graphicNovelOrchestrationTestSeams },
    { installAiServiceTestOverrides, clearAiServiceTestOverrides },
    { installRepositoryTestOverrides, clearRepositoryTestOverrides },
    { installAssetStorageServiceTestOverride, clearAssetStorageServiceTestOverride },
  ] = await Promise.all([
    import('../../domain/graphicNovel'),
    import('../graphicNovelOrchestrationService'),
    import('../aiService'),
    import('../../repositories'),
    import('../assetStorageService'),
  ]);

  const plannedPage = planGraphicNovelLayouts({
    ageGroup: '4-5',
    randomSource: () => 0,
    pages: [
      {
        pageNumber: 1,
        pageRole: 'conversation',
        panels: [
          {
            panelId: 'p1-1',
            beatType: 'conversation',
            visualAction: 'A lantern glows.',
            setting: 'Quiet garden',
            charactersPresent: [],
            dialogue: [{ speaker: 'Mira', text: 'A little light!' }],
            thoughts: [],
            visual: {
              environmentId: 'env-garden',
              primaryRead: 'A lantern glows in a quiet garden.',
              sceneVisual: {
                setting: 'Quiet garden at dusk.',
                lighting: 'Warm lantern light.',
                cameraComposition: { shot: 'medium shot', characters: [] },
              },
            },
            artPrompt: 'A glowing lantern in a quiet garden.',
          },
          {
            panelId: 'p1-2',
            beatType: 'reaction',
            visualAction: 'Fireflies answer.',
            setting: 'Quiet garden',
            charactersPresent: [],
            dialogue: [],
            thoughts: [],
            visual: {
              environmentId: 'env-garden',
              primaryRead: 'Fireflies answer the lantern.',
              sceneVisual: {
                setting: 'Quiet garden at dusk.',
                lighting: 'Warm lantern and firefly light.',
                cameraComposition: { shot: 'wide shot', characters: [] },
              },
            },
            artPrompt: 'Fireflies around a glowing lantern.',
          },
        ],
      },
    ],
  })[0];

  const firstPanel = deferred<GeneratedImage>();
  const secondPanel = deferred<GeneratedImage>();
  const simpleImages = new MockImageProvider()
    .queueGenerate('graphic_novel_template_panel_generate', firstPanel.promise)
    .queueGenerate('graphic_novel_template_panel_generate', secondPanel.promise)
    .queueEdit('graphic_novel_panel_crop_validation_edit', await solidImage('#18a84a'));
  const complexImages = new MockImageProvider();
  const validationText = new MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', sceneValidation(true))
    .queueStructured('image_validation_segmented_scene_qa', sceneValidation(false))
    .queueStructured('image_validation_segmented_scene_qa', sceneValidation(false))
    .queueStructured('graphic_novel_bubble_vision_panel_image', bubbleVision(1, 'p1-1'))
    .queueStructured('graphic_novel_bubble_vision_panel_image', bubbleVision(2, 'p1-2'));

  const uploads: Array<{ path: string; data: Buffer }> = [];
  const assets: any[] = [];
  const pageUpdates: any[] = [];
  const panelUpdates: any[] = [];
  const validationRows: any[] = [];
  const stageRows: any[] = [];
  const storage = {
    async uploadAsset(input: { data: Buffer | string }) {
      const data = typeof input.data === 'string' ? Buffer.from(input.data, 'base64') : input.data;
      const path = `mock/graphic-novel-${uploads.length + 1}.png`;
      uploads.push({ path, data: Buffer.from(data) });
      return {
        storagePath: path,
        storageUrl: `/api/v1/assets/${path}`,
        signedUrl: null,
        signedUrlExpiresAt: null,
        fileSizeBytes: data.length,
      };
    },
    async generateThumbnail() {
      throw new Error('thumbnail boundary intentionally disabled');
    },
  };

  installAiServiceTestOverrides({
    imageProvider: simpleImages,
    complexImageProvider: complexImages,
    validationTextProvider: validationText,
  });
  installAssetStorageServiceTestOverride(storage as any);
  installRepositoryTestOverrides({
    asset: {
      create: async (input: any) => {
        const asset = { id: `asset-${assets.length + 1}`, ...input };
        assets.push(asset);
        return asset;
      },
      update: async () => undefined,
    } as any,
    graphicNovel: {
      updatePage: async (_id: string, patch: any) => {
        pageUpdates.push(patch);
      },
      findPanelsByPageId: async () => [
        { id: 'panel-row-1', panelIndex: 1 },
        { id: 'panel-row-2', panelIndex: 2 },
      ],
      updatePanel: async (id: string, patch: any) => {
        panelUpdates.push({ id, patch });
      },
    } as any,
    imageValidation: {
      insert: async (input: any) => {
        validationRows.push(input);
        return { id: `validation-${validationRows.length}`, ...input };
      },
    } as any,
    storyGenerationStageEvent: {
      create: async (input: any) => {
        stageRows.push(input);
        return { id: `stage-${stageRows.length}`, ...input };
      },
    } as any,
  });

  try {
    const renderPromise = graphicNovelOrchestrationTestSeams.renderAndStorePage({
      requestId: 'request-1',
      storyId: 'story-1',
      userId: 'user-1',
      generationKind: 'graphic_novel',
      page: {
        id: 'page-row-1',
        pageNumber: 1,
        layoutJson: plannedPage,
        generationParams: {},
      },
      style: 'soft_watercolor',
      ageGroup: '4-5',
      environments: [],
      characters: [],
      storyArtifactReference: null,
      createCoverCandidate: false,
    });

    await waitFor(
      () => simpleImages.requests.filter((request) => request.kind === 'generate').length === 2,
      'both panel-generation calls to start while the first response is unresolved'
    );
    assert.equal(
      simpleImages.requests.filter((request) => request.kind === 'generate').length,
      2,
      'production renderer starts both independent panel calls concurrently'
    );

    firstPanel.resolve(await solidImage('#d52b2b'));
    secondPanel.resolve(await solidImage('#2767d8'));
    const result = await renderPromise;

    assert.ok(result.pageAssetId);
    assert.deepEqual(
      simpleImages.requests.map((entry) =>
        entry.kind === 'generate' || entry.kind === 'edit'
          ? `${entry.kind}:${entry.request.operation}`
          : entry.kind
      ),
      [
        'generate:graphic_novel_template_panel_generate',
        'generate:graphic_novel_template_panel_generate',
        'edit:graphic_novel_panel_crop_validation_edit',
      ]
    );

    const finalPageUpdate = pageUpdates.at(-1);
    assert.equal(finalPageUpdate.status, 'completed');
    assert.equal(finalPageUpdate.imageAssetId, result.pageAssetId);
    assert.equal(finalPageUpdate.generationParams.panelRepair.repairedPanelCount, 1);
    assert.equal(finalPageUpdate.generationParams.panelRepair.failedPanelCount, 0);
    assert.deepEqual(finalPageUpdate.generationParams.panelRepair.failedPanels, []);
    assert.equal(
      finalPageUpdate.generationParams.bubblePlacement.mode,
      'post_art_vision_panel_images'
    );
    assert.equal(finalPageUpdate.bubbleLayoutJson.placementMode, 'post_art_vision');
    assert.equal(panelUpdates.length, 2);

    const repairedPanelIndex = [1, 2].find(
      (panelIndex) => validationRows.filter((row) => row.panelIndex === panelIndex).length === 2
    );
    assert.ok(repairedPanelIndex, 'exactly one failed panel is repaired and revalidated');
    const repairedPanelValidations = validationRows
      .filter((row) => row.panelIndex === repairedPanelIndex)
      .sort((left, right) => left.attempt - right.attempt);
    assert.equal(
      repairedPanelValidations.length,
      2,
      `original and repaired panel validations persist: ${JSON.stringify(
        validationRows.map((row) => ({
          panelIndex: row.panelIndex,
          attempt: row.attempt,
          score: row.validationScore,
        }))
      )}`
    );
    assert.equal(repairedPanelValidations[0].attempt, 1);
    assert.equal(repairedPanelValidations[1].attempt, 2);
    assert.ok(
      repairedPanelValidations[1].validationScore > repairedPanelValidations[0].validationScore
    );

    const artOnlyPath = finalPageUpdate.generationParams.artOnlyImageStoragePath;
    const artOnly = uploads.find((upload) => upload.path === artOnlyPath)?.data;
    assert.ok(artOnly, 'art-only recomposed page is persisted');
    const pageSize = pageSizeForGraphicNovelPage(plannedPage);
    const panelRect = plannedPage.panels[repairedPanelIndex! - 1].templatePanel.rect;
    const centerPixel = await sharp(artOnly!)
      .extract({
        left: Math.round((panelRect.x + panelRect.width / 2) * pageSize.width),
        top: Math.round((panelRect.y + panelRect.height / 2) * pageSize.height),
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.ok(
      centerPixel[1] > centerPixel[0] && centerPixel[1] > centerPixel[2],
      'recomposition uses the higher-scoring edited green crop instead of the original red crop'
    );

    assert.ok(stageRows.some((row) => row.operation === 'comic_page_image'));
    simpleImages.assertExhausted();
    complexImages.assertExhausted();
    validationText.assertExhausted();
  } finally {
    clearRepositoryTestOverrides();
    clearAssetStorageServiceTestOverride();
    clearAiServiceTestOverrides();
  }
}

async function testPanelQualityDecisionUsesHardPanelSignals(): Promise<void> {
  const { graphicNovelOrchestrationTestSeams } =
    await import('../graphicNovelOrchestrationService');
  const baseCharacter = {
    name: 'Luma',
    characterKind: 'imaginary',
    found: true,
    duplicated: false,
    recognizableScore: 1,
    matchesColors: true,
    matchesOutfit: true,
    proportionsMatchReference: true,
    sameOverallDesignRead: true,
    silhouetteDriftSeverity: 'none',
    identityComparisonSummary: 'Matches the turnaround.',
  };
  const panelValidation = {
    panelNumber: 2,
    panelId: 'p1-2',
    cropRect: { left: 0, top: 0, width: 100, height: 100 },
    normalizedRect: { x: 0, y: 0, width: 1, height: 1 },
    expectedCharacters: [{ name: 'Luma', characterKind: 'imaginary', validateOutfit: false }],
    validation: {
      validationStatus: 'completed',
      characterCount: 1,
      expectedCharacterCount: 1,
      characters: [baseCharacter],
      hasUnexpectedCharacters: false,
      hasTextOrLetters: false,
      hasRenderingArtifacts: false,
    },
    score: 100,
    attempt: 1,
    repairMode: 'original',
  };

  assert.deepEqual(
    graphicNovelOrchestrationTestSeams.graphicNovelPanelQualityDecision(panelValidation as any),
    { accepted: true, failureReasons: [] }
  );

  const duplicated = {
    ...panelValidation,
    validation: {
      ...panelValidation.validation,
      characters: [{ ...baseCharacter, duplicated: true }],
    },
  };
  assert.deepEqual(
    graphicNovelOrchestrationTestSeams.graphicNovelPanelQualityDecision(duplicated as any),
    { accepted: false, failureReasons: ['duplicated_character:Luma'] }
  );

  const identityDrift = {
    ...panelValidation,
    validation: {
      ...panelValidation.validation,
      characters: [{ ...baseCharacter, sameOverallDesignRead: false }],
    },
  };
  assert.deepEqual(
    graphicNovelOrchestrationTestSeams.graphicNovelPanelQualityDecision(identityDrift as any),
    { accepted: false, failureReasons: ['design_mismatch:Luma'] }
  );
}

async function testManualPanelRepairKeepsDiagnosisOutOfPromptAndRefreshesTurnaround(): Promise<void> {
  const [
    { graphicNovelOrchestrationTestSeams },
    { installRepositoryTestOverrides, clearRepositoryTestOverrides },
    { buildImageEditPrompt },
  ] = await Promise.all([
    import('../graphicNovelOrchestrationService'),
    import('../../repositories'),
    import('../../prompts/image/ImageEditPrompt'),
  ]);
  const page = {
    pageNumber: 3,
    panels: [
      {
        script: {
          panelId: 'p3-1',
          visual: {
            primaryRead: 'Luma runs through the moonlit garden.',
            sceneVisual: {
              cameraComposition: {
                shot: 'medium shot',
                characters: [
                  {
                    name: 'Luma',
                    position: 'center',
                    description: 'girl with one thick side braid near the garden gate',
                  },
                ],
              },
            },
          },
        },
      },
    ],
  } as any;
  const characters = [
    {
      id: 'character-luma',
      name: 'Luma',
      type: 'child',
      referenceBindingId: 'REF_CH_LUMA_123',
      references: [
        {
          storagePath: 'turnarounds/luma-stale.png',
          source: 'child_reference',
          type: 'child_reference',
          isTurnaround: true,
          referenceBindingId: 'REF_CH_LUMA_123',
        },
      ],
    },
  ] as any;

  installRepositoryTestOverrides({
    character: {
      findById: async (characterId: string, userId: string) => {
        assert.equal(characterId, 'character-luma');
        assert.equal(userId, 'user-1');
        return {
          id: characterId,
          name: 'Luma',
          type: 'child',
          turnaroundSheet: { url: '/api/v1/assets/turnarounds/luma-current.png' },
          referencePhotos: [],
        } as any;
      },
    } as any,
  });

  try {
    const refreshed =
      await graphicNovelOrchestrationTestSeams.refreshGraphicNovelManifestTurnarounds({
        characters,
        characterIds: ['character-luma'],
        page,
        userId: 'user-1',
      });
    assert.equal(characters[0].references[0].storagePath, 'turnarounds/luma-stale.png');
    assert.deepEqual(refreshed[0].references, [
      {
        storagePath: 'turnarounds/luma-current.png',
        source: 'child_reference',
        type: 'child_reference',
        isTurnaround: true,
        referenceBindingId: 'REF_CH_LUMA_123',
      },
    ]);

    const target = {
      panelNumber: 1,
      mode: 'edit' as const,
      issues: [
        {
          kind: 'hair' as const,
          comment: '  Restore   the exact two-braid hairstyle. ',
          characterId: 'character-luma',
        },
        {
          kind: 'outfit' as const,
          comment: 'Use the yellow raincoat shown in the turnaround.',
          characterId: 'character-luma',
        },
      ],
    };
    const repairManifest = graphicNovelOrchestrationTestSeams.buildManualPanelRepairManifest({
      target,
      panel: page.panels[0],
      characters: refreshed,
    });
    assert.deepEqual(repairManifest, {
      referenceMode: 'identity_and_outfit',
      issues: [
        {
          kind: 'hair',
          note: 'Replace the selected mismatched subject with the matching visual reference.',
        },
        {
          kind: 'outfit',
          note: 'Replace the selected mismatched subject with the matching visual reference.',
        },
      ],
      subjectReplacements: [
        {
          characterName: 'Luma',
          referenceId: 'REF_CH_LUMA_123',
          sceneSlotDescription: 'girl with one thick side braid near the garden gate',
          found: true,
          repairKinds: ['hair', 'outfit'],
        },
      ],
    });
    const editPrompt = buildImageEditPrompt({
      validationResult: { overallFeedback: 'unused' } as any,
      targetedRepairManifest: repairManifest,
    });
    assert.match(editPrompt, /full character from REF_CH_LUMA_123/);
    assert.doesNotMatch(editPrompt, /Restore the exact two-braid hairstyle/);
    assert.doesNotMatch(editPrompt, /yellow raincoat/);

    const currentValidation = {
      panelNumber: 1,
      panelId: 'p3-1',
      cropRect: { left: 0, top: 0, width: 512, height: 512 },
      normalizedRect: { x: 0, y: 0, width: 1, height: 1 },
      expectedCharacters: [
        {
          name: 'Luma',
          characterKind: 'human',
          validateOutfit: true,
        },
      ],
      validation: {
        characterCount: 1,
        expectedCharacterCount: 1,
        characters: [
          {
            name: 'Luma',
            characterKind: 'human',
            found: true,
            duplicated: false,
            recognizableScore: 0.41,
            faceMatchesReference: false,
            hairMatchesReference: false,
            ageReadMatchesReference: true,
            proportionsMatchReference: true,
            matchesColors: false,
            matchesOutfit: false,
            actualVisibleDescription: 'girl with loose brown hair and a green coat',
            identityComparisonSummary:
              'The visible face, loose hair, colors, and coat do not match Luma.',
            issue: 'Luma is replaced by a visually different child.',
          },
        ],
        hasUnexpectedCharacters: false,
        hasTextOrLetters: false,
        hasRenderingArtifacts: false,
        overallFeedback: 'Character identity needs repair.',
      },
      score: 20,
      imageData: Buffer.alloc(0),
      mimeType: 'image/png',
      attempt: 1,
      repairMode: 'original',
    } as any;
    const validatorRepairPlan = graphicNovelOrchestrationTestSeams.buildManualPanelEditRepairPlan({
      target,
      page,
      panel: page.panels[0],
      characters: refreshed,
      referenceImages: [
        {
          characterName: 'Luma',
          referenceBindingId: 'REF_CH_LUMA_123',
          referenceKind: 'character',
          source: 'character_outfit_turnaround',
          type: 'dressed_turnaround_reference',
          mimeType: 'image/png',
          base64Data: 'aW1hZ2U=',
        },
      ] as any,
      currentValidation,
    });
    assert.equal(validatorRepairPlan.source, 'validator');
    assert.equal(
      validatorRepairPlan.manifest.subjectReplacements?.[0]?.actualVisibleDescription,
      'girl with loose brown hair and a green coat'
    );
    const validatorEditPrompt = buildImageEditPrompt({
      validationResult: currentValidation.validation,
      targetedRepairManifest: validatorRepairPlan.manifest,
    });
    assert.match(
      validatorEditPrompt,
      /Completely replace the visible subject described as "girl with loose brown hair and a green coat" with the full character from REF_CH_LUMA_123/
    );
    assert.doesNotMatch(validatorEditPrompt, /Restore the exact two-braid hairstyle/);
    assert.doesNotMatch(validatorEditPrompt, /yellow raincoat/);
    assert.doesNotMatch(validatorEditPrompt, /visually different child/);

    assert.deepEqual(
      graphicNovelOrchestrationTestSeams.panelRepairFailedPanelsAfterRun({
        previousPanelRepair: {
          failedPanels: [
            { panelNumber: 1, failureReasons: ['old_failure'] },
            { panelNumber: 2, failureReasons: ['untouched_failure'] },
          ],
        },
        requestedPanelNumbers: new Set([1, 3]),
        failedPanels: [{ panelNumber: 3, failureReasons: ['new_failure'] }],
      }),
      [
        { panelNumber: 2, failureReasons: ['untouched_failure'] },
        { panelNumber: 3, failureReasons: ['new_failure'] },
      ]
    );
  } finally {
    clearRepositoryTestOverrides();
  }
}

async function testLegacyLocalizedTitleAliasUsesPersistedManifestIdentity(): Promise<void> {
  const { graphicNovelOrchestrationTestSeams } =
    await import('../graphicNovelOrchestrationService');
  const characters = [
    {
      id: 'theo-uuid',
      characterRef: 'theo-uuid',
      name: 'Theo',
      canonicalName: 'Тео',
      nameAliases: ['Teo'],
      source: 'user_provided',
    },
    {
      id: 'other-theo-uuid',
      characterRef: 'other-theo-uuid',
      name: 'Theodore',
    },
  ] as any;

  const charactersWithPersistedAliasDuplicate = [
    ...characters,
    {
      id: 'tato-theo-llm-uuid',
      characterRef: 'tato-theo-llm-uuid',
      name: 'Тато Тео',
      source: 'llm_generated',
    },
  ] as any;

  assert.equal(
    graphicNovelOrchestrationTestSeams.characterManifestForPageName(
      characters,
      'Тато Тео'
    )?.id,
    'theo-uuid'
  );
  assert.equal(
    graphicNovelOrchestrationTestSeams.characterManifestForPageName(
      charactersWithPersistedAliasDuplicate,
      'Тато Тео'
    )?.id,
    'theo-uuid',
    'legacy titled LLM duplicate yields to the existing base identity'
  );
  assert.equal(
    graphicNovelOrchestrationTestSeams.characterManifestMatchesPage(
      characters[0],
      new Set(['тато тео']),
      new Set(),
      characters
    ),
    true
  );
  assert.equal(
    graphicNovelOrchestrationTestSeams.characterManifestMatchesPage(
      characters[1],
      new Set(['тато тео']),
      new Set(),
      characters
    ),
    false
  );

  const page = {
    pageNumber: 7,
    outfits: [
      { id: 'theo-outfit', characterName: 'Тато Тео', description: 'blue jacket' },
    ],
    panels: [
      {
        script: {
          dialogue: [{ speaker: 'Тато Тео', text: 'Уперед!' }],
          thoughts: [],
          visual: {
            sceneVisual: {
              cameraComposition: {
                shot: 'medium',
                characters: [
                  { name: 'Тато Тео', description: 'clapping on the right' },
                  { name: 'Тео', description: 'standing on the right' },
                ],
              },
            },
          },
        },
      },
    ],
  } as any;
  graphicNovelOrchestrationTestSeams.bindLegacyPlannedPageCharacterIdentity(
    page,
    charactersWithPersistedAliasDuplicate
  );
  assert.equal(page.outfits[0].characterRef, 'theo-uuid');
  assert.equal(page.panels[0].script.dialogue[0].characterRef, 'theo-uuid');
  assert.deepEqual(page.panels[0].script.visual.sceneVisual.cameraComposition.characters, [
    {
      name: 'Тато Тео',
      characterRef: 'theo-uuid',
      description: 'clapping on the right',
    },
  ]);
  assert.deepEqual(
    graphicNovelOrchestrationTestSeams.buildGraphicNovelExpectedCharactersForPanel({
      panel: page.panels[0],
      characters: charactersWithPersistedAliasDuplicate,
      dressedTurnaroundValidationNames: new Set(),
    }).map((character: any) => character.name),
    ['Тато Тео']
  );
}

async function testProductionBubbleVisionFallback(): Promise<void> {
  const [
    { graphicNovelOrchestrationTestSeams },
    { planGraphicNovelLayouts },
    { installAiServiceTestOverrides, clearAiServiceTestOverrides },
  ] = await Promise.all([
    import('../graphicNovelOrchestrationService'),
    import('../../domain/graphicNovel'),
    import('../aiService'),
  ]);
  const page = planGraphicNovelLayouts({
    ageGroup: '4-5',
    randomSource: () => 0,
    pages: [
      {
        pageNumber: 1,
        pageRole: 'opening',
        panels: [
          {
            panelId: 'fallback-panel',
            beatType: 'setup',
            dialogue: [{ speaker: 'Mira', text: 'Hello!' }],
            thoughts: [],
            visual: {
              environmentId: 'env-test',
              primaryRead: 'A lantern glows.',
              sceneVisual: {
                setting: 'Garden',
                lighting: 'Dusk',
                cameraComposition: { shot: 'medium', characters: [] },
              },
            },
          },
          {
            panelId: 'fallback-panel-2',
            beatType: 'reaction',
            dialogue: [],
            thoughts: [],
            visual: {
              environmentId: 'env-test',
              primaryRead: 'Fireflies answer.',
              sceneVisual: {
                setting: 'Garden',
                lighting: 'Dusk',
                cameraComposition: { shot: 'wide', characters: [] },
              },
            },
          },
        ],
      },
    ],
  })[0];
  const provider = new MockTextProvider().queueError(
    'structured',
    'graphic_novel_bubble_vision_panel_image',
    'vision unavailable'
  );
  installAiServiceTestOverrides({ validationTextProvider: provider });
  try {
    const result =
      await graphicNovelOrchestrationTestSeams.applyVisionBubblePlacementForRenderedPage({
        page,
        userId: 'user-1',
        storyId: 'story-1',
        panelImages: [
          {
            panelIndex: 1,
            panelId: 'fallback-panel',
            imageData: (await solidImage('#cccccc')).imageData,
            mimeType: 'image/png',
          },
        ],
      });
    assert.equal(result.page, page);
    assert.equal(result.analysis, null);
    assert.equal(result.placementSummary.mode, 'script_fallback_after_vision_error');
    assert.match(String(result.placementSummary.error), /vision unavailable/);
    provider.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
  }
}

async function main(): Promise<void> {
  await testProductionRendererConcurrencyRepairAndPersistence();
  await testProductionBubbleVisionFallback();
  await testPanelQualityDecisionUsesHardPanelSignals();
  await testManualPanelRepairKeepsDiagnosisOutOfPromptAndRefreshesTurnaround();
  await testLegacyLocalizedTitleAliasUsesPersistedManifestIdentity();
  console.log('graphic novel production orchestration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
