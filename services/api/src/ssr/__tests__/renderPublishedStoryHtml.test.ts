import assert from 'node:assert';
import { renderPublishedStoryHtml } from '../renderPublishedStoryHtml';

const story = {
  id: 'story-1',
  title: 'Launch Story',
  fullText: 'A short launch story.',
  scenes: [],
  authorDisplayName: 'WonderTales',
  publishedAt: '2026-05-01T00:00:00.000Z',
  share: {
    url: 'https://wondertales.art/u/share-token',
    ogImageUrl: 'https://wondertales.art/share-card/story-1.png',
  },
  publicRenderVersion: 1,
};

void (async function main() {
  const indexableHtml = renderPublishedStoryHtml({
    story,
    useStaticBody: false,
  });
  assert.match(
    indexableHtml,
    /<meta name="robots" content="index,follow">/,
    'published story SSR remains indexable by default'
  );

  const unlistedHtml = renderPublishedStoryHtml({
    story,
    useStaticBody: false,
    robots: 'noindex,nofollow',
  });
  assert.match(
    unlistedHtml,
    /<meta name="robots" content="noindex,nofollow">/,
    'unlisted story SSR can be rendered as noindex'
  );

  console.log('renderPublishedStoryHtml tests passed');
})();
