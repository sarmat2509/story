import { db } from '../db/index.js';
import { stories, audioAssets, assets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';

async function checkAudioState() {
  console.log('📖 Checking story:', storyId);
  console.log('='.repeat(80));
  
  // Get story
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  
  if (!story) {
    console.log('❌ Story not found');
    return;
  }
  
  console.log('\n📖 Story audioMetadata:');
  console.log(JSON.stringify(story.audioMetadata, null, 2));
  
  // Get all audio assets
  const audioRecords = await db
    .select({
      audioAsset: audioAssets,
      asset: assets
    })
    .from(audioAssets)
    .leftJoin(assets, eq(audioAssets.assetId, assets.id))
    .where(eq(audioAssets.storyId, storyId));
  
  console.log('\n🎵 Audio Assets in DB:');
  console.log(`Total records: ${audioRecords.length}`);
  
  audioRecords.forEach((record, i) => {
    console.log(`\n--- Record ${i + 1} ---`);
    console.log(`  Audio Asset ID: ${record.audioAsset.id}`);
    console.log(`  Asset ID: ${record.audioAsset.assetId}`);
    console.log(`  Scene Group Index: ${record.audioAsset.sceneGroupIndex}`);
    console.log(`  Is Final: ${record.audioAsset.isFinal}`);
    console.log(`  Retry Count: ${record.audioAsset.retryCount}`);
    console.log(`  Status: ${record.audioAsset.status}`);
    console.log(`  Duration: ${record.audioAsset.durationSeconds}s`);
    console.log(`  Created: ${record.audioAsset.createdAt}`);
    if (record.asset) {
      console.log(`  Storage Path: ${record.asset.storagePath}`);
      console.log(`  File Size: ${record.asset.fileSizeBytes} bytes`);
    }
  });
  
  // Analysis
  console.log('\n📊 Analysis:');
  const finalRecords = audioRecords.filter(r => r.audioAsset.isFinal === true);
  const partialRecords = audioRecords.filter(r => r.audioAsset.isFinal === false);
  
  console.log(`  Final audio records: ${finalRecords.length}`);
  console.log(`  Partial audio records: ${partialRecords.length}`);
  
  if (finalRecords.length === 0) {
    console.log('\n⚠️  NO FINAL AUDIO FOUND');
    console.log('   This is why the "Generate Audio" button should appear.');
  }
  
  if (finalRecords.length > 1) {
    console.log('\n⚠️  MULTIPLE FINAL AUDIO RECORDS');
    console.log('   Only one should be marked as final.');
  }
  
  if (partialRecords.length > 0) {
    console.log(`\n✅ ${partialRecords.length} partial chunk(s) available for reuse`);
  }
}

checkAudioState()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
