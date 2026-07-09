import sharp from 'sharp';
import {
  GRAPHIC_NOVEL_PAGE_SIZE,
  normalizeRect,
  pageSizeForGraphicNovelPage,
} from './layoutPlanner';
import type { StoryEnvironment } from '../../ai/types';
import type { ReferenceImage } from '../../providers/base/IImageProvider';
import type { BubbleGeometry, PlannedGraphicNovelPage, Rect } from './types';
import { buildImageSystemInstruction, buildSceneImagePrompt } from '../../prompts/image/ImagePrompts';
import { plannedCharacterReferenceIdForName } from '../../prompts/visualReferenceLabels';
import {
  findCharacterReferenceBinding,
  findEnvironmentReferenceBinding,
} from '../../services/referenceBinding';
import {
  buildImageRequestManifest,
  summarizeImageReferenceImages,
} from '../../services/imageRequestManifestService';

const BUBBLE_FILL_OPACITY = 0.84;
const BUBBLE_CORNER_RADIUS_PX = 24;
const BUBBLE_STROKE_WIDTH_PX = 4.5;
const BUBBLE_CLOUD_WAVE_PX = 4.5;
const BUBBLE_CLOUD_STEP_PX = 54;
const BUBBLE_TAIL_MOUTH_CLEARANCE_PX = 28;
const BUBBLE_TAIL_MAX_LINE_PX = 60;
const SPEECH_TAIL_MOUTH_CLEARANCE_PX = 64;
const SPEECH_TAIL_MAX_LINE_PX = 145;
const SPEECH_TAIL_BASE_MAX_HALF_WIDTH_PX = 34;
const SPEECH_TAIL_BASE_MIN_HALF_WIDTH_PX = 14;

type PageSize = { width: number; height: number };

function px(rect: Rect, pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE): Rect {
  return normalizeRect(rect, pageSize);
}

function roundedBubblePath(r: Rect, radius: number): string {
  const x2 = r.x + r.width;
  const y2 = r.y + r.height;
  const radiusX = Math.min(radius, r.width / 2);
  const radiusY = Math.min(radius, r.height / 2);
  return [
    `M ${r.x + radiusX} ${r.y}`,
    `H ${x2 - radiusX}`,
    `Q ${x2} ${r.y} ${x2} ${r.y + radiusY}`,
    `V ${y2 - radiusY}`,
    `Q ${x2} ${y2} ${x2 - radiusX} ${y2}`,
    `H ${r.x + radiusX}`,
    `Q ${r.x} ${y2} ${r.x} ${y2 - radiusY}`,
    `V ${r.y + radiusY}`,
    `Q ${r.x} ${r.y} ${r.x + radiusX} ${r.y}`,
    'Z',
  ].join(' ');
}

function n(value: number): string {
  return value.toFixed(1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wavyLineCommands(
  from: { x: number; y: number },
  to: { x: number; y: number },
  normal: { x: number; y: number },
  amplitude: number,
  stepPx: number
): string[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const segmentCount = Math.max(1, Math.round(length / stepPx));
  const commands: string[] = [];

  for (let index = 1; index <= segmentCount; index += 1) {
    const startT = (index - 1) / segmentCount;
    const endT = index / segmentCount;
    const midT = (startT + endT) / 2;
    const wave = amplitude * (index % 2 === 0 ? 0.7 : 1);
    const control = {
      x: from.x + dx * midT + normal.x * wave,
      y: from.y + dy * midT + normal.y * wave,
    };
    const end = {
      x: from.x + dx * endT,
      y: from.y + dy * endT,
    };
    commands.push(`Q ${n(control.x)} ${n(control.y)} ${n(end.x)} ${n(end.y)}`);
  }

  return commands;
}

function bubbleOutlineRect(r: Rect): Rect {
  const inset = BUBBLE_STROKE_WIDTH_PX / 2 + BUBBLE_CLOUD_WAVE_PX;
  return {
    x: r.x + inset,
    y: r.y + inset,
    width: Math.max(24, r.width - inset * 2),
    height: Math.max(24, r.height - inset * 2),
  };
}

function cloudBubblePath(r: Rect, radius: number): string {
  const outline = bubbleOutlineRect(r);
  const x = outline.x;
  const y = outline.y;
  const width = outline.width;
  const height = outline.height;
  const x2 = x + width;
  const y2 = y + height;
  const radiusX = Math.min(radius, width / 2);
  const radiusY = Math.min(radius, height / 2);
  const amplitude = Math.min(BUBBLE_CLOUD_WAVE_PX, width / 18, height / 8);

  return [
    `M ${n(x + radiusX)} ${n(y)}`,
    ...wavyLineCommands(
      { x: x + radiusX, y },
      { x: x2 - radiusX, y },
      { x: 0, y: -1 },
      amplitude,
      BUBBLE_CLOUD_STEP_PX
    ),
    `Q ${n(x2)} ${n(y)} ${n(x2)} ${n(y + radiusY)}`,
    ...wavyLineCommands(
      { x: x2, y: y + radiusY },
      { x: x2, y: y2 - radiusY },
      { x: 1, y: 0 },
      amplitude,
      BUBBLE_CLOUD_STEP_PX
    ),
    `Q ${n(x2)} ${n(y2)} ${n(x2 - radiusX)} ${n(y2)}`,
    ...wavyLineCommands(
      { x: x2 - radiusX, y: y2 },
      { x: x + radiusX, y: y2 },
      { x: 0, y: 1 },
      amplitude,
      BUBBLE_CLOUD_STEP_PX
    ),
    `Q ${n(x)} ${n(y2)} ${n(x)} ${n(y2 - radiusY)}`,
    ...wavyLineCommands(
      { x, y: y2 - radiusY },
      { x, y: y + radiusY },
      { x: -1, y: 0 },
      amplitude,
      BUBBLE_CLOUD_STEP_PX
    ),
    `Q ${n(x)} ${n(y)} ${n(x + radiusX)} ${n(y)}`,
    'Z',
  ].join(' ');
}

function wavyEdgeCommands(
  from: { x: number; y: number },
  to: { x: number; y: number },
  normal: { x: number; y: number },
  amplitude: number
): string[] {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return [];
  return wavyLineCommands(from, to, normal, amplitude, BUBBLE_CLOUD_STEP_PX);
}

function bubbleEdgePointToward(r: Rect, tail: { x: number; y: number }): { x: number; y: number } {
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const dx = tail.x - center.x;
  const dy = tail.y - center.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: center.x, y: r.y + r.height };
  }

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(r.width / 2 / dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(r.height / 2 / dy);
  const scale = Math.min(scaleX, scaleY);
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

function bubbleTailDots(
  bubble: BubbleGeometry,
  r: Rect,
  attrText: string,
  pageSize?: PageSize
): string {
  if (!bubble.tailTo) return '';

  const tail = px({ x: bubble.tailTo.x, y: bubble.tailTo.y, width: 0, height: 0 }, pageSize);
  const edge = bubbleEdgePointToward(r, tail);
  const dx = tail.x - edge.x;
  const dy = tail.y - edge.y;
  const distance = Math.hypot(dx, dy);
  if (distance < BUBBLE_TAIL_MOUTH_CLEARANCE_PX + 14) return '';

  const unitX = dx / distance;
  const unitY = dy / distance;
  const visualDistance = Math.min(
    distance - BUBBLE_TAIL_MOUTH_CLEARANCE_PX,
    BUBBLE_TAIL_MAX_LINE_PX
  );
  if (visualDistance < 14) return '';
  const visualDx = unitX * visualDistance;
  const visualDy = unitY * visualDistance;

  const dots =
    visualDistance < 48
      ? [
          { t: 0.45, radius: 7 },
          { t: 1, radius: 4 },
        ]
      : [
          { t: 0.3, radius: 8.5 },
          { t: 0.64, radius: 6 },
          { t: 1, radius: 3.8 },
        ];

  return dots
    .map((dot) => {
      const cx = edge.x + visualDx * dot.t;
      const cy = edge.y + visualDy * dot.t;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dot.radius}" ${attrText}/>`;
    })
    .join('');
}

interface SpeechTailGeometry {
  side: 'top' | 'right' | 'bottom' | 'left';
  baseStart: { x: number; y: number };
  baseEnd: { x: number; y: number };
  tip: { x: number; y: number };
  mouth: { x: number; y: number };
  concaveSide: 'start' | 'end';
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function speechTailSegment(
  baseStart: { x: number; y: number },
  baseEnd: { x: number; y: number },
  tip: { x: number; y: number },
  concaveSide: 'start' | 'end'
): string {
  const baseCenter = {
    x: (baseStart.x + baseEnd.x) / 2,
    y: (baseStart.y + baseEnd.y) / 2,
  };
  const dx = tip.x - baseCenter.x;
  const dy = tip.y - baseCenter.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / distance;
  const unitY = dy / distance;
  const perpX = -unitY;
  const perpY = unitX;
  const lateral = (point: { x: number; y: number }) =>
    (point.x - baseCenter.x) * perpX + (point.y - baseCenter.y) * perpY;
  const fromAxis = (axisDistance: number, lateralDistance: number) => ({
    x: baseCenter.x + unitX * axisDistance + perpX * lateralDistance,
    y: baseCenter.y + unitY * axisDistance + perpY * lateralDistance,
  });
  const startLateral = lateral(baseStart);
  const endLateral = lateral(baseEnd);

  const sideControl = (baseLateral: number, concave: boolean, position: 'start' | 'end') => {
    const side = baseLateral < 0 ? -1 : 1;
    const width = Math.max(1, Math.abs(baseLateral));
    if (concave) {
      return {
        nearBase: side * width * 0.22,
        nearTip: -side * width * 0.42,
      };
    }

    return {
      nearBase: side * width * (position === 'start' ? 1.76 : 1.58),
      nearTip: side * width * 1.08,
    };
  };
  const startControl = sideControl(startLateral, concaveSide === 'start', 'start');
  const endControl = sideControl(endLateral, concaveSide === 'end', 'end');
  const c1 = fromAxis(distance * 0.34, startControl.nearBase);
  const c2 = fromAxis(distance * 0.82, startControl.nearTip);
  const c3 = fromAxis(distance * 0.82, endControl.nearTip);
  const c4 = fromAxis(distance * 0.34, endControl.nearBase);

  return [
    `C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(tip.x)} ${n(tip.y)}`,
    `C ${n(c3.x)} ${n(c3.y)} ${n(c4.x)} ${n(c4.y)} ${n(baseEnd.x)} ${n(baseEnd.y)}`,
  ].join(' ');
}

function concaveSideForTail(params: {
  side: SpeechTailGeometry['side'];
  baseStart: { x: number; y: number };
  baseEnd: { x: number; y: number };
  baseCenter: { x: number; y: number };
  mouth: { x: number; y: number };
}): 'start' | 'end' {
  const { side, baseStart, baseEnd, baseCenter, mouth } = params;
  if (side === 'top' || side === 'bottom') {
    const targetX =
      mouth.x < baseCenter.x ? Math.min(baseStart.x, baseEnd.x) : Math.max(baseStart.x, baseEnd.x);
    return Math.abs(baseStart.x - targetX) <= Math.abs(baseEnd.x - targetX) ? 'start' : 'end';
  }

  const targetY =
    mouth.y < baseCenter.y ? Math.min(baseStart.y, baseEnd.y) : Math.max(baseStart.y, baseEnd.y);
  return Math.abs(baseStart.y - targetY) <= Math.abs(baseEnd.y - targetY) ? 'start' : 'end';
}

function speechTailGeometry(
  bubble: BubbleGeometry,
  body: Rect,
  radius: number,
  pageSize?: PageSize
): SpeechTailGeometry | undefined {
  if (!bubble.tailTo) return undefined;

  const tail = px({ x: bubble.tailTo.x, y: bubble.tailTo.y, width: 0, height: 0 }, pageSize);
  const center = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
  const dx = tail.x - center.x;
  const dy = tail.y - center.y;
  const distanceFromCenter = Math.hypot(dx, dy);
  if (distanceFromCenter < 1) return undefined;

  const side =
    Math.abs(dx / Math.max(body.width, 1)) > Math.abs(dy / Math.max(body.height, 1))
      ? dx > 0
        ? 'right'
        : 'left'
      : dy > 0
        ? 'bottom'
        : 'top';
  const edge = bubbleEdgePointToward(body, tail);
  const edgeDx = tail.x - edge.x;
  const edgeDy = tail.y - edge.y;
  const edgeDistance = Math.hypot(edgeDx, edgeDy);
  if (edgeDistance < SPEECH_TAIL_MOUTH_CLEARANCE_PX + 18) return undefined;

  const unitX = edgeDx / edgeDistance;
  const unitY = edgeDy / edgeDistance;
  const visualDistance = Math.min(
    edgeDistance - SPEECH_TAIL_MOUTH_CLEARANCE_PX,
    SPEECH_TAIL_MAX_LINE_PX
  );
  if (visualDistance < 18) return undefined;

  const baseHalfLimit =
    side === 'top' || side === 'bottom'
      ? Math.max(0, (body.width - radius * 2) / 2)
      : Math.max(0, (body.height - radius * 2) / 2);
  const bodyScaledBaseHalf = clamp(
    Math.min(body.width, body.height) * 0.18,
    SPEECH_TAIL_BASE_MIN_HALF_WIDTH_PX,
    SPEECH_TAIL_BASE_MAX_HALF_WIDTH_PX
  );
  const distanceScaledBaseHalf = clamp(
    visualDistance * 0.22,
    SPEECH_TAIL_BASE_MIN_HALF_WIDTH_PX,
    SPEECH_TAIL_BASE_MAX_HALF_WIDTH_PX
  );
  const baseHalf = Math.min(
    bodyScaledBaseHalf,
    distanceScaledBaseHalf,
    Math.max(0, baseHalfLimit - 1)
  );
  if (baseHalf < 5) return undefined;

  const tip = {
    x: edge.x + unitX * visualDistance,
    y: edge.y + unitY * visualDistance,
  };
  const x2 = body.x + body.width;
  const y2 = body.y + body.height;

  if (side === 'top' || side === 'bottom') {
    const centerX = clamp(edge.x, body.x + radius + baseHalf, x2 - radius - baseHalf);
    const y = side === 'top' ? body.y : y2;
    const topOrBottom: Omit<SpeechTailGeometry, 'concaveSide'> =
      side === 'top'
        ? {
            side,
            baseStart: { x: centerX - baseHalf, y },
            baseEnd: { x: centerX + baseHalf, y },
            tip,
            mouth: tail,
          }
        : {
            side,
            baseStart: { x: centerX + baseHalf, y },
            baseEnd: { x: centerX - baseHalf, y },
            tip,
            mouth: tail,
          };
    const baseCenter = {
      x: (topOrBottom.baseStart.x + topOrBottom.baseEnd.x) / 2,
      y: (topOrBottom.baseStart.y + topOrBottom.baseEnd.y) / 2,
    };
    const concaveSide = concaveSideForTail({
      side,
      baseStart: topOrBottom.baseStart,
      baseEnd: topOrBottom.baseEnd,
      baseCenter,
      mouth: tail,
    });

    return side === 'top'
      ? {
          ...topOrBottom,
          concaveSide,
        }
      : {
          ...topOrBottom,
          concaveSide,
        };
  }

  const centerY = clamp(edge.y, body.y + radius + baseHalf, y2 - radius - baseHalf);
  const x = side === 'left' ? body.x : x2;
  const leftOrRight: Omit<SpeechTailGeometry, 'concaveSide'> =
    side === 'right'
      ? {
          side,
          baseStart: { x, y: centerY - baseHalf },
          baseEnd: { x, y: centerY + baseHalf },
          tip,
          mouth: tail,
        }
      : {
          side,
          baseStart: { x, y: centerY + baseHalf },
          baseEnd: { x, y: centerY - baseHalf },
          tip,
          mouth: tail,
        };
  const baseCenter = {
    x: (leftOrRight.baseStart.x + leftOrRight.baseEnd.x) / 2,
    y: (leftOrRight.baseStart.y + leftOrRight.baseEnd.y) / 2,
  };

  return {
    ...leftOrRight,
    concaveSide: concaveSideForTail({
      side,
      baseStart: leftOrRight.baseStart,
      baseEnd: leftOrRight.baseEnd,
      baseCenter,
      mouth: tail,
    }),
  };
}

function classicSpeechBubblePath(bubble: BubbleGeometry, r: Rect, pageSize?: PageSize): string {
  const body = bubbleOutlineRect(r);
  const x = body.x;
  const y = body.y;
  const x2 = body.x + body.width;
  const y2 = body.y + body.height;
  const radius = Math.min(
    body.width / 2,
    body.height / 2,
    Math.max(BUBBLE_CORNER_RADIUS_PX, body.height * 0.42)
  );
  const tail = speechTailGeometry(bubble, body, radius, pageSize);
  if (!tail) {
    return cloudBubblePath(r, BUBBLE_CORNER_RADIUS_PX);
  }

  const amplitude = Math.min(BUBBLE_CLOUD_WAVE_PX, body.width / 18, body.height / 8);
  const topEdge =
    tail.side === 'top'
      ? [
          ...wavyEdgeCommands({ x: x + radius, y }, tail.baseStart, { x: 0, y: -1 }, amplitude),
          speechTailSegment(tail.baseStart, tail.baseEnd, tail.tip, tail.concaveSide),
          ...wavyEdgeCommands(tail.baseEnd, { x: x2 - radius, y }, { x: 0, y: -1 }, amplitude),
        ]
      : wavyEdgeCommands({ x: x + radius, y }, { x: x2 - radius, y }, { x: 0, y: -1 }, amplitude);
  const rightEdge =
    tail.side === 'right'
      ? [
          ...wavyEdgeCommands({ x: x2, y: y + radius }, tail.baseStart, { x: 1, y: 0 }, amplitude),
          speechTailSegment(tail.baseStart, tail.baseEnd, tail.tip, tail.concaveSide),
          ...wavyEdgeCommands(tail.baseEnd, { x: x2, y: y2 - radius }, { x: 1, y: 0 }, amplitude),
        ]
      : wavyEdgeCommands(
          { x: x2, y: y + radius },
          { x: x2, y: y2 - radius },
          { x: 1, y: 0 },
          amplitude
        );
  const bottomEdge =
    tail.side === 'bottom'
      ? [
          ...wavyEdgeCommands({ x: x2 - radius, y: y2 }, tail.baseStart, { x: 0, y: 1 }, amplitude),
          speechTailSegment(tail.baseStart, tail.baseEnd, tail.tip, tail.concaveSide),
          ...wavyEdgeCommands(tail.baseEnd, { x: x + radius, y: y2 }, { x: 0, y: 1 }, amplitude),
        ]
      : wavyEdgeCommands(
          { x: x2 - radius, y: y2 },
          { x: x + radius, y: y2 },
          { x: 0, y: 1 },
          amplitude
        );
  const leftEdge =
    tail.side === 'left'
      ? [
          ...wavyEdgeCommands({ x, y: y2 - radius }, tail.baseStart, { x: -1, y: 0 }, amplitude),
          speechTailSegment(tail.baseStart, tail.baseEnd, tail.tip, tail.concaveSide),
          ...wavyEdgeCommands(tail.baseEnd, { x, y: y + radius }, { x: -1, y: 0 }, amplitude),
        ]
      : wavyEdgeCommands({ x, y: y2 - radius }, { x, y: y + radius }, { x: -1, y: 0 }, amplitude);

  return [
    `M ${n(x + radius)} ${n(y)}`,
    ...topEdge,
    `Q ${n(x2)} ${n(y)} ${n(x2)} ${n(y + radius)}`,
    ...rightEdge,
    `Q ${n(x2)} ${n(y2)} ${n(x2 - radius)} ${n(y2)}`,
    ...bottomEdge,
    `Q ${n(x)} ${n(y2)} ${n(x)} ${n(y2 - radius)}`,
    ...leftEdge,
    `Q ${n(x)} ${n(y)} ${n(x + radius)} ${n(y)}`,
    'Z',
  ].join(' ');
}

function bubbleShapeSvg(
  bubble: BubbleGeometry,
  attrs: { fill: string; stroke: string; strokeWidth: number; fillOpacity?: number },
  pageSize?: PageSize
): string {
  const r = px(bubble.rect, pageSize);
  const attrText = `fill="${attrs.fill}" fill-opacity="${attrs.fillOpacity ?? 1}" stroke="${attrs.stroke}" stroke-width="${attrs.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`;
  if (bubble.kind === 'speech') {
    return `<path d="${classicSpeechBubblePath(bubble, r, pageSize)}" ${attrText}/>`;
  }
  const path = cloudBubblePath(r, BUBBLE_CORNER_RADIUS_PX);
  if (bubble.kind === 'thought') {
    return `<path d="${path}" ${attrText}/>${bubbleTailDots(bubble, r, attrText, pageSize)}`;
  }
  return `<path d="${path}" ${attrText}/>`;
}

function bubbleSvg(page: PlannedGraphicNovelPage): string {
  const pageSize = pageSizeForGraphicNovelPage(page);
  const bubbles = page.panels
    .flatMap((panel) => panel.bubbles)
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

  const bubbleNodes: string[] = [];
  for (const bubble of bubbles) {
    bubbleNodes.push(
      bubbleShapeSvg(
        bubble,
        {
          fill: '#fffdf8',
          fillOpacity: BUBBLE_FILL_OPACITY,
          stroke: '#111',
          strokeWidth: BUBBLE_STROKE_WIDTH_PX,
        },
        pageSize
      )
    );
  }
  return bubbleNodes.join('\n');
}

function buildBubbleOnlyOverlaySvg(page: PlannedGraphicNovelPage): string {
  const pageSize = pageSizeForGraphicNovelPage(page);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageSize.width}" height="${pageSize.height}" viewBox="0 0 ${pageSize.width} ${pageSize.height}">
  ${bubbleSvg(page)}
</svg>`;
}

function buildPanelFrameOverlaySvg(page: PlannedGraphicNovelPage): string {
  const pageSize = pageSizeForGraphicNovelPage(page);
  const strokeWidth = 6;
  const halfStroke = strokeWidth / 2;
  const panels = page.panels.map((panel) => {
    const r = px(panel.templatePanel.rect, pageSize);
    return `<rect x="${r.x + halfStroke}" y="${r.y + halfStroke}" width="${Math.max(1, r.width - strokeWidth)}" height="${Math.max(1, r.height - strokeWidth)}" fill="none" stroke="#111111" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageSize.width}" height="${pageSize.height}" viewBox="0 0 ${pageSize.width} ${pageSize.height}">
  ${panels.join('\n  ')}
</svg>`;
}

export async function overlayGraphicNovelPanelFrames(
  baseImage: Buffer,
  page: PlannedGraphicNovelPage
): Promise<Buffer> {
  const pageSize = pageSizeForGraphicNovelPage(page);
  const frameOverlay = await sharp(Buffer.from(buildPanelFrameOverlaySvg(page)))
    .png()
    .toBuffer();

  return sharp(baseImage)
    .resize(pageSize.width, pageSize.height, { fit: 'cover' })
    .composite([{ input: frameOverlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

export async function overlayGraphicNovelBubblesOnly(
  baseImage: Buffer,
  page: PlannedGraphicNovelPage
): Promise<Buffer> {
  const pageSize = pageSizeForGraphicNovelPage(page);
  const overlay = await sharp(Buffer.from(buildBubbleOnlyOverlaySvg(page)))
    .png()
    .toBuffer();

  return sharp(baseImage)
    .resize(pageSize.width, pageSize.height, { fit: 'cover' })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export interface GraphicNovelPanelArtInput {
  panelId: string;
  panelIndex: number;
  imageData: Buffer;
}

export async function normalizeGraphicNovelPanelArtForTemplate(
  imageData: Buffer,
  targetSize: { width: number; height: number }
): Promise<Buffer> {
  let sourceImage = imageData;

  try {
    const original = await sharp(imageData).metadata();
    const trimmed = await sharp(imageData)
      .rotate()
      .trim({ background: '#ffffff', threshold: 12 })
      .png()
      .toBuffer();
    const trimmedMeta = await sharp(trimmed).metadata();
    const minTrimmedWidth = Math.max(8, Math.round((original.width ?? targetSize.width) * 0.2));
    const minTrimmedHeight = Math.max(8, Math.round((original.height ?? targetSize.height) * 0.2));

    if (
      (trimmedMeta.width ?? 0) >= minTrimmedWidth &&
      (trimmedMeta.height ?? 0) >= minTrimmedHeight
    ) {
      sourceImage = trimmed;
    }
  } catch {
    sourceImage = imageData;
  }

  return sharp(sourceImage)
    .resize(targetSize.width, targetSize.height, {
      fit: 'cover',
      position: 'attention',
    })
    .png()
    .toBuffer();
}

export async function composeGraphicNovelPanelArtPage(
  page: PlannedGraphicNovelPage,
  panelArt: GraphicNovelPanelArtInput[]
): Promise<Buffer> {
  const pageSize = pageSizeForGraphicNovelPage(page);
  const base = await sharp({
    create: {
      width: pageSize.width,
      height: pageSize.height,
      channels: 4,
      background: '#fffaf0',
    },
  })
    .png()
    .toBuffer();

  const artByPanelId = new Map(panelArt.map((art) => [art.panelId, art]));
  const composites = await Promise.all(
    page.panels.map(async (panel, index) => {
      const art =
        artByPanelId.get(panel.script.panelId) ??
        panelArt.find((item) => item.panelIndex === index + 1);
      const r = px(panel.templatePanel.rect, pageSize);
      const input = art
        ? await normalizeGraphicNovelPanelArtForTemplate(art.imageData, {
            width: r.width,
            height: r.height,
          })
        : await sharp({
            create: {
              width: r.width,
              height: r.height,
              channels: 4,
              background: '#efe5c7',
            },
          })
            .png()
            .toBuffer();

      return {
        input,
        left: r.x,
        top: r.y,
      };
    })
  );

  const composed = await sharp(base).composite(composites).png().toBuffer();
  return overlayGraphicNovelPanelFrames(composed, page);
}

function addAlias(aliases: Set<string>, value?: string | null): void {
  const text = String(value || '').trim();
  if (!text) return;
  aliases.add(text);
}

function characterAliasEntries(page: PlannedGraphicNovelPage, characterName: string): string[] {
  const aliases = new Set<string>();
  addAlias(aliases, characterName);
  addAlias(aliases, plannedCharacterReferenceIdForName(characterName));
  for (const alias of page.characterAliases?.[characterName] || []) {
    addAlias(aliases, alias);
    addAlias(aliases, plannedCharacterReferenceIdForName(alias));
  }
  return Array.from(aliases);
}

function normalizeReferenceName(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hasCharacterReferenceImages(referenceImages: ReferenceImage[] = []): boolean {
  return referenceImages.some(
    (ref) => ref.referenceKind === 'character' || ref.referenceBindingId?.startsWith('REF_CH_')
  );
}

function hasEnvironmentReferenceImage(
  environment: StoryEnvironment | undefined,
  referenceImages: ReferenceImage[] = []
): boolean {
  if (environment && findEnvironmentReferenceBinding(environment, referenceImages)) return true;
  return referenceImages.some((ref) => {
    const typed = ref as ReferenceImage & { source?: string; type?: string };
    return (
      typed.source === 'environment' ||
      typed.type === 'environment_reference' ||
      typed.referenceBindingId?.startsWith('REF_ENV_')
    );
  });
}

function imageIndexMapForReferences(referenceImages: ReferenceImage[] = []): Map<string, number> {
  const imageIndexMap = new Map<string, number>();
  for (const ref of referenceImages) {
    if (!ref.characterName || ref.imageIndex == null) continue;
    if (!imageIndexMap.has(ref.characterName)) {
      imageIndexMap.set(ref.characterName, ref.imageIndex);
    }
  }
  return imageIndexMap;
}

function panelCharacterReferenceEntries(
  page: PlannedGraphicNovelPage,
  panel: PlannedGraphicNovelPage['panels'][number],
  referenceImages: ReferenceImage[] = []
): Array<{ name: string; isTurnaround?: boolean; nameAliases?: string[] }> {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  const panelCharacterNames =
    typeof composition === 'string'
      ? referenceImages
          .filter((ref) => ref.referenceKind === 'character' && ref.characterName)
          .map((ref) => ref.characterName!)
      : composition.characters.map((character) => character.name);
  const entries = new Map<string, { name: string; isTurnaround?: boolean; nameAliases?: string[] }>();

  for (const characterName of panelCharacterNames) {
    const directRef = findCharacterReferenceBinding(characterName, referenceImages);
    const aliasOwner = Object.entries(page.characterAliases ?? {}).find(([owner, aliases]) => {
      const normalizedTarget = normalizeReferenceName(characterName);
      return (
        normalizeReferenceName(owner) === normalizedTarget ||
        aliases.some((alias) => normalizeReferenceName(alias) === normalizedTarget)
      );
    });
    const aliasOwnerName = aliasOwner?.[0];
    const aliasOwnerRef = aliasOwnerName
      ? findCharacterReferenceBinding(aliasOwnerName, referenceImages)
      : undefined;
    const ref = directRef ?? aliasOwnerRef;
    const canonicalName = ref?.characterName ?? aliasOwnerName ?? characterName;
    const aliases = new Set<string>();
    for (const alias of characterAliasEntries(page, canonicalName)) addAlias(aliases, alias);
    addAlias(aliases, characterName);
    addAlias(aliases, ref?.characterName);

    entries.set(normalizeReferenceName(canonicalName) || canonicalName, {
      name: canonicalName,
      isTurnaround: !!(ref as (ReferenceImage & { isTurnaround?: boolean }) | undefined)
        ?.isTurnaround,
      nameAliases: Array.from(aliases),
    });
  }

  return Array.from(entries.values());
}

function composedPanelSceneVisual(params: {
  panel: PlannedGraphicNovelPage['panels'][number];
  environment?: StoryEnvironment;
  hasEnvironmentImageRef: boolean;
}) {
  const sceneVisual = params.panel.script.visual.sceneVisual;
  let setting = sceneVisual.setting || params.panel.script.visual.primaryRead || '';

  if (params.hasEnvironmentImageRef) {
    setting = setting.trim() || 'Same location as reference.';
  } else if (params.environment?.description) {
    const basePart = params.environment.description.trim();
    const deltaPart = setting.trim();
    setting = deltaPart ? `${basePart} ${deltaPart}` : basePart;
  }

  return {
    setting,
    cameraComposition: sceneVisual.cameraComposition,
    lighting: sceneVisual.lighting,
  };
}

export {
  summarizeImageReferenceImages as summarizeGraphicNovelReferenceImages,
  buildImageRequestManifest as buildGraphicNovelImageRequestManifest,
};

export function buildGraphicNovelPanelCropSystemInstruction(params: {
  style: string;
  ageGroup?: string;
  scenarioCardId?: string;
  referenceImages?: ReferenceImage[];
}): string {
  const ageGroup = params.ageGroup || '6-8';

  return buildImageSystemInstruction({
    style: params.style,
    ageGroup,
    hasReferences: hasCharacterReferenceImages(params.referenceImages),
    hasEnvironmentReference: hasEnvironmentReferenceImage(undefined, params.referenceImages),
    scenarioCardId: params.scenarioCardId,
  });
}

export function buildGraphicNovelPanelCropInstructions(
  page: PlannedGraphicNovelPage,
  panelIndex: number,
  environmentsById: Map<string, StoryEnvironment> = new Map(),
  referenceImages: ReferenceImage[] = [],
  options: {
    style?: string;
    ageGroup?: string;
    scenarioCardId?: string;
  } = {}
): string {
  const panel = page.panels[panelIndex];
  if (!panel) {
    throw new Error(`Graphic novel panel index ${panelIndex} is out of range`);
  }
  const environment = environmentsById.get(panel.script.visual.environmentId);
  const hasEnvironmentImageRef = hasEnvironmentReferenceImage(environment, referenceImages);
  const sceneVisual = composedPanelSceneVisual({
    panel,
    environment,
    hasEnvironmentImageRef,
  });

  return buildSceneImagePrompt({
    sceneVisual,
    ageGroup: options.ageGroup || '6-8',
    style: options.style || 'storybook',
    referenceCharacterNames: panelCharacterReferenceEntries(page, panel, referenceImages),
    hasReferences: hasCharacterReferenceImages(referenceImages),
    imageIndexMap: imageIndexMapForReferences(referenceImages),
    referenceImages,
    currentEnvironment: environment,
    scenarioCardId: options.scenarioCardId,
    hasEnvironmentImageRef,
  });
}
