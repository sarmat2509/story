import assert from 'node:assert';
import { renderPublishedStoryHtml } from '../renderPublishedStoryHtml';

const story = {
  id: 'story-1',
  title: 'Launch Story',
  fullText: 'A short launch story.',
  storyFormat: 'story' as const,
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

  const comicHtml = renderPublishedStoryHtml({
    story: {
      ...story,
      storyFormat: 'graphic_novel',
      comicPages: [
        {
          pageNumber: 1,
          pageRole: 'story',
          status: 'completed',
          imageUrl: '/api/v1/assets/comics/page-1.jpg',
          textOverlay: {
            mode: 'html_overlay',
            coordinateSpace: 'normalized_0_1',
            pageNumber: 1,
            pageSize: { width: 1024, height: 1536 },
            items: [
              {
                id: 'bubble-1',
                segmentId: 'segment-1',
                pageNumber: 1,
                panelIndex: 1,
                bubbleIndex: 1,
                readingOrder: 1,
                kind: 'speech',
                text: 'We found the moon key!',
                rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.12 },
              },
            ],
          },
        },
      ],
    },
    useStaticBody: true,
  });
  assert.match(comicHtml, /class="comic-page"/);
  assert.match(comicHtml, /comics\/page-1\.jpg/);
  assert.match(comicHtml, /We found the moon key!/);

  const mixedHtml = renderPublishedStoryHtml({
    story: {
      ...story,
      storyFormat: 'mixed_story',
      scenes: [
        { sceneId: 1, text: 'Prose comes first.' },
        { sceneId: 2, text: 'Internal comic source text.' },
      ],
      comicPages: [
        {
          pageNumber: 1,
          pageRole: 'story',
          status: 'completed',
          imageUrl: '/api/v1/assets/comics/mixed-1.jpg',
          textOverlay: null,
        },
      ],
      mixedStoryReadingOrder: [
        { screenOrder: 1, kind: 'prose', sceneId: 1, sourceSceneIds: [1], textSegmentIds: [] },
        { screenOrder: 2, kind: 'comic', pageNumber: 1, sourceSceneIds: [2], textSegmentIds: [] },
      ],
    },
    useStaticBody: true,
  });
  assert.ok(mixedHtml.indexOf('Prose comes first.') < mixedHtml.indexOf('mixed-1.jpg'));
  assert.doesNotMatch(
    mixedHtml.split('<script>window.__INITIAL_STORY__')[0] ?? mixedHtml,
    /Internal comic source text/
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
