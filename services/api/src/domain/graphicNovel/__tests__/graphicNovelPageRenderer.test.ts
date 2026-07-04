import assert from 'node:assert/strict';
import sharp from 'sharp';
import { GRAPHIC_NOVEL_PAGE_SIZE, planGraphicNovelLayouts } from '../layoutPlanner';
import { buildGraphicNovelPageTextOverlay } from '../textOverlay';
import {
  buildGraphicNovelImageRequestManifest,
  buildGraphicNovelPageFreeLayoutInstructions,
  buildGraphicNovelPageFreeLayoutSystemInstruction,
  buildGraphicNovelPageValidationRepairInstructions,
  overlayGraphicNovelBubblesOnly,
} from '../pageRenderer';
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
  return planGraphicNovelLayouts({
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

function testFreeLayoutInstructionsUseReferencesWithoutPresetSlots(): void {
  const page = samplePage();
  page.outfits = [
    {
      id: 'o_mira_swimwear',
      characterName: 'Mira',
      description: 'age-appropriate blue swimwear, bare feet, no jacket',
    },
  ];
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition !== 'string') {
      composition.characters[0].outfitId = 'o_mira_swimwear';
    }
  }

  const systemInstruction = buildGraphicNovelPageFreeLayoutSystemInstruction({
    style: 'warm_3d',
    panelCount: page.panels.length,
    ageGroup: '6-8',
  });
  const prompt = buildGraphicNovelPageFreeLayoutInstructions(page, new Map(), [
    {
      base64Data: 'abc',
      mimeType: 'image/png',
      characterName: 'Mira',
      referenceKind: 'character',
      imageIndex: 1,
      referenceBindingId: 'REF_CH_MIRA_TEST01',
      instructionText: 'Image 1: IDENTITY SOURCE Subject A for "Mira". Character sheet.',
    },
    {
      base64Data: 'outfit',
      mimeType: 'image/png',
      characterName: 'Mira',
      referenceKind: 'object',
      source: 'outfit_plate',
      type: 'outfit_plate_reference',
      imageIndex: 2,
      referenceBindingId: 'REF_OUTFIT_MIRA_TEST02',
      instructionText: 'Image 2: Outfit reference for "Mira".',
    } as any,
  ]);

  assert.doesNotMatch(systemInstruction, /exactly 2 comic panels/);
  assert.doesNotMatch(systemInstruction, /No preset layout guide image is attached/);
  assert.match(systemInstruction, /No text\. No speech bubbles\./);
  assert.match(prompt, /Create a single comic page with exactly 2 panels/);
  assert.doesNotMatch(prompt, /Choose the panel layout yourself/);
  assert.match(prompt, /REF_CH_MIRA_TEST01 \/ Image 1: Character identity reference for "Mira"\./);
  assert.match(prompt, /REF_OUTFIT_MIRA_TEST02 \/ Image 2: Outfit reference for "Mira"\./);
  assert.match(prompt, /REFERENCE BINDING REGISTRY:/);
  assert.match(prompt, /Characters:/);
  assert.match(prompt, /Characters allowed in this panel: Mira \/ REF_CH_MIRA_TEST01 \/ Image 1/);
  assert.match(prompt, /Mira \/ REF_CH_MIRA_TEST01 \/ Image 1: position left_foreground/);
  assert.match(prompt, /outfit from REF_OUTFIT_MIRA_TEST02 \/ Image 2/);
  assert.doesNotMatch(prompt, /outfit age-appropriate blue swimwear, bare feet, no jacket/);
  assert.doesNotMatch(prompt, /color-coded/i);
  assert.doesNotMatch(prompt, /\bslot\b/i);
  assert.doesNotMatch(prompt, /PAGE TEMPLATE/i);
  assert.doesNotMatch(prompt, /Fill this/);
}

function testImageRequestManifestUsesCompactReferenceGuide(): void {
  const manifest = buildGraphicNovelImageRequestManifest({
    operation: 'graphic_novel_page_free_layout_generate',
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

  const fullTextPrompt = String(manifest.fullTextPrompt || '');
  assert.match(fullTextPrompt, /REFERENCE IMAGE GUIDE:/);
  assert.match(fullTextPrompt, /REF_CH_MIRA_TEST01 \/ Image 1: Character identity reference for "Mira"\./);
  assert.doesNotMatch(fullTextPrompt, /REFERENCE IMAGES:\n\[/);
  assert.doesNotMatch(fullTextPrompt, /"storagePath"/);
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
  const prompt = buildGraphicNovelPageFreeLayoutInstructions(page, environments, [
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
  ]);

  assert.match(prompt, /- Environment: Playroom; REF_ENV_PLAYROOM_TEST01 \/ Image 1\./);
  assert.doesNotMatch(prompt, /long reusable playroom description/);
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

function testRepairInstructionsUsePanelBoundsWithoutPresetSlots(): void {
  const page = samplePage();
  const prompt = buildGraphicNovelPageValidationRepairInstructions({
    page,
    score: 72,
    validation: {
      characterCount: 1,
      expectedCharacterCount: 1,
      characters: [],
      hasUnexpectedCharacters: false,
      hasTextOrLetters: false,
      hasRenderingArtifacts: false,
      hasArtworkOutsidePanelBounds: true,
      hasArtworkOverSpeechBubbles: false,
      hasExtraPanelStructure: false,
      layoutFeedback: 'art spills outside panel 1',
      overallFeedback: 'repair panel bounds',
    },
  });

  assert.match(prompt, /Panel 1 bounds: x=/);
  assert.match(prompt, /artwork outside panel bounds: yes/);
  assert.doesNotMatch(prompt, /color-coded/i);
  assert.doesNotMatch(prompt, /\bslot\b/i);
  assert.doesNotMatch(prompt, /guide color/i);
}

async function main(): Promise<void> {
  testHtmlTextOverlayCoordinates();
  testHtmlTextOverlayIncludesBubbleTextStyle();
  testHtmlTextOverlaySeparatesRawArtifactText();
  testFreeLayoutInstructionsUseReferencesWithoutPresetSlots();
  testImageRequestManifestUsesCompactReferenceGuide();
  testEnvironmentReferenceSuppressesEnvironmentDescription();
  await testBubbleOnlyOverlayPreservesArtAndDrawsBubble();
  testRepairInstructionsUsePanelBoundsWithoutPresetSlots();
  console.log('graphicNovelPageRenderer tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
