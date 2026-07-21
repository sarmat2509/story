import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const storiesApiSource = readFileSync(resolve(process.cwd(), 'src/api/stories.ts'), 'utf8');
const publishedStorySource = readFileSync(
  resolve(process.cwd(), 'src/screens/published/PublishedStoryScreen.tsx'),
  'utf8'
);
const storyViewerSource = readFileSync(
  resolve(process.cwd(), 'src/screens/story/StoryViewerScreen.tsx'),
  'utf8'
);

assert.match(
  appSource,
  /PublishedStory:\s*APP_ROUTE_PATHS\.publishedStory/,
  'SSR and app story navigation should share the canonical /stories/:slug route'
);
assert.doesNotMatch(appSource, /publishedStoryApp|app\/stories/);

assert.match(
  storiesApiSource,
  /export function usePublicStory[\s\S]*?queryKey:\s*\['public-story', slug, authenticated \? 'authenticated' : 'anonymous'\][\s\S]*?enabled:\s*!!slug && enabled/,
  'public story queries should be keyed by slug and authentication state'
);
assert.doesNotMatch(
  storiesApiSource,
  /__INITIAL_STORY__|initialStoryRef|hasInitialStory/,
  'the app must not retain the first SSR story across slug changes'
);

assert.match(
  publishedStorySource,
  /const renderComicTextItem[\s\S]*?findComicSceneIndex\(page\.pageNumber\)[\s\S]*?renderAlignedTextContent\(text, sceneIndex\)[\s\S]*?\{highlightedText \?\? text\}/,
  'the authenticated published-story app should render aligned text inside comic overlays'
);
assert.match(
  publishedStorySource,
  /const activeComicPanelKey = activeComicTextItem[\s\S]*?comicPanelKey\(activeComicTextItem\.pageNumber, activeComicTextItem\.panelIndex\)/,
  'the published-story app should use page and panel, not bubble, as its scroll identity'
);
assert.match(
  publishedStorySource,
  /comicPanelRefs\.current\[activeComicPanelKey\][\s\S]*?scrollTargetToViewportCenter\(panel \?\? sceneRefs\.current\[activeSceneIndex\]\)/,
  'the published-story app should center the full panel anchor with a page fallback'
);
assert.match(
  publishedStorySource,
  /scrollViewportHeight > 0 \? y \+ height \/ 2 - scrollViewportHeight \/ 2/,
  'native published stories should center the target bounds in the viewport'
);
assert.match(
  storyViewerSource,
  /const activeGraphicNovelPanelKey = activeGraphicNovelTextItem[\s\S]*?graphicNovelPanelKey\([\s\S]*?panelIndex[\s\S]*?scrollTargetToViewportCenter\(panelElement \?\? sceneRefs\.current\[activeSceneIndex\]\)/,
  'the signed-in story viewer should also center a stable full-panel target'
);
assert.match(
  publishedStorySource,
  /scene\.graphicNovelPageNumber \?\? scene\.sceneId[\s\S]*?story\.storyFormat === 'mixed_story'[\s\S]*?renderMixedContent/,
  'comic pages and mixed-story comic blocks should resolve their audio scene before rendering'
);
assert.doesNotMatch(
  storiesApiSource,
  /__INITIAL_STORIES__|initialStoriesRef|hasInitialStories/,
  'the public catalog app query must not depend on an SSR hydration payload'
);

const earlyReturnsIndex = publishedStorySource.indexOf(
  '// ── Early returns after all hooks'
);
assert.ok(earlyReturnsIndex > 0, 'published story should mark its early-return boundary');
assert.doesNotMatch(
  publishedStorySource.slice(earlyReturnsIndex),
  /\buse(?:State|Effect|LayoutEffect|Memo|Callback|Ref)\s*(?:<[^>]+>)?\s*\(/,
  'published story must not declare hooks after early returns'
);

console.log('published story SSR/app document boundary regression guards passed');
