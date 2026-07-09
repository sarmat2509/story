import type {
  GraphicNovelAgeGroup,
  GraphicNovelPageRole,
  GraphicNovelPageTemplate,
  Rect,
} from './types';

const lowAges: GraphicNovelAgeGroup[] = ['0-1', '1y', '2-3'];
const lowAndEarlyAges: GraphicNovelAgeGroup[] = ['0-1', '1y', '2-3', '4-5'];
const earlyAgesWithRareSixToEight: GraphicNovelAgeGroup[] = ['2-3', '4-5', '6-8'];
const conversationalAges: GraphicNovelAgeGroup[] = ['4-5', '6-8'];
const dynamicAges: GraphicNovelAgeGroup[] = ['6-8', '9-12'];
const flexibleFourPanelAges: GraphicNovelAgeGroup[] = ['4-5', '6-8', '9-12'];

const TEMPLATE_WIDTH = 1536;
const TEMPLATE_HEIGHT = 2048;
const PANEL_GUTTER_PX = Math.round(((TEMPLATE_WIDTH * 0.04) / 2) * (2 / 3));
const PAGE_MARGIN_PX = PANEL_GUTTER_PX;
const PAGE_FRAME_PX = {
  x: PAGE_MARGIN_PX,
  y: PAGE_MARGIN_PX,
  width: TEMPLATE_WIDTH - PAGE_MARGIN_PX * 2,
  height: TEMPLATE_HEIGHT - PAGE_MARGIN_PX * 2,
};

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const normalizeX = (value: number): number => Number((value / TEMPLATE_WIDTH).toFixed(6));
const normalizeY = (value: number): number => Number((value / TEMPLATE_HEIGHT).toFixed(6));

function normalizePixelRect(rect: PixelRect): Rect {
  return {
    x: normalizeX(rect.x),
    y: normalizeY(rect.y),
    width: normalizeX(rect.width),
    height: normalizeY(rect.height),
  };
}

function weightedSizes(total: number, weights: number[], gutter: number): number[] {
  const available = total - gutter * (weights.length - 1);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const sizes: number[] = [];
  let used = 0;
  let cumulativeWeight = 0;

  for (const weight of weights.slice(0, -1)) {
    cumulativeWeight += weight;
    const cumulativeSize = Math.round((available * cumulativeWeight) / weightSum);
    const size = cumulativeSize - used;
    sizes.push(size);
    used += size;
  }

  return [...sizes, available - used];
}

function splitRows(rect: PixelRect, weights: number[]): PixelRect[] {
  const heights = weightedSizes(rect.height, weights, PANEL_GUTTER_PX);
  let y = rect.y;

  return heights.map((height) => {
    const panel = { x: rect.x, y, width: rect.width, height };
    y += height + PANEL_GUTTER_PX;
    return panel;
  });
}

function splitColumns(rect: PixelRect, weights: number[]): PixelRect[] {
  const widths = weightedSizes(rect.width, weights, PANEL_GUTTER_PX);
  let x = rect.x;

  return widths.map((width) => {
    const panel = { x, y: rect.y, width, height: rect.height };
    x += width + PANEL_GUTTER_PX;
    return panel;
  });
}

function rowLayout(rowWeights: number[], columnWeightsByRow: number[][]): Rect[] {
  return splitRows(PAGE_FRAME_PX, rowWeights)
    .flatMap((row, index) => splitColumns(row, columnWeightsByRow[index] ?? [1]))
    .map(normalizePixelRect);
}

function alternatingHalfStackLayout(): Rect[] {
  const [topRow, bottomRow] = splitRows(PAGE_FRAME_PX, [1, 1]);
  const [topLeft, topRight] = splitColumns(topRow, [1, 1]);
  const [topRightTop, topRightBottom] = splitRows(topRight, [1, 1]);
  const [bottomLeft, bottomRight] = splitColumns(bottomRow, [1, 1]);
  const [bottomLeftTop, bottomLeftBottom] = splitRows(bottomLeft, [1, 1]);

  return [
    topLeft,
    topRightTop,
    topRightBottom,
    bottomLeftTop,
    bottomLeftBottom,
    bottomRight,
  ].map(normalizePixelRect);
}

function template(params: {
  id: string;
  panels: Rect[];
  ages: GraphicNovelAgeGroup[];
  uses: GraphicNovelPageRole[];
}): GraphicNovelPageTemplate {
  return {
    id: params.id,
    aspectRatio: '3:4',
    pageSize: { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT },
    templateFamily: 'graphic_novel_page',
    panelCount: params.panels.length,
    readingOrder: params.panels.map((_, index) => `p${index + 1}`),
    allowedAgeGroups: params.ages,
    bestUseCases: params.uses,
    panels: params.panels.map((rect, index) => ({
      id: `p${index + 1}`,
      rect,
    })),
  };
}

export const GRAPHIC_NOVEL_PAGE_TEMPLATES: GraphicNovelPageTemplate[] = [
  template({ id: 'T01', panels: rowLayout([1, 1], [[1], [1]]), ages: lowAges, uses: ['opening', 'setup'] }),
  template({ id: 'T04', panels: rowLayout([1, 1.1], [[1, 1], [1]]), ages: lowAndEarlyAges, uses: ['action', 'resolution'] }),
  template({ id: 'T06', panels: rowLayout([1, 1, 1], [[1], [1], [1]]), ages: earlyAgesWithRareSixToEight, uses: ['conversation', 'reflection'] }),
  template({ id: 'T08', panels: rowLayout([1, 1], [[1], [1, 1]]), ages: earlyAgesWithRareSixToEight, uses: ['action', 'resolution'] }),
  template({ id: 'T09', panels: rowLayout([1, 1, 1], [[1], [1, 1], [1]]), ages: conversationalAges, uses: ['opening', 'conversation', 'reflection'] }),
  template({ id: 'T10', panels: rowLayout([1, 1, 1], [[1, 1], [1], [1]]), ages: conversationalAges, uses: ['setup', 'reveal'] }),
  template({ id: 'T11', panels: rowLayout([1, 1], [[1, 1], [1, 1]]), ages: conversationalAges, uses: ['conversation', 'action'] }),
  template({ id: 'T12', panels: rowLayout([1, 1.2], [[1], [1, 1, 1]]), ages: conversationalAges, uses: ['action', 'resolution'] }),
  template({ id: 'T14', panels: rowLayout([1, 1.2], [[2, 1], [1, 1, 1]]), ages: dynamicAges, uses: ['setup', 'reveal'] }),
  template({ id: 'T15', panels: rowLayout([0.8, 0.7, 0.8], [[1, 1], [1, 1], [1]]), ages: dynamicAges, uses: ['action', 'reflection'] }),
  template({ id: 'T16', panels: rowLayout([1, 1.1], [[1, 1, 1], [1, 1]]), ages: dynamicAges, uses: ['reveal', 'resolution'] }),
  template({ id: 'T17', panels: rowLayout([1, 1], [[2, 1], [1, 2]]), ages: flexibleFourPanelAges, uses: ['conversation', 'action', 'reveal'] }),
  template({ id: 'T18', panels: alternatingHalfStackLayout(), ages: dynamicAges, uses: ['conversation', 'action', 'reveal'] }),
];

export function getTemplatesForAge(ageGroup: string): GraphicNovelPageTemplate[] {
  const normalized = (ageGroup || '4-5') as GraphicNovelAgeGroup;
  return GRAPHIC_NOVEL_PAGE_TEMPLATES.filter((template) =>
    template.allowedAgeGroups.includes(normalized)
  );
}
