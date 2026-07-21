import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const storiesApiSource = readFileSync(resolve(process.cwd(), 'src/api/stories.ts'), 'utf8');
const publishedStorySource = readFileSync(
  resolve(process.cwd(), 'src/screens/published/PublishedStoryScreen.tsx'),
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
  /scene\.graphicNovelPageNumber \?\? scene\.sceneId[\s\S]*?story\.storyFormat === 'mixed_story'[\s\S]*?renderMixedContent/,
  'comic pages and mixed-story comic blocks should resolve their audio scene before rendering'
);
assert.doesNotMatch(
  storiesApiSource,
  /__INITIAL_STORIES__|initialStoriesRef|hasInitialStories/,
  'the public catalog app query must not depend on an SSR hydration payload'
);

console.log('published story SSR/app document boundary regression guards passed');
