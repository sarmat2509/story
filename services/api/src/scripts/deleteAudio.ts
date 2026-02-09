#!/usr/bin/env tsx
/**
 * Delete audio for a story
 * Usage: npx tsx src/scripts/deleteAudio.ts <storyId>
 */

import { db } from '../db/index.js';
import { stories, audioAssets, assets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const storyId = process.argv[2];

if (!storyId) {
  console.error('❌ Usage: npx tsx src/scripts/deleteAudio.ts <storyId>');
  process.exit(1);
}

async function deleteAudio() {
  console.log('🔍 Checking story and audio assets...');

  // 1. Get story info
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story) {
    console.log('❌ Story not found');
    process.exit(1);
  }

  console.log('✅ Story found:', story.title);
  console.log('📊 Current audioMetadata:', story.audioMetadata);

  // 2. Get audio assets
  const audioAssetsData = await db
    .select({
      audioAsset: audioAssets,
      asset: assets,
    })
    .from(audioAssets)
    .leftJoin(assets, eq(audioAssets.assetId, assets.id))
    .where(eq(audioAssets.storyId, storyId));

  console.log('📝 Found', audioAssetsData.length, 'audio assets');

  if (audioAssetsData.length > 0) {
    for (const item of audioAssetsData) {
      console.log('  - Audio Asset ID:', item.audioAsset.id);
      console.log('    Asset ID:', item.asset?.id);
      console.log('    Storage Path:', item.asset?.storagePath);
      console.log('    Status:', item.audioAsset.status);
    }
    
    // 3. Delete audio assets (will cascade delete from assets due to FK)
    console.log('\n🗑️  Deleting audio assets...');
    await db.delete(audioAssets).where(eq(audioAssets.storyId, storyId));
    console.log('✅ Deleted audio assets');
    
    // 4. Clear audioMetadata from story
    console.log('\n🗑️  Clearing audioMetadata from story...');
    await db.update(stories)
      .set({ audioMetadata: null })
      .where(eq(stories.id, storyId));
    console.log('✅ Cleared audioMetadata');
    
    console.log('\n✅ Audio successfully deleted! You can now regenerate.');
  } else {
    console.log('\n⚠️  No audio assets found for this story');
    
    // Still clear audioMetadata if it exists
    if (story.audioMetadata) {
      console.log('🗑️  Clearing audioMetadata from story...');
      await db.update(stories)
        .set({ audioMetadata: null })
        .where(eq(stories.id, storyId));
      console.log('✅ Cleared audioMetadata');
    }
  }
}

deleteAudio()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
