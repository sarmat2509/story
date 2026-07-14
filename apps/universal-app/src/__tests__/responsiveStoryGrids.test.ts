import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateGridCardWidth,
  getScenarioGridColumnCount,
  getStoryGridColumnCount,
  STORY_GRID_FOUR_COLUMN_BREAKPOINT,
} from '../utils/responsiveGridLayout';

assert.equal(getStoryGridColumnCount(639), 1);
assert.equal(getStoryGridColumnCount(768), 2);
assert.equal(getStoryGridColumnCount(1024), 3);
assert.equal(getStoryGridColumnCount(STORY_GRID_FOUR_COLUMN_BREAKPOINT - 1), 3);
assert.equal(getStoryGridColumnCount(STORY_GRID_FOUR_COLUMN_BREAKPOINT), 4);

// 1024 viewport - 68 collapsed drawer - 48 horizontal grid padding.
const landscapeTabletGridWidth = 1024 - 68 - 48;
assert.equal(Math.round(calculateGridCardWidth(landscapeTabletGridWidth, 3, 24)), 287);

// The topic grid gets two columns at the measured 1024px layout width.
assert.equal(getScenarioGridColumnCount(852), 2);
assert.equal(getScenarioGridColumnCount(923), 2);
assert.equal(getScenarioGridColumnCount(924), 3);

const srcRoot = resolve(process.cwd(), 'src');
const librarySource = readFileSync(resolve(srcRoot, 'screens/library/LibraryScreen.tsx'), 'utf8');
const publishedSource = readFileSync(
  resolve(srcRoot, 'screens/published/PublishedStoriesScreen.tsx'),
  'utf8'
);
const scenariosSource = readFileSync(
  resolve(srcRoot, 'screens/wizard/components/ScenarioCardsGrid.tsx'),
  'utf8'
);

assert.match(librarySource, /getStoryGridColumnCount\(width\)/);
assert.match(publishedSource, /getStoryGridColumnCount\(width\)/);
assert.match(
  scenariosSource,
  /styles\.grid\} onLayout=\{\(event\) => setGridWidth\(event\.nativeEvent\.layout\.width\)\}/,
  'topic cards should use the exact inner grid width, including container borders and padding'
);

console.log('responsive story-grid regression guards passed');
