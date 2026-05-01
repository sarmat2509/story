import assert from 'node:assert';
import path from 'node:path';
import {
  filterOrphanStoragePathsByMinimumAge,
  findOrphanStoragePaths,
  resolveStorageFilePath,
  shouldScanStorageFile,
} from '../orphanStorageCleanupService';
import { normalizeAssetStoragePath } from '../entityAssetCleanupService';

void (async function main() {
  assert.strictEqual(
    normalizeAssetStoragePath('/api/v1/assets/development/u/story/image.png?token=abc'),
    'development/u/story/image.png'
  );
  assert.strictEqual(
    normalizeAssetStoragePath('https://cdn.example.com/api/v1/assets/development/u/story/audio.mp3'),
    'development/u/story/audio.mp3'
  );
  assert.strictEqual(normalizeAssetStoragePath('favicon.ico'), null);

  assert.strictEqual(shouldScanStorageFile('development/u/story/image.png'), true);
  assert.strictEqual(shouldScanStorageFile('development/u/story/.DS_Store'), false);
  assert.strictEqual(shouldScanStorageFile('uploads/.gitkeep'), false);
  assert.strictEqual(shouldScanStorageFile('.cache/file.tmp'), false);
  assert.strictEqual(shouldScanStorageFile('development/.cache/file.tmp'), false);
  assert.strictEqual(shouldScanStorageFile('voice-samples/en/demo.mp3'), false);

  assert.deepStrictEqual(
    findOrphanStoragePaths(
      [
        'development/u/story/image.png',
        'development/u/story/orphan.png',
        'development/u/story/.DS_Store',
      ],
      ['development/u/story/image.png']
    ),
    ['development/u/story/orphan.png']
  );

  const root = path.resolve('/tmp/wondertales-uploads');
  assert.strictEqual(
    resolveStorageFilePath(root, 'development/u/story/orphan.png'),
    path.join(root, 'development/u/story/orphan.png')
  );
  assert.strictEqual(resolveStorageFilePath(root, '../outside.png'), null);

  const now = new Date('2026-05-01T12:00:00.000Z');
  assert.deepStrictEqual(
    filterOrphanStoragePathsByMinimumAge(
      [
        'development/u/story/old.png',
        'development/u/story/fresh.png',
        'development/u/story/missing.png',
      ],
      [
        {
          relativePath: 'development/u/story/old.png',
          mtimeMs: now.getTime() - 8 * 24 * 60 * 60 * 1000,
        },
        {
          relativePath: 'development/u/story/fresh.png',
          mtimeMs: now.getTime() - 2 * 60 * 60 * 1000,
        },
      ],
      7 * 24 * 60 * 60 * 1000,
      now
    ),
    ['development/u/story/old.png']
  );
  assert.deepStrictEqual(
    filterOrphanStoragePathsByMinimumAge(
      ['development/u/story/old.png', 'development/u/story/fresh.png'],
      [],
      0,
      now
    ),
    ['development/u/story/old.png', 'development/u/story/fresh.png']
  );

  console.log('orphanStorageCleanupService tests passed');
})();
