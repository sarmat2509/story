import assert from 'node:assert';
import { decideStoryAssetAccess } from '../assetAccessService';

const ownerId = 'owner';
const otherId = 'other';

void (async function main() {
  const privateStory = {
    userId: ownerId,
    isPublished: false,
    visibility: 'public',
    publishedSlug: null,
    shareToken: null,
    hidden: false,
  };

  assert.deepStrictEqual(
    decideStoryAssetAccess({ story: privateStory }),
    { allowed: false, status: 401, reason: 'authentication_required' },
    'private story assets require authentication'
  );

  assert.deepStrictEqual(
    decideStoryAssetAccess({ story: privateStory, session: { userId: ownerId } }),
    { allowed: true, cacheControl: 'private', reason: 'owner_or_admin_session' },
    'owners can access private story assets with private cache headers'
  );

  assert.deepStrictEqual(
    decideStoryAssetAccess({ story: privateStory, session: { userId: otherId } }),
    { allowed: false, status: 403, reason: 'access_denied' },
    'other authenticated users cannot access private story assets'
  );

  assert.deepStrictEqual(
    decideStoryAssetAccess({
      story: {
        ...privateStory,
        isPublished: true,
        visibility: 'public',
        publishedSlug: 'public-slug',
      },
    }),
    { allowed: true, cacheControl: 'public', reason: 'public_catalog_story' },
    'public catalog story assets are public'
  );

  const unlistedStory = {
    ...privateStory,
    isPublished: true,
    visibility: 'unlisted',
    shareToken: 'share-secret',
  };

  assert.deepStrictEqual(
    decideStoryAssetAccess({ story: unlistedStory }),
    { allowed: false, status: 401, reason: 'authentication_required' },
    'unlisted story assets are not raw-public'
  );

  assert.deepStrictEqual(
    decideStoryAssetAccess({ story: unlistedStory, shareToken: 'share-secret' }),
    { allowed: true, cacheControl: 'public', reason: 'unlisted_share_token' },
    'unlisted story assets can load with the matching share token'
  );

  assert.deepStrictEqual(
    decideStoryAssetAccess({ story: privateStory, hasValidSignedUrl: true }),
    { allowed: true, cacheControl: 'public', reason: 'signed_asset_url' },
    'valid signed URLs remain supported for private assets'
  );

  assert.deepStrictEqual(
    decideStoryAssetAccess({
      story: { ...privateStory, hidden: true },
      session: { userId: ownerId },
      hasValidSignedUrl: true,
    }),
    { allowed: false, status: 404, reason: 'story_hidden' },
    'hidden stories do not serve assets to owners or signed links'
  );

  console.log('assetAccessService tests passed');
})();

