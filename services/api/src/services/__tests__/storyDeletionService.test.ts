import assert from 'node:assert';
import { collectStoryDeletionStoragePaths } from '../storyDeletionService';

void (async function main() {
  const paths = collectStoryDeletionStoragePaths({
    assets: [
      {
        storagePath: 'development/user/story/image/scene-1.png',
        thumbnailPath: 'development/user/story/image/scene-1_thumb.jpg',
      },
      {
        storagePath: 'development/user/story/audio/final.mp3',
        thumbnailPath: null,
      },
    ],
    imageValidationRows: [
      {
        imageStoragePath: 'development/user/story/rejected/scene1_attempt1.png',
      },
      {
        imageStoragePath: 'development/user/story/image/scene-1.png',
      },
    ],
  });

  assert.deepStrictEqual(
    paths,
    [
      'development/user/story/image/scene-1.png',
      'development/user/story/image/scene-1_thumb.jpg',
      'development/user/story/audio/final.mp3',
      'development/user/story/rejected/scene1_attempt1.png',
    ],
    'story deletion should collect unique asset, thumbnail, audio, and rejected validation paths'
  );

  console.log('storyDeletionService tests passed');
})();
