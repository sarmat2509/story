/**
 * Backfill Asset Scene IDs and Regenerate Signed URLs
 *
 * One-time script that:
 * 1. Links orphan image assets (scene_id IS NULL) to scene rows via visualPrompt matching
 * 2. Regenerates proper HMAC-signed URLs for ALL image assets
 *
 * Run: cd services/api && npx tsx src/scripts/backfillAssetSceneIds.ts
 */

import 'dotenv/config';
import { db } from '../db/index';
import { assets, scenes } from '../db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getAssetStorageService } from '../services/assetStorageService';

async function main() {
  console.log('=== Backfill Asset Scene IDs & Regenerate Signed URLs ===\n');

  // ── Step 1: Backfill scene_id on orphan image assets ──

  const orphanAssets = await db
    .select({
      id: assets.id,
      storyId: assets.storyId,
      storagePath: assets.storagePath,
      visualPrompt: sql<string | null>`${assets.generationParams}->>'visualPrompt'`,
    })
    .from(assets)
    .where(
      and(
        isNull(assets.sceneId),
        eq(assets.assetType, 'image'),
        eq(assets.status, 'completed')
      )
    );

  console.log(`Found ${orphanAssets.length} image assets with scene_id = NULL\n`);

  let linked = 0;
  let skipped = 0;

  for (const asset of orphanAssets) {
    if (!asset.visualPrompt) {
      console.log(`  SKIP ${asset.id} — no visualPrompt in generationParams`);
      skipped++;
      continue;
    }

    // Find matching scene by storyId + normalized visualPrompt
    const normalizedPrompt = asset.visualPrompt.trim().replace(/\s+/g, ' ');

    const [sceneMatch] = await db
      .select({ id: scenes.id, sceneId: scenes.sceneId })
      .from(scenes)
      .where(
        and(
          eq(scenes.storyId, asset.storyId),
          sql`TRIM(REGEXP_REPLACE(${scenes.visualPrompt}, '\\s+', ' ', 'g')) = ${normalizedPrompt}`
        )
      )
      .limit(1);

    if (sceneMatch) {
      await db
        .update(assets)
        .set({ sceneId: sceneMatch.id })
        .where(eq(assets.id, asset.id));
      console.log(`  LINKED ${asset.id} → scene ${sceneMatch.id} (sceneId=${sceneMatch.sceneId})`);
      linked++;
    } else {
      console.log(`  SKIP ${asset.id} — no matching scene for story ${asset.storyId}`);
      skipped++;
    }
  }

  console.log(`\nScene ID backfill: ${linked} linked, ${skipped} skipped\n`);

  // ── Step 2: Regenerate signed URLs for ALL image assets ──

  console.log('Regenerating signed URLs for all image assets...\n');

  const allImageAssets = await db
    .select({
      id: assets.id,
      storagePath: assets.storagePath,
    })
    .from(assets)
    .where(
      and(
        eq(assets.assetType, 'image'),
        eq(assets.status, 'completed')
      )
    );

  console.log(`Found ${allImageAssets.length} completed image assets to update\n`);

  const assetStorage = getAssetStorageService();
  let updated = 0;
  let errors = 0;

  for (const asset of allImageAssets) {
    try {
      const { signedUrl, expiresAt } = await assetStorage.generateSignedUrl(asset.storagePath, 24);

      await db
        .update(assets)
        .set({
          signedUrl,
          signedUrlExpiresAt: expiresAt,
        })
        .where(eq(assets.id, asset.id));

      updated++;
    } catch (err) {
      console.error(`  ERROR updating ${asset.id}:`, err);
      errors++;
    }
  }

  console.log(`\nSigned URL refresh: ${updated} updated, ${errors} errors`);
  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
