import { db } from '../db/index.js';
import { stories, audioAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';
const audioAssetId = '7db95bd3-1388-4686-bf73-f0f6b1fa16ac';

async function fixAudioState() {
  console.log('🔧 Fixing audio state for story:', storyId);
  console.log('='.repeat(80));
  
  // Step 1: Mark existing audio as partial chunk #1
  console.log('\n1️⃣  Marking audio as partial chunk (sceneGroupIndex=1)...');
  await db
    .update(audioAssets)
    .set({
      sceneGroupIndex: 1,
      isFinal: false,
    })
    .where(eq(audioAssets.id, audioAssetId));
  
  console.log('✅ Audio asset updated');
  
  // Step 2: Update story metadata to show error (trigger retry UI)
  console.log('\n2️⃣  Updating story audioMetadata...');
  await db.execute(sql`
    UPDATE stories
    SET audio_metadata = jsonb_set(
      COALESCE(audio_metadata, '{}'::jsonb),
      '{error}',
      'true'::jsonb
    )
    WHERE id = ${storyId}
  `);
  
  console.log('✅ Story metadata updated with error flag');
  
  // Verify
  console.log('\n📊 Verification:');
  console.log('='.repeat(80));
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  const [audioAsset] = await db.select().from(audioAssets).where(eq(audioAssets.id, audioAssetId));
  
  console.log('\n📖 Story audioMetadata:');
  console.log(JSON.stringify(story.audioMetadata, null, 2));
  
  console.log('\n🎵 Audio asset state:');
  console.log(`  ID: ${audioAsset.id}`);
  console.log(`  Scene Group Index: ${audioAsset.sceneGroupIndex}`);
  console.log(`  Is Final: ${audioAsset.isFinal}`);
  console.log(`  Status: ${audioAsset.status}`);
  console.log(`  Duration: ${audioAsset.durationSeconds}s`);
  
  console.log('\n✅ Fix complete!');
  console.log('='.repeat(80));
  console.log('\n📝 Next steps:');
  console.log('   1. Reload story page in browser');
  console.log('   2. Should see "Generate Audio" button with warning');
  console.log('   3. Click button to regenerate');
  console.log('   4. System will reuse existing chunk #1 and generate only #0 and #2');
  console.log('   5. Final audio will be concatenated from all 3 chunks');
}

fixAudioState()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
