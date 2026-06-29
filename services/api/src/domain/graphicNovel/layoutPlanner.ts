import { GRAPHIC_NOVEL_PAGE_TEMPLATES, getTemplatesForAge } from './pageTemplates';
import { measureGraphicNovelBubbleTextBox } from './bubbleTextSizing';
import type { CameraCharacterComposition } from '../../services/types';
import type {
  BubbleGeometry,
  GraphicNovelLine,
  GraphicNovelPageScript,
  GraphicNovelPageTemplate,
  GraphicNovelPanelScript,
  PlannedGraphicNovelPage,
  Rect,
} from './types';

const PAGE_WIDTH = 1536;
const PAGE_HEIGHT = 2048;
const MIN_PANEL_COUNT = 2;
const BUBBLE_PADDING = 0.018;
const BUBBLE_GAP = 0.012;
const DEFAULT_SPEECH_TARGET_Y = 0.42;
const BUBBLE_OVERLAP_EPSILON = 0.000001;

type BubbleLineForLayout = { kind: BubbleGeometry['kind']; speaker?: string; text: string };
type RandomSource = () => number;
type PageSize = { width: number; height: number };

interface BubblePlacementCandidate {
  label: string;
  rect: Rect;
  bias: number;
}

interface ScoredTemplateCandidate {
  template: GraphicNovelPageTemplate;
  score: number;
}

interface ScoredBubblePlacement {
  candidate: BubblePlacementCandidate;
  score: number;
  overlapWithPlaced: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomIndex(length: number, randomSource: RandomSource): number {
  return Math.floor(clamp(randomSource(), 0, 0.999999) * length);
}

function shuffle<T>(items: T[], randomSource: RandomSource): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, randomSource);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function shuffleEqualScoreGroups(
  candidates: ScoredTemplateCandidate[],
  randomSource: RandomSource
): ScoredTemplateCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const result: ScoredTemplateCandidate[] = [];
  let index = 0;

  while (index < sorted.length) {
    const score = sorted[index].score;
    const group: ScoredTemplateCandidate[] = [];
    while (index < sorted.length && sorted[index].score === score) {
      group.push(sorted[index]);
      index += 1;
    }
    result.push(...shuffle(group, randomSource));
  }

  return result;
}

function lineText(line: GraphicNovelLine): string {
  return line.text.trim();
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

function isPanelPoint(value: unknown): value is { x: number; y: number } {
  const point = value as { x?: unknown; y?: unknown };
  return (
    typeof point?.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point?.y === 'number' &&
    Number.isFinite(point.y)
  );
}

function clampPanelPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: clamp(point.x, 0.08, 0.92),
    y: clamp(point.y, 0.12, 0.9),
  };
}

function panelCharacters(panel: GraphicNovelPanelScript): CameraCharacterComposition[] {
  const composition = panel.visual?.sceneVisual?.cameraComposition;
  if (composition && typeof composition !== 'string' && Array.isArray(composition.characters)) {
    return composition.characters;
  }

  return (Array.isArray(panel.charactersPresent) ? panel.charactersPresent : []).map((name, index, all) => ({
    name,
    description:
      index === 0
        ? 'foreground left, readable expression, looking toward the panel action'
        : index === all.length - 1
          ? 'foreground right, readable expression, responding to the other character'
          : 'center foreground, readable expression, reacting to the panel action',
  }));
}

function fallbackAnchorForCharacter(
  character: CameraCharacterComposition | undefined,
  index: number,
  count: number
): { x: number; y: number } {
  const text = `${character?.position || ''} ${character?.description || ''}`.toLowerCase();
  let x: number;
  if (/\bleft\b|left_/.test(text)) {
    x = 0.3;
  } else if (/\bright\b|right_/.test(text)) {
    x = 0.7;
  } else if (/\bcenter\b|\bmiddle\b|center_/.test(text)) {
    x = 0.5;
  } else if (count <= 1) {
    x = 0.5;
  } else {
    x = 0.28 + (0.44 * index) / Math.max(1, count - 1);
  }

  let y = 0.64;
  if (/\bbackground\b|background_/.test(text)) {
    y = 0.5;
  } else if (/\bmidground\b|midground_/.test(text)) {
    y = 0.58;
  } else if (/\bflying\b|\bhovering\b|\babove\b|\bupper\b|upper_/.test(text)) {
    y = 0.42;
  }

  return clampPanelPoint({ x, y });
}

function targetFromAnchor(anchor: { x: number; y: number }): { x: number; y: number } {
  return clampPanelPoint({
    x: anchor.x,
    y: Math.min(anchor.y - 0.18, DEFAULT_SPEECH_TARGET_Y),
  });
}

function toPagePoint(point: { x: number; y: number }, panelRect: Rect, padding: number): { x: number; y: number } {
  return {
    x: clamp(panelRect.x + point.x * panelRect.width, panelRect.x + padding, panelRect.x + panelRect.width - padding),
    y: clamp(panelRect.y + point.y * panelRect.height, panelRect.y + padding, panelRect.y + panelRect.height - padding),
  };
}

function findSpeakerPlacement(
  panel: GraphicNovelPanelScript,
  panelRect: Rect,
  speaker: string | undefined,
  padding: number
): { anchor: { x: number; y: number }; speechTarget: { x: number; y: number }; speechTargetPage: { x: number; y: number } } | undefined {
  if (!speaker?.trim()) {
    return undefined;
  }

  const characters = panelCharacters(panel);
  const speakerKey = normalizedName(speaker);
  let characterIndex = characters.findIndex((character) => normalizedName(character.name) === speakerKey);
  if (characterIndex < 0) {
    characterIndex = characters.findIndex((character) => {
      const characterKey = normalizedName(character.name);
      return characterKey.includes(speakerKey) || speakerKey.includes(characterKey);
    });
  }

  const character = characterIndex >= 0 ? characters[characterIndex] : undefined;
  const fallbackIndex = characterIndex >= 0 ? characterIndex : 0;
  const fallbackCount = Math.max(characters.length, 1);
  const anchor = clampPanelPoint(isPanelPoint(character?.anchor)
    ? character.anchor
    : fallbackAnchorForCharacter(character, fallbackIndex, fallbackCount));
  const speechTarget = clampPanelPoint(isPanelPoint(character?.speechTarget)
    ? character.speechTarget
    : targetFromAnchor(anchor));

  return {
    anchor,
    speechTarget,
    speechTargetPage: toPagePoint(speechTarget, panelRect, padding),
  };
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

function rectCenter(rect: Rect): { x: number; y: number } {
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

function rectContainsPoint(rect: Rect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x &&
    point.x <= rectRight(rect) &&
    point.y >= rect.y &&
    point.y <= rectBottom(rect);
}

function clampBubbleRect(rect: Rect, panelRect: Rect, padding: number): Rect {
  const maxWidth = Math.max(0.001, panelRect.width - padding * 2);
  const maxHeight = Math.max(0.001, panelRect.height - padding * 2);
  const width = Math.min(rect.width, maxWidth);
  const height = Math.min(rect.height, maxHeight);
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

function rectAroundPagePoint(
  point: { x: number; y: number },
  width: number,
  height: number,
  panelRect: Rect,
  padding: number
): Rect {
  return clampBubbleRect(
    {
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
    },
    panelRect,
    padding
  );
}

function characterAvoidBoxes(panel: GraphicNovelPanelScript, panelRect: Rect, padding: number): Rect[] {
  const characters = panelCharacters(panel);
  return characters.flatMap((character, index) => {
    const anchor = clampPanelPoint(isPanelPoint(character.anchor)
      ? character.anchor
      : fallbackAnchorForCharacter(character, index, Math.max(characters.length, 1)));
    const speechTarget = clampPanelPoint(isPanelPoint(character.speechTarget)
      ? character.speechTarget
      : targetFromAnchor(anchor));
    const anchorPage = toPagePoint(anchor, panelRect, padding);
    const speechTargetPage = toPagePoint(speechTarget, panelRect, padding);

    return [
      rectAroundPagePoint(
        speechTargetPage,
        panelRect.width * 0.22,
        panelRect.height * 0.18,
        panelRect,
        padding
      ),
      rectAroundPagePoint(
        anchorPage,
        panelRect.width * 0.26,
        panelRect.height * 0.34,
        panelRect,
        padding
      ),
    ];
  });
}

function uniqueCandidates(candidates: BubblePlacementCandidate[]): BubblePlacementCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [
      candidate.rect.x,
      candidate.rect.y,
      candidate.rect.width,
      candidate.rect.height,
    ].map((value) => value.toFixed(4)).join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildBubblePlacementCandidates(
  line: BubbleLineForLayout,
  measured: { width: number; height: number },
  panelRect: Rect,
  padding: number,
  index: number,
  placement: ReturnType<typeof findSpeakerPlacement>
): BubblePlacementCandidate[] {
  const left = panelRect.x + padding;
  const right = panelRect.x + panelRect.width - padding - measured.width;
  const top = panelRect.y + padding;
  const bottom = panelRect.y + panelRect.height - padding - measured.height;
  const centerX = panelRect.x + (panelRect.width - measured.width) / 2;
  const middleY = panelRect.y + (panelRect.height - measured.height) / 2;
  const upperY = panelRect.y + panelRect.height * 0.2 - measured.height / 2;
  const lowerY = panelRect.y + panelRect.height * 0.74 - measured.height / 2;
  const speakerOnRight = placement ? placement.speechTarget.x >= 0.5 : index % 2 === 1;
  const speakerSideX = speakerOnRight ? right : left;
  const oppositeSideX = speakerOnRight ? left : right;
  const targetX = placement ? placement.speechTargetPage.x - measured.width / 2 : centerX;
  const aboveTargetY = placement ? placement.speechTargetPage.y - measured.height - BUBBLE_GAP : top;
  const belowTargetY = placement ? placement.speechTargetPage.y + BUBBLE_GAP : lowerY;
  const candidates: BubblePlacementCandidate[] = [];

  const add = (label: string, x: number, y: number, bias = 0) => {
    candidates.push({
      label,
      rect: clampBubbleRect({ x, y, width: measured.width, height: measured.height }, panelRect, padding),
      bias,
    });
  };

  if (line.kind === 'caption') {
    add('caption-top-center', centerX, top, -5);
    add('caption-top-left', left, top, -4);
    add('caption-top-right', right, top, -2);
    add('caption-bottom-center', centerX, bottom, index > 0 ? -4 : 1);
    add('caption-bottom-left', left, bottom, index > 0 ? -3 : 2);
    add('caption-bottom-right', right, bottom, index > 0 ? -2 : 3);
    return uniqueCandidates(candidates);
  }

  add('speaker-above', targetX, aboveTargetY, -6);
  add('top-speaker-side', speakerSideX, top, -4);
  add('top-near-speaker', targetX, top, -3);
  add('upper-speaker-side', speakerSideX, upperY, -1);
  add('middle-speaker-side', speakerSideX, middleY, 4);
  add('bottom-speaker-side', speakerSideX, bottom, index >= 2 ? -6 : 1);
  add('bottom-near-speaker', targetX, bottom, index >= 2 ? -5 : 2);
  add('speaker-below', targetX, belowTargetY, 7);
  add('top-opposite-side', oppositeSideX, top, 6);
  add('bottom-opposite-side', oppositeSideX, bottom, index >= 2 ? 0 : 7);
  add('middle-opposite-side', oppositeSideX, middleY, 8);
  add('top-center', centerX, top, 3);
  add('bottom-center', centerX, bottom, index >= 2 ? -2 : 6);
  add('lower-center', centerX, lowerY, index >= 2 ? 0 : 8);

  return uniqueCandidates(candidates);
}

function scoreBubblePlacement(params: {
  candidate: BubblePlacementCandidate;
  line: BubbleLineForLayout;
  panelRect: Rect;
  index: number;
  placedBubbles: BubbleGeometry[];
  avoidBoxes: Rect[];
  placement: ReturnType<typeof findSpeakerPlacement>;
}): ScoredBubblePlacement {
  const { candidate, line, panelRect, index, placedBubbles, avoidBoxes, placement } = params;
  const area = Math.max(rectArea(candidate.rect), BUBBLE_OVERLAP_EPSILON);
  const panelDiagonal = Math.hypot(panelRect.width, panelRect.height);
  const center = rectCenter(candidate.rect);
  let score = candidate.bias;
  let overlapWithPlaced = 0;

  for (const placed of placedBubbles) {
    const overlap = overlapArea(candidate.rect, placed.rect);
    if (overlap > BUBBLE_OVERLAP_EPSILON) {
      overlapWithPlaced += overlap;
      score += 600 + (overlap / area) * 4000;
    }
  }

  for (const avoidBox of avoidBoxes) {
    const overlap = overlapArea(candidate.rect, avoidBox);
    if (overlap > BUBBLE_OVERLAP_EPSILON) {
      score += (overlap / area) * 140;
    }
  }

  const topBand = candidate.rect.y < panelRect.y + panelRect.height * 0.28;
  const bottomBand = candidate.rect.y > panelRect.y + panelRect.height * 0.58;
  const placedTopCount = placedBubbles.filter((bubble) =>
    bubble.rect.y < panelRect.y + panelRect.height * 0.28
  ).length;

  if (index >= 2 && placedTopCount >= 2 && topBand) {
    score += 20;
  }
  if (index >= 2 && bottomBand) {
    score -= 7;
  }
  if (line.kind === 'caption') {
    if (topBand) score -= 4;
    if (bottomBand && index > 0) score -= 3;
  }

  const previous = placedBubbles[placedBubbles.length - 1];
  if (previous) {
    const previousCenter = rectCenter(previous.rect);
    if (center.y + panelRect.height * 0.08 < previousCenter.y && center.x < previousCenter.x) {
      score += 10;
    }
  }

  if (placement) {
    const target = placement.speechTargetPage;
    const distance = Math.hypot(center.x - target.x, center.y - target.y) / Math.max(panelDiagonal, 0.001);
    score += distance * 14;
    if (rectContainsPoint(candidate.rect, target)) {
      score += 180;
    }
    if (center.y < target.y) {
      score -= 3;
    } else {
      score += 7;
    }

    const speakerOnRight = placement.speechTarget.x >= 0.5;
    const panelCenterX = panelRect.x + panelRect.width / 2;
    if (speakerOnRight && center.x < panelCenterX - panelRect.width * 0.08) {
      score += 8;
    }
    if (!speakerOnRight && center.x > panelCenterX + panelRect.width * 0.08) {
      score += 8;
    }
  }

  return {
    candidate,
    score,
    overlapWithPlaced,
  };
}

function selectBubblePlacement(params: {
  line: BubbleLineForLayout;
  measured: { width: number; height: number };
  panelRect: Rect;
  padding: number;
  index: number;
  placedBubbles: BubbleGeometry[];
  avoidBoxes: Rect[];
  placement: ReturnType<typeof findSpeakerPlacement>;
}): ScoredBubblePlacement {
  const candidates = buildBubblePlacementCandidates(
    params.line,
    params.measured,
    params.panelRect,
    params.padding,
    params.index,
    params.placement
  );
  const scored = candidates
    .map((candidate) => scoreBubblePlacement({ ...params, candidate }))
    .sort((a, b) => a.score - b.score);

  return scored.find((candidate) => candidate.overlapWithPlaced <= BUBBLE_OVERLAP_EPSILON) ?? scored[0];
}

function buildBubbleGeometry(panel: GraphicNovelPanelScript, panelRect: Rect): BubbleGeometry[] {
  const lines: BubbleLineForLayout[] = [];
  for (const line of panel.dialogue || []) {
    lines.push({ kind: 'speech', speaker: line.speaker, text: lineText(line) });
  }
  for (const line of panel.thoughts || []) {
    lines.push({ kind: 'thought', speaker: line.speaker, text: lineText(line) });
  }
  if (panel.caption?.trim()) {
    lines.push({ kind: 'caption', text: panel.caption.trim() });
  }

  const padding = Math.min(BUBBLE_PADDING, panelRect.width * 0.08, panelRect.height * 0.08);
  const placedBubbles: BubbleGeometry[] = [];
  const avoidBoxes = characterAvoidBoxes(panel, panelRect, padding);

  return lines.map((line, index) => {
    const measured = measureGraphicNovelBubbleTextBox({
      text: line.text,
      kind: line.kind,
      panelRect,
    });
    const placement = findSpeakerPlacement(panel, panelRect, line.speaker, padding);
    const scoredPlacement = selectBubblePlacement({
      line,
      measured,
      panelRect,
      padding,
      index,
      placedBubbles,
      avoidBoxes,
      placement,
    });
    const rect = scoredPlacement.candidate.rect;
    const layoutOverflow = scoredPlacement.overlapWithPlaced > BUBBLE_OVERLAP_EPSILON;

    const bubble = {
      id: `${panel.panelId}-b${index + 1}`,
      kind: line.kind,
      speaker: line.speaker,
      text: line.text,
      rect,
      overflow: measured.overflow || layoutOverflow,
      tailTo: line.kind === 'caption' ? undefined : placement?.speechTargetPage,
    };
    placedBubbles.push(bubble);
    return bubble;
  });
}

function textLoad(panel: GraphicNovelPanelScript): number {
  const dialogue = (panel.dialogue || []).reduce((sum, line) => sum + line.text.length, 0);
  const thoughts = (panel.thoughts || []).reduce((sum, line) => sum + line.text.length, 0);
  return dialogue + thoughts + (panel.caption?.length || 0);
}

function selectTemplate(
  ageGroup: string,
  page: GraphicNovelPageScript,
  randomSource: RandomSource,
  options: {
    templates?: GraphicNovelPageTemplate[];
    minPanelCount?: number;
  } = {}
): GraphicNovelPageTemplate[] {
  const templatePool = options.templates ?? GRAPHIC_NOVEL_PAGE_TEMPLATES;
  const ageTemplatePool = options.templates
    ? templatePool.filter((template) =>
        template.allowedAgeGroups.includes((ageGroup || '4-5') as any)
      )
    : getTemplatesForAge(ageGroup);
  const eligible = ageTemplatePool.length > 0 ? ageTemplatePool : templatePool;
  const requiredPanelCount = Math.max(options.minPanelCount ?? MIN_PANEL_COUNT, page.panels.length);
  const pageTextLoad = page.panels.reduce((sum, panel) => sum + textLoad(panel), 0);
  const ageCandidates = eligible.filter((template) => template.panelCount === requiredPanelCount);
  const fallbackCandidates = templatePool.filter((template) =>
    template.panelCount === requiredPanelCount
  );
  const candidates = ageCandidates.length > 0 ? ageCandidates : fallbackCandidates;

  const scored = candidates
    .map((template) => {
      let score = 0;
      if (template.bestUseCases.includes(page.pageRole)) score += 5;
      if (ageGroup === '6-8') {
        if (template.panelCount >= 4) score += 4;
        if (template.panelCount === 5) score += 1;
        if (template.panelCount === 3) score -= 3;
        if (template.panelCount <= 2) score -= 10;
      }
      if (pageTextLoad < 80 && template.panelCount <= 3) score += 2;
      return { template, score };
    });

  return shuffleEqualScoreGroups(scored, randomSource)
    .map((item) => item.template);
}

function planPanelsForTemplate(
  panels: GraphicNovelPanelScript[],
  template: GraphicNovelPageTemplate
): PlannedGraphicNovelPage['panels'] {
  if (panels.length !== template.panelCount) {
    throw new Error(
      `Graphic novel template ${template.id} has ${template.panelCount} panels, but script has ${panels.length} panels`
    );
  }

  return panels.map((panel, index) => {
    const templatePanel = template.panels[index];
    const bubbles = buildBubbleGeometry(panel, templatePanel.rect);
    return {
      script: panel,
      templatePanel,
      bubbles,
    };
  });
}

function scoreBubbleFit(panels: PlannedGraphicNovelPage['panels']): {
  overflowCount: number;
} {
  let overflowCount = 0;

  for (const panel of panels) {
    for (const bubble of panel.bubbles) {
      if (bubble.overflow) overflowCount += 1;
    }
  }

  return { overflowCount };
}

function targetMinimumPanels(ageGroup: string, page: GraphicNovelPageScript): number {
  if (ageGroup === '6-8') {
    return ['reflection', 'resolution'].includes(page.pageRole) ? 3 : 4;
  }
  return MIN_PANEL_COUNT;
}

function splitVisualBeat(
  panel: GraphicNovelPanelScript,
  panelId: string,
  primaryReadPrefix: string,
  settingPrefix: string
): GraphicNovelPanelScript {
  const visual = panel.visual;
  return {
    ...panel,
    panelId,
    dialogue: [],
    thoughts: [],
    caption: undefined,
    beatType: 'reaction',
    visual: {
      ...visual,
      primaryRead: `${primaryReadPrefix}: ${visual.primaryRead}`,
      sceneVisual: {
        ...visual.sceneVisual,
        setting: `${settingPrefix}: ${visual.sceneVisual.setting}`,
      },
    },
  };
}

function ensureMinimumPanels(page: GraphicNovelPageScript, ageGroup: string): GraphicNovelPanelScript[] {
  const minimum = targetMinimumPanels(ageGroup, page);
  if (page.panels.length >= minimum) {
    return page.panels;
  }

  if (page.panels.length >= MIN_PANEL_COUNT) {
    const panels = [...page.panels];
    let sourceIndex = 0;
    while (panels.length < minimum) {
      const source = page.panels[sourceIndex % page.panels.length];
      panels.push(splitVisualBeat(
        source,
        `${source.panelId}-reaction-${panels.length + 1}`,
        'Silent reaction beat',
        'Small visual reaction beat'
      ));
      sourceIndex += 1;
    }
    return panels;
  }

  const original = page.panels[0];
  if (!original) {
    return [];
  }

  const panels: GraphicNovelPanelScript[] = [
    {
      ...original,
      panelId: `${original.panelId}-setup`,
      beatType: 'reaction',
      dialogue: [],
      thoughts: original.thoughts.slice(0, 1),
      visual: {
        ...original.visual,
        primaryRead: `Setup moment: ${original.visual.primaryRead}`,
        sceneVisual: {
          ...original.visual.sceneVisual,
          setting: `Setup moment before the change: ${original.visual.sceneVisual.setting}`,
        },
      },
    },
    {
      ...original,
      panelId: `${original.panelId}-response`,
      beatType: 'response',
      thoughts: [],
      visual: {
        ...original.visual,
        primaryRead: `Response moment: ${original.visual.primaryRead}`,
        sceneVisual: {
          ...original.visual.sceneVisual,
          setting: `Response moment after the change: ${original.visual.sceneVisual.setting}`,
        },
      },
    },
  ];

  let sourceIndex = 0;
  while (panels.length < minimum) {
    const source = page.panels[sourceIndex % page.panels.length] ?? original;
    panels.push(splitVisualBeat(
      source,
      `${source.panelId}-reaction-${panels.length + 1}`,
      'Silent reaction beat',
      'Small visual reaction beat'
    ));
    sourceIndex += 1;
  }

  return panels;
}

export function planGraphicNovelLayouts(params: {
  ageGroup: string;
  pages: GraphicNovelPageScript[];
  outfits?: PlannedGraphicNovelPage['outfits'];
  preservePanelCount?: boolean;
  preferredTemplateId?: string;
  templates?: GraphicNovelPageTemplate[];
  minPanelCount?: number;
  randomSource?: RandomSource;
}): PlannedGraphicNovelPage[] {
  const randomSource = params.randomSource ?? Math.random;
  return params.pages.map((page) => {
    const panels = params.preservePanelCount
      ? page.panels
      : ensureMinimumPanels(page, params.ageGroup);
    const pageForTemplate = { ...page, panels };
    const templatePool = params.templates ?? GRAPHIC_NOVEL_PAGE_TEMPLATES;
    let candidates = selectTemplate(params.ageGroup, pageForTemplate, randomSource, {
      templates: params.templates,
      minPanelCount: params.minPanelCount,
    });

    if (params.preferredTemplateId) {
      const preferred = templatePool.find((template) =>
        template.id === params.preferredTemplateId
      );
      if (!preferred) {
        throw new Error(`Graphic novel template ${params.preferredTemplateId} does not exist`);
      }
      if (preferred.panelCount !== panels.length) {
        throw new Error(
          `Graphic novel template ${preferred.id} has ${preferred.panelCount} panels, but script has ${panels.length} panels`
        );
      }
      candidates = [preferred];
    }

    if (candidates.length === 0) {
      throw new Error(
        `No graphic novel template with exactly ${panels.length} panels for age group ${params.ageGroup}`
      );
    }

    const plannedCandidates = candidates.map((template) => {
      const plannedPanels = planPanelsForTemplate(panels, template);
      return {
        template,
        plannedPanels,
        fit: scoreBubbleFit(plannedPanels),
      };
    });
    const selected = plannedCandidates.find((candidate) => candidate.fit.overflowCount === 0);
    const fallbackCandidates = selected
      ? []
      : plannedCandidates.filter((candidate) =>
        candidate.fit.overflowCount === Math.min(...plannedCandidates.map((item) => item.fit.overflowCount))
      );
    const fallbackSelected = fallbackCandidates.length > 0
      ? shuffle(fallbackCandidates, randomSource)[0]
      : undefined;
    const finalSelected = selected ?? fallbackSelected;
    const template = finalSelected?.template ?? candidates[0];

    return {
      pageNumber: page.pageNumber,
      pageRole: page.pageRole,
      template,
      pageSize: template.pageSize ?? GRAPHIC_NOVEL_PAGE_SIZE,
      outfits: params.outfits,
      panels: finalSelected?.plannedPanels ?? planPanelsForTemplate(panels, template),
    };
  });
}

export function pageSizeForGraphicNovelPage(page: Pick<PlannedGraphicNovelPage, 'pageSize' | 'template'>): PageSize {
  return page.pageSize ?? page.template.pageSize ?? GRAPHIC_NOVEL_PAGE_SIZE;
}

export function normalizeRect(rect: Rect, pageSize: PageSize = GRAPHIC_NOVEL_PAGE_SIZE): Rect {
  return {
    x: Math.round(rect.x * pageSize.width),
    y: Math.round(rect.y * pageSize.height),
    width: Math.round(rect.width * pageSize.width),
    height: Math.round(rect.height * pageSize.height),
  };
}

export const GRAPHIC_NOVEL_PAGE_SIZE = {
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT,
};
