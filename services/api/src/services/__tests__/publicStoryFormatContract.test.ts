import assert from 'node:assert/strict';
import {
  clearRepositoryTestOverrides,
  installRepositoryTestOverrides,
} from '../../repositories';
import { buildStoryPublicView } from '../publicStoryService';

const storyId = 'a2222222-2222-4222-8222-222222222221';
const authorId = 'a1111111-1111-4111-8111-111111111111';

void (async function main() {
  installRepositoryTestOverrides({
    scene: {
      findByStoryIds: async () => [],
    } as any,
    asset: {
      findCompletedImagesByStoryIds: async () => [],
      findFinalCompletedAudioByStoryId: async () => null,
    } as any,
    graphicNovel: {
      findProjectByStoryId: async (id: string) =>
        id === storyId ? { id: 'project-1', storyId } : null,
      findPagesByProjectId: async () => [
        {
          id: 'page-row-1',
          projectId: 'project-1',
          pageNumber: 1,
          pageRole: 'story',
          status: 'completed',
          imageUrl: 'development/author/story/comic/page-1.jpg',
          layoutJson: { internalPrompt: 'must not be public' },
          bubbleLayoutJson: {
            rendererInternals: { secret: true },
            textOverlay: {
              mode: 'html_overlay',
              coordinateSpace: 'normalized_0_1',
              pageNumber: 1,
              pageSize: { width: 1024, height: 1536 },
              rawPlainText: 'internal audio form',
              items: [
                {
                  id: 'bubble-1',
                  htmlId: 'internal-html-id',
                  segmentId: 'segment-1',
                  pageNumber: 1,
                  panelId: 'panel-internal-id',
                  panelIndex: 1,
                  bubbleIndex: 1,
                  readingOrder: 1,
                  kind: 'speech',
                  speaker: 'Mira',
                  rawText: 'internal raw form',
                  text: '<b>We found the moon key!</b>',
                  audioText: 'internal audio form',
                  rect: { x: 0.1, y: 0.2, width: 0.35, height: 0.12 },
                },
              ],
            },
          },
        },
      ],
    } as any,
    user: {
      findPublicAuthorById: async (id: string) =>
        id === authorId
          ? { id: authorId, displayName: 'Mira Author', avatarUrl: null }
          : null,
    } as any,
    childProfile: {
      findPublicChildAuthorById: async () => null,
    } as any,
  });

  try {
    const story = await buildStoryPublicView(
      {
        id: storyId,
        userId: authorId,
        authorType: 'user',
        title: 'Moon Key',
        fullText: 'A prose opening. We found the moon key!',
        scenes: [
          {
            sceneId: 1,
            text: 'A prose opening.',
            mixedStoryBlockKind: 'prose',
            mixedStoryScreenOrder: 1,
          },
          {
            sceneId: 2,
            text: 'We found the moon key!',
            mixedStoryBlockKind: 'comic',
            mixedStoryScreenOrder: 2,
            graphicNovelPageNumber: 1,
          },
        ],
        metadata: {
          storyFormat: 'mixed_story',
          mixedStoryReadingOrder: [
            {
              screenOrder: 1,
              kind: 'prose',
              sceneId: 1,
              sourceSceneIds: [1],
              textSegmentIds: ['prose-1'],
            },
            {
              screenOrder: 2,
              kind: 'comic',
              pageNumber: 1,
              sourceSceneIds: [2],
              textSegmentIds: ['segment-1'],
            },
          ],
        },
        publishedAt: new Date('2026-07-01T12:00:00.000Z'),
        publicRenderVersion: 1,
      },
      'moon-key',
      { shareToken: 'share-token' }
    );

    assert.equal(story.storyFormat, 'mixed_story');
    assert.deepStrictEqual(story.mixedStoryReadingOrder?.map(({ screenOrder, kind }) => ({ screenOrder, kind })), [
      { screenOrder: 1, kind: 'prose' },
      { screenOrder: 2, kind: 'comic' },
    ]);
    assert.equal(story.comicPages?.length, 1);
    assert.equal(
      story.comicPages?.[0]?.imageUrl,
      '/api/v1/assets/development/author/story/comic/page-1.jpg?shareToken=share-token'
    );
    assert.equal(story.comicPages?.[0]?.textOverlay?.items[0]?.text, 'We found the moon key!');
    assert.deepStrictEqual(story.comicPages?.[0]?.textOverlay?.items[0]?.rect, {
      x: 0.1,
      y: 0.2,
      width: 0.35,
      height: 0.12,
    });

    const serialized = JSON.stringify(story.comicPages);
    assert.doesNotMatch(serialized, /internalPrompt|rendererInternals|rawPlainText|rawText|audioText|panel-internal-id/);
  } finally {
    clearRepositoryTestOverrides();
  }

  console.log('public story format contract tests passed');
})();
