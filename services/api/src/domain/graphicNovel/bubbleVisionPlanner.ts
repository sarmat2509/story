import config from '../../config';
import sharp from 'sharp';
import { measureGraphicNovelBubbleTextBox } from './bubbleTextSizing';
import { GRAPHIC_NOVEL_PAGE_SIZE, pageSizeForGraphicNovelPage } from './layoutPlanner';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { JsonSchema } from '../../providers/base/JsonSchema';
import { crossScriptIdentityKey, normalizeCharacterName } from '../../utils/characterNormalization';
import type {
  BubbleGeometry,
  GraphicNovelBubbleTextSizing,
  PlannedGraphicNovelPage,
  PlannedGraphicNovelPanel,
  Rect,
} from './types';

interface VisionPoint {
  x: number;
  y: number;
}

interface VisionEmptyZone extends Rect {
  confidence?: number;
  description?: string;
}

interface VisionOccupiedZone extends Rect {
  confidence?: number;
  label?: string;
  kind?: 'character' | 'face' | 'important_object' | 'main_action' | 'other';
  description?: string;
}

export interface GraphicNovelBubbleVisionCharacter {
  name: string;
  faceCenter?: VisionPoint;
  headCenter?: VisionPoint;
  mouthCenter?: VisionPoint;
  confidence?: number;
  notes?: string;
}

export interface GraphicNovelBubbleVisionPanel {
  panelIndex: number;
  panelId?: string;
  plannedPanelIndex?: number;
  plannedPanelId?: string;
  matchConfidence?: number;
  matchReason?: string;
  panelBounds?: Rect;
  detectedCharacters: GraphicNovelBubbleVisionCharacter[];
  occupiedZones?: VisionOccupiedZone[];
  emptyZones?: VisionEmptyZone[];
  notes?: string;
}

export interface GraphicNovelBubbleVisionAnalysis {
  panels: GraphicNovelBubbleVisionPanel[];
}

export interface GraphicNovelBubbleVisionLayoutResult {
  page: PlannedGraphicNovelPage;
  placementSummary: {
    panelCount: number;
    bubblesPlaced: number;
    bubblesWithVisionTargets: number;
    bubblesWithVisionEmptyZones: number;
    bubblesWithVisionOccupiedZones: number;
    panelsWithDetectedBounds: number;
    coordinateSpace: AnalysisCoordinateSpace;
    extraVisionPanelCount: number;
    hasExtraVisionPanelStructure: boolean;
  };
}

const MIN_EMPTY_ZONE_CONFIDENCE = 0.15;
const OVERLAP_EPSILON = 0.000001;
const IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX = 100;
const IDEAL_BUBBLE_DISTANCE_TOLERANCE_PX = 24;
const MAX_BUBBLE_DISTANCE_FROM_SPEAKER_PX = 150;
type PageSize = { width: number; height: number };

interface BubbleCandidate {
  rect: Rect;
  overflow: boolean;
  candidateKind: 'empty_zone' | 'empty_zone_expanded' | 'empty_direction' | 'target_ring' | 'near_target';
  sourceZone?: Rect;
}

interface ScoredBubbleCandidate extends BubbleCandidate {
  overlapWithPlaced: number;
  weightedAvoidOverlapRatio: number;
  distanceFromTargetPx?: number;
  score: number;
}

interface AvoidRect extends Rect {
  weight: number;
}

export type AnalysisCoordinateSpace = 'panel' | 'page';

export const GRAPHIC_NOVEL_BUBBLE_VISION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['panels'],
  properties: {
    panels: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['panelIndex', 'detectedCharacters', 'occupiedZones'],
        properties: {
          panelIndex: {
            type: 'integer',
            minimum: 1,
            description: '1-based panel number in reading order.',
          },
          panelId: {
            type: 'string',
            description: 'Optional planned panel id if visible in prompt context.',
          },
          plannedPanelIndex: {
            type: 'integer',
            nullable: true,
            minimum: 1,
            description: '1-based planned panel number that best matches this physical panel. Multiple physical panels may map to the same planned panel if the model split one planned beat.',
          },
          plannedPanelId: {
            type: 'string',
            nullable: true,
            description: 'Planned panel id that best matches this physical panel, when clear from the prompt context.',
          },
          matchConfidence: {
            type: 'number',
            nullable: true,
            minimum: 0,
            maximum: 1,
            description: 'Confidence that this physical panel matches plannedPanelIndex/plannedPanelId.',
          },
          matchReason: {
            type: 'string',
            nullable: true,
            description: 'Short reason for the planned panel match, based on expected characters and visual read.',
          },
          panelBounds: {
            type: 'object',
            nullable: true,
            description: 'Actual visible panel rectangle in page-relative 0..1 coordinates. Required when analyzing a full free-layout page.',
            required: ['x', 'y', 'width', 'height'],
            properties: {
              x: { type: 'number', minimum: 0, maximum: 1 },
              y: { type: 'number', minimum: 0, maximum: 1 },
              width: { type: 'number', minimum: 0, maximum: 1 },
              height: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
          detectedCharacters: {
            type: 'array',
            description: 'Visible named characters in this panel, with face/head/mouth points in 0..1 coordinates. Panel-crop analysis uses panel-relative coordinates; free-layout full-page analysis uses page-relative coordinates.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'confidence'],
              properties: {
                name: { type: 'string' },
                faceCenter: {
                  type: 'object',
                  nullable: true,
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number', minimum: 0, maximum: 1 },
                    y: { type: 'number', minimum: 0, maximum: 1 },
                  },
                },
                headCenter: {
                  type: 'object',
                  nullable: true,
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number', minimum: 0, maximum: 1 },
                    y: { type: 'number', minimum: 0, maximum: 1 },
                  },
                },
                mouthCenter: {
                  type: 'object',
                  nullable: true,
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number', minimum: 0, maximum: 1 },
                    y: { type: 'number', minimum: 0, maximum: 1 },
                  },
                },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                notes: { type: 'string' },
              },
            },
          },
          occupiedZones: {
            type: 'array',
            description: 'Actual visible occupied/no-cover zones: character bodies, faces, hands, important props, and main action. Panel-crop analysis uses panel-relative coordinates; free-layout full-page analysis uses page-relative coordinates.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'width', 'height', 'confidence'],
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1 },
                y: { type: 'number', minimum: 0, maximum: 1 },
                width: { type: 'number', minimum: 0, maximum: 1 },
                height: { type: 'number', minimum: 0, maximum: 1 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                label: { type: 'string' },
                kind: {
                  type: 'string',
                  enum: ['character', 'face', 'important_object', 'main_action', 'other'],
                },
                description: { type: 'string' },
              },
            },
          },
          emptyZones: {
            type: 'array',
            description: 'Optional actual visually empty/simple-background zones suitable for server-rendered rounded speech bubbles. Panel-crop analysis uses panel-relative coordinates; free-layout full-page analysis uses page-relative coordinates. Use [] if unsure.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'width', 'height', 'confidence'],
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1 },
                y: { type: 'number', minimum: 0, maximum: 1 },
                width: { type: 'number', minimum: 0, maximum: 1 },
                height: { type: 'number', minimum: 0, maximum: 1 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                description: { type: 'string' },
              },
            },
          },
          notes: { type: 'string' },
        },
      },
    },
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function rectRight(rect: Rect): number {
  return rect.x + rect.width;
}

function rectBottom(rect: Rect): number {
  return rect.y + rect.height;
}

function rectArea(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function rectCenter(rect: Rect): VisionPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y));
  return width * height;
}

function rectContainsPoint(rect: Rect, point: VisionPoint): boolean {
  return point.x >= rect.x && point.x <= rectRight(rect) && point.y >= rect.y && point.y <= rectBottom(rect);
}

function normalizeName(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-zа-яё0-9]+/giu, ' ')
    .trim();
}

function addNameKeys(keys: Set<string>, value: string | undefined): void {
  const raw = (value || '').trim();
  if (!raw) return;
  const normalized = normalizeName(raw);
  if (normalized) keys.add(normalized);
  const characterNormalized = normalizeCharacterName(raw);
  if (characterNormalized) keys.add(characterNormalized);
  const crossScript = crossScriptIdentityKey(raw);
  if (crossScript) keys.add(crossScript);
}

function keySetsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
}

function aliasKeysForName(
  value: string | undefined,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'> | undefined
): Set<string> {
  const keys = new Set<string>();
  addNameKeys(keys, value);
  if (!page?.characterAliases || keys.size === 0) return keys;

  for (const [canonicalName, aliases] of Object.entries(page.characterAliases)) {
    const characterKeys = new Set<string>();
    addNameKeys(characterKeys, canonicalName);
    for (const alias of aliases || []) {
      addNameKeys(characterKeys, alias);
    }
    if (!keySetsIntersect(keys, characterKeys)) continue;
    for (const key of characterKeys) {
      keys.add(key);
    }
  }

  return keys;
}

function characterNamesMatch(
  a: string | undefined,
  b: string | undefined,
  page?: Pick<PlannedGraphicNovelPage, 'characterAliases'>
): boolean {
  const aKeys = aliasKeysForName(a, page);
  const bKeys = aliasKeysForName(b, page);
  if (aKeys.size === 0 || bKeys.size === 0) return false;
  if (keySetsIntersect(aKeys, bKeys)) return true;

  const aNormalized = normalizeName(a);
  const bNormalized = normalizeName(b);
  return !!aNormalized && !!bNormalized && (
    aNormalized.includes(bNormalized) || bNormalized.includes(aNormalized)
  );
}

function characterAliasesForDisplay(
  name: string,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>
): string[] {
  if (!page.characterAliases) return [];
  const nameKeys = aliasKeysForName(name, page);
  const aliases: string[] = [];
  for (const [canonicalName, candidateAliases] of Object.entries(page.characterAliases)) {
    const candidateKeys = aliasKeysForName(canonicalName, page);
    if (!keySetsIntersect(nameKeys, candidateKeys)) continue;
    for (const alias of [canonicalName, ...(candidateAliases || [])]) {
      const trimmed = alias.trim();
      if (trimmed && !aliases.includes(trimmed) && trimmed !== name) {
        aliases.push(trimmed);
      }
    }
  }
  return aliases.slice(0, 8);
}

function panelCharacterNames(panel: PlannedGraphicNovelPanel): string[] {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  if (typeof composition === 'string') return panel.script.charactersPresent || [];
  return composition.characters.map((character) => character.name).filter(Boolean);
}

function panelPlannedCharacters(panel: PlannedGraphicNovelPanel): Array<{
  name?: string;
  position?: string;
  description?: string;
  anchor?: { x?: unknown; y?: unknown };
}> {
  const composition = panel.script.visual.sceneVisual.cameraComposition;
  if (typeof composition === 'string') return [];
  return composition.characters;
}

function plannedPanelBrief(
  page: PlannedGraphicNovelPage,
  options: { includeTemplateRects?: boolean } = {}
): string {
  const includeTemplateRects = options.includeTemplateRects !== false;
  return page.panels
    .map((panel, index) => {
      const rect = panel.templatePanel.rect;
      const characters = panelCharacterNames(panel)
        .map((name) => {
          const aliases = characterAliasesForDisplay(name, page);
          return aliases.length > 0 ? `${name} (aliases: ${aliases.join(', ')})` : name;
        })
        .join(', ') || 'none';
      const bubbles = panel.bubbles
        .map((bubble, bubbleIndex) =>
          `    Bubble ${bubbleIndex + 1}: kind=${bubble.kind}; speaker=${bubble.speaker || 'caption'}; text="${bubble.text}"`
        )
        .join('\n');

      return [
        includeTemplateRects
          ? `Panel ${index + 1} (${panel.script.panelId}): planned fallback rect page-normalized x=${rect.x.toFixed(4)}, y=${rect.y.toFixed(4)}, width=${rect.width.toFixed(4)}, height=${rect.height.toFixed(4)}`
          : `Panel ${index + 1} (${panel.script.panelId})`,
        `  Expected characters: ${characters}`,
        `  Visual read: ${panel.script.visual.primaryRead}`,
        `  Bubble texts to place later:`,
        bubbles || '    none',
      ].join('\n');
    })
    .join('\n\n');
}

function plannedSinglePanelBrief(page: PlannedGraphicNovelPage, panelIndex: number): string {
  const panel = page.panels[panelIndex];
  const characters = panelCharacterNames(panel)
    .map((name) => {
      const aliases = characterAliasesForDisplay(name, page);
      return aliases.length > 0 ? `${name} (aliases: ${aliases.join(', ')})` : name;
    })
    .join(', ') || 'none';
  const bubbles = panel.bubbles
    .map((bubble, bubbleIndex) =>
      `    Bubble ${bubbleIndex + 1}: kind=${bubble.kind}; speaker=${bubble.speaker || 'caption'}; text="${bubble.text}"`
    )
    .join('\n');

  return [
    `Panel ${panelIndex + 1} (${panel.script.panelId})`,
    `  Expected characters: ${characters}`,
    `  Visual read: ${panel.script.visual.primaryRead}`,
    `  Bubble texts to place later:`,
    bubbles || '    none',
  ].join('\n');
}

function buildBubbleVisionPrompt(
  page: PlannedGraphicNovelPage,
  options: { detectPanelBounds?: boolean } = {}
): string {
  const detectPanelBounds = options.detectPanelBounds === true;
  const panelBoundsInstructions = detectPanelBounds
    ? [
        '- The page may use a model-chosen free layout. Do not assume any old preset rectangles or planned panel count.',
        '- Return one item for every actual visible physical panel and set panelBounds: the visible panel rectangle in full-page coordinates from 0 to 1.',
        '- For each physical panel, set plannedPanelIndex and plannedPanelId to the planned panel it best represents.',
        '- If the artwork split one planned panel into two or more physical panels, return each physical panel separately and give all of them the same plannedPanelIndex/plannedPanelId.',
        '- Match physical panels to planned panels using expected characters, visual read, dialogue speakers, and visible action. Reading order is only a tie-breaker.',
        '- For free-layout full-page analysis, return ALL coordinates in full-page coordinates from 0 to 1: panelBounds, character face/head/mouth points, occupiedZones, and emptyZones.',
        '- Do not return panel-relative coordinates in this mode.',
      ].join('\n')
    : [
        '- For every panel, return panelBounds if the actual visible panel rectangle is clear.',
        '- If the artwork follows the planned fallback map, the planned rects below can guide panel identity, but pixels remain source of truth.',
      ].join('\n');

  return `Analyze this finished art-only graphic novel page for server-rendered bubble placement.

The image already has the panel artwork. It intentionally does NOT include speech bubbles or text.
Your job is to visually identify:
0. actual visible panel rectangles in reading order;
1. actual visible face/head/mouth points for the named characters in each panel;
2. actual occupied/no-cover zones: character bodies, faces, hands, important props, and the main action;
3. optional empty/simple-background zones if they are obvious.

Return coordinates from 0 to 1 as instructed below. Do not use planned bubble positions as truth; infer from the pixels in the image.

Rules:
- Analyze the visible physical panels in reading order.
${panelBoundsInstructions}
- If the image contains more physical panels than planned, still return every physical panel. Use plannedPanelIndex/plannedPanelId to show which planned beat each physical panel belongs to.
- For every visible speaking character, provide the best mouthCenter if visible; otherwise faceCenter; otherwise headCenter.
- If a mouth is not visible, estimate the point on the lower face/head where a tail should point.
- Report occupiedZones first. These are rectangles the deterministic layout algorithm should avoid covering.
- Use tight but complete occupiedZones around each visible character body, face/head, hands/gestures, important prop, and main action area.
- Prefer a few accurate occupiedZones over one huge rectangle that covers half the panel.
- Mark faces/heads as kind="face", full or partial bodies as kind="character", important story props as kind="important_object", and visible action centers as kind="main_action".
- If obvious empty zones exist, report them too as optional emptyZones: sky, wall, plain floor, soft background, or unimportant simple texture.
- Empty zones are secondary. Do not invent empty zones if the panel is visually busy.

Planned page context:
${plannedPanelBrief(page, { includeTemplateRects: !detectPanelBounds })}`;
}

function buildSinglePanelBubbleVisionPrompt(page: PlannedGraphicNovelPage, panelIndex: number): string {
  return `Analyze this single finished art-only graphic novel panel for server-rendered bubble placement.

The image is a crop of exactly one panel from page ${page.pageNumber}. It intentionally does NOT include speech bubbles or text.
Your job is to visually identify:
1. actual visible face/head/mouth points for the named characters in this panel;
2. actual occupied/no-cover zones: character bodies, faces, hands, important props, and the main action;
3. optional empty/simple-background zones if they are obvious.

Return panel-relative coordinates from 0 to 1 inside this crop. Do not use planned bubble positions as truth; infer from the pixels in the image.

Rules:
- Return exactly one item in panels[].
- Set panelIndex to ${panelIndex + 1}.
- For every visible speaking character, provide the best mouthCenter if visible; otherwise faceCenter; otherwise headCenter.
- If a mouth is not visible, estimate the point on the lower face/head where a tail should point.
- Report occupiedZones first. These are rectangles the deterministic layout algorithm should avoid covering.
- Use tight but complete occupiedZones around each visible character body, face/head, hands/gestures, important prop, and main action area.
- Prefer a few accurate occupiedZones over one huge rectangle that covers half the panel.
- Mark faces/heads as kind="face", full or partial bodies as kind="character", important story props as kind="important_object", and visible action centers as kind="main_action".
- If obvious empty zones exist, report them too as optional emptyZones: sky, wall, plain floor, soft background, or unimportant simple texture.
- Empty zones are secondary. Do not invent empty zones if the panel is visually busy.

Planned panel context:
${plannedSinglePanelBrief(page, panelIndex)}`;
}

function pagePoint(panelRelative: VisionPoint | undefined, panelRect: Rect): VisionPoint | undefined {
  if (!panelRelative) return undefined;
  return {
    x: panelRect.x + clamp01(panelRelative.x) * panelRect.width,
    y: panelRect.y + clamp01(panelRelative.y) * panelRect.height,
  };
}

function isVisionPoint(value: unknown): value is VisionPoint {
  const point = value as { x?: unknown; y?: unknown };
  return (
    typeof point?.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point?.y === 'number' &&
    Number.isFinite(point.y)
  );
}

function pageRect(panelRelative: Rect, panelRect: Rect): Rect {
  const x = clamp01(panelRelative.x);
  const y = clamp01(panelRelative.y);
  const width = clamp(panelRelative.width, 0, 1 - x);
  const height = clamp(panelRelative.height, 0, 1 - y);
  return {
    x: panelRect.x + x * panelRect.width,
    y: panelRect.y + y * panelRect.height,
    width: width * panelRect.width,
    height: height * panelRect.height,
  };
}

function pageRelativeRect(rect: Rect, panelRect: Rect): Rect | undefined {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const width = clamp(Number.isFinite(rect.width) ? rect.width : 0, 0, 1 - x);
  const height = clamp(Number.isFinite(rect.height) ? rect.height : 0, 0, 1 - y);
  const pageRectValue = { x, y, width, height };
  const area = Math.max(rectArea(pageRectValue), OVERLAP_EPSILON);
  const overlap = overlapArea(pageRectValue, panelRect);
  if (overlap / area < 0.2) return undefined;
  return clampRectToPanel(pageRectValue, panelRect);
}

function clampRectToPanel(rect: Rect, panelRect: Rect): Rect {
  const padding = Math.min(0.008, panelRect.width * 0.04, panelRect.height * 0.04);
  const width = Math.min(rect.width, panelRect.width - padding * 2);
  const height = Math.min(rect.height, panelRect.height - padding * 2);
  const minX = panelRect.x + padding;
  const minY = panelRect.y + padding;
  const maxX = panelRect.x + panelRect.width - padding - width;
  const maxY = panelRect.y + panelRect.height - padding - height;
  return {
    x: clamp(rect.x, minX, Math.max(minX, maxX)),
    y: clamp(rect.y, minY, Math.max(minY, maxY)),
    width,
    height,
  };
}

function analysisPointToPage(
  point: VisionPoint | undefined,
  panelRect: Rect,
  coordinateSpace: AnalysisCoordinateSpace
): VisionPoint | undefined {
  if (!point) return undefined;
  if (coordinateSpace === 'panel') return pagePoint(point, panelRect);
  const pagePointValue = {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };
  const margin = Math.min(0.025, panelRect.width * 0.08, panelRect.height * 0.08);
  if (
    pagePointValue.x < panelRect.x - margin ||
    pagePointValue.x > rectRight(panelRect) + margin ||
    pagePointValue.y < panelRect.y - margin ||
    pagePointValue.y > rectBottom(panelRect) + margin
  ) {
    return undefined;
  }
  return pagePointValue;
}

function analysisRectToPage(
  rect: Rect,
  panelRect: Rect,
  coordinateSpace: AnalysisCoordinateSpace
): Rect | undefined {
  return coordinateSpace === 'page'
    ? pageRelativeRect(rect, panelRect)
    : pageRect(rect, panelRect);
}

function distanceFromRectToPoint(rect: Rect, point: VisionPoint): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - rectRight(rect));
  const dy = Math.max(rect.y - point.y, 0, point.y - rectBottom(rect));
  return Math.hypot(dx, dy);
}

function distancePxFromRectToPoint(
  rect: Rect,
  point: VisionPoint,
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE
): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - rectRight(rect)) * pageSize.width;
  const dy = Math.max(rect.y - point.y, 0, point.y - rectBottom(rect)) * pageSize.height;
  return Math.hypot(dx, dy);
}

function pointPx(point: VisionPoint, pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE): VisionPoint {
  return {
    x: point.x * pageSize.width,
    y: point.y * pageSize.height,
  };
}

function rectFromPx(
  params: {
    centerX: number;
    centerY: number;
    widthPx: number;
    heightPx: number;
  },
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE
): Rect {
  return {
    x: (params.centerX - params.widthPx / 2) / pageSize.width,
    y: (params.centerY - params.heightPx / 2) / pageSize.height,
    width: params.widthPx / pageSize.width,
    height: params.heightPx / pageSize.height,
  };
}

function unitDirectionPx(
  from: VisionPoint,
  to: VisionPoint,
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE
): VisionPoint | undefined {
  const fromPx = pointPx(from, pageSize);
  const toPx = pointPx(to, pageSize);
  const dx = toPx.x - fromPx.x;
  const dy = toPx.y - fromPx.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return undefined;
  return {
    x: dx / length,
    y: dy / length,
  };
}

function dotDirection(a: VisionPoint | undefined, b: VisionPoint | undefined): number {
  if (!a || !b) return 0;
  return a.x * b.x + a.y * b.y;
}

function findPanelAnalysis(
  analysis: GraphicNovelBubbleVisionAnalysis,
  panel: PlannedGraphicNovelPanel,
  panelIndex: number
): GraphicNovelBubbleVisionPanel | undefined {
  return analysis.panels.find((candidate) =>
    candidate.plannedPanelIndex === panelIndex + 1 ||
    candidate.plannedPanelId === panel.script.panelId ||
    candidate.panelIndex === panelIndex + 1 ||
    candidate.panelId === panel.script.panelId
  );
}

function panelAnalysisKey(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  fallbackPanelIndex: number
): string {
  if (!panelAnalysis) return `planned:${fallbackPanelIndex + 1}`;
  return panelAnalysis.panelId
    ? `vision-id:${panelAnalysis.panelId}`
    : `vision-index:${panelAnalysis.panelIndex}`;
}

function plannedCharacterOverlapScore(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  panel: PlannedGraphicNovelPanel,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>
): number {
  if (!panelAnalysis?.detectedCharacters?.length) return 0;
  const plannedNames = panelCharacterNames(panel);
  if (plannedNames.length === 0) return 0;
  let score = 0;
  for (const detected of panelAnalysis.detectedCharacters) {
    if (plannedNames.some((plannedName) => characterNamesMatch(detected.name, plannedName, page))) {
      score += 18 * clamp(detected.confidence ?? 0.7, 0.2, 1);
    }
  }
  return score;
}

function panelAnalysisSpeakerTarget(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  speaker: string | undefined,
  plannedPanel: PlannedGraphicNovelPanel,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>
): VisionPoint | undefined {
  if (!speaker || !panelAnalysis?.detectedCharacters?.length) return undefined;
  const character = panelAnalysis.detectedCharacters.find((candidate) =>
    characterNamesMatch(candidate.name, speaker, page)
  );
  const target = character?.mouthCenter ?? character?.faceCenter ?? character?.headCenter;
  if (!target) return undefined;
  const panelRect = sanitizePanelBounds(panelAnalysis.panelBounds, plannedPanel.templatePanel.rect);
  return analysisPointToPage(target, panelRect, 'page');
}

function scorePanelAnalysisForBubble(params: {
  panelAnalysis: GraphicNovelBubbleVisionPanel;
  plannedPanel: PlannedGraphicNovelPanel;
  plannedPanelIndex: number;
  bubble: BubbleGeometry;
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>;
  coordinateSpace: AnalysisCoordinateSpace;
}): number {
  const {
    panelAnalysis,
    plannedPanel,
    plannedPanelIndex,
    bubble,
    page,
    coordinateSpace,
  } = params;
  let score = 0;
  if (panelAnalysis.plannedPanelIndex === plannedPanelIndex + 1) score += 95;
  if (panelAnalysis.plannedPanelId && panelAnalysis.plannedPanelId === plannedPanel.script.panelId) {
    score += 95;
  }
  if (panelAnalysis.panelIndex === plannedPanelIndex + 1) score += 12;
  if (panelAnalysis.panelId === plannedPanel.script.panelId) score += 18;
  score += plannedCharacterOverlapScore(panelAnalysis, plannedPanel, page);
  if (panelAnalysis.matchConfidence != null) {
    score += clamp(panelAnalysis.matchConfidence, 0, 1) * 18;
  }
  if (bubble.kind !== 'caption' && bubble.speaker) {
    const hasUsableSpeakerTarget = coordinateSpace === 'page'
      ? !!panelAnalysisSpeakerTarget(panelAnalysis, bubble.speaker, plannedPanel, page)
      : panelAnalysis.detectedCharacters.some((character) =>
          characterNamesMatch(character.name, bubble.speaker, page)
        );
    score += hasUsableSpeakerTarget ? 140 : -45;
  }
  score -= Math.abs(panelAnalysis.panelIndex - (plannedPanelIndex + 1)) * 2;
  return score;
}

function findPanelAnalysisForBubble(
  analysis: GraphicNovelBubbleVisionAnalysis,
  plannedPanel: PlannedGraphicNovelPanel,
  plannedPanelIndex: number,
  bubble: BubbleGeometry,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>,
  coordinateSpace: AnalysisCoordinateSpace
): GraphicNovelBubbleVisionPanel | undefined {
  if (analysis.panels.length === 0) return undefined;
  const scored = analysis.panels
    .map((panelAnalysis) => ({
      panelAnalysis,
      score: scorePanelAnalysisForBubble({
        panelAnalysis,
        plannedPanel,
        plannedPanelIndex,
        bubble,
        page,
        coordinateSpace,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score > 0) return best.panelAnalysis;
  return findPanelAnalysis(analysis, plannedPanel, plannedPanelIndex);
}

function sanitizePanelBounds(bounds: Rect | undefined, fallback: Rect): Rect {
  if (!bounds) return fallback;
  const x = clamp01(bounds.x);
  const y = clamp01(bounds.y);
  const width = clamp(Number.isFinite(bounds.width) ? bounds.width : 0, 0, 1 - x);
  const height = clamp(Number.isFinite(bounds.height) ? bounds.height : 0, 0, 1 - y);
  if (width < 0.08 || height < 0.08) return fallback;
  return { x, y, width, height };
}

function sanitizeDetectedPanelBounds(bounds: Rect | undefined): Rect | undefined {
  if (!bounds) return undefined;
  const x = clamp01(bounds.x);
  const y = clamp01(bounds.y);
  const width = clamp(Number.isFinite(bounds.width) ? bounds.width : 0, 0, 1 - x);
  const height = clamp(Number.isFinite(bounds.height) ? bounds.height : 0, 0, 1 - y);
  if (width < 0.08 || height < 0.08) return undefined;
  return { x, y, width, height };
}

function horizontalOverlap(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x));
}

function normalizedDetectedPanelBounds(
  analysis: GraphicNovelBubbleVisionAnalysis
): Map<GraphicNovelBubbleVisionPanel, Rect> {
  const entries = analysis.panels
    .map((panelAnalysis) => {
      const rect = sanitizeDetectedPanelBounds(panelAnalysis.panelBounds);
      return rect ? { panelAnalysis, rect } : null;
    })
    .filter((entry): entry is { panelAnalysis: GraphicNovelBubbleVisionPanel; rect: Rect } => !!entry);
  const normalized = new Map<GraphicNovelBubbleVisionPanel, Rect>();

  for (const entry of entries) {
    const rect = { ...entry.rect };
    for (const other of entries) {
      if (other === entry) continue;
      const overlapX = horizontalOverlap(rect, other.rect);
      const sameColumnRatio = overlapX / Math.max(Math.min(rect.width, other.rect.width), OVERLAP_EPSILON);
      const otherStartsLowerInside =
        other.rect.y > rect.y + rect.height * 0.25 &&
        other.rect.y < rectBottom(rect) - 0.04;
      const otherMostlyInsideBottom = rectBottom(other.rect) <= rectBottom(rect) + 0.018;
      const otherIsLaterPanel = other.panelAnalysis.panelIndex > entry.panelAnalysis.panelIndex;
      if (
        sameColumnRatio >= 0.7 &&
        otherIsLaterPanel &&
        otherStartsLowerInside &&
        otherMostlyInsideBottom
      ) {
        const gap = Math.min(0.012, rect.height * 0.04, other.rect.height * 0.04);
        const trimmedHeight = other.rect.y - gap - rect.y;
        if (trimmedHeight >= 0.08) {
          rect.height = Math.min(rect.height, trimmedHeight);
        }
      }
    }
    normalized.set(entry.panelAnalysis, rect);
  }

  return normalized;
}

function resolvedPanelForPlacement(
  panel: PlannedGraphicNovelPanel,
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  useDetectedPanelBounds: boolean,
  detectedPanelBounds?: Rect
): { panel: PlannedGraphicNovelPanel; panelBoundsUsed: boolean } {
  if (!useDetectedPanelBounds) {
    return { panel, panelBoundsUsed: false };
  }
  const rect = detectedPanelBounds ?? sanitizePanelBounds(panelAnalysis?.panelBounds, panel.templatePanel.rect);
  const panelBoundsUsed =
    rect.x !== panel.templatePanel.rect.x ||
    rect.y !== panel.templatePanel.rect.y ||
    rect.width !== panel.templatePanel.rect.width ||
    rect.height !== panel.templatePanel.rect.height;

  if (!panelBoundsUsed) {
    return { panel, panelBoundsUsed: false };
  }

  return {
    panel: {
      ...panel,
      templatePanel: {
        ...panel.templatePanel,
        rect,
      },
    },
    panelBoundsUsed: true,
  };
}

function findCharacterTarget(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  bubble: BubbleGeometry,
  panel: PlannedGraphicNovelPanel,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>,
  coordinateSpace: AnalysisCoordinateSpace
): { point?: VisionPoint; hasVisionTarget: boolean } {
  if (!panelAnalysis || bubble.kind === 'caption') {
    return { hasVisionTarget: false };
  }

  let character = panelAnalysis.detectedCharacters.find((candidate) =>
    characterNamesMatch(candidate.name, bubble.speaker, page)
  );

  if (!character && panelAnalysis.detectedCharacters.length === 1) {
    character = panelAnalysis.detectedCharacters[0];
  }

  const target = character?.mouthCenter ?? character?.faceCenter ?? character?.headCenter;
  const pageTarget = analysisPointToPage(target, panel.templatePanel.rect, coordinateSpace);
  if (pageTarget) {
    return {
      point: pageTarget,
      hasVisionTarget: true,
    };
  }

  return { hasVisionTarget: false };
}

function findPlannedCharacter(
  panel: PlannedGraphicNovelPanel,
  detectedName: string | undefined,
  page?: Pick<PlannedGraphicNovelPage, 'characterAliases'>
): ReturnType<typeof panelPlannedCharacters>[number] | undefined {
  if (!detectedName?.trim()) return undefined;

  return panelPlannedCharacters(panel).find((candidate) =>
    characterNamesMatch(candidate.name, detectedName, page)
  );
}

function emptyZonesForPanel(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  panelRect: Rect,
  coordinateSpace: AnalysisCoordinateSpace
): Rect[] {
  const zones = (panelAnalysis?.emptyZones || [])
    .filter((zone) => (zone.confidence ?? 0) >= MIN_EMPTY_ZONE_CONFIDENCE)
    .map((zone) => analysisRectToPage(zone, panelRect, coordinateSpace))
    .filter((zone): zone is Rect => !!zone)
    .filter((zone) => zone.width > 0.02 && zone.height > 0.02);

  if (zones.length > 0) {
    return zones;
  }

  return [{
    x: panelRect.x + panelRect.width * 0.08,
    y: panelRect.y + panelRect.height * 0.08,
    width: panelRect.width * 0.84,
    height: panelRect.height * 0.84,
  }];
}

function fullPanelZone(panelRect: Rect): Rect {
  return {
    x: panelRect.x + panelRect.width * 0.04,
    y: panelRect.y + panelRect.height * 0.04,
    width: panelRect.width * 0.92,
    height: panelRect.height * 0.92,
  };
}

function occupiedZoneWeight(zone: VisionOccupiedZone): number {
  const confidence = clamp(zone.confidence ?? 0.7, 0.2, 1);
  const kind = zone.kind || 'other';
  const baseWeight = kind === 'face'
    ? 1.45
    : kind === 'character'
      ? 1.05
      : kind === 'main_action'
        ? 0.95
        : kind === 'important_object'
          ? 0.75
          : 0.55;
  return baseWeight * confidence;
}

function speakerOwnZoneWeight(
  zone: VisionOccupiedZone,
  bubble: BubbleGeometry | undefined,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>,
  relaxOwnSpeakerBody: boolean
): number {
  const baseWeight = occupiedZoneWeight(zone);
  if (
    !relaxOwnSpeakerBody ||
    !bubble?.speaker ||
    !zoneMatchesSpeaker(zone, bubble.speaker, page)
  ) {
    return baseWeight;
  }

  const kind = zone.kind || 'other';
  if (kind === 'face') return Math.max(baseWeight, 1.35);
  if (kind === 'character') return baseWeight * 0.22;
  return baseWeight * 0.45;
}

function zoneMatchesSpeaker(
  zone: VisionOccupiedZone,
  speaker: string,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>
): boolean {
  if (zone.label && characterNamesMatch(zone.label, speaker, page)) return true;

  const description = normalizeName(zone.description);
  if (!description) return false;
  const descriptionText = ` ${description} `;
  for (const key of aliasKeysForName(speaker, page)) {
    if (key.length >= 3 && descriptionText.includes(` ${key} `)) return true;
  }
  return false;
}

function occupiedAvoidRectsForPanel(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  panelRect: Rect,
  coordinateSpace: AnalysisCoordinateSpace,
  bubble: BubbleGeometry | undefined,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>,
  relaxOwnSpeakerBody: boolean
): AvoidRect[] {
  return (panelAnalysis?.occupiedZones || [])
    .filter((zone) => (zone.confidence ?? 0) >= MIN_EMPTY_ZONE_CONFIDENCE)
    .map((zone) => {
      const rect = analysisRectToPage(zone, panelRect, coordinateSpace);
      return rect
        ? {
            ...rect,
            weight: speakerOwnZoneWeight(zone, bubble, page, relaxOwnSpeakerBody),
          }
        : null;
    })
    .filter((zone): zone is AvoidRect => !!zone)
    .filter((zone) => zone.width > 0.015 && zone.height > 0.015);
}

function countExtraVisionPanels(
  page: PlannedGraphicNovelPage,
  analysis: GraphicNovelBubbleVisionAnalysis
): number {
  const seen = new Set<number>();
  for (const panel of analysis.panels) {
    seen.add(panel.panelIndex);
  }

  return [...seen].filter((panelIndex) =>
    panelIndex < 1 || panelIndex > page.panels.length
  ).length;
}

function characterAvoidRects(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  panel: PlannedGraphicNovelPanel,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>,
  coordinateSpace: AnalysisCoordinateSpace,
  bubble?: BubbleGeometry
): AvoidRect[] {
  const panelRect = panel.templatePanel.rect;
  const relaxOwnSpeakerBody =
    !!bubble?.speaker &&
    (panelAnalysis?.detectedCharacters?.length ?? 0) > 1;
  const occupiedAvoidRects = occupiedAvoidRectsForPanel(
    panelAnalysis,
    panelRect,
    coordinateSpace,
    bubble,
    page,
    relaxOwnSpeakerBody
  );
  const characterRects = (panelAnalysis?.detectedCharacters || []).flatMap((character) => {
    const isBubbleSpeaker = !!bubble?.speaker && characterNamesMatch(character.name, bubble.speaker, page);
    const points = [character.mouthCenter, character.faceCenter, character.headCenter]
      .map((point) => analysisPointToPage(point, panelRect, coordinateSpace))
      .filter((point): point is VisionPoint => !!point);
    const pointRects = points.map((point) => ({
      ...clampRectToPanel({
        x: point.x - panelRect.width * 0.08,
        y: point.y - panelRect.height * 0.09,
        width: panelRect.width * 0.16,
        height: panelRect.height * 0.18,
      }, panelRect),
      weight: isBubbleSpeaker ? 1.2 : 1,
    }));

    const plannedCharacter = findPlannedCharacter(panel, character.name, page);
    const plannedAnchor = isVisionPoint(plannedCharacter?.anchor)
      ? pagePoint(plannedCharacter.anchor, panelRect)
      : undefined;
    const visualPoints = [
      character.headCenter,
      character.faceCenter,
      character.mouthCenter,
    ].map((point) => analysisPointToPage(point, panelRect, coordinateSpace)).filter((point): point is VisionPoint => !!point);

    const headPoint = analysisPointToPage(
      character.headCenter ?? character.faceCenter ?? character.mouthCenter,
      panelRect,
      coordinateSpace
    );
    if (!headPoint && !plannedAnchor) {
      return pointRects;
    }

    const anchor = plannedAnchor ?? {
      x: headPoint?.x ?? panelRect.x + panelRect.width * 0.5,
      y: Math.min(
        panelRect.y + panelRect.height * 0.9,
        (headPoint?.y ?? panelRect.y + panelRect.height * 0.42) + panelRect.height * 0.34
      ),
    };
    const allPoints = [...visualPoints, anchor];
    const minX = Math.min(...allPoints.map((point) => point.x));
    const maxX = Math.max(...allPoints.map((point) => point.x));
    const minY = Math.min(...allPoints.map((point) => point.y));
    const maxY = Math.max(...allPoints.map((point) => point.y));
    const plannedText = `${plannedCharacter?.position || ''} ${plannedCharacter?.description || ''}`.toLowerCase();
    const closeOrForeground = /\bclose\b|\bforeground\b|foreground_/.test(plannedText);
    const flyingOrUpper = /\bflying\b|\bhovering\b|\bupper\b|upper_/.test(plannedText);
    const baseWidth = panelRect.width * (flyingOrUpper ? 0.18 : closeOrForeground ? 0.3 : 0.3);
    const sidePadding = baseWidth / 2;
    const topPadding = panelRect.height * (flyingOrUpper ? 0.06 : 0.08);
    const bottomPadding = panelRect.height * (flyingOrUpper ? 0.13 : closeOrForeground ? 0.24 : 0.2);
    const bodyRect = {
      ...clampRectToPanel({
        x: minX - sidePadding,
        y: minY - topPadding,
        width: Math.max(baseWidth, maxX - minX + sidePadding * 2),
        height: Math.max(panelRect.height * 0.18, maxY - minY + topPadding + bottomPadding),
      }, panelRect),
      weight: (closeOrForeground ? 0.55 : flyingOrUpper ? 0.4 : 0.35) *
        (occupiedAvoidRects.length > 0 ? 0.65 : 1) *
        (isBubbleSpeaker && relaxOwnSpeakerBody ? 0.28 : 1),
    };

    return [...pointRects, bodyRect];
  });

  return [...occupiedAvoidRects, ...characterRects];
}

function candidateNearTarget(
  target: VisionPoint,
  bubble: BubbleGeometry,
  panelRect: Rect,
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE,
  textSizing?: GraphicNovelBubbleTextSizing
): BubbleCandidate[] {
  const gapX = Math.min(
    IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX / pageSize.width,
    panelRect.width * 0.18
  );
  const gapY = Math.min(
    IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX / pageSize.height,
    panelRect.height * 0.18
  );
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    textSizing,
  });
  const width = measured.width;
  const height = measured.height;
  return [
    { x: target.x - width / 2, y: target.y - height - gapY, width, height },
    { x: target.x - width / 2, y: target.y + gapY, width, height },
    { x: target.x - width - gapX, y: target.y - height / 2, width, height },
    { x: target.x + gapX, y: target.y - height / 2, width, height },
    { x: target.x - width - gapX, y: target.y - height - gapY, width, height },
    { x: target.x + gapX, y: target.y - height - gapY, width, height },
    { x: target.x - width - gapX, y: target.y + gapY, width, height },
    { x: target.x + gapX, y: target.y + gapY, width, height },
  ].map((rect) => ({
    rect: clampRectToPanel(rect, panelRect),
    overflow: measured.overflow,
    candidateKind: 'near_target' as const,
  }));
}

function candidateTargetRingAtSpeakerDistance(
  target: VisionPoint,
  bubble: BubbleGeometry,
  panelRect: Rect,
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE,
  textSizing?: GraphicNovelBubbleTextSizing
): BubbleCandidate[] {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    textSizing,
  });
  const widthPx = measured.width * pageSize.width;
  const heightPx = measured.height * pageSize.height;
  const targetPx = pointPx(target, pageSize);
  const angles = [
    -160, -135, -110, -90, -65, -40, -18,
    0,
    18, 40, 65, 90, 110, 135, 160, 180,
  ];
  const distanceOffsets = [-18, 0, 18, 36];

  return uniqueCandidates(angles.flatMap((angleDeg) => {
    const angle = angleDeg * Math.PI / 180;
    const direction = {
      x: Math.cos(angle),
      y: Math.sin(angle),
    };
    const supportPx = Math.abs(direction.x) * widthPx / 2 + Math.abs(direction.y) * heightPx / 2;
    const centerDistancePx = IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX + supportPx;

    return distanceOffsets.map((distanceOffsetPx) => ({
      rect: clampRectToPanel(
        rectFromPx({
          centerX: targetPx.x + direction.x * (centerDistancePx + distanceOffsetPx),
          centerY: targetPx.y + direction.y * (centerDistancePx + distanceOffsetPx),
          widthPx,
          heightPx,
        }, pageSize),
        panelRect
      ),
      overflow: measured.overflow,
      candidateKind: 'target_ring' as const,
    }));
  }));
}

function candidateInsideZone(
  zone: Rect,
  bubble: BubbleGeometry,
  panelRect: Rect,
  target?: VisionPoint,
  textSizing?: GraphicNovelBubbleTextSizing
): BubbleCandidate {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    zoneRect: zone,
    textSizing,
  });
  const width = measured.width;
  const height = measured.height;
  const preferred = target ?? rectCenter(zone);
  const minX = zone.x;
  const minY = zone.y;
  const maxX = rectRight(zone) - width;
  const maxY = rectBottom(zone) - height;
  return {
    rect: clampRectToPanel({
      x: clamp(preferred.x - width / 2, minX, Math.max(minX, maxX)),
      y: clamp(preferred.y - height / 2, minY, Math.max(minY, maxY)),
      width,
      height,
    }, panelRect),
    overflow: measured.overflow,
    candidateKind: 'empty_zone' as const,
    sourceZone: zone,
  };
}

function candidateAroundZone(
  zone: Rect,
  bubble: BubbleGeometry,
  panelRect: Rect,
  target?: VisionPoint,
  textSizing?: GraphicNovelBubbleTextSizing
): BubbleCandidate[] {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    textSizing,
  });
  const width = measured.width;
  const height = measured.height;
  const zoneCenter = rectCenter(zone);
  const targetBiasedCenter = target
    ? {
        x: zoneCenter.x * 0.72 + target.x * 0.28,
        y: zoneCenter.y * 0.72 + target.y * 0.28,
      }
    : zoneCenter;
  const maxX = rectRight(panelRect) - width;
  const maxY = rectBottom(panelRect) - height;
  const xs = [
    zoneCenter.x - width / 2,
    targetBiasedCenter.x - width / 2,
    zone.x,
    rectRight(zone) - width,
  ];
  const ys = [
    zoneCenter.y - height / 2,
    targetBiasedCenter.y - height / 2,
    zone.y,
    rectBottom(zone) - height,
  ];

  return uniqueCandidates(xs.flatMap((x) => ys.map((y) => ({
    rect: clampRectToPanel({
      x: clamp(x, panelRect.x, Math.max(panelRect.x, maxX)),
      y: clamp(y, panelRect.y, Math.max(panelRect.y, maxY)),
      width,
      height,
    }, panelRect),
    overflow: measured.overflow,
    candidateKind: 'empty_zone_expanded' as const,
    sourceZone: zone,
  }))));
}

function candidateTowardEmptyZoneAtSpeakerDistance(
  zone: Rect,
  bubble: BubbleGeometry,
  panelRect: Rect,
  target?: VisionPoint,
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE,
  textSizing?: GraphicNovelBubbleTextSizing
): BubbleCandidate[] {
  if (!target) return [];

  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    textSizing,
  });
  const widthPx = measured.width * pageSize.width;
  const heightPx = measured.height * pageSize.height;
  const direction = unitDirectionPx(target, rectCenter(zone), pageSize);
  if (!direction) return [];

  const targetPx = pointPx(target, pageSize);
  const supportPx = Math.abs(direction.x) * widthPx / 2 + Math.abs(direction.y) * heightPx / 2;
  const centerDistancePx = IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX + supportPx;
  const baseCenter = {
    x: targetPx.x + direction.x * centerDistancePx,
    y: targetPx.y + direction.y * centerDistancePx,
  };
  const perpendicular = { x: -direction.y, y: direction.x };
  const perpendicularOffsets = [0, -24, 24, -48, 48, -72, 72, -104, 104, -136, 136];
  const distanceOffsets = [0, -12, 12];

  return uniqueCandidates(distanceOffsets.flatMap((distanceOffsetPx) =>
    perpendicularOffsets.map((perpendicularOffsetPx) => ({
      rect: clampRectToPanel(
        rectFromPx({
          centerX: baseCenter.x + direction.x * distanceOffsetPx + perpendicular.x * perpendicularOffsetPx,
          centerY: baseCenter.y + direction.y * distanceOffsetPx + perpendicular.y * perpendicularOffsetPx,
          widthPx,
          heightPx,
        }, pageSize),
        panelRect
      ),
      overflow: measured.overflow,
      candidateKind: 'empty_direction' as const,
      sourceZone: zone,
    }))
  ));
}

function uniqueCandidates(rects: BubbleCandidate[]): BubbleCandidate[] {
  const seen = new Set<string>();
  return rects.filter((candidate) => {
    const key = [candidate.rect.x, candidate.rect.y, candidate.rect.width, candidate.rect.height]
      .map((value) => value.toFixed(4))
      .join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateRectsInsideZone(
  zone: Rect,
  bubble: BubbleGeometry,
  panelRect: Rect,
  target?: VisionPoint,
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE,
  textSizing?: GraphicNovelBubbleTextSizing
): BubbleCandidate[] {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    zoneRect: zone,
    textSizing,
  });
  const width = measured.width;
  const height = measured.height;
  const maxX = rectRight(zone) - width;
  const maxY = rectBottom(zone) - height;
  const xs = [
    zone.x,
    zone.x + (zone.width - width) / 2,
    maxX,
    target ? target.x - width / 2 : undefined,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const ys = [
    zone.y,
    zone.y + (zone.height - height) / 2,
    maxY,
    target ? target.y - height / 2 : undefined,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return uniqueCandidates([
    candidateInsideZone(zone, bubble, panelRect, target, textSizing),
    ...candidateTowardEmptyZoneAtSpeakerDistance(
      zone,
      bubble,
      panelRect,
      target,
      pageSize,
      textSizing
    ),
    ...candidateAroundZone(zone, bubble, panelRect, target, textSizing),
    ...xs.flatMap((x) => ys.map((y) =>
      ({
        rect: clampRectToPanel({
          x: clamp(x, zone.x, Math.max(zone.x, maxX)),
          y: clamp(y, zone.y, Math.max(zone.y, maxY)),
          width,
          height,
        }, panelRect),
        overflow: measured.overflow,
        candidateKind: 'empty_zone' as const,
        sourceZone: zone,
      })
    )),
  ]);
}

function scoreCandidate(params: {
  rect: Rect;
  bubble: BubbleGeometry;
  panelRect: Rect;
  target?: VisionPoint;
  placed: BubbleGeometry[];
  emptyZones: Rect[];
  avoidRects: AvoidRect[];
  candidateKind: 'empty_zone' | 'empty_zone_expanded' | 'empty_direction' | 'target_ring' | 'near_target';
  overflow: boolean;
  sourceZone?: Rect;
  pageSize?: PageSize;
  preferSpeakerDistanceLimit?: boolean;
}): number {
  const {
    rect,
    bubble,
    panelRect,
    target,
    placed,
    emptyZones,
    avoidRects,
    candidateKind,
    overflow,
    sourceZone,
    pageSize = GRAPHIC_NOVEL_PAGE_SIZE,
    preferSpeakerDistanceLimit = false,
  } = params;
  const bubbleArea = Math.max(rectArea(rect), OVERLAP_EPSILON);
  const panelDiagonal = Math.max(Math.hypot(panelRect.width, panelRect.height), OVERLAP_EPSILON);
  let score = candidateKind === 'empty_zone'
    ? -18
    : candidateKind === 'empty_direction'
      ? -310
      : candidateKind === 'target_ring'
        ? -260
        : candidateKind === 'empty_zone_expanded'
          ? -8
          : 35;

  for (const placedBubble of placed) {
    const overlap = overlapArea(rect, placedBubble.rect);
    if (overlap > OVERLAP_EPSILON) {
      score += 1800 + (overlap / bubbleArea) * 12000;
    }
  }

  for (const avoidRect of avoidRects) {
    const overlap = overlapArea(rect, avoidRect);
    if (overlap > OVERLAP_EPSILON) {
      score += (2500 + (overlap / bubbleArea) * 40000) * avoidRect.weight;
    }
  }

  const emptyOverlap = emptyZones.reduce((sum, zone) => sum + overlapArea(rect, zone), 0);
  if (candidateKind === 'empty_direction' || candidateKind === 'target_ring') {
    score -= Math.min(1, emptyOverlap / bubbleArea) * 55;
  } else {
    score -= Math.min(1, emptyOverlap / bubbleArea) * 95;
    if (emptyOverlap < bubbleArea * 0.5) {
      score += candidateKind === 'empty_zone_expanded' ? 45 : 90;
    }
  }
  if (overflow) {
    score += 10000;
  }

  if (target) {
    const directionZones = emptyZones.filter((zone) => {
      const zoneCenter = rectCenter(zone);
      return zoneCenter.y <= target.y + panelRect.height * 0.08;
    });
    if (directionZones.length > 0) {
      const bubbleDirection = unitDirectionPx(target, rectCenter(rect), pageSize);
      if (bubbleDirection) {
        const bestAlignment = Math.max(...directionZones.map((zone) => {
          const zoneDirection = unitDirectionPx(target, rectCenter(zone), pageSize);
          return dotDirection(zoneDirection, bubbleDirection);
        }));
        score -= Math.max(0, bestAlignment) * 140;
        if (bestAlignment < 0.2) {
          score += (0.2 - bestAlignment) * 520;
        }
      }
    }

    if (candidateKind === 'empty_direction' && sourceZone) {
      const zoneDirection = unitDirectionPx(target, rectCenter(sourceZone), pageSize);
      const bubbleDirection = unitDirectionPx(target, rectCenter(rect), pageSize);
      const alignment = dotDirection(zoneDirection, bubbleDirection);
      score -= Math.max(0, alignment) * 180;
      if (alignment < 0.72) {
        score += (0.72 - alignment) * 600;
      }

      const zoneCenter = rectCenter(sourceZone);
      if (zoneCenter.y <= target.y + panelRect.height * 0.08) {
        score -= 220;
      } else if (zoneCenter.y > target.y + panelRect.height * 0.18) {
        score += 360;
      } else {
        score += 90;
      }
    }

    const distancePx = distancePxFromRectToPoint(rect, target, pageSize);
    score += (distanceFromRectToPoint(rect, target) / panelDiagonal) * 90;
    const distanceDeltaPx = Math.abs(distancePx - IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX);
    if (distanceDeltaPx <= IDEAL_BUBBLE_DISTANCE_TOLERANCE_PX) {
      score -= candidateKind === 'empty_direction'
        ? 380
        : candidateKind === 'target_ring'
          ? 340
          : 150;
    } else {
      const excessPx = distanceDeltaPx - IDEAL_BUBBLE_DISTANCE_TOLERANCE_PX;
      score += excessPx * (distancePx < IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX ? 12 : 9);
      if (preferSpeakerDistanceLimit && distancePx > MAX_BUBBLE_DISTANCE_FROM_SPEAKER_PX) {
        score += 4800 + (distancePx - MAX_BUBBLE_DISTANCE_FROM_SPEAKER_PX) * 44;
      }
      if (distancePx > IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX * 1.8) {
        score += (distancePx - IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX * 1.8) * 12;
      }
    }
    if (rectContainsPoint(rect, target)) {
      score += 600;
    }
    const center = rectCenter(rect);
    if (panelRect.width >= 0.7) {
      const panelCenterX = panelRect.x + panelRect.width / 2;
      const sideMargin = panelRect.width * 0.08;
      const speakerClearlyLeft = target.x < panelCenterX - sideMargin;
      const speakerClearlyRight = target.x > panelCenterX + sideMargin;
      const bubbleClearlyRight = center.x > panelCenterX + sideMargin;
      const bubbleClearlyLeft = center.x < panelCenterX - sideMargin;
      if ((speakerClearlyLeft && bubbleClearlyRight) || (speakerClearlyRight && bubbleClearlyLeft)) {
        score += 760 + Math.abs(center.x - target.x) * pageSize.width * 1.1;
      }
      if (preferSpeakerDistanceLimit && speakerClearlyRight && rect.y > target.y + panelRect.height * 0.03) {
        score += 980;
      }
    }
    const coversTargetColumn = target.x >= rect.x && target.x <= rectRight(rect);
    const sitsOnBodySide = rect.y > target.y - panelRect.height * 0.03;
    if (coversTargetColumn && sitsOnBodySide) {
      score += 160;
    }
    if (rectBottom(rect) > target.y + panelRect.height * 0.05) {
      score += 150;
    } else if (rectBottom(rect) <= target.y) {
      score -= 42;
    }
    if (Math.abs(center.x - target.x) > panelRect.width * 0.18 || center.y < target.y) {
      score -= 24;
    }
  } else if (bubble.kind === 'caption') {
    const center = rectCenter(rect);
    const panelCenterY = panelRect.y + panelRect.height / 2;
    score += Math.abs(center.y - panelCenterY) * 8;
  }

  return score;
}

function overlapWithPlaced(rect: Rect, placed: BubbleGeometry[]): number {
  return placed.reduce((sum, placedBubble) => sum + overlapArea(rect, placedBubble.rect), 0);
}

function weightedAvoidOverlapRatio(rect: Rect, avoidRects: AvoidRect[]): number {
  const area = Math.max(rectArea(rect), OVERLAP_EPSILON);
  const weightedOverlap = avoidRects.reduce((sum, avoidRect) =>
    sum + overlapArea(rect, avoidRect) * avoidRect.weight,
  0);
  return weightedOverlap / area;
}

function placeBubble(params: {
  bubble: BubbleGeometry;
  panel: PlannedGraphicNovelPanel;
  target?: VisionPoint;
  placed: BubbleGeometry[];
  emptyZones: Rect[];
  avoidRects: AvoidRect[];
  pageSize?: PageSize;
  textSizing?: GraphicNovelBubbleTextSizing;
  preferSpeakerDistanceLimit?: boolean;
}): BubbleGeometry {
  const {
    bubble,
    panel,
    target,
    placed,
    emptyZones,
    avoidRects,
    pageSize = GRAPHIC_NOVEL_PAGE_SIZE,
    textSizing,
    preferSpeakerDistanceLimit = false,
  } = params;
  const panelRect = panel.templatePanel.rect;
  const zoneCandidates = emptyZones.flatMap((zone) =>
    candidateRectsInsideZone(zone, bubble, panelRect, target, pageSize, textSizing)
  );
  const candidates = [
    ...(target
      ? candidateTargetRingAtSpeakerDistance(target, bubble, panelRect, pageSize, textSizing)
      : []),
    ...zoneCandidates,
    ...(target
      ? candidateNearTarget(target, bubble, panelRect, pageSize, textSizing)
      : []),
  ];

  const scored: ScoredBubbleCandidate[] = candidates
    .map((candidate) => ({
      ...candidate,
      overlapWithPlaced: overlapWithPlaced(candidate.rect, placed),
      weightedAvoidOverlapRatio: weightedAvoidOverlapRatio(candidate.rect, avoidRects),
      distanceFromTargetPx: target
        ? distancePxFromRectToPoint(candidate.rect, target, pageSize)
        : undefined,
      score: scoreCandidate({
        rect: candidate.rect,
        bubble,
        panelRect,
        target,
        placed,
        emptyZones,
        avoidRects,
        candidateKind: candidate.candidateKind,
        overflow: candidate.overflow,
        sourceZone: candidate.sourceZone,
        pageSize,
        preferSpeakerDistanceLimit,
      }),
    }))
    .sort((a, b) => a.score - b.score);

  const nearTargetCandidates = target && preferSpeakerDistanceLimit
    ? scored.filter((candidate) =>
        (candidate.distanceFromTargetPx ?? Infinity) <= MAX_BUBBLE_DISTANCE_FROM_SPEAKER_PX
      )
    : scored;

  const selected = nearTargetCandidates.find((candidate) =>
    candidate.overlapWithPlaced <= OVERLAP_EPSILON &&
      !candidate.overflow &&
      candidate.weightedAvoidOverlapRatio <= 0.35
  ) ??
    scored.find((candidate) =>
      candidate.overlapWithPlaced <= OVERLAP_EPSILON && !candidate.overflow
    ) ??
    nearTargetCandidates.find((candidate) => !candidate.overflow) ??
    nearTargetCandidates.find((candidate) => candidate.overlapWithPlaced <= OVERLAP_EPSILON) ??
    scored.find((candidate) => !candidate.overflow) ??
    scored.find((candidate) => candidate.overlapWithPlaced <= OVERLAP_EPSILON) ??
    scored[0];

  return {
    ...bubble,
    rect: selected?.rect ?? bubble.rect,
    overflow: (selected?.overflow ?? bubble.overflow) ||
      (selected?.overlapWithPlaced ?? 0) > OVERLAP_EPSILON ||
      false,
    tailTo: bubble.kind === 'caption' ? undefined : target ?? bubble.tailTo,
  };
}

export function applyGraphicNovelBubbleVisionLayout(
  page: PlannedGraphicNovelPage,
  analysis: GraphicNovelBubbleVisionAnalysis,
  options: { useDetectedPanelBounds?: boolean } = {}
): GraphicNovelBubbleVisionLayoutResult {
  const pageSize = pageSizeForGraphicNovelPage(page);
  const coordinateSpace: AnalysisCoordinateSpace =
    options.useDetectedPanelBounds === true ? 'page' : 'panel';
  let bubblesPlaced = 0;
  let bubblesWithVisionTargets = 0;
  let bubblesWithVisionEmptyZones = 0;
  let bubblesWithVisionOccupiedZones = 0;
  let panelsWithDetectedBounds = 0;
  const extraVisionPanelCount = countExtraVisionPanels(page, analysis);
  const placedByPanelKey = new Map<string, BubbleGeometry[]>();
  const detectedPanelBounds = options.useDetectedPanelBounds === true
    ? normalizedDetectedPanelBounds(analysis)
    : new Map<GraphicNovelBubbleVisionPanel, Rect>();

  const plannedPage: PlannedGraphicNovelPage = {
    ...page,
    panels: page.panels.map((panel, panelIndex) => {
      const panelAnalysis = findPanelAnalysis(analysis, panel, panelIndex);
      const resolved = resolvedPanelForPlacement(
        panel,
        panelAnalysis,
        options.useDetectedPanelBounds === true,
        panelAnalysis ? detectedPanelBounds.get(panelAnalysis) : undefined
      );
      const placementPanel = resolved.panel;
      if (resolved.panelBoundsUsed) panelsWithDetectedBounds += 1;
      const bubbles = panel.bubbles.map((bubble) => {
        const bubblePanelAnalysis = options.useDetectedPanelBounds === true
          ? findPanelAnalysisForBubble(analysis, panel, panelIndex, bubble, page, coordinateSpace)
          : panelAnalysis;
        const bubbleResolved = resolvedPanelForPlacement(
          panel,
          bubblePanelAnalysis,
          options.useDetectedPanelBounds === true,
          bubblePanelAnalysis ? detectedPanelBounds.get(bubblePanelAnalysis) : undefined
        );
        const bubblePlacementPanel = bubbleResolved.panel;
        const hasOccupiedZones = !!bubblePanelAnalysis?.occupiedZones?.length;
        const visionEmptyZones = emptyZonesForPanel(
          bubblePanelAnalysis,
          bubblePlacementPanel.templatePanel.rect,
          coordinateSpace
        );
        const occupiedPlacementZones = hasOccupiedZones
          ? [fullPanelZone(bubblePlacementPanel.templatePanel.rect)]
          : visionEmptyZones;
        const avoidRects = characterAvoidRects(
          bubblePanelAnalysis,
          bubblePlacementPanel,
          page,
          coordinateSpace,
          bubble
        );
        const placedKey = options.useDetectedPanelBounds === true
          ? panelAnalysisKey(bubblePanelAnalysis, panelIndex)
          : `planned:${panelIndex + 1}`;
        const placed = placedByPanelKey.get(placedKey) ?? [];
        const targetResult = findCharacterTarget(
          bubblePanelAnalysis,
          bubble,
          bubblePlacementPanel,
          page,
          coordinateSpace
        );
        const placementTarget = targetResult.point ?? bubble.tailTo;
        const placementZones = bubble.kind === 'caption' ? visionEmptyZones : occupiedPlacementZones;
        const preferSpeakerDistanceLimit =
          bubble.kind !== 'caption' && !!placementTarget;
        const placedBubble = placeBubble({
          bubble,
          panel: bubblePlacementPanel,
          target: placementTarget,
          placed,
          emptyZones: placementZones,
          avoidRects,
          pageSize,
          textSizing: page.bubbleTextSizing,
          preferSpeakerDistanceLimit,
        });
        placed.push(placedBubble);
        placedByPanelKey.set(placedKey, placed);
        bubblesPlaced += 1;
        if (targetResult.hasVisionTarget) bubblesWithVisionTargets += 1;
        if (bubblePanelAnalysis?.emptyZones?.length) bubblesWithVisionEmptyZones += 1;
        if (bubblePanelAnalysis?.occupiedZones?.length) bubblesWithVisionOccupiedZones += 1;
        return placedBubble;
      });

      return {
        ...placementPanel,
        bubbles,
      };
    }),
  };

  return {
    page: plannedPage,
    placementSummary: {
      panelCount: plannedPage.panels.length,
      bubblesPlaced,
      bubblesWithVisionTargets,
      bubblesWithVisionEmptyZones,
      bubblesWithVisionOccupiedZones,
      panelsWithDetectedBounds,
      coordinateSpace,
      extraVisionPanelCount,
      hasExtraVisionPanelStructure: extraVisionPanelCount > 0,
    },
  };
}

export async function analyzeGraphicNovelBubbleVision(params: {
  textProvider: ITextProvider;
  page: PlannedGraphicNovelPage;
  imageData: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  detectPanelBounds?: boolean;
  onUsage?: (usage: UsageMetadata) => void;
}): Promise<GraphicNovelBubbleVisionAnalysis> {
  return params.textProvider.generateStructured<GraphicNovelBubbleVisionAnalysis>({
    model: config.ai.validationModel || config.ai.geminiVisionModel,
    temperature: 0,
    maxTokens: 6000,
    operation: 'graphic_novel_bubble_vision',
    onUsage: params.onUsage,
    systemInstruction: [
      'You are a precise comic page vision layout analyzer.',
      'Return only structured JSON matching the schema.',
      'Use the image pixels as source of truth for character face/head/mouth positions and occupied no-cover zones.',
      params.detectPanelBounds
        ? 'Detect the actual panel rectangles from the finished page; do not rely on preset rectangles. Return panelBounds and all visual coordinates in full-page 0..1 coordinates.'
        : 'If panel rectangles are visible, report them; otherwise keep analysis panel-relative.',
      'Do not invent speech bubble coordinates; only describe visual evidence for a deterministic server planner.',
    ].join(' '),
    prompt: buildBubbleVisionPrompt(params.page, {
      detectPanelBounds: params.detectPanelBounds,
    }),
    schema: GRAPHIC_NOVEL_BUBBLE_VISION_SCHEMA,
    imageData: [{
      mimeType: params.mimeType,
      data: params.imageData.toString('base64'),
      instructionText: params.detectPanelBounds
        ? 'Finished free-layout art-only graphic novel page image. Detect actual panel rectangles, visible characters, occupied no-cover zones, and optional empty zones.'
        : 'Finished art-only graphic novel page image. Analyze visible characters, occupied no-cover zones, and optional empty zones inside the panels.',
    }],
  });
}

function panelPixelRect(
  page: PlannedGraphicNovelPage,
  panelIndex: number,
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  const rect = page.panels[panelIndex].templatePanel.rect;
  const left = clamp(Math.round(rect.x * imageWidth), 0, imageWidth - 1);
  const top = clamp(Math.round(rect.y * imageHeight), 0, imageHeight - 1);
  const right = clamp(Math.round((rect.x + rect.width) * imageWidth), left + 1, imageWidth);
  const bottom = clamp(Math.round((rect.y + rect.height) * imageHeight), top + 1, imageHeight);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export async function analyzeGraphicNovelBubbleVisionByPanelCrops(params: {
  textProvider: ITextProvider;
  page: PlannedGraphicNovelPage;
  imageData: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  onUsage?: (usage: UsageMetadata) => void;
}): Promise<GraphicNovelBubbleVisionAnalysis> {
  const metadata = await sharp(params.imageData).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error('Cannot analyze graphic novel panel crops without image dimensions');
  }

  const panels: GraphicNovelBubbleVisionPanel[] = [];
  for (let panelIndex = 0; panelIndex < params.page.panels.length; panelIndex += 1) {
    const cropRect = panelPixelRect(params.page, panelIndex, width, height);
    const crop = await sharp(params.imageData)
      .extract(cropRect)
      .png()
      .toBuffer();
    const analysis = await params.textProvider.generateStructured<GraphicNovelBubbleVisionAnalysis>({
      model: config.ai.validationModel || config.ai.geminiVisionModel,
      temperature: 0,
      maxTokens: 2500,
      operation: 'graphic_novel_bubble_vision_panel_crop',
      onUsage: params.onUsage,
      systemInstruction: [
        'You are a precise comic panel vision layout analyzer.',
        'Return only structured JSON matching the schema.',
        'Use the image pixels as source of truth for character face/head/mouth positions and occupied no-cover zones.',
        'The image is one panel crop only; do not infer or invent other panels.',
      ].join(' '),
      prompt: buildSinglePanelBubbleVisionPrompt(params.page, panelIndex),
      schema: GRAPHIC_NOVEL_BUBBLE_VISION_SCHEMA,
      imageData: [{
        mimeType: 'image/png',
        data: crop.toString('base64'),
        instructionText: `Finished art-only crop for panel ${panelIndex + 1}. Analyze visible characters, occupied no-cover zones, and optional empty zones inside this panel only.`,
      }],
    });

    const panelAnalysis = analysis.panels.find((panel) =>
      panel.panelIndex === panelIndex + 1 ||
      panel.panelId === params.page.panels[panelIndex].script.panelId
    ) ?? analysis.panels[0];

    panels.push({
      ...(panelAnalysis || {
        detectedCharacters: [],
        occupiedZones: [],
        emptyZones: [],
      }),
      panelIndex: panelIndex + 1,
      panelId: params.page.panels[panelIndex].script.panelId,
    });
  }

  return { panels };
}
