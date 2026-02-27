import { db } from '../db';
import { assets } from '../db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { getAssetStorageService } from '../services/assetStorageService';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Backfill thumbnails for all existing scene images
 * 
 * This script generates 672×384px JPEG thumbnails for all existing scene images
 * that don't already have thumbnails. It reads the original images from storage,
 * generates thumbnails using sharp, and updates the database records.
 * 
 * Usage:
 *   Development:
 *     cd services/api
 *     npx tsx src/scripts/backfillThumbnails.ts
 * 
 *   Production (via Docker):
 *     docker exec kazka-api-prod sh -c 'cd /app/services/api && npx tsx src/scripts/backfillThumbnails.ts'
 */
async function backfillThumbnails() {
  logger.info('Starting thumbnail backfill...');

  // Find all scene images without thumbnails
  const imagesWithoutThumbs = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.assetType, 'image'),
        isNull(assets.thumbnailPath)
      )
    );

  logger.info({ count: imagesWithoutThumbs.length }, 'Found images without thumbnails');

  if (imagesWithoutThumbs.length === 0) {
    logger.info('No images to process. Exiting.');
    return;
  }

  const assetStorage = getAssetStorageService();
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const asset of imagesWithoutThumbs) {
    try {
      const originalPath = path.join(process.cwd(), 'uploads', asset.storagePath);
      
      // Check if original file exists
      try {
        await fs.access(originalPath);
      } catch {
        logger.warn({ assetId: asset.id, path: originalPath }, 'Original file not found, skipping');
        skipped++;
        continue;
      }

      // Read original image
      const originalBuffer = await fs.readFile(originalPath);

      // Generate thumbnail (672×384px JPEG, quality 80%)
      const thumbnailBuffer = await assetStorage.generateThumbnail(originalBuffer);

      // Determine thumbnail path (same directory, add _thumb suffix before extension)
      const ext = path.extname(asset.storagePath);
      const basename = path.basename(asset.storagePath, ext);
      const dirname = path.dirname(asset.storagePath);
      const thumbnailPath = path.join(dirname, `${basename}_thumb.jpg`);
      const thumbnailFullPath = path.join(process.cwd(), 'uploads', thumbnailPath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(thumbnailFullPath), { recursive: true });

      // Write thumbnail
      await fs.writeFile(thumbnailFullPath, thumbnailBuffer);

      // Update database
      await db
        .update(assets)
        .set({
          thumbnailPath: thumbnailPath,
          thumbnailUrl: `/api/v1/assets/${thumbnailPath}`,
        })
        .where(eq(assets.id, asset.id));

      processed++;
      
      // Log progress every 10 images
      if (processed % 10 === 0) {
        logger.info({ 
          processed, 
          errors,
          skipped,
          total: imagesWithoutThumbs.length,
          progress: `${Math.round((processed / imagesWithoutThumbs.length) * 100)}%`
        }, 'Backfill progress');
      }
    } catch (error) {
      errors++;
      logger.error({ 
        err: error, 
        assetId: asset.id,
        storagePath: asset.storagePath
      }, 'Failed to generate thumbnail');
    }
  }

  logger.info({ 
    processed, 
    errors, 
    skipped,
    total: imagesWithoutThumbs.length,
    successRate: `${Math.round((processed / imagesWithoutThumbs.length) * 100)}%`
  }, 'Thumbnail backfill completed');
}

// Run the backfill
backfillThumbnails()
  .then(() => {
    logger.info('Backfill script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Backfill script failed');
    process.exit(1);
  });
