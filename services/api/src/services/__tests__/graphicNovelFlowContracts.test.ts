import assert from 'node:assert/strict';
import { CreateStoryRequestSchema } from '@wondertales/shared';
import { calculateGraphicNovelQuota } from '../graphicNovelQuotaService';
import {
  buildGraphicNovelCoverPanelCrop,
  buildGraphicNovelTextManifest,
  buildGraphicNovelGenerationStatus,
  getGraphicNovelStoryCharacterLinks,
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
  assert.deepEqual(
    calculateGraphicNovelQuota({ limit: 2, used: 1 }),
    { allowed: true, limit: 2, used: 1, remaining: 1 }
  );
  assert.deepEqual(
    calculateGraphicNovelQuota({ limit: 2, used: 2 }),
    { allowed: false, limit: 2, used: 2, remaining: 0 }
  );
  assert.deepEqual(
    calculateGraphicNovelQuota({ limit: -1, used: 99 }),
    { allowed: true, limit: null, used: 99, remaining: null }
  );
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
  assert.deepEqual(status.pagesWithImages, [{
    pageNumber: 1,
    imageUrl: '/page-1.png',
    assetId: 'asset-1',
    textOverlayMode: 'html_overlay',
  }]);
  assert.equal(status.textOverlayMode, 'html_overlay');
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
      { pageNumber: 3, status: 'failed', imageUrl: null, imageAssetId: null, errorMessage: 'edit failed' },
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
          { name: 'Mira', description: 'foreground left, whispering, curious face, looking at the gate' },
          { name: 'Leo', description: 'foreground right, pointing, surprised face, looking at the keyhole' },
        ],
      },
    },
  });
  const planned = planGraphicNovelLayouts({
    ageGroup: '6-8',
    pages: [{
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
    }],
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

function testCoverPanelSelectionRequiresFullWidthPanel(): void {
  const makePage = (rects: Array<{ x: number; y: number; width: number; height: number }>) => ({
    panels: rects.map((rect, index) => ({
      templatePanel: {
        id: `p${index + 1}`,
        rect,
      },
    })),
  });

  assert.deepEqual(
    selectGraphicNovelCoverPanel(makePage([
      { x: 0.0195, y: 0.02, width: 0.9609, height: 0.33 },
      { x: 0.0195, y: 0.37, width: 0.47, height: 0.28 },
      { x: 0.5104, y: 0.37, width: 0.47, height: 0.28 },
    ]) as any),
    { panelIndex: 0 }
  );

  assert.equal(
    selectGraphicNovelCoverPanel(makePage([
      { x: 0.0195, y: 0.02, width: 0.47, height: 0.94 },
      { x: 0.5104, y: 0.02, width: 0.47, height: 0.94 },
    ]) as any),
    null
  );

  assert.equal(
    selectGraphicNovelCoverPanel(makePage([
      { x: 0.0195, y: 0.02, width: 0.9609, height: 0.86 },
      { x: 0.0195, y: 0.9, width: 0.47, height: 0.08 },
      { x: 0.5104, y: 0.9, width: 0.47, height: 0.08 },
    ]) as any),
    null,
    'cover should be a horizontal full-width panel, not a tall full-width panel'
  );
}

function testCoverPanelCropMatchesStoryThumbnailRatioAndCharacters(): void {
  const page = {
    panels: [
      {
        templatePanel: {
          id: 'p1',
          rect: { x: 0.02, y: 0.34, width: 0.96, height: 0.32 },
        },
      },
    ],
  };
  const crop = buildGraphicNovelCoverPanelCrop({
    page: page as any,
    panelIndex: 0,
    imageWidth: 896,
    imageHeight: 1152,
    analysis: {
      panels: [
        {
          panelIndex: 1,
          detectedCharacters: [],
          occupiedZones: [
            {
              x: 0.72,
              y: 0.18,
              width: 0.22,
              height: 0.74,
              kind: 'character',
            },
          ],
        },
      ],
    },
  });

  assert.ok(crop.borderInsetPx >= 6);
  assert.ok(crop.cropRect.left > crop.fullPanelCropRect.left, 'crop should remove left border');
  assert.ok(crop.cropRect.top > crop.fullPanelCropRect.top, 'crop should remove top border');
  assert.ok(
    crop.cropRect.left + crop.cropRect.width <
      crop.fullPanelCropRect.left + crop.fullPanelCropRect.width,
    'crop should remove right border and crop toward the character area'
  );
  assert.ok(crop.cropRect.left > crop.fullPanelCropRect.left + 60, 'crop should shift toward right-side characters');
  assert.ok(Math.abs(crop.cropRect.width / crop.cropRect.height - 672 / 384) < 0.01);
  assert.equal(crop.focusRect?.x, 0.72);
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

function main(): void {
  testWizardPayloadContract();
  testGraphicNovelQuotaCalculation();
  testGenerationStatusAfterFirstPage();
  testFirstPageCompletionRule();
  testGenerationStatusWithBackgroundFailure();
  testTextManifestFeedsStoryTextAndOverlay();
  testCoverPanelSelectionRequiresFullWidthPanel();
  testCoverPanelCropMatchesStoryThumbnailRatioAndCharacters();
  testGraphicNovelStoryCharacterLinksMatchStorybookFlow();
  console.log('graphicNovelFlowContracts tests passed');
}

main();
