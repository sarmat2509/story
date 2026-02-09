#!/usr/bin/env tsx
/**
 * Update audio duration for final concatenated file
 */

import { db } from '../db/index.js';
import { audioAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const assetId = 'e5d6250a-291f-4c5e-a0c7-e074bfaf524f'; // Final audio
const correctDuration = 228.397279; // From ffprobe

async function updateDuration() {
  console.log('📝 Updating final audio duration...');
  console.log('Asset ID:', assetId);
  console.log('New Duration:', correctDuration, 'seconds');
  console.log('');
  
  await db
    .update(audioAssets)
    .set({ durationSeconds: correctDuration.toString() as any })
    .where(eq(audioAssets.assetId, assetId));
  
  console.log('✅ Duration updated successfully!');
}

updateDuration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
