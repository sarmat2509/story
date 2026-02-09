#!/usr/bin/env tsx
/**
 * Check story audio assets
 */

import { db } from '../db/index.js';
import { stories, audioAssets, assets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const storyId = process.argv[2] || 'e393c49b-f5d9-40cd-90ff-f78efa027825';

async function checkAudioAssets() {
  console.log('🔍 Checking story audio metadata...\n');
  console.log('Story ID:', storyId);
  console.log('');

  // Get story
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);

  if (!story) {
    console.error('❌ Story not found');
    process.exit(1);
  }

  console.log('📖 Story audioMetadata:');
  console.log(JSON.stringify(story.audioMetadata, null, 2));
  console.log('');

  // Get all audio assets for this story
  const audioAssetsData = await db
    .select({
      audioAsset: audioAssets,
      asset: assets,
    })
    .from(audioAssets)
    .leftJoin(assets, eq(audioAssets.assetId, assets.id))
    .where(eq(audioAssets.storyId, storyId))
    .orderBy(audioAssets.createdAt);

  console.log('📦 Audio Assets (' + audioAssetsData.length + ' total):\n');

  for (const item of audioAssetsData) {
    console.log('Asset ID:', item.asset?.id);
    console.log('Storage Path:', item.asset?.storagePath);
    console.log('Duration:', item.audioAsset.durationSeconds, 'sec');
    console.log('Status:', item.audioAsset.status);
    console.log('Asset Type:', item.audioAsset.assetType || 'N/A');
    console.log('Group Index:', item.audioAsset.sceneGroupIndex);
    console.log('Created:', item.audioAsset.createdAt);
    console.log('---');
  }
}

checkAudioAssets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
