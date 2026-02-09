import { db } from '../db/index.js';
import { audioAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function fixAudioDuration() {
  const audioAssetId = '7db95bd3-1388-4686-bf73-f0f6b1fa16ac';
  const correctDuration = 186.549116;

  console.log('Updating audio duration...');
  console.log('  Audio Asset ID:', audioAssetId);
  console.log('  Correct Duration:', correctDuration, 'seconds');

  await db
    .update(audioAssets)
    .set({ durationSeconds: correctDuration.toString() as any })
    .where(eq(audioAssets.id, audioAssetId));

  console.log('✅ Duration updated successfully!');

  // Verify
  const [updated] = await db
    .select()
    .from(audioAssets)
    .where(eq(audioAssets.id, audioAssetId));

  console.log('\nVerification:');
  console.log('  New Duration:', updated.durationSeconds, 'seconds');
  
  process.exit(0);
}

fixAudioDuration().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
