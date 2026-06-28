import { GRAPHIC_NOVEL_PAGE_SIZE } from './layoutPlanner';
import type {
  GraphicNovelPageTextOverlay,
  GraphicNovelTextOverlayItem,
  PlannedGraphicNovelPage,
  Rect,
} from './types';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pct(value: number): string {
  const rounded = (clamp01(value) * 100).toFixed(3).replace(/\.?0+$/, '');
  return `${rounded}%`;
}

function cssPercent(rect: Rect): GraphicNovelTextOverlayItem['cssPercent'] {
  return {
    left: pct(rect.x),
    top: pct(rect.y),
    width: pct(rect.width),
    height: pct(rect.height),
  };
}

function htmlSafeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function labelFor(item: {
  kind: GraphicNovelTextOverlayItem['kind'];
  speaker?: string;
  text: string;
}): string {
  const speakerPrefix = item.speaker ? `${item.speaker}:` : '';
  const textWithoutSpeaker = speakerPrefix && item.text.startsWith(speakerPrefix)
    ? item.text.slice(speakerPrefix.length).trim()
    : item.text;
  if (item.kind === 'caption') return `Caption: ${item.text}`;
  if (item.kind === 'thought') return item.speaker ? `${item.speaker} thinks: ${textWithoutSpeaker}` : `Thought: ${item.text}`;
  return item.speaker ? `${item.speaker} says: ${textWithoutSpeaker}` : item.text;
}

export function buildGraphicNovelPageTextOverlay(
  page: PlannedGraphicNovelPage,
  options: {
    textTransform?: (value: string) => string;
    displayTextTransform?: (value: string) => string;
    audioTextTransform?: (value: string) => string;
  } = {}
): GraphicNovelPageTextOverlay {
  const textTransform = options.textTransform ?? ((value: string) => value);
  const displayTextTransform = options.displayTextTransform ?? ((value: string) => value);
  const audioTextTransform = options.audioTextTransform ?? displayTextTransform;
  const items: GraphicNovelTextOverlayItem[] = [];
  let readingOrder = 0;

  page.panels.forEach((panel, panelIndex) => {
    panel.bubbles.forEach((bubble, bubbleIndex) => {
      readingOrder += 1;
      const segmentId = `gn-p${page.pageNumber}-panel${panelIndex + 1}-bubble${bubbleIndex + 1}`;
      const rawText = textTransform(bubble.text);
      const text = displayTextTransform(rawText);
      const audioText = audioTextTransform(rawText);
      const speaker = bubble.speaker ? textTransform(bubble.speaker) : undefined;
      const item: GraphicNovelTextOverlayItem = {
        id: bubble.id,
        htmlId: htmlSafeId(`graphic-novel-${segmentId}`),
        segmentId,
        pageNumber: page.pageNumber,
        panelId: panel.script.panelId,
        panelIndex: panelIndex + 1,
        bubbleIndex: bubbleIndex + 1,
        readingOrder,
        kind: bubble.kind,
        speaker,
        rawText,
        text,
        audioText,
        rect: bubble.rect,
        cssPercent: cssPercent(bubble.rect),
        tailTo: bubble.tailTo,
        ariaLabel: labelFor({ kind: bubble.kind, speaker, text }),
      };
      items.push(item);
    });
  });

  return {
    mode: 'html_overlay',
    coordinateSpace: 'normalized_0_1',
    pageNumber: page.pageNumber,
    pageSize: GRAPHIC_NOVEL_PAGE_SIZE,
    items,
    rawPlainText: items.map((item) => item.rawText).filter(Boolean).join('\n'),
    plainText: items.map((item) => item.audioText).filter(Boolean).join('\n'),
  };
}
