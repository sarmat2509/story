/**
 * Render one graphic-novel page from an existing script JSON.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx \
 *     src/scripts/renderGraphicNovelPageWithTextFromScript.ts \
 *     --script-json=/abs/path/script.json --story-id=<uuid> --page=1
 *
 * Re-overlay an existing art-only page without calling the image model:
 *   ... --art-only-image=/abs/path/page-1-art-only.png
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import {
  analyzeGraphicNovelBubbleVisionByPanelCrops,
  applyGraphicNovelBubbleVisionLayout,
  editGraphicNovelPage,
  overlayGraphicNovelTemplate,
  renderGraphicNovelPageTemplate,
} from '../domain/graphicNovel';
import { GRAPHIC_NOVEL_PAGE_SIZE, planGraphicNovelLayouts } from '../domain/graphicNovel/layoutPlanner';
import { getImageDomainService, getValidationTextProvider } from '../services/aiService';
import { buildStorySpec } from '../services/storyOrchestrationService';
import { getAssetStorageService } from '../services/assetStorageService';
import type { GraphicNovelScript, PlannedGraphicNovelPage, Rect } from '../domain/graphicNovel';
import type { ReferenceImage } from '../providers/base/IImageProvider';

const DEFAULT_STORY_ID = '13606f1c-539d-4404-8ccf-8cbd125ec392';
const DEFAULT_SCRIPT_JSON = path.resolve(
  process.cwd(),
  'output',
  'graphic-novel-diagnostic-13606f1c-539d-4404-8ccf-8cbd125ec392-1782415573742',
  'script.json'
);

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function px(rect: Rect): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(rect.x * GRAPHIC_NOVEL_PAGE_SIZE.width),
    y: Math.round(rect.y * GRAPHIC_NOVEL_PAGE_SIZE.height),
    width: Math.round(rect.width * GRAPHIC_NOVEL_PAGE_SIZE.width),
    height: Math.round(rect.height * GRAPHIC_NOVEL_PAGE_SIZE.height),
  };
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function visualUnits(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (/\s/u.test(char)) return sum + 0.35;
    if (/[.,:;'"’`!?|()[\]{}]/u.test(char)) return sum + 0.35;
    if (/[ijlI1іїІЇ]/u.test(char)) return sum + 0.55;
    if (/[mwшщюжфWМШЩЮЖФ]/u.test(char)) return sum + 1.2;
    return sum + 1;
  }, 0);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = (text.trim() || ' ').split(/\s+/u);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const next = `${current} ${word}`;
    if (charLength(next) <= maxChars) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [' '];
}

function fitText(text: string, rect: Rect, kind: 'speech' | 'thought' | 'caption'): {
  lines: string[];
  fontSize: number;
  lineHeight: number;
} {
  const r = px(rect);
  const padX = kind === 'caption' ? 26 : 30;
  const padY = kind === 'caption' ? 18 : 22;
  const maxFont = kind === 'caption' ? 25 : 29;
  const minFont = 16;

  for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 1) {
    const maxChars = Math.max(7, Math.floor((r.width - padX * 2) / (fontSize * 0.55)));
    const lines = wrapText(text, maxChars);
    const lineHeight = fontSize * 1.16;
    const textHeight = lines.length * lineHeight;
    const widest = Math.max(...lines.map(visualUnits)) * fontSize * 0.55;
    if (textHeight <= r.height - padY * 2 && widest <= r.width - padX * 2) {
      return { lines, fontSize, lineHeight };
    }
  }

  const fontSize = minFont;
  return {
    lines: wrapText(text, Math.max(7, Math.floor((r.width - 36) / (fontSize * 0.55)))),
    fontSize,
    lineHeight: fontSize * 1.16,
  };
}

function buildTextSvg(page: PlannedGraphicNovelPage): string {
  const nodes: string[] = [];
  for (const panel of page.panels) {
    for (const bubble of panel.bubbles) {
      const r = px(bubble.rect);
      const fit = fitText(bubble.text, bubble.rect, bubble.kind);
      const centerX = r.x + r.width / 2;
      const totalHeight = fit.lines.length * fit.lineHeight;
      const startY = r.y + (r.height - totalHeight) / 2 + fit.fontSize * 0.86;
      const tspans = fit.lines.map((line, index) =>
        `<tspan x="${centerX}" y="${(startY + index * fit.lineHeight).toFixed(1)}">${escapeXml(line)}</tspan>`
      ).join('');
      nodes.push([
        `<text text-anchor="middle"`,
        `font-family="Arial, Helvetica, sans-serif"`,
        `font-size="${fit.fontSize}"`,
        `font-weight="700"`,
        `letter-spacing="0"`,
        `fill="#111">${tspans}</text>`,
      ].join(' '));
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAPHIC_NOVEL_PAGE_SIZE.width}" height="${GRAPHIC_NOVEL_PAGE_SIZE.height}" viewBox="0 0 ${GRAPHIC_NOVEL_PAGE_SIZE.width} ${GRAPHIC_NOVEL_PAGE_SIZE.height}">
${nodes.join('\n')}
</svg>`;
}

async function overlayText(image: Buffer, page: PlannedGraphicNovelPage): Promise<Buffer> {
  const textOverlay = await sharp(Buffer.from(buildTextSvg(page))).png().toBuffer();
  return sharp(image)
    .composite([{ input: textOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

function extractStoragePath(url: string): string {
  const withoutQuery = url.split('?')[0];
  const withoutOrigin = withoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return withoutOrigin.replace(/^\/api\/v1\/assets\//, '').replace(/^\/+/, '');
}

function mimeTypeForStoragePath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function pageCharacterNames(page: PlannedGraphicNovelPage): Set<string> {
  const names = new Set<string>();
  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition === 'string') continue;
    for (const character of composition.characters) {
      if (character.name) names.add(character.name.trim().toLowerCase());
    }
  }
  return names;
}

async function loadCharacterReferences(params: {
  storyId: string;
  page: PlannedGraphicNovelPage;
}): Promise<ReferenceImage[]> {
  const [{ db, closeDatabaseConnection }, schema, repositories] = await Promise.all([
    import('../db'),
    import('../db/schema'),
    import('../repositories'),
  ]);
  const sourceStory = await repositories.getStoryRepository().findById(params.storyId);
  if (!sourceStory) return [];
  let sourceRequest = sourceStory.storyRequestId
    ? await repositories.getStoryRepository().findRequestById(sourceStory.storyRequestId)
    : null;
  if (!sourceRequest) {
    const [requestByStoryId] = await db
      .select()
      .from(schema.storyRequests)
      .where(eq(schema.storyRequests.storyId, params.storyId))
      .limit(1);
    sourceRequest = requestByStoryId ?? null;
  }
  if (!sourceRequest) return [];

  const { spec } = await buildStorySpec({
    ...sourceRequest,
    selectedCharacters: Array.isArray(sourceRequest.selectedCharacters) ? sourceRequest.selectedCharacters : [],
    selectedChildren: Array.isArray(sourceRequest.selectedChildren) ? sourceRequest.selectedChildren : [],
  } as any);
  const namesOnPage = pageCharacterNames(params.page);
  const assetStorage = getAssetStorageService();
  const refs: ReferenceImage[] = [];

  for (const character of spec.characters || []) {
    const characterName = character.name;
    if (!namesOnPage.has(String(characterName).trim().toLowerCase())) continue;
    const turnaround = (character as any).turnaroundSheet as { url?: string; frontUrl?: string } | undefined;
    const url = turnaround?.url || turnaround?.frontUrl || character.referencePhotos?.[0]?.url;
    if (!url) continue;
    const storagePath = extractStoragePath(url);
    const data = await assetStorage.getAssetByPath(storagePath);
    const imageIndex = refs.length + 1;
    const sourceKind = turnaround ? 'Character sheet' : 'Reference photo';
    refs.push({
      base64Data: data.toString('base64'),
      mimeType: mimeTypeForStoragePath(storagePath),
      characterName,
      referenceKind: 'character',
      instructionText: `Image ${imageIndex}: Character reference for "${characterName}". ${sourceKind}.`,
    });
  }

  await closeDatabaseConnection();
  return refs;
}

async function main(): Promise<void> {
  const scriptPath = path.resolve(argValue('script-json') || DEFAULT_SCRIPT_JSON);
  const pageNumber = Number(argValue('page') || '1');
  const storyId = argValue('story-id') || DEFAULT_STORY_ID;
  const style = argValue('style') || 'soft watercolor children graphic novel, clean ink line art';
  const useVisionBubbles = hasFlag('vision-bubbles') || argValue('vision-bubbles') === 'true';
  const visionJsonPath = argValue('vision-json')
    ? path.resolve(argValue('vision-json') as string)
    : undefined;
  const artOnlyImagePath = argValue('art-only-image')
    ? path.resolve(argValue('art-only-image') as string)
    : undefined;
  const outputRoot = path.resolve(
    process.cwd(),
    'output',
    `graphic-novel-page-render-${path.basename(path.dirname(scriptPath))}-p${pageNumber}-${Date.now()}`
  );
  await fs.mkdir(outputRoot, { recursive: true });
  process.env.GRAPHIC_NOVEL_DEBUG_OUTPUT_DIR = outputRoot;

  const script = JSON.parse(await fs.readFile(scriptPath, 'utf8')) as GraphicNovelScript;
  const plannedPages = planGraphicNovelLayouts({ ageGroup: '6-8', pages: script.pages });
  const page = plannedPages.find((item) => item.pageNumber === pageNumber);
  if (!page) throw new Error(`Page ${pageNumber} not found in ${scriptPath}`);

  const template = await renderGraphicNovelPageTemplate(page);
  await fs.writeFile(path.join(outputRoot, `page-${pageNumber}-template.png`), template);

  const referenceImages = await loadCharacterReferences({ storyId, page });
  let rendered: {
    imageData: Buffer;
    mimeType: string;
    generationParams: Record<string, unknown>;
  };
  if (artOnlyImagePath) {
    const imageData = await fs.readFile(artOnlyImagePath);
    await fs.writeFile(path.join(outputRoot, `page-${pageNumber}-art-only.png`), imageData);
    rendered = {
      imageData,
      mimeType: mimeTypeForStoragePath(artOnlyImagePath),
      generationParams: {
        mode: 'graphic_novel_existing_art_only_reoverlay',
        artOnlyImagePath,
        templateId: page.template.id,
        textRenderingMode: 'html_overlay',
        bubbleShapeRenderingMode: 'post_art_vision_svg_speech_single_path_tail_thought_beaded_tail',
        referenceCount: referenceImages.length,
      },
    };
  } else {
    const imageDomain = getImageDomainService();
    rendered = await editGraphicNovelPage({
      imageDomain,
      page,
      templateBuffer: template,
      style,
      ageGroup: '6-8',
      referenceImages,
      onAttemptImage: async ({ imageData }) => {
        await fs.writeFile(path.join(outputRoot, `page-${pageNumber}-art-only.png`), imageData);
      },
    });
  }
  let finalPage = page;
  let bubbleVisionAnalysis: unknown = null;
  let bubbleVisionPlacementSummary: Record<string, unknown> = {
    mode: 'script_initial',
    skipped: !useVisionBubbles,
  };

  if (useVisionBubbles || visionJsonPath) {
    const analysis = visionJsonPath
      ? JSON.parse(await fs.readFile(visionJsonPath, 'utf8'))
      : await analyzeGraphicNovelBubbleVisionByPanelCrops({
          textProvider: getValidationTextProvider(),
          page,
          imageData: Buffer.from(rendered.imageData),
          mimeType: rendered.mimeType === 'image/jpeg' || rendered.mimeType === 'image/webp'
            ? rendered.mimeType
            : 'image/png',
        });
    const planned = applyGraphicNovelBubbleVisionLayout(page, analysis);
    finalPage = planned.page;
    bubbleVisionAnalysis = analysis;
    bubbleVisionPlacementSummary = {
      mode: visionJsonPath ? 'post_art_vision_panel_crops_reused_json' : 'post_art_vision_panel_crops',
      ...planned.placementSummary,
    };
    await fs.writeFile(
      path.join(outputRoot, `page-${pageNumber}-bubble-vision-panel-crops.json`),
      JSON.stringify(analysis, null, 2)
    );
    await fs.writeFile(
      path.join(outputRoot, `page-${pageNumber}-bubble-vision-placement-summary.json`),
      JSON.stringify(bubbleVisionPlacementSummary, null, 2)
    );
  }

  const framedWithBubbles = await overlayGraphicNovelTemplate(Buffer.from(rendered.imageData), finalPage);
  const withText = await overlayText(framedWithBubbles, finalPage);

  const bubblesPath = path.join(outputRoot, `page-${pageNumber}-with-bubbles.png`);
  const finalPath = path.join(outputRoot, `page-${pageNumber}-with-text.png`);
  await fs.writeFile(bubblesPath, framedWithBubbles);
  await fs.writeFile(finalPath, withText);
  await fs.writeFile(path.join(outputRoot, 'render-report.json'), JSON.stringify({
    scriptPath,
    pageNumber,
    outputRoot,
    finalPath,
    bubblesPath,
    templateId: page.template.id,
    panelCount: finalPage.panels.length,
    bubbleCount: finalPage.panels.reduce((sum, panel) => sum + panel.bubbles.length, 0),
    referenceCount: referenceImages.length,
    reusedArtOnlyImage: !!artOnlyImagePath,
    artOnlyImagePath: artOnlyImagePath ?? null,
    visionJsonPath: visionJsonPath ?? null,
    bubbleVisionAnalysis,
    bubbleVisionPlacementSummary,
    generationParams: rendered.generationParams,
  }, null, 2));

  console.log(JSON.stringify({
    outputRoot,
    finalPath,
    bubblesPath,
    templateId: page.template.id,
    panelCount: finalPage.panels.length,
    bubbleCount: finalPage.panels.reduce((sum, panel) => sum + panel.bubbles.length, 0),
    referenceCount: referenceImages.length,
    reusedArtOnlyImage: !!artOnlyImagePath,
    bubbleVisionPlacementSummary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
