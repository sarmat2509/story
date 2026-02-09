import { db } from '../db/index.js';
import { stories, audioAssets, assets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';

async function deleteAudioForTesting() {
  console.log('🗑️  Deleting audio assets for story:', storyId);
  console.log('');

  // Get current audio assets
  const existingAudioAssets = await db
    .select()
    .from(audioAssets)
    .where(eq(audioAssets.storyId, storyId));

  console.log(`Found ${existingAudioAssets.length} audio assets to delete`);
  
  for (const audioAsset of existingAudioAssets) {
    console.log(`  - Audio asset: ${audioAsset.id} (asset ID: ${audioAsset.assetId})`);
  }
  console.log('');

  // Delete audio assets
  if (existingAudioAssets.length > 0) {
    await db
      .delete(audioAssets)
      .where(eq(audioAssets.storyId, storyId));
    console.log('✅ Deleted audio_assets records');
  }

  // Delete linked asset records
  for (const audioAsset of existingAudioAssets) {
    if (audioAsset.assetId) {
      await db
        .delete(assets)
        .where(eq(assets.id, audioAsset.assetId));
      console.log(`✅ Deleted asset record: ${audioAsset.assetId}`);
    }
  }

  // Clear story audioMetadata
  await db
    .update(stories)
    .set({ audioMetadata: null })
    .where(eq(stories.id, storyId));
  console.log('✅ Cleared story audioMetadata');
  console.log('');

  console.log('🎯 Story is ready for audio regeneration with text-to-dialogue API');
  console.log('');
  console.log('Next steps:');
  console.log('1. Go to /story/41115014-fcd2-412a-9b35-d6d942a41707');
  console.log('2. Click "Generate Audio" button');
  console.log('3. Wait for generation to complete');
  console.log('4. Listen to verify emotional tags work correctly');
  console.log('');

  process.exit(0);
}

deleteAudioForTesting().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
