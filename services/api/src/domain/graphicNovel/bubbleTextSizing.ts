import type { BubbleGeometry, GraphicNovelBubbleTextSizing, Rect } from './types';

const PAGE_WIDTH = 1536;
const PAGE_HEIGHT = 2048;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH_PX = 992;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_HEIGHT_PX = Math.round(
  GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH_PX * PAGE_HEIGHT / PAGE_WIDTH
);
export const GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX = 20;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_LINE_HEIGHT_PX = 23;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_PX = 14;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_PX = 6;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_LINE_HEIGHT_RATIO =
  GRAPHIC_NOVEL_BUBBLE_TEXT_LINE_HEIGHT_PX / GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_RATIO =
  GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_PX / GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_RATIO =
  GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_PX / GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX;
const MIN_GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX = 14;
const MAX_GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX = 32;
const GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_MIN_AGE_YEARS = 2;
const GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_MAX_AGE_YEARS = 8;
const GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_AT_MIN_AGE = 1;
const GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_AT_MAX_AGE = 0.75;
const BUBBLE_OUTLINE_EXTRA_PX = 14;
const SPEECH_MAX_LINE_CHARS = 24;
const CAPTION_MAX_LINE_CHARS = 30;
const MIN_LINE_CHARS = 8;
const VISUAL_TEXT_WIDTH_FACTOR = 0.66;
const BOLD_CHARACTER_WIDTH_FACTOR = 0.64;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ageYearsFromAgeGroup(ageGroup: string | null | undefined): number | null {
  if (!ageGroup) return null;
  if (ageGroup === '1y') return 1;
  const numbers = ageGroup.match(/\d+/g)?.map((value) => Number(value)) ?? [];
  const finite = numbers.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return Math.max(...finite);
}

export function graphicNovelBubbleFontScaleForAge(params: {
  ageYears?: number | null;
  ageGroup?: string | null;
}): number {
  const rawAge =
    typeof params.ageYears === 'number' && Number.isFinite(params.ageYears)
      ? params.ageYears
      : ageYearsFromAgeGroup(params.ageGroup);
  if (typeof rawAge !== 'number' || !Number.isFinite(rawAge)) {
    return GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_AT_MAX_AGE;
  }

  const age = clamp(
    rawAge,
    GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_MIN_AGE_YEARS,
    GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_MAX_AGE_YEARS
  );
  const progress =
    (age - GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_MIN_AGE_YEARS) /
    (GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_MAX_AGE_YEARS -
      GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_MIN_AGE_YEARS);
  const scale =
    GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_AT_MIN_AGE -
    progress *
      (GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_AT_MIN_AGE -
        GRAPHIC_NOVEL_BUBBLE_FONT_SCALE_AT_MAX_AGE);
  return Math.round(scale * 1000) / 1000;
}

function rectWidthPx(rect: Rect, pageWidthPx: number): number {
  return Math.max(1, rect.width * pageWidthPx);
}

function rectHeightPx(rect: Rect, pageHeightPx: number): number {
  return Math.max(1, rect.height * pageHeightPx);
}

function visualTextUnits(text: string): number {
  return Array.from(text.trim() || ' ').reduce((sum, char) => {
    if (/\s/u.test(char)) return sum + 0.35;
    if (/[.,:;'"’`!?|()[\]{}]/u.test(char)) return sum + 0.35;
    if (/[ijlI1іїІЇ]/u.test(char)) return sum + 0.55;
    if (/[mwшщюжфWМШЩЮЖФ]/u.test(char)) return sum + 1.2;
    return sum + 1;
  }, 0);
}

function charLength(text: string): number {
  return Array.from(text).length;
}

function splitLongWord(word: string, maxChars: number): string[] {
  const chars = Array.from(word);
  const parts: string[] = [];
  for (let index = 0; index < chars.length; index += maxChars) {
    parts.push(chars.slice(index, index + maxChars).join(''));
  }
  return parts;
}

function wrapTextByCharacterLimit(text: string, maxChars: number): string[] {
  const words = (text.trim() || ' ').split(/\s+/u);
  const lines: string[] = [];
  let current = '';

  for (const rawWord of words) {
    const wordParts = charLength(rawWord) > maxChars ? splitLongWord(rawWord, maxChars) : [rawWord];
    for (const word of wordParts) {
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
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [' '];
}

export interface GraphicNovelBubbleTextBox {
  width: number;
  height: number;
  overflow: boolean;
  lineCount: number;
  fontSizePx: number;
  maxCharsPerLine: number;
}

export function normalizeGraphicNovelBubbleTextSizing(
  value?: Partial<GraphicNovelBubbleTextSizing> | null
): GraphicNovelBubbleTextSizing {
  const requestedFontSize = value?.fontSizePx;
  const fontSizePx = Math.round(clamp(
    typeof requestedFontSize === 'number' && Number.isFinite(requestedFontSize)
      ? requestedFontSize
      : GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX,
    MIN_GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX,
    MAX_GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX
  ));
  const defaultLineHeightPx = Math.max(
    fontSizePx + 1,
    Math.round(fontSizePx * GRAPHIC_NOVEL_BUBBLE_TEXT_LINE_HEIGHT_RATIO)
  );
  const defaultPaddingXPx = Math.max(
    8,
    Math.round(fontSizePx * GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_RATIO)
  );
  const defaultPaddingYPx = Math.max(
    4,
    Math.round(fontSizePx * GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_RATIO)
  );
  const targetPageWidthPx = Math.round(clamp(
    typeof value?.targetPageWidthPx === 'number' && Number.isFinite(value.targetPageWidthPx)
      ? value.targetPageWidthPx
      : GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH_PX,
    320,
    PAGE_WIDTH
  ));
  const targetPageHeightPx = Math.round(clamp(
    typeof value?.targetPageHeightPx === 'number' && Number.isFinite(value.targetPageHeightPx)
      ? value.targetPageHeightPx
      : Math.round(targetPageWidthPx * PAGE_HEIGHT / PAGE_WIDTH),
    320,
    PAGE_HEIGHT
  ));

  return {
    fontSizePx,
    lineHeightPx: Math.round(clamp(
      typeof value?.lineHeightPx === 'number' && Number.isFinite(value.lineHeightPx)
        ? value.lineHeightPx
        : defaultLineHeightPx,
      fontSizePx,
      fontSizePx * 1.8
    )),
    paddingXPx: Math.round(clamp(
      typeof value?.paddingXPx === 'number' && Number.isFinite(value.paddingXPx)
        ? value.paddingXPx
        : defaultPaddingXPx,
      4,
      fontSizePx * 1.2
    )),
    paddingYPx: Math.round(clamp(
      typeof value?.paddingYPx === 'number' && Number.isFinite(value.paddingYPx)
        ? value.paddingYPx
        : defaultPaddingYPx,
      2,
      fontSizePx
    )),
    targetPageWidthPx,
    targetPageHeightPx,
  };
}

export function graphicNovelBubbleTextSizingFromStoryTextSize(
  textSizePx: number | null | undefined,
  options: { ageYears?: number | null; ageGroup?: string | null } = {}
): GraphicNovelBubbleTextSizing {
  const fontScale = graphicNovelBubbleFontScaleForAge(options);
  const sourceTextSizePx = textSizePx ?? GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX;
  return normalizeGraphicNovelBubbleTextSizing({
    fontSizePx: sourceTextSizePx * fontScale,
  });
}

export function measureGraphicNovelBubbleTextBox(params: {
  text: string;
  kind?: BubbleGeometry['kind'];
  panelRect: Rect;
  zoneRect?: Rect;
  textSizing?: Partial<GraphicNovelBubbleTextSizing> | null;
}): GraphicNovelBubbleTextBox {
  const kind = params.kind || 'speech';
  const textSizing = normalizeGraphicNovelBubbleTextSizing(params.textSizing);
  const pageWidthPx = textSizing.targetPageWidthPx;
  const pageHeightPx = textSizing.targetPageHeightPx;
  const panelWidthPx = rectWidthPx(params.panelRect, pageWidthPx);
  const panelHeightPx = rectHeightPx(params.panelRect, pageHeightPx);
  const sizingRect = kind === 'caption' ? params.panelRect : params.zoneRect || params.panelRect;
  const zoneWidthPx = rectWidthPx(sizingRect, pageWidthPx);
  const zoneHeightPx = rectHeightPx(sizingRect, pageHeightPx);
  const fontSizePx = textSizing.fontSizePx;
  const lineHeightPx = textSizing.lineHeightPx;
  const padXPx = textSizing.paddingXPx;
  const padYPx = textSizing.paddingYPx;
  const horizontalChromePx = padXPx * 2 + BUBBLE_OUTLINE_EXTRA_PX;
  const verticalChromePx = padYPx * 2 + BUBBLE_OUTLINE_EXTRA_PX;
  const configuredMaxChars = kind === 'caption' ? CAPTION_MAX_LINE_CHARS : SPEECH_MAX_LINE_CHARS;
  const dynamicPanelWidthRatio = kind === 'caption'
    ? 0.78
    : 0.62;
  const maxWidthPx = Math.max(
    fontSizePx * 3.2 + horizontalChromePx,
    Math.min(zoneWidthPx * 0.96, panelWidthPx * dynamicPanelWidthRatio)
  );
  const maxContentWidthPx = Math.max(fontSizePx, maxWidthPx - horizontalChromePx);
  const maxCharsByZone = Math.floor(maxContentWidthPx / (fontSizePx * 0.56));
  const maxCharsPerLine = Math.floor(clamp(maxCharsByZone, MIN_LINE_CHARS, configuredMaxChars));
  const wrappedLines = wrapTextByCharacterLimit(params.text, maxCharsPerLine);
  const maxLines = kind === 'caption' ? 3 : 4;
  const visibleLines = wrappedLines.slice(0, maxLines);
  const balancedWrapSafetyLines = wrappedLines.length > 1 ? 1 : 0;
  const visualLineCount = Math.min(
    wrappedLines.length + balancedWrapSafetyLines,
    maxLines + balancedWrapSafetyLines
  );
  const widestLineUnits = Math.max(...visibleLines.map(visualTextUnits), 1);
  const widestLineChars = Math.max(...visibleLines.map(charLength), 1);
  const widestLinePx = Math.max(
    widestLineUnits * fontSizePx * VISUAL_TEXT_WIDTH_FACTOR,
    widestLineChars * fontSizePx * BOLD_CHARACTER_WIDTH_FACTOR
  );
  const preferredWrappedLinePx = wrappedLines.length > 1
    ? Math.min(maxContentWidthPx, maxCharsPerLine * fontSizePx * BOLD_CHARACTER_WIDTH_FACTOR)
    : 0;
  const targetContentWidthPx = Math.max(widestLinePx, preferredWrappedLinePx);
  const maxHeightPx = Math.max(
    lineHeightPx + verticalChromePx,
    Math.min(zoneHeightPx * 0.96, panelHeightPx * (kind === 'caption' ? 0.36 : 0.34))
  );
  const minWidthPx = Math.min(
    maxWidthPx,
    Math.max(fontSizePx * 3.2 + horizontalChromePx, targetContentWidthPx + horizontalChromePx)
  );
  const widthPx = clamp(targetContentWidthPx + horizontalChromePx, minWidthPx, maxWidthPx);
  const requestedHeightPx = visualLineCount * lineHeightPx + verticalChromePx;

  return {
    width: widthPx / pageWidthPx,
    height: Math.min(requestedHeightPx, maxHeightPx) / pageHeightPx,
    overflow: wrappedLines.length > maxLines || requestedHeightPx > maxHeightPx,
    lineCount: wrappedLines.length,
    fontSizePx,
    maxCharsPerLine,
  };
}
