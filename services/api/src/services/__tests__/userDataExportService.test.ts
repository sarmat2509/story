import assert from 'node:assert';
import {
  omitKeys,
  sanitizeAssetForDataExport,
  sanitizeStoryForDataExport,
  sanitizeUserForDataExport,
  serializeForDataExport,
} from '../userDataExportService';

void (async function main() {
  assert.deepStrictEqual(
    serializeForDataExport({
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      nested: [{ value: undefined }, { value: 1 }],
    }),
    {
      createdAt: '2026-05-01T10:00:00.000Z',
      nested: [{ value: null }, { value: 1 }],
    }
  );

  assert.deepStrictEqual(
    omitKeys({ keep: 'yes', remove: 'no' }, ['remove']),
    { keep: 'yes' }
  );

  const userExport = sanitizeUserForDataExport({
    id: 'user-id',
    email: 'parent@example.com',
    passwordHash: 'hash-should-not-export',
  } as any);
  assert.strictEqual(userExport.passwordHash, undefined);
  assert.strictEqual(userExport.email, 'parent@example.com');

  const storyExport = sanitizeStoryForDataExport({
    id: 'story-id',
    title: 'Story',
    shareToken: 'secret-share-token',
  } as any);
  assert.strictEqual(storyExport.shareToken, undefined);
  assert.strictEqual(storyExport.title, 'Story');

  const assetExport = sanitizeAssetForDataExport({
    id: 'asset-id',
    storagePath: 'development/user/story/image.png',
    signedUrl: 'https://signed.example/token',
    signedUrlExpiresAt: new Date('2026-05-01T11:00:00.000Z'),
  } as any);
  assert.strictEqual(assetExport.signedUrl, undefined);
  assert.strictEqual(assetExport.signedUrlExpiresAt, undefined);
  assert.strictEqual(assetExport.storagePath, 'development/user/story/image.png');

  console.log('userDataExportService tests passed');
})();
