import assert from 'node:assert';
import { renderPublicAuthorHtml } from '../renderPublicAuthorHtml';

void (async function main() {
  const html = renderPublicAuthorHtml({
    author: {
      id: 'author-1',
      displayName: 'Ava Author',
      aboutMe: 'Writes bright bedtime adventures.',
      avatarUrl: '/api/v1/assets/development/author/avatar.png',
    },
    total: 1,
    stories: [
      {
        id: 'story-1',
        title: 'The Moonlit Garden',
        language: 'en',
        ageGroup: '6-8',
        authorId: 'author-1',
        authorDisplayName: 'Ava Author',
        publishedAt: '2026-05-01T00:00:00.000Z',
        publishedSlug: 'moonlit-garden',
        scenes: [
          {
            sceneId: 1,
            text: 'A child found a singing flower.',
            imageUrl: '/api/v1/assets/development/story/image.png',
          },
        ],
        hasAudio: false,
        scenarioCardId: null,
        shareUrl: 'https://wondertales.art/stories/moonlit-garden',
      },
    ],
  });

  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<link rel="canonical" href="[^"]+\/authors\/author-1">/);
  assert.match(html, /<link rel="manifest" href="\/manifest\.json(?:\?v=[^"]+)?">/);
  assert.match(html, /Ava Author/);
  assert.match(html, /The Moonlit Garden/);
  assert.match(html, /\/stories\/moonlit-garden/);
  assert.doesNotMatch(html, /window\.__INITIAL_AUTHOR__/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /email/i, 'author SSR must not expose private account fields');

  console.log('renderPublicAuthorHtml tests passed');
})();
