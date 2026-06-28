import type { BubbleGeometry, Rect } from './types';

const PAGE_WIDTH = 1536;
const PAGE_HEIGHT = 2048;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX = 20;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_LINE_HEIGHT_PX = 23;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_PX = 14;
export const GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_PX = 6;
const BUBBLE_OUTLINE_EXTRA_PX = 14;
const SPEECH_MAX_LINE_CHARS = 24;
const CAPTION_MAX_LINE_CHARS = 30;
const MIN_LINE_CHARS = 8;
const VISUAL_TEXT_WIDTH_FACTOR = 0.66;
const BOLD_CHARACTER_WIDTH_FACTOR = 0.64;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rectWidthPx(rect: Rect): number {
  return Math.max(1, rect.width * PAGE_WIDTH);
}

function rectHeightPx(rect: Rect): number {
  return Math.max(1, rect.height * PAGE_HEIGHT);
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

export function measureGraphicNovelBubbleTextBox(params: {
  text: string;
  kind?: BubbleGeometry['kind'];
  panelRect: Rect;
  zoneRect?: Rect;
}): GraphicNovelBubbleTextBox {
  const kind = params.kind || 'speech';
  const panelWidthPx = rectWidthPx(params.panelRect);
  const panelHeightPx = rectHeightPx(params.panelRect);
  const sizingRect = kind === 'caption' ? params.panelRect : params.zoneRect || params.panelRect;
  const zoneWidthPx = rectWidthPx(sizingRect);
  const zoneHeightPx = rectHeightPx(sizingRect);
  const fontSizePx = GRAPHIC_NOVEL_BUBBLE_TEXT_FONT_SIZE_PX;
  const lineHeightPx = GRAPHIC_NOVEL_BUBBLE_TEXT_LINE_HEIGHT_PX;
  const padXPx = GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_X_PX;
  const padYPx = GRAPHIC_NOVEL_BUBBLE_TEXT_PADDING_Y_PX;
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
  const maxLines = kind === 'caption' ? 2 : 4;
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
    Math.min(zoneHeightPx * 0.96, panelHeightPx * (kind === 'caption' ? 0.24 : 0.34))
  );
  const minWidthPx = Math.min(
    maxWidthPx,
    Math.max(fontSizePx * 3.2 + horizontalChromePx, targetContentWidthPx + horizontalChromePx)
  );
  const widthPx = clamp(targetContentWidthPx + horizontalChromePx, minWidthPx, maxWidthPx);
  const requestedHeightPx = visualLineCount * lineHeightPx + verticalChromePx;

  return {
    width: widthPx / PAGE_WIDTH,
    height: Math.min(requestedHeightPx, maxHeightPx) / PAGE_HEIGHT,
    overflow: wrappedLines.length > maxLines || requestedHeightPx > maxHeightPx,
    lineCount: wrappedLines.length,
    fontSizePx,
    maxCharsPerLine,
  };
}
