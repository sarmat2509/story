import assert from 'node:assert';
import { Script, runInNewContext } from 'node:vm';
import { renderPublishedStoryHtml } from '../renderPublishedStoryHtml';
import { resolveVersionedWebBundleUrl } from '../webBundleUrl';

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
    authenticatedAppBundleUrl: 'https://wondertales.art/static/js/bundle.js?v=test',
  });
  assert.match(
    indexableHtml,
    /<meta name="robots" content="index,follow">/,
    'published story SSR remains indexable by default'
  );
  assert.match(indexableHtml, /data-authenticated-app-bootstrap/);
  assert.match(indexableHtml, /localStorage\.getItem\('auth-storage'\)/);
  assert.match(
    indexableHtml,
    /script\.src="https:\/\/wondertales\.art\/static\/js\/bundle\.js\?v=test"/
  );
  assert.doesNotMatch(indexableHtml, /\/app\/stories\//);
  assert.doesNotMatch(indexableHtml, /window\.__INITIAL_STORY__/);
  assert.doesNotMatch(indexableHtml, /<script\b[^>]*\bsrc=/i);
  assert.match(
    indexableHtml,
    /A short launch story\./,
    'published story SSR always renders its body'
  );
  const appBootstrap = indexableHtml.match(
    /<script data-authenticated-app-bootstrap>([\s\S]*?)<\/script>/
  )?.[1];
  assert.ok(appBootstrap, 'authenticated app bootstrap should be present');
  let appendedScript: { src?: string; defer?: boolean } | null = null;
  runInNewContext(appBootstrap, {
    window: {
      localStorage: {
        getItem: () =>
          JSON.stringify({
            state: { isAuthenticated: true, token: 'stored-browser-session' },
          }),
      },
    },
    document: {
      createElement: () => ({}),
      body: {
        appendChild: (script: { src?: string; defer?: boolean }) => {
          appendedScript = script;
        },
      },
    },
  });
  assert.deepEqual(appendedScript, {
    src: 'https://wondertales.art/static/js/bundle.js?v=test',
    defer: true,
  });
  appendedScript = null;
  runInNewContext(appBootstrap, {
    window: {
      localStorage: { getItem: () => null },
    },
    document: {
      createElement: () => ({}),
      body: {
        appendChild: (script: { src?: string; defer?: boolean }) => {
          appendedScript = script;
        },
      },
    },
  });
  assert.equal(appendedScript, null, 'guest SSR must not load the app bundle');

  const staticHtml = renderPublishedStoryHtml({ story });
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
  assert.match(
    staticHtml,
    /\.sidebar\{[^}]*max-height:calc\(100vh - 56px\)[^}]*overflow-y:auto/,
    'published story SSR keeps an independently scrollable desktop sidebar'
  );
  assert.match(
    staticHtml,
    /\.sidebar-sticky\{position:static\}/,
    'published story SSR does not trap tall sidebar content in a sticky child'
  );
  assert.match(
    staticHtml,
    /<aside class="sidebar"><div class="sidebar-sticky">[\s\S]*class="report-action report-action-sidebar"[\s\S]*<\/div><\/aside>/,
    'published story SSR renders the report action in the desktop sidebar'
  );
  const sidebarHtml = staticHtml.match(
    /<aside class="sidebar"><div class="sidebar-sticky">([\s\S]*?)<\/div><\/aside>/
  )?.[1];
  assert.ok(sidebarHtml, 'published story SSR should render a desktop sidebar');
  assert.equal(
    sidebarHtml.trim().endsWith('</a>'),
    true,
    'published story SSR keeps the report action last in the desktop sidebar'
  );
  assert.match(
    staticHtml,
    /class="report-action report-action-mobile"/,
    'published story SSR preserves the report action on mobile where the sidebar is hidden'
  );

  const audioHtml = renderPublishedStoryHtml({
    story: {
      ...story,
      share: {
        ...story.share,
        url: 'https://wondertales.art/stories/audio-story',
      },
      scenes: [{ sceneId: 1, text: 'Once upon a moonlit path.' }],
      audio: {
        url: '/api/v1/assets/audio/story.mp3',
        duration: 65,
        alignment: {
          words: [
            { text: 'Once', start: 0, end: 0.4 },
            { text: 'upon', start: 0.4, end: 0.8 },
          ],
        } as any,
      },
    },
  });
  assert.equal(
    (audioHtml.match(/<section class="sidebar-widget story-audio-widget [^"]+" data-story-audio-player/g) ?? []).length,
    2,
    'SSR renders equivalent desktop and mobile audio player placements'
  );
  assert.equal(
    (audioHtml.match(/<audio class="story-audio-native" controls/g) ?? []).length,
    2,
    'native controls remain available as the no-JavaScript fallback'
  );
  assert.match(audioHtml, /class="story-audio-play"/);
  assert.match(audioHtml, /class="story-audio-progress"/);
  assert.match(audioHtml, /class="story-audio-speed"/);
  assert.match(audioHtml, /class="story-audio-follow-input"/);
  assert.match(audioHtml, /Читай слідом за оповідачем/);
  assert.match(
    audioHtml,
    /data-alignment-url="\/api\/v1\/public\/stories\/audio-story\/alignment"/,
    'public SSR follows the cacheable public alignment route'
  );
  assert.match(
    audioHtml,
    /@media\(max-width:1023px\)\{[\s\S]*\.story-audio-widget-mobile\{display:block/,
    'mobile SSR exposes the audio player above the story content'
  );
  assert.doesNotMatch(
    audioHtml,
    /"words":\[/,
    'large alignment payload is not embedded into the SSR document'
  );
  const audioEnhancement = audioHtml.match(
    /<script data-published-story-audio>([\s\S]*?)<\/script>/
  )?.[1];
  assert.ok(audioEnhancement, 'SSR audio progressive enhancement is present');
  assert.doesNotThrow(() => new Script(audioEnhancement), 'SSR audio enhancement is valid JavaScript');

  const unlistedAudioHtml = renderPublishedStoryHtml({
    story: {
      ...story,
      audio: {
        url: '/api/v1/assets/audio/story.mp3',
        alignment: { words: [{ text: 'Once', start: 0, end: 0.4 }] } as any,
      },
    },
  });
  assert.match(
    unlistedAudioHtml,
    /data-alignment-url="\/api\/v1\/public\/u\/share-token\/alignment"/,
    'unlisted SSR keeps follow-along access behind the share token'
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
            pageSize: { width: 992, height: 1323 },
            textStyle: {
              fontSizePx: 15,
              lineHeightPx: 17,
              paddingXPx: 11,
              paddingYPx: 5,
              targetPageWidthPx: 992,
              targetPageHeightPx: 1323,
            },
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
  });
  assert.match(comicHtml, /class="comic-page"/);
  assert.match(comicHtml, /comics\/page-1\.jpg/);
  assert.match(comicHtml, /We found the moon key!/);
  assert.match(comicHtml, /--comic-font-size:1\.512097cqw/);
  assert.match(comicHtml, /--comic-line-height:1\.71371cqw/);
  assert.match(comicHtml, /--comic-padding-x:1\.108871cqw/);
  assert.match(comicHtml, /--comic-padding-y:0\.504032cqw/);
  assert.match(comicHtml, /\.comic-page-canvas\{[^}]*container-type:inline-size/);
  assert.match(comicHtml, /\.comic-bubble\{[^}]*font-size:var\(--comic-font-size\)/);
  assert.doesNotMatch(comicHtml, /max-width:900px|font-size:clamp\(/);

  assert.equal(
    resolveVersionedWebBundleUrl({
      webBundleUrl: '/apps/universal-app/index.bundle?platform=web&dev=true',
      webBuildId: 'release-123',
      nodeEnv: 'production',
    }),
    '/static/js/bundle.js?v=release-123',
    'production SSR replaces the development Metro URL with the deployed compatibility bundle'
  );
  assert.equal(
    resolveVersionedWebBundleUrl({
      webBundleUrl: '/apps/universal-app/index.bundle?platform=web&dev=true',
      webBuildId: 'dev',
      nodeEnv: 'development',
    }),
    '/apps/universal-app/index.bundle?platform=web&dev=true',
    'local development can still opt into the Metro bundle'
  );

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
  });
  assert.ok(mixedHtml.indexOf('Prose comes first.') < mixedHtml.indexOf('mixed-1.jpg'));
  assert.doesNotMatch(mixedHtml, /Internal comic source text/);

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
  });
  assert.doesNotMatch(
    artifactLeakAttemptHtml,
    /Secret Compass|artifact-1|artifact_collect|Collect|Забрати/,
    'published story SSR ignores artifact metadata and does not render collect affordances'
  );

  const unlistedHtml = renderPublishedStoryHtml({
    story,
    robots: 'noindex,nofollow',
  });
  assert.match(
    unlistedHtml,
    /<meta name="robots" content="noindex,nofollow">/,
    'unlisted story SSR can be rendered as noindex'
  );

  console.log('renderPublishedStoryHtml tests passed');
})();
