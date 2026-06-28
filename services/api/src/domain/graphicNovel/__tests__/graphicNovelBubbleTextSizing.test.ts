import assert from 'node:assert/strict';
import { measureGraphicNovelBubbleTextBox } from '../bubbleTextSizing';
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

function testShortSpeechStaysCompact(): void {
  const measured = measureGraphicNovelBubbleTextBox({
    kind: 'speech',
    panelRect: FIRST_PAGE_WIDE_PANEL,
    text: 'Так!',
  });

  assert.equal(measured.overflow, false);
  assert.ok(
    measured.width < 0.08,
    `short speech bubble should remain compact; got ${measured.width.toFixed(3)}`
  );
}

export async function runGraphicNovelBubbleTextSizingTests(): Promise<void> {
  testLongUkrainianSpeechGetsReadableWidth();
  testCaptionGetsReadableWidth();
  testShortSpeechStaysCompact();
}

if (require.main === module) {
  runGraphicNovelBubbleTextSizingTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
