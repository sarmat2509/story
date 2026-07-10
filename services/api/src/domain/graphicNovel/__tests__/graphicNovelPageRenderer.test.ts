import assert from 'node:assert/strict';
import sharp from 'sharp';
import { GRAPHIC_NOVEL_PAGE_SIZE, planGraphicNovelLayouts } from '../layoutPlanner';
import { buildGraphicNovelPageTextOverlay } from '../textOverlay';
import {
  buildGraphicNovelImageRequestManifest,
  buildGraphicNovelPanelCropInstructions,
  buildGraphicNovelPanelCropSystemInstruction,
  normalizeGraphicNovelPanelArtForTemplate,
  overlayGraphicNovelBubblesOnly,
  overlayGraphicNovelPanelFrames,
} from '../pageRenderer';
import type { ReferenceImage } from '../../../providers/base/IImageProvider';
import type { PlannedGraphicNovelPage } from '../types';

function visual(primaryRead: string, characterName = 'Mira') {
  return {
    environmentId: 'env_playroom',
    primaryRead,
    sceneVisual: {
      setting: primaryRead,
      lighting: 'warm playroom light',
      cameraComposition: {
        shot: 'medium shot, eye level',
        characters: [
          {
            name: characterName,
            position: 'left_foreground',
            anchor: { x: 0.3, y: 0.66 },
            speechTarget: { x: 0.3, y: 0.42 },
            description: 'foreground, readable face, clear hand gesture',
          },
        ],
      },
    },
  };
}

function samplePage(): PlannedGraphicNovelPage {
  const page = planGraphicNovelLayouts({
    ageGroup: '4-5',
    pages: [
      {
        pageNumber: 1,
        pageRole: 'opening',
        panels: [
          {
            panelId: 'p1-1',
            beatType: 'setup',
            visualAction: 'A child finds a glowing button.',
            setting: 'Playroom',
            charactersPresent: ['Mira'],
            dialogue: [{ speaker: 'Mira', text: 'What does this do?' }],
            thoughts: [],
            visual: visual('Mira finds a glowing button'),
            artPrompt: 'A child finding a glowing button in a cozy playroom.',
          },
          {
            panelId: 'p1-2',
            beatType: 'reaction',
            visualAction: 'A soft light answers.',
            setting: 'Playroom',
            charactersPresent: ['Mira'],
            dialogue: [],
            thoughts: [{ speaker: 'Mira', text: 'It feels friendly.' }],
            visual: visual('A soft light answers'),
            artPrompt: 'A soft friendly light glowing in a cozy playroom.',
          },
        ],
      },
    ],
  })[0];
  page.characterAliases = {
    Mira: ['Mira', 'Mila'],
  };
  return page;
}

async function pixelAt(
  buffer: Buffer,
  x: number,
  y: number
): Promise<[number, number, number, number]> {
  const raw = await sharp(buffer)
    .resize(GRAPHIC_NOVEL_PAGE_SIZE.width, GRAPHIC_NOVEL_PAGE_SIZE.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const index = (y * GRAPHIC_NOVEL_PAGE_SIZE.width + x) * 4;
  return [raw[index], raw[index + 1], raw[index + 2], raw[index + 3]];
}

async function pixelAtImage(
  buffer: Buffer,
  width: number,
  x: number,
  y: number
): Promise<[number, number, number, number]> {
  const raw = await sharp(buffer).ensureAlpha().raw().toBuffer();
  const index = (y * width + x) * 4;
  return [raw[index], raw[index + 1], raw[index + 2], raw[index + 3]];
}

function testHtmlTextOverlayCoordinates(): void {
  const page = samplePage();
  const overlay = buildGraphicNovelPageTextOverlay(page);
  const firstBubble = page.panels[0].bubbles[0];

  assert.equal(overlay.mode, 'html_overlay');
  assert.equal(overlay.coordinateSpace, 'normalized_0_1');
  assert.equal(overlay.items.length, 2);
  assert.equal(overlay.plainText, 'What does this do?\nIt feels friendly.');
  assert.equal(overlay.items[0].segmentId, 'gn-p1-panel1-bubble1');
  assert.equal(overlay.items[0].htmlId, 'graphic-novel-gn-p1-panel1-bubble1');
  assert.equal(overlay.items[0].speaker, 'Mira');
  assert.equal(overlay.items[0].text, firstBubble.text);
  assert.equal(overlay.items[0].ariaLabel, 'Mira says: What does this do?');
  assert.deepEqual(overlay.items[0].rect, firstBubble.rect);
  assert.match(overlay.items[0].cssPercent.left, /%$/);
  assert.match(overlay.items[0].cssPercent.top, /%$/);
  assert.equal(overlay.textStyle, undefined);
}

function testHtmlTextOverlayIncludesBubbleTextStyle(): void {
  const page = {
    ...samplePage(),
    bubbleTextSizing: {
      fontSizePx: 26,
      lineHeightPx: 30,
      paddingXPx: 18,
      paddingYPx: 8,
      targetPageWidthPx: 992,
      targetPageHeightPx: 1323,
    },
  };
  const overlay = buildGraphicNovelPageTextOverlay(page);

  assert.deepEqual(overlay.textStyle, {
    fontSizePx: 26,
    lineHeightPx: 30,
    paddingXPx: 18,
    paddingYPx: 8,
    targetPageWidthPx: 992,
    targetPageHeightPx: 1323,
  });
}

function testHtmlTextOverlaySeparatesRawArtifactText(): void {
  const page = samplePage();
  page.panels[0].bubbles[0].text = 'I found {Star Key}.';
  const overlay = buildGraphicNovelPageTextOverlay(page, {
    displayTextTransform: (value) => value.replace(/\{([^{}]+)\}/g, '$1'),
  });

  assert.equal(overlay.items[0].rawText, 'I found {Star Key}.');
  assert.equal(overlay.items[0].text, 'I found Star Key.');
  assert.equal(overlay.rawPlainText.includes('{Star Key}'), true);
  assert.equal(overlay.plainText.includes('{Star Key}'), false);
}

function testPanelCropInstructionsUseScenePrompt(): void {
  const page = samplePage();
  const systemInstruction = buildGraphicNovelPanelCropSystemInstruction({
    style: 'colored_pencil',
    ageGroup: '6-8',
  });
  const prompt = buildGraphicNovelPanelCropInstructions(page, 0, new Map(), [], {
    style: 'colored_pencil',
    ageGroup: '6-8',
  });

  assert.match(systemInstruction, /edge-to-edge/);
  assert.match(systemInstruction, /full-bleed artwork extending past all four image edges/i);
  assert.doesNotMatch(systemInstruction, /illustration on textured paper/i);
  assert.match(prompt, /- Scene: Mira finds a glowing button/);
  assert.match(prompt, /- Composition: medium shot, eye level/);
  assert.doesNotMatch(prompt, /replacement comic panel crop/i);
  assert.doesNotMatch(prompt, /artwork inside Panel/i);
  assert.doesNotMatch(prompt, /wide image inside a white canvas/i);
  assert.doesNotMatch(prompt, /letterboxing/i);
  assert.doesNotMatch(prompt, /Panel 1:/);
}

async function testNormalizePanelArtTrimsLetterboxBeforeResize(): Promise<void> {
  const art = await sharp({
    create: {
      width: 200,
      height: 90,
      channels: 4,
      background: '#2c6ca3',
    },
  })
    .png()
    .toBuffer();
  const letterboxed = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite([{ input: art, left: 0, top: 55 }])
    .png()
    .toBuffer();

  const normalized = await normalizeGraphicNovelPanelArtForTemplate(letterboxed, {
    width: 200,
    height: 200,
  });
  const metadata = await sharp(normalized).metadata();
  const top = await pixelAtImage(normalized, 200, 100, 4);
  const bottom = await pixelAtImage(normalized, 200, 100, 195);

  assert.equal(metadata.width, 200);
  assert.equal(metadata.height, 200);
  assert.ok(top[2] > 120 && top[0] < 80, 'top edge should be artwork, not white letterbox');
  assert.ok(
    bottom[2] > 120 && bottom[0] < 80,
    'bottom edge should be artwork, not white letterbox'
  );
}

function testImageRequestManifestOmitsCombinedFullTextPrompt(): void {
  const manifest = buildGraphicNovelImageRequestManifest({
    operation: 'graphic_novel_template_panel_generate',
    mode: 'generate',
    prompt: 'Create a page.',
    systemInstruction: 'No text. No speech bubbles.',
    referenceImages: [
      {
        base64Data: 'abc',
        mimeType: 'image/png',
        characterName: 'Mira',
        referenceKind: 'character',
        source: 'character_reference',
        imageIndex: 1,
        referenceBindingId: 'REF_CH_MIRA_TEST01',
        storagePath: 'photos/mira.png',
      } as any,
    ],
  });

  assert.equal(manifest.prompt, 'Create a page.');
  assert.equal(manifest.systemInstruction, 'No text. No speech bubbles.');
  assert.equal(Object.prototype.hasOwnProperty.call(manifest, 'fullTextPrompt'), false);
}

function testImageRequestManifestCarriesProviderRawRequest(): void {
  const manifest = buildGraphicNovelImageRequestManifest({
    operation: 'graphic_novel_template_panel_generate',
    mode: 'generate',
    prompt: 'Create a page.',
    systemInstruction: 'No text. No speech bubbles.',
    referenceImages: [],
    providerRequestManifest: {
      providerRequestId: 'gemini-img-test',
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      endpointUsed: 'generateContent',
      fullTextPrompt: 'The next image is REF_CH_MIRA_TEST01.\n\nCreate a page.',
      partsCount: 3,
      modelRequest: {
        endpoint: 'models.generateContent',
        input: [
          { type: 'text', text: 'The next image is REF_CH_MIRA_TEST01.' },
          { type: 'image', data: '[omitted base64 image payload]' },
          { type: 'text', text: 'Create a page.' },
        ],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio: '3:4' },
        },
      },
    },
  });

  assert.equal(manifest.providerRequestId, 'gemini-img-test');
  assert.equal(manifest.endpointUsed, 'generateContent');
  assert.equal(manifest.fullTextPrompt, 'The next image is REF_CH_MIRA_TEST01.\n\nCreate a page.');
  assert.equal((manifest.modelRequest as any).endpoint, 'models.generateContent');
  assert.deepEqual(
    (manifest.modelRequest as any).input.map((part: any) => part.type),
    ['text', 'image', 'text']
  );
  assert.equal(manifest.prompt, 'Create a page.');
  assert.equal(manifest.systemInstruction, 'No text. No speech bubbles.');
}

function testEnvironmentReferenceSuppressesEnvironmentDescription(): void {
  const page = samplePage();
  const environments = new Map([
    [
      'env_playroom',
      {
        id: 'env_playroom',
        name: 'Playroom',
        description:
          'A long reusable playroom description with shelves, rugs, lamps, and window placement.',
      },
    ],
  ]);
  const referenceImages: Array<ReferenceImage & { source?: string; type?: string }> = [
    {
      base64Data: 'env',
      mimeType: 'image/png',
      characterName: 'Playroom',
      referenceKind: 'object',
      source: 'environment',
      type: 'environment_reference',
      imageIndex: 1,
      referenceBindingId: 'REF_ENV_PLAYROOM_TEST01',
      instructionText:
        'Image 1: Environment reference for "Playroom". Reusable location structure.',
    },
  ];
  const systemInstruction = buildGraphicNovelPanelCropSystemInstruction({
    style: 'warm_3d',
    ageGroup: '6-8',
    referenceImages,
  });
  const prompt = buildGraphicNovelPanelCropInstructions(page, 0, environments, referenceImages, {
    style: 'warm_3d',
    ageGroup: '6-8',
  });

  assert.match(systemInstruction, /MUST AVOID any kind of text/);
  assert.doesNotMatch(systemInstruction, /Never render reference IDs/);
  assert.doesNotMatch(prompt, /MUST AVOID any kind of text/);
  assert.doesNotMatch(prompt, /REFERENCE INPUTS:/);
  assert.doesNotMatch(prompt, /ATTACHED REFERENCE INPUTS:/);
  assert.doesNotMatch(prompt, /REF_ENV_\* references are location sources/);
  assert.doesNotMatch(prompt, /long reusable playroom description/);
  assert.doesNotMatch(prompt, /REFERENCE IMAGES TO FOLLOW/);
  assert.doesNotMatch(prompt, /Image 1: Environment reference/);
}

async function testBubbleOnlyOverlayPreservesArtAndDrawsBubble(): Promise<void> {
  const page = samplePage();
  const redBase = await sharp({
    create: {
      width: GRAPHIC_NOVEL_PAGE_SIZE.width,
      height: GRAPHIC_NOVEL_PAGE_SIZE.height,
      channels: 4,
      background: '#ff0000',
    },
  })
    .png()
    .toBuffer();

  const finalImage = await overlayGraphicNovelBubblesOnly(redBase, page);
  const bubble = page.panels[0].bubbles[0].rect;
  const bubbleCenter = await pixelAt(
    finalImage,
    Math.round((bubble.x + bubble.width * 0.5) * GRAPHIC_NOVEL_PAGE_SIZE.width),
    Math.round((bubble.y + bubble.height * 0.5) * GRAPHIC_NOVEL_PAGE_SIZE.height)
  );
  const untouchedCorner = await pixelAt(finalImage, 8, 8);

  assert.ok(
    bubbleCenter[1] > 180 && bubbleCenter[2] > 180,
    'bubble fill should be composited over art'
  );
  assert.ok(
    untouchedCorner[0] > 220 && untouchedCorner[1] < 80 && untouchedCorner[2] < 80,
    'art outside bubbles should remain unchanged'
  );
}

async function testPanelFrameOverlayDrawsDeterministicPanelBorders(): Promise<void> {
  const page = samplePage();
  const redBase = await sharp({
    create: {
      width: GRAPHIC_NOVEL_PAGE_SIZE.width,
      height: GRAPHIC_NOVEL_PAGE_SIZE.height,
      channels: 4,
      background: '#ff0000',
    },
  })
    .png()
    .toBuffer();

  const framedImage = await overlayGraphicNovelPanelFrames(redBase, page);
  const panelRect = page.panels[0].templatePanel.rect;
  const borderPixel = await pixelAt(
    framedImage,
    Math.round(panelRect.x * GRAPHIC_NOVEL_PAGE_SIZE.width + 4),
    Math.round(panelRect.y * GRAPHIC_NOVEL_PAGE_SIZE.height + 4)
  );
  const innerPixel = await pixelAt(
    framedImage,
    Math.round((panelRect.x + panelRect.width * 0.5) * GRAPHIC_NOVEL_PAGE_SIZE.width),
    Math.round((panelRect.y + panelRect.height * 0.5) * GRAPHIC_NOVEL_PAGE_SIZE.height)
  );

  assert.ok(
    borderPixel[0] < 40 && borderPixel[1] < 40 && borderPixel[2] < 40,
    'panel frame should be composited as a black deterministic border'
  );
  assert.ok(
    innerPixel[0] > 220 && innerPixel[1] < 80 && innerPixel[2] < 80,
    'panel frame overlay should not alter panel artwork away from the border'
  );
}

async function main(): Promise<void> {
  testHtmlTextOverlayCoordinates();
  testHtmlTextOverlayIncludesBubbleTextStyle();
  testHtmlTextOverlaySeparatesRawArtifactText();
  testPanelCropInstructionsUseScenePrompt();
  testImageRequestManifestOmitsCombinedFullTextPrompt();
  testImageRequestManifestCarriesProviderRawRequest();
  testEnvironmentReferenceSuppressesEnvironmentDescription();
  await testBubbleOnlyOverlayPreservesArtAndDrawsBubble();
  await testPanelFrameOverlayDrawsDeterministicPanelBorders();
  await testNormalizePanelArtTrimsLetterboxBeforeResize();
  console.log('graphicNovelPageRenderer tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
