import assert from 'node:assert/strict';
import sharp from 'sharp';
import { GRAPHIC_NOVEL_PAGE_SIZE, planGraphicNovelLayouts } from '../layoutPlanner';
import { buildGraphicNovelPageTextOverlay } from '../textOverlay';
import {
  buildGraphicNovelPageEditInstructions,
  buildGraphicNovelPageSystemInstruction,
  detectGraphicNovelTemplateColorResidue,
  editGraphicNovelPage,
  overlayGraphicNovelTemplate,
  renderGraphicNovelPageTemplate,
} from '../pageRenderer';
import type { PlannedGraphicNovelPage } from '../types';
import type { GeneratedImage } from '../../../providers/base/IImageProvider';

function visual(primaryRead: string, characterName = 'Mira') {
  return {
    environmentId: 'env_playroom',
    primaryRead,
    sceneVisual: {
      setting: primaryRead,
      lighting: 'warm playroom light',
      cameraComposition: {
        shot: 'medium shot, eye level',
        characters: [{
          name: characterName,
          position: 'left_foreground',
          anchor: { x: 0.3, y: 0.66 },
          speechTarget: { x: 0.3, y: 0.42 },
          description: 'foreground, readable face, clear hand gesture',
        }],
      },
    },
  };
}

function samplePage(): PlannedGraphicNovelPage {
  return planGraphicNovelLayouts({
    ageGroup: '4-5',
    pages: [{
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
    }],
  })[0];
}

async function paintRect(
  source: Buffer,
  rect: { x: number; y: number; width: number; height: number },
  fill = '#ff0000'
): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
    <rect width="100%" height="100%" fill="${fill}"/>
  </svg>`;
  return sharp(source)
    .composite([{ input: Buffer.from(svg), left: rect.x, top: rect.y }])
    .png()
    .toBuffer();
}

function generated(imageData: Buffer, id: string): GeneratedImage {
  return {
    imageData,
    mimeType: 'image/png',
    width: GRAPHIC_NOVEL_PAGE_SIZE.width,
    height: GRAPHIC_NOVEL_PAGE_SIZE.height,
    format: 'png',
    providerInteractionId: id,
  };
}

async function pixelAt(buffer: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
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

function testEditInstructionsIncludeReferencesAndPostArtBubblePlacement(): void {
  const page = samplePage();
  page.outfits = [{
    id: 'o_mira_swimwear',
    characterName: 'Mira',
    description: 'age-appropriate blue swimwear, bare feet, no jacket',
  }];
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition !== 'string') {
      composition.characters[0].outfitId = 'o_mira_swimwear';
    }
  }
  const systemInstruction = buildGraphicNovelPageSystemInstruction({
    style: 'warm_3d',
    slotCount: page.panels.length,
    ageGroup: '6-8',
  });
  const prompt = buildGraphicNovelPageEditInstructions(page, new Map(), [
    {
      base64Data: 'abc',
      mimeType: 'image/png',
      characterName: 'Mira',
      referenceKind: 'character',
      instructionText: 'Image 1: IDENTITY SOURCE Subject A for "Mira". Character sheet. Use as the locked source of truth for face/head design, exact hairstyle or fur/body structure, age/species read, body proportions, silhouette, stable palette, and distinctive marks.',
    },
  ]);

  assert.match(prompt, /REFERENCE IMAGES TO FOLLOW/);
  assert.match(prompt, /Image 1: Character reference for "Mira"\. Character sheet\./);
  assert.doesNotMatch(prompt, /PAGE STRUCTURE/);
  assert.doesNotMatch(prompt, /Exactly 2 color-coded slots/);
  assert.doesNotMatch(prompt, /The only valid color-coded slots are/);
  assert.match(prompt, /sky-blue slot:\n- Slot color: sky-blue\.\n- Slot position: x=/);
  assert.match(prompt, /- Slot size: width=/);
  assert.match(prompt, /peach slot:\n- Slot color: peach\.\n- Slot position: x=/);
  assert.match(prompt, /Characters in slot/);
  assert.match(prompt, /Mira: position left_foreground/);
  assert.match(prompt, /outfit age-appropriate blue swimwear, bare feet, no jacket/);
  assert.doesNotMatch(prompt, /Environment id:/);
  assert.doesNotMatch(prompt, /Character staging/);
  assert.doesNotMatch(prompt, /If Character staging mentions/);
  assert.doesNotMatch(prompt, /Use as the locked source of truth/);
  assert.doesNotMatch(prompt, /locked visual ground truth/);
  assert.doesNotMatch(prompt, /Never borrow a character design/);
  assert.doesNotMatch(prompt, /Fill this color-coded slot/);
  assert.doesNotMatch(prompt, /\b(?:Do not|Never|do not|never)\b/);
  assert.doesNotMatch(systemInstruction, /\b(?:Do not|Never|do not|never)\b/);
  assert.match(systemInstruction, /high-quality modern 3D animated film render/);
  assert.match(systemInstruction, /rounded appealing character forms/);
  assert.doesNotMatch(systemInstruction, /Style: warm_3d/);
  assert.match(systemInstruction, /exactly 2 color-coded slots/);
  assert.match(systemInstruction, /Each ART TO ADD slot section maps one guide color to one scene/);
  assert.match(systemInstruction, /Each slot contains one single visual moment/);
  assert.match(systemInstruction, /Each slot uses exactly the characters listed under Characters in slot/);
  assert.match(systemInstruction, /full-bleed illustration to the inside edge/);
  assert.match(systemInstruction, /Character identity reference images are locked visual ground truth/);
  assert.match(systemInstruction, /Outfit instructions are wardrobe-only/);
  assert.doesNotMatch(prompt, /numbered/i);
  assert.doesNotMatch(prompt, /bubble/i);
  assert.doesNotMatch(prompt, /comic/i);
  assert.doesNotMatch(prompt, /graphic[- ]novel/i);
}

function testEnvironmentReferenceSuppressesEnvironmentDescription(): void {
  const page = samplePage();
  const environments = new Map([
    ['env_playroom', {
      id: 'env_playroom',
      name: 'Playroom',
      description: 'A long reusable playroom description with shelves, rugs, lamps, and window placement.',
    }],
  ]);
  const prompt = buildGraphicNovelPageEditInstructions(page, environments, [
    {
      base64Data: 'env',
      mimeType: 'image/png',
      characterName: 'Playroom',
      referenceKind: 'object',
      instructionText: 'Image 1: Environment reference for "Playroom". Reusable location structure.',
    },
  ]);

  assert.doesNotMatch(prompt, /ENVIRONMENT TO REUSE/);
  assert.match(prompt, /- Environment: Playroom; use Image 1 environment reference\./);
  assert.doesNotMatch(prompt, /long reusable playroom description/);
}

async function testOverlayPreservesPanelArtAndMasksGutters(): Promise<void> {
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
  const finalImage = await overlayGraphicNovelTemplate(redBase, page);
  const panel = page.panels[0].templatePanel.rect;
  const insidePanel = await pixelAt(
    finalImage,
    Math.round((panel.x + panel.width * 0.5) * GRAPHIC_NOVEL_PAGE_SIZE.width),
    Math.round((panel.y + panel.height * 0.75) * GRAPHIC_NOVEL_PAGE_SIZE.height)
  );
  const gutter = await pixelAt(finalImage, 4, 4);

  assert.ok(insidePanel[0] > 220 && insidePanel[1] < 80 && insidePanel[2] < 80, 'panel art should remain visible');
  assert.ok(gutter[0] > 230 && gutter[1] > 220 && gutter[2] > 190, 'gutters should be restored over spilled art');
}

async function testTemplateColorResidueDetector(): Promise<void> {
  const page = samplePage();
  const template = await renderGraphicNovelPageTemplate(page);
  const templateCheck = await detectGraphicNovelTemplateColorResidue(template, page);
  assert.equal(templateCheck.hasResidue, true);
  assert.ok(templateCheck.matchedPixels > templateCheck.thresholdPixels);

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
  const finalImage = await overlayGraphicNovelTemplate(redBase, page);
  const finalCheck = await detectGraphicNovelTemplateColorResidue(finalImage, page);
  assert.equal(finalCheck.hasResidue, false);
}

async function testEditAcceptsFirstImageWithoutProtectedRetry(): Promise<void> {
  const page = samplePage();
  const template = await renderGraphicNovelPageTemplate(page);
  const invalidEdit = await paintRect(template, {
    x: 0,
    y: 0,
    width: GRAPHIC_NOVEL_PAGE_SIZE.width,
    height: 220,
  });
  const editInstructions: string[] = [];
  const systemInstructions: string[] = [];
  const operations: Array<string | undefined> = [];
  const referenceCounts: number[] = [];
  const attemptImages: number[] = [];
  let calls = 0;
  const imageDomain = {
    async editImageWithInstructions(request: {
      editInstructions: string;
      systemInstruction?: string;
      operation?: string;
      referenceImages?: unknown[];
    }): Promise<GeneratedImage> {
      calls += 1;
      editInstructions.push(request.editInstructions);
      systemInstructions.push(request.systemInstruction || '');
      operations.push(request.operation);
      referenceCounts.push(request.referenceImages?.length || 0);
      return generated(invalidEdit, `edit-${calls}`);
    },
  };

  const result = await editGraphicNovelPage({
    imageDomain: imageDomain as any,
    page,
    templateBuffer: template,
    style: 'soft_watercolor',
    referenceImages: [
      {
        base64Data: 'abc',
        mimeType: 'image/png',
        characterName: 'Mira',
        referenceKind: 'character',
        instructionText: 'Image 1: Character reference for "Mira". Character sheet.',
      },
    ],
    onAttemptImage: ({ attempt }) => {
      attemptImages.push(attempt);
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(referenceCounts, [1]);
  assert.deepEqual(attemptImages, [1]);
  assert.deepEqual(operations, ['graphic_novel_page_edit']);
  assert.match(systemInstructions[0], /ART STYLE:/);
  assert.match(systemInstructions[0], /exactly 2 color-coded slots/);
  assert.match(systemInstructions[0], /Each ART TO ADD slot section maps one guide color to one scene/);
  assert.doesNotMatch(editInstructions[0], /ART STYLE:/);
  assert.doesNotMatch(editInstructions[0], /exactly 2 color-coded slots/);
  assert.doesNotMatch(editInstructions[0], /Each ART TO ADD slot section maps one guide color to one scene/);
  assert.doesNotMatch(editInstructions[0], /STRICT RETRY/);
  assert.equal(result.generationParams.editAttempts, 1);
  assert.equal(result.generationParams.protectedTemplateValidationSkipped, true);
  assert.equal(result.generationParams.validationPassed, null);
  assert.equal(result.generationParams.fallbackOverlayRequired, false);
  assert.equal(result.generationParams.deterministicOverlayApplied, false);
}

async function testEditDoesNotFallbackAfterProtectedDrift(): Promise<void> {
  const page = samplePage();
  const template = await renderGraphicNovelPageTemplate(page);
  const invalidEdit = await paintRect(template, {
    x: 0,
    y: 0,
    width: GRAPHIC_NOVEL_PAGE_SIZE.width,
    height: 220,
  });
  let calls = 0;
  const imageDomain = {
    async editImageWithInstructions(): Promise<GeneratedImage> {
      calls += 1;
      return generated(invalidEdit, `bad-edit-${calls}`);
    },
  };

  const result = await editGraphicNovelPage({
    imageDomain: imageDomain as any,
    page,
    templateBuffer: template,
    style: 'soft_watercolor',
  });

  assert.equal(calls, 1);
  assert.equal(result.generationParams.editAttempts, 1);
  assert.equal(result.generationParams.protectedTemplateValidationSkipped, true);
  assert.equal(result.generationParams.validationPassed, null);
  assert.equal(result.generationParams.fallbackOverlayRequired, false);
  assert.equal(result.generationParams.deterministicOverlayApplied, false);
}

async function main(): Promise<void> {
  testHtmlTextOverlayCoordinates();
  testHtmlTextOverlaySeparatesRawArtifactText();
  testEditInstructionsIncludeReferencesAndPostArtBubblePlacement();
  testEnvironmentReferenceSuppressesEnvironmentDescription();
  await testOverlayPreservesPanelArtAndMasksGutters();
  await testTemplateColorResidueDetector();
  await testEditAcceptsFirstImageWithoutProtectedRetry();
  await testEditDoesNotFallbackAfterProtectedDrift();
  console.log('graphicNovelPageRenderer tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
