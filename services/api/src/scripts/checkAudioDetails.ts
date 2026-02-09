import { db } from '../db/index.js';
import { audioAssets, assets } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

async function checkAudioDetails() {
  const storyId = process.argv[2];

  if (!storyId) {
    console.log('Usage: npx tsx src/scripts/checkAudioDetails.ts <storyId>');
    process.exit(1);
  }

  const audioList = await db
    .select({
      audioAsset: audioAssets,
      asset: assets,
    })
    .from(audioAssets)
    .leftJoin(assets, eq(audioAssets.assetId, assets.id))
    .where(eq(audioAssets.storyId, storyId))
    .orderBy(desc(audioAssets.createdAt));

  console.log('🔊 Total audio records:', audioList.length);
  console.log('='.repeat(80));

  for (const record of audioList) {
    const audio = record.audioAsset;
    const asset = record.asset;

    console.log('\n📀 Audio Asset ID:', audio.id);
    console.log('   Asset ID:', audio.assetId);
    console.log('   Status:', audio.status);
    console.log(
      '   Scene Group Index:',
      audio.sceneGroupIndex === null ? '🎵 FINAL (null)' : audio.sceneGroupIndex
    );
    console.log('   Duration:', audio.durationSeconds, 'seconds');
    console.log('   Voice ID:', audio.voiceId || 'N/A');
    console.log(
      '   Text Hash:',
      audio.textHash?.substring(0, 20) + '...' || 'N/A'
    );
    console.log('   Created:', audio.createdAt);

    if (asset) {
      console.log('   📁 Storage URL:', asset.storageUrl);
      console.log('   📁 Asset Type:', asset.assetType);
      console.log('   📁 Asset Status:', asset.status);
    } else {
      console.log('   ⚠️  No asset record found!');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('LOGIC CHECK: How to identify FINAL audio?');
  console.log('='.repeat(80));
  console.log('✅ FINAL audio = sceneGroupIndex IS NULL');
  console.log('✅ Latest audio = ORDER BY createdAt DESC LIMIT 1');
  console.log('✅ Completed audio = status = "completed"');
  console.log('\nCombined query (what API should use):');
  console.log('  WHERE storyId = ? AND status = "completed"');
  console.log('  ORDER BY createdAt DESC LIMIT 1');
  console.log('  → This returns the LATEST completed audio (which is FINAL)');

  process.exit(0);
}

checkAudioDetails().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
