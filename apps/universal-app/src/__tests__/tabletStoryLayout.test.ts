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
  /const\s+tabletHeaderTitleMaxWidth\s*=\s*isTabletPortrait\s*\?\s*Math\.max\(240,\s*width\s*-\s*176\)/,
  'tablet story headers should calculate an explicit safe width from the viewport'
);
assert.match(
  storyViewerSource,
  /tabletHeaderTitleContainer:\s*\{[\s\S]*?right:\s*theme\.spacing\[20\]\s*\+\s*theme\.spacing\[4\]/,
  'tablet story header title content should reserve 96px on the right'
);
assert.match(
  storyViewerSource,
  /style=\{\[\s*styles\.tabletHeaderBreadcrumb,[\s\S]*?width:\s*tabletHeaderTitleMaxWidth,[\s\S]*?maxWidth:\s*tabletHeaderTitleMaxWidth/,
  'tablet breadcrumbs should wrap category and story titles together across two lines'
);
assert.match(
  storyViewerSource,
  /styles\.tabletHeaderTitleContainer,[\s\S]*?width:\s*tabletHeaderTitleMaxWidth,[\s\S]*?maxWidth:\s*tabletHeaderTitleMaxWidth/,
  'tablet navigation title container should use the explicit safe width'
);
assert.match(
  storyViewerSource,
  /style=\{\[\s*styles\.tabletHeaderTitle,[\s\S]*?width:\s*tabletHeaderTitleMaxWidth,[\s\S]*?maxWidth:\s*tabletHeaderTitleMaxWidth/,
  'tablet story titles without breadcrumbs should use the same explicit safe width'
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
assert.match(
  storyViewerSource,
  /leftColumn:\s*\{\s*flex:\s*1,\s*paddingHorizontal:\s*theme\.spacing\[6\]/s,
  'the story column should keep a 24px inset from the navigation'
);
assert.match(
  storyViewerSource,
  /rightColumnContent:\s*\{\s*paddingLeft:\s*0,/s,
  'the sidebar should not add a second inset to the 24px story-column gap'
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
