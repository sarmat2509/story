// 68px collapsed drawer + 48px grid padding + 3 * 24px gaps + 4 * 260px cards
// needs 1228px. Round up so the four-column state has a little breathing room.
export const STORY_GRID_FOUR_COLUMN_BREAKPOINT = 1240;
export const STORY_GRID_GAP = 24;

export function getStoryGridColumnCount(viewportWidth: number): number {
  if (viewportWidth < 640) return 1;
  if (viewportWidth < 1024) return 2;
  if (viewportWidth < STORY_GRID_FOUR_COLUMN_BREAKPOINT) return 3;
  return 4;
}

export function calculateGridCardWidth(
  containerWidth: number,
  columns: number,
  gap: number
): number {
  if (containerWidth <= 0 || columns <= 0) return 0;
  return Math.max(0, (containerWidth - gap * (columns - 1)) / columns);
}

const SCENARIO_GRID_GAP = 12;
const SCENARIO_TWO_COLUMN_MIN_CARD_WIDTH = 210;
// Topic cards carry title and description overlays, so keep their three-column
// variant substantially wider than the compact two-column minimum.
const SCENARIO_THREE_COLUMN_MIN_CARD_WIDTH = 300;

export function getScenarioGridColumnCount(gridWidth: number): number {
  if (gridWidth >= SCENARIO_THREE_COLUMN_MIN_CARD_WIDTH * 3 + SCENARIO_GRID_GAP * 2) {
    return 3;
  }
  if (gridWidth >= SCENARIO_TWO_COLUMN_MIN_CARD_WIDTH * 2 + SCENARIO_GRID_GAP) {
    return 2;
  }
  return 1;
}
