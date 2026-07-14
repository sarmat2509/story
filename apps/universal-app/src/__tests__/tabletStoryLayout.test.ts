import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const srcRoot = resolve(process.cwd(), 'src');
const storyViewerSource = readFileSync(
  resolve(srcRoot, 'screens/story/StoryViewerScreen.tsx'),
  'utf8'
);
const navigatorSource = readFileSync(resolve(srcRoot, 'navigation/MainNavigator.tsx'), 'utf8');

assert.match(
  storyViewerSource,
  /const\s+isSingleColumn\s*=\s*isMobile\s*\|\|\s*isTabletPortrait/,
  'tablet portrait should use the same explicit single-column layout contract as mobile'
);
assert.match(
  storyViewerSource,
  /isTabletPortrait\s*\?\s*styles\.tabletHeaderTitleContainer/,
  'tablet story headers should reserve a dedicated title area beside the feedback action'
);
assert.match(
  storyViewerSource,
  /right:\s*theme\.spacing\[16\]/,
  'tablet story header title content should reserve 64px on the right'
);
assert.ok(
  (storyViewerSource.match(/isSingleColumn\s*&&\s*styles\.singleColumnMedia/g) ?? []).length >= 4,
  'all prose, placeholder, comic, and pending media should lose rounding in one-column mode'
);
assert.match(
  storyViewerSource,
  /style=\{\[styles\.mobileSectionWrapper,\s*styles\.readingTimeSection\]\}/,
  'single-column reading time should have spacing below it'
);
assert.match(
  storyViewerSource,
  /ref=\{quizSectionRef\}\s+style=\{styles\.singleColumnTextSection\}/,
  'post-story activities should align with story text padding in one-column mode'
);
assert.match(
  storyViewerSource,
  /singleColumnTextSection:\s*\{\s*paddingHorizontal:\s*theme\.spacing\[6\]/s,
  'post-story activities should use the same 24px horizontal padding as story text'
);
assert.ok(
  (navigatorSource.match(/numberOfLines=\{2\}/g) ?? []).length >= 2,
  'tablet navigation labels should wrap to a second line'
);
assert.match(
  navigatorSource,
  /tabLabel:\s*\{[\s\S]*?minHeight:\s*28,[\s\S]*?textAlign:\s*'center'/,
  'wrapped navigation labels should reserve two centered lines'
);

console.log('tablet story layout regression guards passed');
