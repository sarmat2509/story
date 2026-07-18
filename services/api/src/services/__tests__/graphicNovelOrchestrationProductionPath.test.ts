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
  console.log('graphic novel production orchestration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
