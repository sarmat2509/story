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
    extraVisionPanelCount: number;
    hasExtraVisionPanelStructure: boolean;
  };
}

const MIN_EMPTY_ZONE_CONFIDENCE = 0.15;
const OVERLAP_EPSILON = 0.000001;
const IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX = 100;
const IDEAL_BUBBLE_DISTANCE_TOLERANCE_PX = 24;
type PageSize = { width: number; height: number };

interface BubbleCandidate {
  rect: Rect;
  overflow: boolean;
  candidateKind: 'empty_zone' | 'empty_zone_expanded' | 'empty_direction' | 'target_ring' | 'near_target';
  sourceZone?: Rect;
}

interface AvoidRect extends Rect {
  weight: number;
}

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
          detectedCharacters: {
            type: 'array',
            description: 'Visible named characters in this panel, with face/head/mouth points in panel-relative 0..1 coordinates.',
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
            description: 'Actual visible occupied/no-cover zones: character bodies, faces, hands, important props, and main action. Coordinates are panel-relative 0..1.',
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
            description: 'Optional actual visually empty/simple-background zones suitable for server-rendered rounded speech bubbles. Coordinates are panel-relative 0..1. Use [] if unsure.',
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

function plannedPanelBrief(page: PlannedGraphicNovelPage): string {
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
        `Panel ${index + 1} (${panel.script.panelId}): rect page-normalized x=${rect.x.toFixed(4)}, y=${rect.y.toFixed(4)}, width=${rect.width.toFixed(4)}, height=${rect.height.toFixed(4)}`,
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

function buildBubbleVisionPrompt(page: PlannedGraphicNovelPage): string {
  return `Analyze this finished art-only graphic novel page for server-rendered bubble placement.

The image already has the panel artwork. It intentionally does NOT include speech bubbles or text.
Your job is to visually identify:
1. actual visible face/head/mouth points for the named characters in each panel;
2. actual occupied/no-cover zones: character bodies, faces, hands, important props, and the main action;
3. optional empty/simple-background zones if they are obvious.

Return panel-relative coordinates from 0 to 1 inside each panel. Do not use planned bubble positions as truth; infer from the pixels in the image.

Rules:
- Analyze all ${page.panels.length} panels in reading order.
- For every visible speaking character, provide the best mouthCenter if visible; otherwise faceCenter; otherwise headCenter.
- If a mouth is not visible, estimate the point on the lower face/head where a tail should point.
- Report occupiedZones first. These are rectangles the deterministic layout algorithm should avoid covering.
- Use tight but complete occupiedZones around each visible character body, face/head, hands/gestures, important prop, and main action area.
- Prefer a few accurate occupiedZones over one huge rectangle that covers half the panel.
- Mark faces/heads as kind="face", full or partial bodies as kind="character", important story props as kind="important_object", and visible action centers as kind="main_action".
- If obvious empty zones exist, report them too as optional emptyZones: sky, wall, plain floor, soft background, or unimportant simple texture.
- Empty zones are secondary. Do not invent empty zones if the panel is visually busy.

Planned page context:
${plannedPanelBrief(page)}`;
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
    candidate.panelIndex === panelIndex + 1 || candidate.panelId === panel.script.panelId
  );
}

function findCharacterTarget(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  bubble: BubbleGeometry,
  panel: PlannedGraphicNovelPanel,
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>
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
  if (target) {
    return {
      point: pagePoint(target, panel.templatePanel.rect),
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

function emptyZonesForPanel(panelAnalysis: GraphicNovelBubbleVisionPanel | undefined, panelRect: Rect): Rect[] {
  const zones = (panelAnalysis?.emptyZones || [])
    .filter((zone) => (zone.confidence ?? 0) >= MIN_EMPTY_ZONE_CONFIDENCE)
    .map((zone) => pageRect(zone, panelRect))
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

function occupiedAvoidRectsForPanel(
  panelAnalysis: GraphicNovelBubbleVisionPanel | undefined,
  panelRect: Rect
): AvoidRect[] {
  return (panelAnalysis?.occupiedZones || [])
    .filter((zone) => (zone.confidence ?? 0) >= MIN_EMPTY_ZONE_CONFIDENCE)
    .map((zone) => ({
      ...pageRect(zone, panelRect),
      weight: occupiedZoneWeight(zone),
    }))
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
  page: Pick<PlannedGraphicNovelPage, 'characterAliases'>
): AvoidRect[] {
  const panelRect = panel.templatePanel.rect;
  const occupiedAvoidRects = occupiedAvoidRectsForPanel(panelAnalysis, panelRect);
  const characterRects = (panelAnalysis?.detectedCharacters || []).flatMap((character) => {
    const points = [character.mouthCenter, character.faceCenter, character.headCenter]
      .map((point) => pagePoint(point, panelRect))
      .filter((point): point is VisionPoint => !!point);
    const pointRects = points.map((point) => ({
      ...clampRectToPanel({
        x: point.x - panelRect.width * 0.08,
        y: point.y - panelRect.height * 0.09,
        width: panelRect.width * 0.16,
        height: panelRect.height * 0.18,
      }, panelRect),
      weight: 1,
    }));

    const plannedCharacter = findPlannedCharacter(panel, character.name, page);
    const plannedAnchor = isVisionPoint(plannedCharacter?.anchor)
      ? pagePoint(plannedCharacter.anchor, panelRect)
      : undefined;
    const visualPoints = [
      character.headCenter,
      character.faceCenter,
      character.mouthCenter,
    ].map((point) => pagePoint(point, panelRect)).filter((point): point is VisionPoint => !!point);

    const headPoint = pagePoint(character.headCenter ?? character.faceCenter ?? character.mouthCenter, panelRect);
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
        (occupiedAvoidRects.length > 0 ? 0.65 : 1),
    };

    return [...pointRects, bodyRect];
  });

  return [...occupiedAvoidRects, ...characterRects];
}

function candidateNearTarget(
  target: VisionPoint,
  bubble: BubbleGeometry,
  panelRect: Rect,
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE
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
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE
): BubbleCandidate[] {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
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
  target?: VisionPoint
): BubbleCandidate {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    zoneRect: zone,
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
  target?: VisionPoint
): BubbleCandidate[] {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
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
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE
): BubbleCandidate[] {
  if (!target) return [];

  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
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
  pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE
): BubbleCandidate[] {
  const measured = measureGraphicNovelBubbleTextBox({
    text: bubble.text,
    kind: bubble.kind,
    panelRect,
    zoneRect: zone,
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
    candidateInsideZone(zone, bubble, panelRect, target),
    ...candidateTowardEmptyZoneAtSpeakerDistance(zone, bubble, panelRect, target, pageSize),
    ...candidateAroundZone(zone, bubble, panelRect, target),
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
      if (distancePx > IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX * 1.8) {
        score += (distancePx - IDEAL_BUBBLE_DISTANCE_FROM_SPEAKER_PX * 1.8) * 12;
      }
    }
    if (rectContainsPoint(rect, target)) {
      score += 600;
    }
    const center = rectCenter(rect);
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

function placeBubble(params: {
  bubble: BubbleGeometry;
  panel: PlannedGraphicNovelPanel;
  target?: VisionPoint;
  placed: BubbleGeometry[];
  emptyZones: Rect[];
  avoidRects: AvoidRect[];
  pageSize?: PageSize;
}): BubbleGeometry {
  const {
    bubble,
    panel,
    target,
    placed,
    emptyZones,
    avoidRects,
    pageSize = GRAPHIC_NOVEL_PAGE_SIZE,
  } = params;
  const panelRect = panel.templatePanel.rect;
  const zoneCandidates = emptyZones.flatMap((zone) =>
    candidateRectsInsideZone(zone, bubble, panelRect, target, pageSize)
  );
  const candidates = [
    ...(target
      ? candidateTargetRingAtSpeakerDistance(target, bubble, panelRect, pageSize)
      : []),
    ...zoneCandidates,
    ...(target
      ? candidateNearTarget(target, bubble, panelRect, pageSize)
      : []),
  ];

  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      overlapWithPlaced: overlapWithPlaced(candidate.rect, placed),
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
      }),
    }))
    .sort((a, b) => a.score - b.score);
  const selected = scored.find((candidate) =>
    candidate.overlapWithPlaced <= OVERLAP_EPSILON && !candidate.overflow
  ) ??
    scored.find((candidate) => !candidate.overflow) ??
    scored.find((candidate) => candidate.overlapWithPlaced <= OVERLAP_EPSILON) ??
    scored[0];

  return {
    ...bubble,
    rect: selected?.rect ?? bubble.rect,
    overflow: bubble.overflow || selected?.overflow || (selected?.overlapWithPlaced ?? 0) > OVERLAP_EPSILON || false,
    tailTo: bubble.kind === 'caption' ? undefined : target ?? bubble.tailTo,
  };
}

export function applyGraphicNovelBubbleVisionLayout(
  page: PlannedGraphicNovelPage,
  analysis: GraphicNovelBubbleVisionAnalysis
): GraphicNovelBubbleVisionLayoutResult {
  const pageSize = pageSizeForGraphicNovelPage(page);
  let bubblesPlaced = 0;
  let bubblesWithVisionTargets = 0;
  let bubblesWithVisionEmptyZones = 0;
  let bubblesWithVisionOccupiedZones = 0;
  const extraVisionPanelCount = countExtraVisionPanels(page, analysis);

  const plannedPage: PlannedGraphicNovelPage = {
    ...page,
    panels: page.panels.map((panel, panelIndex) => {
      const panelAnalysis = findPanelAnalysis(analysis, panel, panelIndex);
      const hasOccupiedZones = !!panelAnalysis?.occupiedZones?.length;
      const visionEmptyZones = emptyZonesForPanel(panelAnalysis, panel.templatePanel.rect);
      const occupiedPlacementZones = hasOccupiedZones
        ? [fullPanelZone(panel.templatePanel.rect)]
        : visionEmptyZones;
      const avoidRects = characterAvoidRects(panelAnalysis, panel, page);
      const placed: BubbleGeometry[] = [];
      const bubbles = panel.bubbles.map((bubble) => {
        const targetResult = findCharacterTarget(panelAnalysis, bubble, panel, page);
        const placementTarget = targetResult.point ?? bubble.tailTo;
        const placementZones = bubble.kind === 'caption' ? visionEmptyZones : occupiedPlacementZones;
        const placedBubble = placeBubble({
          bubble,
          panel,
          target: placementTarget,
          placed,
          emptyZones: placementZones,
          avoidRects,
          pageSize,
        });
        placed.push(placedBubble);
        bubblesPlaced += 1;
        if (targetResult.hasVisionTarget) bubblesWithVisionTargets += 1;
        if (panelAnalysis?.emptyZones?.length) bubblesWithVisionEmptyZones += 1;
        if (panelAnalysis?.occupiedZones?.length) bubblesWithVisionOccupiedZones += 1;
        return placedBubble;
      });

      return {
        ...panel,
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
      'Do not invent speech bubble coordinates; only describe visual evidence for a deterministic server planner.',
    ].join(' '),
    prompt: buildBubbleVisionPrompt(params.page),
    schema: GRAPHIC_NOVEL_BUBBLE_VISION_SCHEMA,
    imageData: [{
      mimeType: params.mimeType,
      data: params.imageData.toString('base64'),
      instructionText: 'Finished art-only graphic novel page image. Analyze visible characters, occupied no-cover zones, and optional empty zones inside the panels.',
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
