import sharp from 'sharp';
import type { ImageDomainService } from '../image';
import {
  GRAPHIC_NOVEL_PAGE_SIZE,
  normalizeRect,
  pageSizeForGraphicNovelPage,
} from './layoutPlanner';
import type { StoryEnvironment } from '../../ai/types';
import type { ImageValidationResult } from '../../ai/types';
import type { ReferenceImage } from '../../providers/base/IImageProvider';
import type { BubbleGeometry, PlannedGraphicNovelPage, Rect } from './types';
import { getImageStylePrefix } from '../../prompts/image/styles';
import {
  buildReferenceBindingRegistry,
  findCharacterReferenceBinding,
  findEnvironmentReferenceBinding,
  findOutfitReferenceBinding,
  formatReferenceBindingInstruction,
  referenceBindingIdFor,
} from '../../services/referenceBinding';

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

function pageEditAspectRatio(page: PlannedGraphicNovelPage): '16:9' | '3:4' {
  const pageSize = pageSizeForGraphicNovelPage(page);
  return pageSize.width >= pageSize.height ? '16:9' : '3:4';
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

function meaningfulOutfitText(value?: string | null): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^natural appearance\.?$/i.test(text)) return null;
  return text;
}

type CharacterReferenceContext = {
  canonicalName: string;
  bindingId: string;
  aliases: string[];
};

function capitalizeAscii(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}` : value;
}

function addAlias(aliases: Set<string>, value?: string | null): void {
  const text = String(value || '').trim();
  if (!text) return;
  aliases.add(text);
}

function characterAliasEntries(
  page: PlannedGraphicNovelPage,
  characterName: string
): string[] {
  const aliases = new Set<string>();
  addAlias(aliases, characterName);
  for (const alias of page.characterAliases?.[characterName] || []) {
    addAlias(aliases, alias);
  }
  return Array.from(aliases);
}

function collectCharacterReferenceContexts(
  page: PlannedGraphicNovelPage,
  referenceImages: ReferenceImage[]
): CharacterReferenceContext[] {
  const byName = new Map<string, CharacterReferenceContext>();

  for (const panel of page.panels) {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition === 'string') continue;

    for (const character of composition.characters) {
      const key = normalizeReferenceName(character.name);
      if (!key) continue;

      const reference = findCharacterReferenceBinding(character.name, referenceImages);
      const bindingId = reference ? referenceBindingIdFor(reference) : character.name;
      const aliases = new Set(byName.get(key)?.aliases || []);
      for (const alias of characterAliasEntries(page, character.name)) {
        addAlias(aliases, alias);
      }
      addAlias(aliases, reference?.characterName);

      const outfitSlug = character.outfitId
        ?.replace(/_?outfit$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      addAlias(aliases, outfitSlug);
      addAlias(aliases, capitalizeAscii(outfitSlug || ''));

      const idSlug = bindingId.match(/^REF_CH_(.+)_[A-Z0-9]{6}$/)?.[1];
      if (idSlug) {
        const readableSlug = idSlug.replace(/_/g, ' ').toLowerCase();
        addAlias(aliases, readableSlug);
        addAlias(aliases, capitalizeAscii(readableSlug));
      }

      byName.set(key, {
        canonicalName: character.name,
        bindingId,
        aliases: Array.from(aliases),
      });
    }
  }

  return Array.from(byName.values());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceCharacterNamesWithBindings(
  value: string,
  contexts: CharacterReferenceContext[]
): string {
  let result = value;
  const replacements = contexts.flatMap((context) =>
    context.aliases
      .filter((alias) => alias && alias !== context.bindingId)
      .map((alias) => ({ alias, bindingId: context.bindingId }))
  );

  replacements.sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, bindingId } of replacements) {
    const escaped = escapeRegExp(alias);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
    result = result.replace(pattern, `$1${bindingId}`);
  }

  return result;
}

function characterReferenceId(
  characterName: string,
  contexts: CharacterReferenceContext[]
): string {
  const key = normalizeReferenceName(characterName);
  return contexts.find((context) => normalizeReferenceName(context.canonicalName) === key)
    ?.bindingId ?? characterName;
}

function cameraCharacters(
  panel: PlannedGraphicNovelPage['panels'][number],
  outfitsById: Map<string, string> = new Map(),
  referenceImages: ReferenceImage[] = [],
  characterContexts: CharacterReferenceContext[] = []
): string {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  if (typeof composition === 'string') {
    return replaceCharacterNamesWithBindings(composition, characterContexts);
  }
  if (!composition.characters.length) return '  * none';

  return composition.characters
    .map((character) => {
      const characterLabel = characterReferenceId(character.name, characterContexts);
      const outfitRef = findOutfitReferenceBinding(character.name, referenceImages);
      const outfitDescription = character.outfitId ? outfitsById.get(character.outfitId) : null;
      const outfit = outfitRef
        ? `from ${referenceBindingIdFor(outfitRef)}`
        : character.outfitId
          ? outfitDescription === undefined
            ? `outfit id ${character.outfitId}`
            : meaningfulOutfitText(outfitDescription)
          : null;
      const staging = [
        character.position ? `position ${character.position}` : null,
        replaceCharacterNamesWithBindings(character.description, characterContexts),
        outfit ? `outfit ${outfit}` : null,
      ]
        .filter(Boolean)
        .join('; ');
      return `  * ${characterLabel}: ${staging}`;
    })
    .join('\n');
}

function panelGeometryLine(
  panel: PlannedGraphicNovelPage['panels'][number],
  index: number
): string {
  const r = px(panel.templatePanel.rect);
  return [
    `- Panel ${index + 1} bounds: x=${r.x}; y=${r.y}; width=${r.width}; height=${r.height}.`,
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

function environmentSlotLine(
  environment: StoryEnvironment | undefined,
  referenceImages: ReferenceImage[]
): string | null {
  if (!environment) return null;
  const environmentRef = findEnvironmentReferenceBinding(environment, referenceImages);
  const environmentSource = environmentRef
    ? referenceBindingIdFor(environmentRef)
    : environment.description || environment.name;
  return `- Environment: ${environmentSource}.`;
}

function buildReferenceBrief(referenceImages: ReferenceImage[] = []): string {
  if (referenceImages.length === 0) {
    return 'No reference images were attached.';
  }

  return referenceImages
    .map((reference, index) => {
      const imageIndex = reference.imageIndex ?? index + 1;
      return `- ${formatReferenceBindingInstruction(reference, imageIndex)}`;
    })
    .join('\n');
}

export function summarizeGraphicNovelReferenceImages(
  referenceImages: ReferenceImage[]
): Array<Record<string, unknown>> {
  return referenceImages.map((ref, index) => {
    const meta = ref as ReferenceImage & {
      source?: string;
      type?: string;
      isTurnaround?: boolean;
      identitySource?: 'turnaround' | 'reference_photo';
      environmentId?: string;
      storagePath?: string;
    };

    return {
      index: index + 1,
      imageIndex: ref.imageIndex ?? index + 1,
      referenceBindingId: ref.referenceBindingId ?? null,
      characterName: ref.characterName ?? null,
      referenceKind: ref.referenceKind ?? null,
      source: meta.source ?? null,
      type: meta.type ?? null,
      environmentId: meta.environmentId ?? null,
      storagePath: meta.storagePath ?? null,
      url: ref.url ?? null,
      isTurnaround: ref.referenceKind === 'character' ? meta.isTurnaround === true : null,
      identitySource:
        ref.referenceKind === 'character'
          ? (meta.identitySource ?? (meta.isTurnaround ? 'turnaround' : 'reference_photo'))
          : null,
      hasFileUri: !!ref.fileUri,
      fileUri: ref.fileUri ?? null,
      hasBase64Data: !!ref.base64Data,
      base64Bytes: ref.base64Data ? Buffer.byteLength(ref.base64Data, 'base64') : null,
      instructionText: ref.instructionText ?? null,
    };
  });
}

export function buildGraphicNovelImageRequestManifest(params: {
  operation: string;
  mode: 'generate' | 'edit';
  prompt: string;
  systemInstruction?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  personGeneration?: 'allow_adult' | 'allow_all' | 'dont_allow';
  previousInteractionId?: string | null;
  referenceImages?: ReferenceImage[];
}): Record<string, unknown> {
  const referenceImages = params.referenceImages ?? [];
  const references = summarizeGraphicNovelReferenceImages(referenceImages);
  return {
    version: 1,
    operation: params.operation,
    mode: params.mode,
    savedAt: new Date().toISOString(),
    aspectRatio: params.aspectRatio ?? null,
    personGeneration: params.personGeneration ?? null,
    previousInteractionId: params.previousInteractionId ?? null,
    prompt: params.prompt,
    systemInstruction: params.systemInstruction ?? null,
    promptLength: params.prompt.length,
    systemInstructionLength: params.systemInstruction?.length ?? 0,
    referenceCount: references.length,
    characterReferenceCount: references.filter((ref) => ref.referenceKind === 'character').length,
    objectReferenceCount: references.filter((ref) => ref.referenceKind === 'object').length,
    referenceImages: references,
  };
}

function buildPanelFreeLayoutBrief(
  panel: PlannedGraphicNovelPage['panels'][number],
  index: number,
  environments: Map<string, StoryEnvironment>,
  referenceImages: ReferenceImage[],
  outfitsById: Map<string, string> = new Map(),
  characterContexts: CharacterReferenceContext[] = []
): string {
  const visual = panel.script.visual;
  const sceneVisual = visual.sceneVisual;
  const composition = sceneVisual.cameraComposition;
  const environment = environments.get(visual.environmentId);
  const shot = replaceCharacterNamesWithBindings(
    typeof composition === 'string' ? composition : composition.shot,
    characterContexts
  );

  return [
    `Panel ${index + 1}:`,
    environmentSlotLine(environment, referenceImages),
    `- Setting: ${sentence(replaceCharacterNamesWithBindings(sceneVisual.setting, characterContexts))}`,
    `- Characters:`,
    cameraCharacters(panel, outfitsById, referenceImages, characterContexts),
    `- Camera: ${sentence(shot)}`,
    `- Lighting: ${sentence(replaceCharacterNamesWithBindings(sceneVisual.lighting, characterContexts))}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPanelRepairBrief(
  panel: PlannedGraphicNovelPage['panels'][number],
  index: number,
  environments: Map<string, StoryEnvironment>,
  referenceImages: ReferenceImage[],
  outfitsById: Map<string, string> = new Map(),
  characterContexts: CharacterReferenceContext[] = []
): string {
  const visual = panel.script.visual;
  const sceneVisual = visual.sceneVisual;
  const composition = sceneVisual.cameraComposition;
  const environment = environments.get(visual.environmentId);
  const shot = replaceCharacterNamesWithBindings(
    typeof composition === 'string' ? composition : composition.shot,
    characterContexts
  );

  return [
    `Panel ${index + 1}:`,
    panelGeometryLine(panel, index),
    environmentSlotLine(environment, referenceImages),
    `- Setting: ${sentence(replaceCharacterNamesWithBindings(sceneVisual.setting, characterContexts))}`,
    `- Characters:`,
    cameraCharacters(panel, outfitsById, referenceImages, characterContexts),
    `- Camera: ${sentence(shot)}`,
    `- Lighting: ${sentence(replaceCharacterNamesWithBindings(sceneVisual.lighting, characterContexts))}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function validationCharacterNeedsRepair(
  character: ImageValidationResult['characters'][number]
): boolean {
  return (
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
  );
}

function characterMatchesPanelName(
  page: PlannedGraphicNovelPage,
  panelCharacterName: string,
  validationCharacterName: string
): boolean {
  const validationName = normalizeReferenceName(validationCharacterName);
  if (!validationName) return false;
  const panelAliases = characterAliasEntries(page, panelCharacterName).map(normalizeReferenceName);
  return (
    normalizeReferenceName(panelCharacterName) === validationName ||
    panelAliases.includes(validationName)
  );
}

function expectedPanelNumbersForCharacter(
  page: PlannedGraphicNovelPage,
  characterName: string
): number[] {
  const panels: number[] = [];

  page.panels.forEach((panel, index) => {
    const composition = panel.script.visual.sceneVisual.cameraComposition;
    if (typeof composition === 'string') return;
    const expectedHere = composition.characters.some((character) =>
      characterMatchesPanelName(page, character.name, characterName)
    );
    if (expectedHere) panels.push(index + 1);
  });

  return panels;
}

function characterRepairIssueSummary(
  character: ImageValidationResult['characters'][number]
): string {
  const parts = [
    character.found ? null : 'missing',
    character.duplicated ? 'duplicated' : null,
    character.actualVisibleDescription
      ? `currently visible: ${character.actualVisibleDescription}`
      : null,
    character.issue
      ? `validator feedback: ${character.issue.replace(/[.。]+$/u, '')}`
      : character.identityComparisonSummary
        ? `validator feedback: ${character.identityComparisonSummary.replace(/[.。]+$/u, '')}`
        : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('; ') : 'validator marked this character incorrect';
}

function validationLayoutRepairLines(validation: ImageValidationResult): string[] {
  const lines: string[] = [];
  if (validation.hasExtraPanelStructure) {
    lines.push(
      `- Page layout: ${validation.layoutFeedback || 'extra/missing/split panel structure reported by validator'}.`
    );
  } else if (validation.layoutFeedback && validation.hasArtworkOutsidePanelBounds) {
    lines.push(`- Page layout: ${validation.layoutFeedback}.`);
  }
  if (validation.hasArtworkOutsidePanelBounds) {
    lines.push('- Keep repaired artwork inside the existing panel borders.');
  }
  if (validation.hasArtworkOverSpeechBubbles) {
    lines.push('- Clear artwork from reserved speech bubble areas.');
  }
  if (validation.hasTextOrLetters) {
    lines.push('- Remove readable text, letters, captions, and bubbles from the artwork.');
  }
  if (validation.hasRenderingArtifacts) {
    lines.push('- Fix severe rendering artifacts called out by the validator.');
  }
  if (validation.hasUnexpectedCharacters) {
    lines.push('- Remove unexpected page-roster characters from panels where they are not expected.');
  }
  return lines;
}

function validationCharacterRepairLines(
  page: PlannedGraphicNovelPage,
  validation: ImageValidationResult,
  referenceImages: ReferenceImage[]
): string {
  const lines: string[] = [];

  for (const character of validation.characters.filter(validationCharacterNeedsRepair)) {
    const identityRef = findCharacterReferenceBinding(character.name, referenceImages);
    const outfitRef = findOutfitReferenceBinding(character.name, referenceImages);
    const identityLabel = identityRef ? referenceBindingIdFor(identityRef) : character.name;
    const outfitLabel = outfitRef ? referenceBindingIdFor(outfitRef) : null;
    const panels = expectedPanelNumbersForCharacter(page, character.name);
    const summary = characterRepairIssueSummary(character);
    const refInstruction = outfitLabel
      ? `Use ${identityLabel} for identity and ${outfitLabel} for wardrobe.`
      : `Use ${identityLabel} for identity.`;
    const targets = panels.length > 0 ? panels.map((panel) => `Panel ${panel}`) : ['Page'];

    for (const target of targets) {
      lines.push(`- ${target}: ${identityLabel} is incorrect; ${summary}. ${refInstruction}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '- No targeted character repair issue reported.';
}

export function buildGraphicNovelPageFreeLayoutSystemInstruction(params: {
  style: string;
  panelCount: number;
  ageGroup?: string;
  scenarioCardId?: string;
}): string {
  void params;
  return [
    "Children's illustration comic page.",
    'Use clear panel borders and gutters so the page reads as one finished comic page.',
    'No text. No speech bubbles.',
  ].join(' ');
}

export function buildGraphicNovelPageFreeLayoutInstructions(
  page: PlannedGraphicNovelPage,
  environmentsById: Map<string, StoryEnvironment> = new Map(),
  referenceImages: ReferenceImage[] = [],
  options: {
    style?: string;
    ageGroup?: string;
    scenarioCardId?: string;
  } = {}
): string {
  const outfits = outfitById(page);
  const characterContexts = collectCharacterReferenceContexts(page, referenceImages);
  const panelInstructions = page.panels
    .map((panel, index) =>
      buildPanelFreeLayoutBrief(
        panel,
        index,
        environmentsById,
        referenceImages,
        outfits,
        characterContexts
      )
    )
    .join('\n\n');
  const styleLine = options.style
    ? `ART STYLE:\n${getImageStylePrefix(options.style, options.ageGroup || '6-8', options.scenarioCardId)}\n\n`
    : '';

  return `${styleLine}Create a single comic page with exactly ${page.panels.length} panels.
Panel count is strict: draw exactly ${page.panels.length} physical panel boxes, no extra panels, no split panels.

REFERENCE IMAGES TO FOLLOW:
${buildReferenceBrief(referenceImages)}
${buildReferenceBindingRegistry(referenceImages)}

PANEL CONTENT:
${panelInstructions}`;
}

export function buildGraphicNovelPageRepairSystemInstruction(params: {
  style: string;
  slotCount: number;
  ageGroup?: string;
  scenarioCardId?: string;
}): string {
  void params;
  return [
    "Children's illustration page repair.",
    'Fix only the validator issues listed in the repair instructions.',
    'No text. No speech bubbles.',
  ].join(' ');
}

export function buildGraphicNovelPageValidationRepairInstructions(params: {
  page: PlannedGraphicNovelPage;
  validation: ImageValidationResult;
  score: number | null;
  environmentsById?: Map<string, StoryEnvironment>;
  referenceImages?: ReferenceImage[];
}): string {
  const referenceImages = params.referenceImages ?? [];
  const layoutLines = validationLayoutRepairLines(params.validation);
  const characterLines = validationCharacterRepairLines(
    params.page,
    params.validation,
    referenceImages
  );
  const layoutSection =
    layoutLines.length > 0 ? `\nPAGE / LAYOUT FEEDBACK:\n${layoutLines.join('\n')}\n` : '';

  return `Repair the failed art-only page using only the validator feedback below.

VALIDATION RESULT:
- score: ${params.score ?? 'n/a'}
${layoutSection}
CHARACTER FEEDBACK:
${characterLines}

Make the smallest edit that fixes these issues. Preserve the existing panel count, panel geometry, frames, gutters, and correct areas. Do not add speech bubbles, thought bubbles, captions, labels, or readable text.`;
}

export async function generateGraphicNovelPageFreeLayout(params: {
  imageDomain: ImageDomainService;
  page: PlannedGraphicNovelPage;
  style: string;
  ageGroup?: string;
  scenarioCardId?: string;
  environmentsById?: Map<string, StoryEnvironment>;
  referenceImages?: ReferenceImage[];
  onUsage?: Parameters<ImageDomainService['generateImageWithInstructions']>[0]['onUsage'];
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
  const referenceImages = params.referenceImages ?? [];
  const characterReferenceCount = referenceImages.filter(
    (ref) => ref.referenceKind === 'character'
  ).length;
  const objectReferenceCount = referenceImages.filter(
    (ref) => ref.referenceKind === 'object'
  ).length;
  const prompt = buildGraphicNovelPageFreeLayoutInstructions(
    params.page,
    params.environmentsById,
    referenceImages,
    {
      style: params.style,
      ageGroup: params.ageGroup,
      scenarioCardId: params.scenarioCardId,
    }
  );
  const aspectRatio = pageEditAspectRatio(params.page);
  const systemInstruction = buildGraphicNovelPageFreeLayoutSystemInstruction({
    style: params.style,
    panelCount: params.page.panels.length,
    ageGroup: params.ageGroup,
    scenarioCardId: params.scenarioCardId,
  });

  const generated = await params.imageDomain.generateImageWithInstructions({
    prompt,
    aspectRatio,
    referenceImages,
    personGeneration: 'allow_all',
    systemInstruction,
    onUsage: params.onUsage,
    operation: 'graphic_novel_page_free_layout_generate',
  });
  await params.onAttemptImage?.({
    attempt: 1,
    imageData: Buffer.from(generated.imageData),
    mimeType: generated.mimeType || 'image/png',
  });

  return {
    imageData: Buffer.from(generated.imageData),
    mimeType: generated.mimeType || 'image/png',
    generationParams: {
      mode: 'graphic_novel_page_free_layout_generate',
      requestedPanelCount: params.page.panels.length,
      layoutMode: 'free_layout',
      planningLayoutId: params.page.template.id,
      modelChoosesPanelLayout: true,
      textRenderingMode: 'html_overlay',
      providerInteractionId: generated.providerInteractionId,
      referenceCount: referenceImages.length,
      characterReferenceCount,
      objectReferenceCount,
      referenceImages: summarizeGraphicNovelReferenceImages(referenceImages),
      imageRequestManifest: {
        ...buildGraphicNovelImageRequestManifest({
          operation: 'graphic_novel_page_free_layout_generate',
          mode: 'generate',
          prompt,
          systemInstruction,
          aspectRatio,
          personGeneration: 'allow_all',
          referenceImages,
        }),
        providerInteractionId: generated.providerInteractionId ?? null,
      },
    },
  };
}
