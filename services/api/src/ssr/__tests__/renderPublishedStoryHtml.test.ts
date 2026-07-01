import assert from 'node:assert';
import { renderPublishedStoryHtml } from '../renderPublishedStoryHtml';

const story = {
  id: 'story-1',
  title: 'Launch Story',
  fullText: 'A short launch story.',
  scenes: [],
  author: {
    id: 'author-1',
    displayName: 'WonderTales',
    avatarUrl: null,
  },
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
  const staticHtml = renderPublishedStoryHtml({ story, useStaticBody: true });
  assert.match(
    staticHtml,
    /\.report-action\{[^}]*transition:transform \.18s ease/,
    'report action should transition the hover lift'
  );
  assert.match(
    staticHtml,
    /\.report-action:hover\{[^}]*transform:translateY\(-1px\)/,
    'report action should use the shared hover lift'
  );
  assert.match(
    staticHtml,
    /href="[^"]+\/authors\/author-1"/,
    'published story SSR links public author pages when author id is present'
  );

  const artifactLeakAttemptHtml = renderPublishedStoryHtml({
    story: {
      ...story,
      fullText: 'A plain public story.',
      scenes: [
        {
          sceneId: 1,
          text: 'A plain scene without collectible controls.',
          artifactMention: { artifactId: 'artifact-1', label: 'Secret Compass' },
          textSegments: [
            { type: 'text', text: 'A plain scene with ' },
            { type: 'artifact', text: 'Secret Compass', label: 'Secret Compass' },
          ],
        },
      ],
      closingArtifact: {
        id: 'artifact-1',
        title: 'Secret Compass',
        imageUrl: '/artifact.png',
      },
      closingKeepsakeLabel: 'Secret Compass',
    } as any,
    useStaticBody: true,
  });
  assert.doesNotMatch(
    artifactLeakAttemptHtml,
    /Secret Compass|artifact-1|artifact_collect|Collect|Забрати/,
    'published story SSR ignores artifact metadata and does not render collect affordances'
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
