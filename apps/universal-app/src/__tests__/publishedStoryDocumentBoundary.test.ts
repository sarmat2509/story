import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const storiesApiSource = readFileSync(resolve(process.cwd(), 'src/api/stories.ts'), 'utf8');

assert.match(
  appSource,
  /PublishedStory:\s*APP_ROUTE_PATHS\.publishedStory/,
  'SSR and app story navigation should share the canonical /stories/:slug route'
);
assert.doesNotMatch(appSource, /publishedStoryApp|app\/stories/);

assert.match(
  storiesApiSource,
  /export function usePublicStory[\s\S]*?queryKey:\s*\['public-story', slug\][\s\S]*?enabled:\s*!!slug && enabled/,
  'public story queries should be keyed and enabled by the current slug'
);
assert.doesNotMatch(
  storiesApiSource,
  /__INITIAL_STORY__|initialStoryRef|hasInitialStory/,
  'the app must not retain the first SSR story across slug changes'
);
assert.doesNotMatch(
  storiesApiSource,
  /__INITIAL_STORIES__|initialStoriesRef|hasInitialStories/,
  'the public catalog app query must not depend on an SSR hydration payload'
);

console.log('published story SSR/app document boundary regression guards passed');
