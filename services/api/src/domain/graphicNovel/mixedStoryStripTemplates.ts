import type {
  GraphicNovelAgeGroup,
  GraphicNovelPageRole,
  GraphicNovelPageTemplate,
  Rect,
} from './types';

export const MIXED_STORY_STRIP_PAGE_SIZE = {
  width: 1536,
  height: 768,
};

const ALL_AGES: GraphicNovelAgeGroup[] = ['0-1', '1y', '2-3', '4-5', '6-8', '9-12'];
const ALL_USES: GraphicNovelPageRole[] = [
  'opening',
  'setup',
  'conversation',
  'action',
  'reveal',
  'reflection',
  'resolution',
];

const PAGE_MARGIN_X = 0.032;
const PAGE_MARGIN_Y = 0.055;
const GUTTER = 0.022;
const FRAME: Rect = {
  x: PAGE_MARGIN_X,
  y: PAGE_MARGIN_Y,
  width: 1 - PAGE_MARGIN_X * 2,
  height: 1 - PAGE_MARGIN_Y * 2,
};

function columns(weights: number[]): Rect[] {
  const available = FRAME.width - GUTTER * (weights.length - 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let x = FRAME.x;
  return weights.map((weight, index) => {
    const width =
      index === weights.length - 1
        ? FRAME.x + FRAME.width - x
        : Number(((available * weight) / totalWeight).toFixed(6));
    const rect = { x, y: FRAME.y, width, height: FRAME.height };
    x = Number((x + width + GUTTER).toFixed(6));
    return rect;
  });
}

function template(id: string, panels: Rect[]): GraphicNovelPageTemplate {
  return {
    id,
    aspectRatio: '2:1',
    pageSize: MIXED_STORY_STRIP_PAGE_SIZE,
    templateFamily: 'mixed_story_strip',
    panelCount: panels.length,
    readingOrder: panels.map((_, index) => `p${index + 1}`),
    allowedAgeGroups: ALL_AGES,
    bestUseCases: ALL_USES,
    panels: panels.map((rect, index) => ({
      id: `p${index + 1}`,
      rect,
    })),
  };
}

export const MIXED_STORY_STRIP_TEMPLATES: GraphicNovelPageTemplate[] = [
  template('MS01_FULL_WIDTH', columns([1])),
  template('MS02_HALF_HALF', columns([1, 1])),
  template('MS03_THIRDS', columns([1, 1, 1])),
  template('MS04_THIRD_TWO_THIRDS', columns([1, 2])),
  template('MS05_TWO_THIRDS_THIRD', columns([2, 1])),
];
