import assert from 'node:assert/strict';
import {
  GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH_PX,
  graphicNovelBubbleTextSizingFromStoryTextSize,
  measureGraphicNovelBubbleTextBox,
} from '../bubbleTextSizing';
import type { Rect } from '../types';

const FIRST_PAGE_WIDE_PANEL: Rect = {
  x: 0.020182,
  y: 0.015137,
  width: 0.959635,
  height: 0.477539,
};

function testLongUkrainianSpeechGetsReadableWidth(): void {
  const measured = measureGraphicNovelBubbleTextBox({
    kind: 'speech',
    panelRect: FIRST_PAGE_WIDE_PANEL,
    text: 'Сьогодні на небі так спокійно. Усі кораблі летять за розкладом.',
  });

  assert.equal(measured.overflow, false);
  assert.ok(
    measured.width > 0.22,
    `long speech bubble should be wide enough for 20px bold text; got ${measured.width.toFixed(3)}`
  );
  assert.ok(measured.lineCount <= 4, 'speech should wrap within the expected line budget');
  assert.ok(
    measured.height > 0.055,
    `long speech bubble should reserve a balanced-wrap safety line; got ${measured.height.toFixed(3)}`
  );
}

function testCaptionGetsReadableWidth(): void {
  const measured = measureGraphicNovelBubbleTextBox({
    kind: 'caption',
    panelRect: FIRST_PAGE_WIDE_PANEL,
    text: 'Космічний маяк — найнадійніше місце у галактиці.',
  });

  assert.equal(measured.overflow, false);
  assert.ok(
    measured.width > 0.27,
    `caption bubble should fit balanced 20px text without narrow wrapping; got ${measured.width.toFixed(3)}`
  );
  assert.ok(measured.lineCount <= 2, 'caption should fit the expected two-line budget');
  assert.ok(
    measured.height > 0.045,
    `caption bubble should reserve a balanced-wrap safety line; got ${measured.height.toFixed(3)}`
  );
}

function testThreeLineCaptionDoesNotOverflow(): void {
  const measured = measureGraphicNovelBubbleTextBox({
    kind: 'caption',
    panelRect: {
      x: 0.02,
      y: 0.02,
      width: 0.96,
      height: 0.33,
    },
    text: 'Глибоко в джунглях Емілія та її друзі шукали стародавнє місто.',
  });

  assert.equal(measured.overflow, false);
  assert.equal(measured.lineCount, 3);
  assert.ok(
    measured.height > 0.055,
    `three-line caption should reserve enough text height; got ${measured.height.toFixed(3)}`
  );
}

function testShortSpeechStaysCompact(): void {
  const measured = measureGraphicNovelBubbleTextBox({
    kind: 'speech',
    panelRect: FIRST_PAGE_WIDE_PANEL,
    text: 'Так!',
  });

  assert.equal(measured.overflow, false);
  assert.ok(
    measured.width * GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH_PX < 120,
    `short speech bubble should remain compact; got ${Math.round(measured.width * GRAPHIC_NOVEL_BUBBLE_TEXT_TARGET_PAGE_WIDTH_PX)}px`
  );
}

function testStoryTextSizeChangesBubbleMeasurement(): void {
  const text = 'Сьогодні на небі так спокійно. Усі кораблі летять за розкладом.';
  const narrowPanel: Rect = {
    x: 0.1,
    y: 0.1,
    width: 0.26,
    height: 0.32,
  };
  const defaultMeasured = measureGraphicNovelBubbleTextBox({
    kind: 'speech',
    panelRect: narrowPanel,
    text,
  });
  const largeTextSizing = graphicNovelBubbleTextSizingFromStoryTextSize(26);
  const largeMeasured = measureGraphicNovelBubbleTextBox({
    kind: 'speech',
    panelRect: narrowPanel,
    text,
    textSizing: largeTextSizing,
  });

  assert.equal(largeMeasured.fontSizePx, 26);
  assert.ok(
    largeMeasured.height > defaultMeasured.height,
    `larger story text size should reserve taller bubbles; default=${defaultMeasured.height.toFixed(3)} large=${largeMeasured.height.toFixed(3)}`
  );
  assert.ok(
    largeMeasured.maxCharsPerLine < defaultMeasured.maxCharsPerLine,
    `larger story text size should reduce chars per line; default=${defaultMeasured.maxCharsPerLine} large=${largeMeasured.maxCharsPerLine}`
  );
}

export async function runGraphicNovelBubbleTextSizingTests(): Promise<void> {
  testLongUkrainianSpeechGetsReadableWidth();
  testCaptionGetsReadableWidth();
  testThreeLineCaptionDoesNotOverflow();
  testShortSpeechStaysCompact();
  testStoryTextSizeChangesBubbleMeasurement();
}

if (require.main === module) {
  runGraphicNovelBubbleTextSizingTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
