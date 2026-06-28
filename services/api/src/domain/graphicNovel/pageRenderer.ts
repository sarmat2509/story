import sharp from 'sharp';
import type { ImageDomainService } from '../image';
import { GRAPHIC_NOVEL_PAGE_SIZE, normalizeRect } from './layoutPlanner';
import type { StoryEnvironment } from '../../ai/types';
import type { ImageValidationResult } from '../../ai/types';
import type { ReferenceImage } from '../../providers/base/IImageProvider';
import type { BubbleGeometry, PlannedGraphicNovelPage, Rect } from './types';
import { getImageStylePrefix } from '../../prompts/image/styles';

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
const PANEL_GUIDE_COLORS = [
  { name: 'sky-blue', frameFill: '#d8ecff', artFill: '#c5e1ff' },
  { name: 'peach', frameFill: '#ffe1d1', artFill: '#ffd1bd' },
  { name: 'mint-green', frameFill: '#d9f4df', artFill: '#c7ebcf' },
  { name: 'lavender', frameFill: '#e8ddff', artFill: '#dacaff' },
  { name: 'butter-yellow', frameFill: '#fff3bf', artFill: '#ffe89a' },
  { name: 'rose-pink', frameFill: '#ffdce8', artFill: '#ffc7d8' },
];
const TEMPLATE_COLOR_MAX_CHANNEL_DELTA = 14;
const TEMPLATE_COLOR_RESIDUE_MIN_PIXELS = 500;
const TEMPLATE_COLOR_RESIDUE_MIN_PANEL_RATIO = 0.002;

export interface GraphicNovelTemplateColorResiduePanelCheck {
  panelIndex: number;
  panelId: string;
  guideColor: string;
  matchedPixels: number;
  panelPixels: number;
  ratio: number;
}

export interface GraphicNovelTemplateColorResidueCheck {
  hasResidue: boolean;
  matchedPixels: number;
  thresholdPixels: number;
  thresholdPanelRatio: number;
  panels: GraphicNovelTemplateColorResiduePanelCheck[];
}

function px(rect: Rect): Rect {
  return normalizeRect(rect);
}

function rectSvg(rect: Rect, attrs: string): string {
  const r = px(rect);
  return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" ${attrs}/>`;
}

function panelGuideColor(index: number): (typeof PANEL_GUIDE_COLORS)[number] {
  return PANEL_GUIDE_COLORS[index % PANEL_GUIDE_COLORS.length];
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function colorMatchesGuideColor(
  r: number,
  g: number,
  b: number,
  guideColors: Array<[number, number, number]>
): boolean {
  return guideColors.some(
    ([gr, gg, gb]) =>
      Math.abs(r - gr) <= TEMPLATE_COLOR_MAX_CHANNEL_DELTA &&
      Math.abs(g - gg) <= TEMPLATE_COLOR_MAX_CHANNEL_DELTA &&
      Math.abs(b - gb) <= TEMPLATE_COLOR_MAX_CHANNEL_DELTA
  );
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

function bubbleTailDots(bubble: BubbleGeometry, r: Rect, attrText: string): string {
  if (!bubble.tailTo) return '';

  const tail = px({ x: bubble.tailTo.x, y: bubble.tailTo.y, width: 0, height: 0 });
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
  radius: number
): SpeechTailGeometry | undefined {
  if (!bubble.tailTo) return undefined;

  const tail = px({ x: bubble.tailTo.x, y: bubble.tailTo.y, width: 0, height: 0 });
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

function classicSpeechBubblePath(bubble: BubbleGeometry, r: Rect): string {
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
  const tail = speechTailGeometry(bubble, body, radius);
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
  attrs: { fill: string; stroke: string; strokeWidth: number; fillOpacity?: number }
): string {
  const r = px(bubble.rect);
  const attrText = `fill="${attrs.fill}" fill-opacity="${attrs.fillOpacity ?? 1}" stroke="${attrs.stroke}" stroke-width="${attrs.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`;
  if (bubble.kind === 'speech') {
    return `<path d="${classicSpeechBubblePath(bubble, r)}" ${attrText}/>`;
  }
  const path = cloudBubblePath(r, BUBBLE_CORNER_RADIUS_PX);
  if (bubble.kind === 'thought') {
    return `<path d="${path}" ${attrText}/>${bubbleTailDots(bubble, r, attrText)}`;
  }
  return `<path d="${path}" ${attrText}/>`;
}

function bubbleSvg(page: PlannedGraphicNovelPage): string {
  const bubbles = page.panels
    .flatMap((panel) => panel.bubbles)
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

  const bubbleNodes: string[] = [];
  for (const bubble of bubbles) {
    bubbleNodes.push(
      bubbleShapeSvg(bubble, {
        fill: '#fffdf8',
        fillOpacity: BUBBLE_FILL_OPACITY,
        stroke: '#111',
        strokeWidth: BUBBLE_STROKE_WIDTH_PX,
      })
    );
  }
  return bubbleNodes.join('\n');
}

function frameSvg(page: PlannedGraphicNovelPage, includeArtPlaceholders: boolean): string {
  const panels = page.panels
    .map((panel, index) => {
      const color = panelGuideColor(index);
      const fill = includeArtPlaceholders ? color.artFill : color.frameFill;
      return rectSvg(panel.templatePanel.rect, `fill="${fill}" stroke="#111" stroke-width="8"`);
    })
    .join('\n');
  return panels;
}

function panelFrameOnlySvg(page: PlannedGraphicNovelPage): string {
  return page.panels
    .map((panel) => rectSvg(panel.templatePanel.rect, 'fill="none" stroke="#111" stroke-width="8"'))
    .join('\n');
}

function buildSvg(page: PlannedGraphicNovelPage, includeArtPlaceholders: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAPHIC_NOVEL_PAGE_SIZE.width}" height="${GRAPHIC_NOVEL_PAGE_SIZE.height}" viewBox="0 0 ${GRAPHIC_NOVEL_PAGE_SIZE.width} ${GRAPHIC_NOVEL_PAGE_SIZE.height}">
  <rect width="100%" height="100%" fill="#fffaf0"/>
  ${frameSvg(page, includeArtPlaceholders)}
</svg>`;
}

function buildOverlaySvg(page: PlannedGraphicNovelPage): string {
  const pagePath = `M 0 0 H ${GRAPHIC_NOVEL_PAGE_SIZE.width} V ${GRAPHIC_NOVEL_PAGE_SIZE.height} H 0 Z`;
  const panelHoles = page.panels
    .map((panel) => {
      const r = px(panel.templatePanel.rect);
      return `M ${r.x} ${r.y} H ${r.x + r.width} V ${r.y + r.height} H ${r.x} Z`;
    })
    .join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAPHIC_NOVEL_PAGE_SIZE.width}" height="${GRAPHIC_NOVEL_PAGE_SIZE.height}" viewBox="0 0 ${GRAPHIC_NOVEL_PAGE_SIZE.width} ${GRAPHIC_NOVEL_PAGE_SIZE.height}">
  <path d="${pagePath} ${panelHoles}" fill="#fffaf0" fill-rule="evenodd"/>
  ${panelFrameOnlySvg(page)}
  ${bubbleSvg(page)}
</svg>`;
}

export async function renderGraphicNovelPageTemplate(
  page: PlannedGraphicNovelPage
): Promise<Buffer> {
  return sharp(Buffer.from(buildSvg(page, true)))
    .png()
    .toBuffer();
}

export async function detectGraphicNovelTemplateColorResidue(
  imageData: Buffer,
  page: PlannedGraphicNovelPage
): Promise<GraphicNovelTemplateColorResidueCheck> {
  const { data, info } = await sharp(imageData)
    .resize(GRAPHIC_NOVEL_PAGE_SIZE.width, GRAPHIC_NOVEL_PAGE_SIZE.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  const panels = page.panels.map((panel, index) => {
    const color = panelGuideColor(index);
    const guideColors = [hexToRgb(color.artFill), hexToRgb(color.frameFill)];
    const rect = px(panel.templatePanel.rect);
    const x0 = clamp(Math.floor(rect.x), 0, info.width - 1);
    const y0 = clamp(Math.floor(rect.y), 0, info.height - 1);
    const x1 = clamp(Math.ceil(rect.x + rect.width), x0 + 1, info.width);
    const y1 = clamp(Math.ceil(rect.y + rect.height), y0 + 1, info.height);
    let matchedPixels = 0;
    let panelPixels = 0;

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const pixelIndex = (y * info.width + x) * channels;
        const alpha = channels >= 4 ? data[pixelIndex + 3] : 255;
        if (alpha < 16) continue;
        panelPixels += 1;
        if (
          colorMatchesGuideColor(
            data[pixelIndex],
            data[pixelIndex + 1],
            data[pixelIndex + 2],
            guideColors
          )
        ) {
          matchedPixels += 1;
        }
      }
    }

    const ratio = panelPixels > 0 ? matchedPixels / panelPixels : 0;
    return {
      panelIndex: index + 1,
      panelId: panel.templatePanel.id,
      guideColor: color.name,
      matchedPixels,
      panelPixels,
      ratio: Math.round(ratio * 10000) / 10000,
    };
  });

  const matchedPixels = panels.reduce((sum, panel) => sum + panel.matchedPixels, 0);
  return {
    hasResidue: panels.some(
      (panel) =>
        panel.matchedPixels >= TEMPLATE_COLOR_RESIDUE_MIN_PIXELS &&
        panel.ratio >= TEMPLATE_COLOR_RESIDUE_MIN_PANEL_RATIO
    ),
    matchedPixels,
    thresholdPixels: TEMPLATE_COLOR_RESIDUE_MIN_PIXELS,
    thresholdPanelRatio: TEMPLATE_COLOR_RESIDUE_MIN_PANEL_RATIO,
    panels,
  };
}

export async function overlayGraphicNovelTemplate(
  baseImage: Buffer,
  page: PlannedGraphicNovelPage
): Promise<Buffer> {
  const overlay = await sharp(Buffer.from(buildOverlaySvg(page)))
    .png()
    .toBuffer();

  return sharp(baseImage)
    .resize(GRAPHIC_NOVEL_PAGE_SIZE.width, GRAPHIC_NOVEL_PAGE_SIZE.height, { fit: 'cover' })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export interface GraphicNovelPanelArtInput {
  panelId: string;
  panelIndex: number;
  imageData: Buffer;
}

export async function composeGraphicNovelPanelArtPage(
  page: PlannedGraphicNovelPage,
  panelArt: GraphicNovelPanelArtInput[]
): Promise<Buffer> {
  const base = await sharp({
    create: {
      width: GRAPHIC_NOVEL_PAGE_SIZE.width,
      height: GRAPHIC_NOVEL_PAGE_SIZE.height,
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
      const r = px(panel.templatePanel.rect);
      const input = art
        ? await sharp(art.imageData)
            .resize(r.width, r.height, { fit: 'cover', position: 'attention' })
            .png()
            .toBuffer()
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

  return sharp(base).composite(composites).png().toBuffer();
}

function outfitById(page: PlannedGraphicNovelPage): Map<string, string> {
  return new Map((page.outfits || []).map((outfit) => [outfit.id, outfit.description]));
}

function cameraCharacters(
  panel: PlannedGraphicNovelPage['panels'][number],
  outfitsById: Map<string, string> = new Map()
): string {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  if (typeof composition === 'string') return composition;
  if (!composition.characters.length) return '  * none';

  return composition.characters
    .map((character) => {
      const outfit = character.outfitId
        ? outfitsById.get(character.outfitId) || `outfit id ${character.outfitId}`
        : null;
      const staging = [
        character.position ? `position ${character.position}` : null,
        character.description,
        outfit ? `outfit ${outfit}` : null,
      ]
        .filter(Boolean)
        .join('; ');
      return `  * ${character.name}: ${staging}`;
    })
    .join('\n');
}

function panelGeometryLine(
  panel: PlannedGraphicNovelPage['panels'][number],
  index: number
): string {
  const r = px(panel.templatePanel.rect);
  return [
    `- Slot color: ${panelGuideColor(index).name}.`,
    `- Slot position: x=${r.x}; y=${r.y}.`,
    `- Slot size: width=${r.width}; height=${r.height}.`,
  ].join('\n');
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizeReferenceName(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function findEnvironmentReferenceIndex(
  environment: StoryEnvironment,
  referenceImages: ReferenceImage[]
): number | null {
  const environmentName = normalizeReferenceName(environment.name);
  const environmentId = normalizeReferenceName(environment.id);
  const index = referenceImages.findIndex((reference) => {
    if (reference.referenceKind !== 'object') return false;
    const referenceName = normalizeReferenceName(reference.characterName);
    const instructionText = normalizeReferenceName(reference.instructionText);
    return (
      referenceName === environmentName ||
      referenceName === environmentId ||
      instructionText.includes(environmentName) ||
      instructionText.includes(environmentId)
    );
  });
  return index >= 0 ? index + 1 : null;
}

function environmentSlotLine(
  environment: StoryEnvironment | undefined,
  referenceImages: ReferenceImage[]
): string | null {
  if (!environment) return null;
  const referenceIndex = findEnvironmentReferenceIndex(environment, referenceImages);
  const environmentSource = referenceIndex
    ? `use Image ${referenceIndex} environment reference`
    : environment.description;
  const outfitContext = environment.characterOutfits
    ? ` Wardrobe/outfit context: ${environment.characterOutfits}`
    : '';
  return `- Environment: ${environment.name}; ${environmentSource}.${outfitContext}`;
}

function buildReferenceBrief(referenceImages: ReferenceImage[] = []): string {
  if (referenceImages.length === 0) {
    return 'No reference images were attached.';
  }

  return referenceImages
    .map((reference, index) => {
      const fallbackLabel = `Image ${index + 1}: ${reference.referenceKind === 'object' ? 'object/environment' : 'character identity'} reference${reference.characterName ? ` for ${reference.characterName}` : ''}.`;
      if (reference.referenceKind === 'character') {
        const instruction = reference.instructionText || '';
        const sourceKind = /Reference photo/i.test(instruction)
          ? 'Reference photo'
          : 'Character sheet';
        return `- Image ${index + 1}: Character reference for "${reference.characterName || 'character'}". ${sourceKind}.`;
      }
      if (reference.referenceKind === 'object') {
        return `- Image ${index + 1}: Environment reference for "${reference.characterName || 'location'}". Reusable location structure, background objects, materials, and color continuity.`;
      }
      return `- ${reference.instructionText || fallbackLabel}`;
    })
    .join('\n');
}

function buildPanelEditBrief(
  panel: PlannedGraphicNovelPage['panels'][number],
  index: number,
  environments: Map<string, StoryEnvironment>,
  referenceImages: ReferenceImage[],
  outfitsById: Map<string, string> = new Map()
): string {
  const visual = panel.script.visual;
  const sceneVisual = visual.sceneVisual;
  const composition = sceneVisual.cameraComposition;
  const environment = environments.get(visual.environmentId);
  const shot = typeof composition === 'string' ? composition : composition.shot;

  return [
    `${panelGuideColor(index).name} slot:`,
    panelGeometryLine(panel, index),
    environmentSlotLine(environment, referenceImages),
    `- Draw: ${sentence(visual.primaryRead)}`,
    `- Scene setting/change: ${sentence(sceneVisual.setting)}`,
    `- Camera: ${shot}.`,
    `- Lighting: ${sentence(sceneVisual.lighting)}`,
    `- Characters in slot:`,
    cameraCharacters(panel, outfitsById),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPanelRepairBrief(
  panel: PlannedGraphicNovelPage['panels'][number],
  index: number,
  environments: Map<string, StoryEnvironment>,
  referenceImages: ReferenceImage[],
  outfitsById: Map<string, string> = new Map()
): string {
  const visual = panel.script.visual;
  const sceneVisual = visual.sceneVisual;
  const composition = sceneVisual.cameraComposition;
  const environment = environments.get(visual.environmentId);
  const shot = typeof composition === 'string' ? composition : composition.shot;

  return [
    `Panel ${index + 1}:`,
    panelGeometryLine(panel, index),
    environmentSlotLine(environment, referenceImages),
    `- Intended visual: ${sentence(visual.primaryRead)}`,
    `- Scene setting/change: ${sentence(sceneVisual.setting)}`,
    `- Camera: ${shot}.`,
    `- Lighting: ${sentence(sceneVisual.lighting)}`,
    `- Characters in panel:`,
    cameraCharacters(panel, outfitsById),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildGraphicNovelPageSystemInstruction(params: {
  style: string;
  slotCount: number;
  ageGroup?: string;
  scenarioCardId?: string;
}): string {
  const stylePrefix = getImageStylePrefix(
    params.style,
    params.ageGroup || '6-8',
    params.scenarioCardId
  );
  return [
    `Children's illustration page. ART STYLE: ${stylePrefix}.`,
    `You are editing a prepared page template with exactly ${params.slotCount} color-coded slots and fixed gutters.`,
    'Use the existing slot count, black frames, and gutters as the fixed page structure.',
    'Each ART TO ADD slot section maps one guide color to one scene.',
    'Fill each color-coded slot with one continuous full-bleed illustration to the inside edge of its black frame, covering every pixel of the guide color.',
    'Each slot contains one single visual moment.',
    'All character bodies, hands, props, and background art stay inside their slot frames.',
    'Each slot uses exactly the characters listed under Characters in slot.',
    'When a scene needs more room, crop the illustration at the slot edge so the art still fills the whole slot.',
    'Render visual art only; bubbles and readable text are added later by the server.',
    "The final image is a clean children's illustration page.",
    'Character identity reference images are locked visual ground truth for face/head design, hairstyle or fur/body structure, age/species read, body proportions, silhouette, stable palette, and distinctive marks.',
    'Outfit instructions are wardrobe-only. Apply garments, shoes, and worn accessories to the locked character identity without changing face, hair, body proportions, age read, species design, silhouette, or expression.',
    'Reference labels use the exact character and environment names that appear in the slot visual instructions.',
    'Environment references define reusable location structure, materials, key objects, and palette continuity.',
  ].join(' ');
}

export function buildGraphicNovelPageEditInstructions(
  page: PlannedGraphicNovelPage,
  environmentsById: Map<string, StoryEnvironment> = new Map(),
  referenceImages: ReferenceImage[] = []
): string {
  const outfits = outfitById(page);
  const panelInstructions = page.panels
    .map((panel, index) =>
      buildPanelEditBrief(panel, index, environmentsById, referenceImages, outfits)
    )
    .join('\n\n');

  return `Use the attached color-coded page template and reference images.
Fill the slots according to ART TO ADD.

REFERENCE IMAGES TO FOLLOW:
${buildReferenceBrief(referenceImages)}

ART TO ADD:
${panelInstructions}`;
}

export function buildGraphicNovelPageRepairSystemInstruction(params: {
  style: string;
  slotCount: number;
  ageGroup?: string;
  scenarioCardId?: string;
}): string {
  const stylePrefix = getImageStylePrefix(
    params.style,
    params.ageGroup || '6-8',
    params.scenarioCardId
  );
  return [
    `Children's illustration page repair. ART STYLE: ${stylePrefix}.`,
    `Edit the failed art-only page while preserving exactly ${params.slotCount} panel boxes, black frames, gutters, page aspect ratio, and the existing page composition.`,
    'Fix only the validator issues listed in the repair instructions.',
    'Keep correct characters, backgrounds, lighting, camera angles, panel geometry, and style unchanged.',
    'Use attached reference images only according to their labels.',
    'Character identity reference images are locked visual ground truth for face/head design, hairstyle or fur/body structure, age/species read, body proportions, silhouette, stable palette, and distinctive marks.',
    'Environment references define reusable location structure, materials, key objects, and palette continuity.',
    'Render visual art only; bubbles and readable text are added later by the server.',
  ].join(' ');
}

function validationRepairFlagLines(validation: ImageValidationResult): string {
  return [
    `- unexpected characters: ${validation.hasUnexpectedCharacters ? 'yes' : 'no'}`,
    `- text/letters in art: ${validation.hasTextOrLetters ? 'yes' : 'no'}`,
    `- rendering artifacts: ${validation.hasRenderingArtifacts ? 'yes' : 'no'}`,
    `- artwork outside panel bounds: ${validation.hasArtworkOutsidePanelBounds ? 'yes' : 'no'}`,
    `- extra panel/scenes: ${validation.hasExtraPanelStructure ? 'yes' : 'no'}`,
    `- leftover color template residue: ${validation.hasTemplateColorResidue ? 'yes' : 'no'}`,
  ].join('\n');
}

function validationCharacterRepairLines(validation: ImageValidationResult): string {
  const lines = validation.characters
    .filter(
      (character) =>
        !character.found ||
        character.duplicated ||
        character.recognizableScore < 0.95 ||
        character.faceMatchesReference === false ||
        character.hairMatchesReference === false ||
        character.ageReadMatchesReference === false ||
        character.proportionsMatchReference === false ||
        character.sameOverallDesignRead === false ||
        character.silhouetteDriftSeverity === 'moderate' ||
        character.silhouetteDriftSeverity === 'severe' ||
        character.matchesColors === false ||
        character.matchesOutfit === false ||
        !!character.issue
    )
    .map((character) => {
      const issueParts = [
        `- ${character.name}:`,
        character.found ? null : 'missing',
        character.duplicated ? 'duplicated' : null,
        `recognizable=${character.recognizableScore}`,
        character.faceMatchesReference === false ? 'face mismatch' : null,
        character.hairMatchesReference === false ? 'hair mismatch' : null,
        character.ageReadMatchesReference === false ? 'age read mismatch' : null,
        character.proportionsMatchReference === false ? 'proportions mismatch' : null,
        character.sameOverallDesignRead === false ? 'overall design mismatch' : null,
        character.silhouetteDriftSeverity && character.silhouetteDriftSeverity !== 'none'
          ? `silhouette drift=${character.silhouetteDriftSeverity}`
          : null,
        character.matchesColors === false ? 'colors mismatch' : null,
        character.matchesOutfit === false ? 'outfit mismatch' : null,
        character.issue ? `issue=${character.issue}` : null,
        character.identityComparisonSummary
          ? `summary=${character.identityComparisonSummary}`
          : null,
      ];

      return issueParts.filter(Boolean).join(' ');
    });

  return lines.length > 0 ? lines.join('\n') : '- No per-character repair issue reported.';
}

export function buildGraphicNovelPageValidationRepairInstructions(params: {
  page: PlannedGraphicNovelPage;
  validation: ImageValidationResult;
  score: number | null;
  environmentsById?: Map<string, StoryEnvironment>;
  referenceImages?: ReferenceImage[];
}): string {
  const referenceImages = params.referenceImages ?? [];
  const environments = params.environmentsById ?? new Map<string, StoryEnvironment>();
  const outfits = outfitById(params.page);
  const panelInstructions = params.page.panels
    .map((panel, index) =>
      buildPanelRepairBrief(panel, index, environments, referenceImages, outfits)
    )
    .join('\n\n');

  return `Repair the attached failed art-only page using the validator feedback.

REFERENCE IMAGES TO FOLLOW:
${buildReferenceBrief(referenceImages)}

VALIDATION RESULT:
- score: ${params.score ?? 'n/a'}
- overall feedback: ${params.validation.overallFeedback || 'n/a'}
- layout feedback: ${params.validation.layoutFeedback || 'n/a'}
${validationRepairFlagLines(params.validation)}
${params.validation.hasTemplateColorResidue ? '- Repair focus: cover every visible color-coded guide-template patch/strip/band with finished illustration while preserving the panel frames and gutters.' : ''}

CHARACTER ISSUES:
${validationCharacterRepairLines(params.validation)}

ART TARGET BY PANEL:
${panelInstructions}

Output the corrected art-only page. Preserve panel count, panel geometry, frames, gutters, and correct areas. Do not add speech bubbles, thought bubbles, captions, labels, or readable text.`;
}

export async function editGraphicNovelPage(params: {
  imageDomain: ImageDomainService;
  page: PlannedGraphicNovelPage;
  templateBuffer: Buffer;
  style: string;
  ageGroup?: string;
  scenarioCardId?: string;
  environmentsById?: Map<string, StoryEnvironment>;
  environmentReferenceImages?: ReferenceImage[];
  referenceImages?: ReferenceImage[];
  onUsage?: Parameters<ImageDomainService['editImageWithInstructions']>[0]['onUsage'];
  onAttemptImage?: (params: {
    attempt: number;
    imageData: Buffer;
    mimeType: string;
  }) => void | Promise<void>;
}): Promise<{
  imageData: Buffer;
  mimeType: string;
  generationParams: Record<string, unknown>;
}> {
  const referenceImages = params.referenceImages ?? params.environmentReferenceImages ?? [];
  const characterReferenceCount = referenceImages.filter(
    (ref) => ref.referenceKind === 'character'
  ).length;
  const objectReferenceCount = referenceImages.filter(
    (ref) => ref.referenceKind === 'object'
  ).length;
  const editInstructions = buildGraphicNovelPageEditInstructions(
    params.page,
    params.environmentsById,
    referenceImages
  );

  const edited = await params.imageDomain.editImageWithInstructions({
    originalImage: params.templateBuffer,
    originalMimeType: 'image/png',
    editInstructions,
    aspectRatio: '3:4',
    referenceImages,
    personGeneration: 'allow_all',
    systemInstruction: buildGraphicNovelPageSystemInstruction({
      style: params.style,
      slotCount: params.page.panels.length,
      ageGroup: params.ageGroup,
      scenarioCardId: params.scenarioCardId,
    }),
    onUsage: params.onUsage,
    operation: 'graphic_novel_page_edit',
  });
  await params.onAttemptImage?.({
    attempt: 1,
    imageData: Buffer.from(edited.imageData),
    mimeType: 'image/png',
  });

  return {
    imageData: Buffer.from(edited.imageData),
    mimeType: 'image/png',
    generationParams: {
      mode: 'graphic_novel_page_art_edit',
      templateId: params.page.template.id,
      textRenderingMode: 'html_overlay',
      bubbleShapeRenderingMode: 'post_art_vision_svg_speech_single_path_tail_thought_beaded_tail',
      providerInteractionId: edited.providerInteractionId,
      referenceCount: referenceImages.length,
      characterReferenceCount,
      objectReferenceCount,
      environmentReferenceCount: params.environmentReferenceImages?.length || objectReferenceCount,
      referenceImages: referenceImages.map((ref, index) => ({
        index: index + 1,
        characterName: ref.characterName ?? null,
        referenceKind: ref.referenceKind ?? null,
        hasFileUri: !!ref.fileUri,
        hasBase64Data: !!ref.base64Data,
        instructionText: ref.instructionText ?? null,
      })),
      editAttempts: 1,
      protectedTemplateValidationSkipped: true,
      validationPassed: null,
      validation: null,
      fallbackOverlayRequired: false,
      deterministicOverlayApplied: false,
    },
  };
}
