import assert from 'node:assert';
import { collectEntityAssetPaths } from '../entityAssetCleanupService';

void (async function main() {
  assert.deepStrictEqual(
    collectEntityAssetPaths({
      referencePhotos: [
        { url: '/api/v1/assets/development/user/photos/profile/avatar.jpg?token=abc' },
      ],
    }),
    ['development/user/photos/profile/avatar.jpg'],
    'account deletion can reuse entity asset collection for profile avatar URLs'
  );

  assert.deepStrictEqual(
    collectEntityAssetPaths({
      referencePhotos: [
        { url: '/api/v1/assets/development/user/photos/child/ref.jpg' },
      ],
      turnaroundSheet: {
        url: '/api/v1/assets/development/user/photos/child/sheet.png',
        frontUrl: '/api/v1/assets/development/user/photos/child/front.png',
        sourcePhotoUrl: '/api/v1/assets/development/user/photos/child/source.jpg',
      },
    }),
    [
      'development/user/photos/child/ref.jpg',
      'development/user/photos/child/sheet.png',
      'development/user/photos/child/front.png',
      'development/user/photos/child/source.jpg',
    ],
    'account deletion collects child or character reference and turnaround files'
  );

  console.log('userDeletionService tests passed');
})();
