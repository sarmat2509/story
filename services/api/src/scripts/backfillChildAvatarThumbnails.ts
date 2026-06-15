/**
 * Backfill small avatar thumbnails for child profile navigation.
 *
 * Reads existing turnaroundSheet.frontUrl, generates a 160x160 JPEG thumbnail,
 * uploads it as child_front_thumbnail, and stores the path in
 * turnaroundSheet.frontThumbnailUrl.
 *
 * Usage:
 *   cd services/api
 *   npx tsx src/scripts/backfillChildAvatarThumbnails.ts --limit=25
 *   npx tsx src/scripts/backfillChildAvatarThumbnails.ts --force --limit=10
 */

import './loadEnvForScripts';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { childProfiles } from '../db/schema';
import { getAssetStorageService } from '../services/assetStorageService';
import { logger } from '../utils/logger';

interface ScriptOptions {
  force: boolean;
  limit: number;
  offset: number;
}

type ChildTurnaroundSheet = {
  url: string;
  frontUrl?: string;
  frontThumbnailUrl?: string;
  generatedAt: string;
  sourcePhotoUrl?: string;
};

function parseNumberArg(name: string, defaultValue: number): number {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return defaultValue;
  const value = Number.parseInt(arg.split('=')[1] ?? '', 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid --${name} value: ${arg}`);
  }
  return value;
}

function parseOptions(): ScriptOptions {
  return {
    force: process.argv.includes('--force'),
    limit: parseNumberArg('limit', 25),
    offset: parseNumberArg('offset', 0),
  };
}

function extractStoragePath(url: string): string {
  const urlWithoutQuery = url.split('?')[0];
  const urlWithoutProtocol = urlWithoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return urlWithoutProtocol.replace(/^\/api\/v1\/assets\//, '');
}

async function backfillChildAvatarThumbnails() {
  const options = parseOptions();
  if (options.limit === 0) {
    throw new Error('--limit must be greater than 0');
  }

  const assetStorage = getAssetStorageService();
  const hasFront = and(
    isNotNull(childProfiles.turnaroundSheet),
    sql`${childProfiles.turnaroundSheet}->>'frontUrl' IS NOT NULL`,
  );

  const rows = await db
    .select({
      id: childProfiles.id,
      userId: childProfiles.userId,
      name: childProfiles.name,
      turnaroundSheet: childProfiles.turnaroundSheet,
    })
    .from(childProfiles)
    .where(
      options.force
        ? hasFront
        : and(hasFront, sql`${childProfiles.turnaroundSheet}->>'frontThumbnailUrl' IS NULL`),
    )
    .orderBy(childProfiles.id)
    .limit(options.limit)
    .offset(options.offset);

  logger.info(
    { count: rows.length, limit: options.limit, offset: options.offset, force: options.force },
    'Found child profiles needing avatar thumbnails',
  );

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of rows) {
    const turnaroundSheet = row.turnaroundSheet as ChildTurnaroundSheet | null;
    if (!turnaroundSheet?.frontUrl) {
      skipped++;
      continue;
    }

    try {
      if (options.force && turnaroundSheet.frontThumbnailUrl) {
        await assetStorage.deleteAsset(extractStoragePath(turnaroundSheet.frontThumbnailUrl))
          .catch((err) =>
            logger.warn(
              { err, childId: row.id, frontThumbnailUrl: turnaroundSheet.frontThumbnailUrl },
              'Failed to delete previous child avatar thumbnail before force backfill',
            ),
          );
      }

      const frontStoragePath = extractStoragePath(turnaroundSheet.frontUrl);
      const frontBuffer = await assetStorage.getAssetByPath(frontStoragePath);
      const thumbnailBuffer = await assetStorage.generateAvatarThumbnail(frontBuffer);
      const thumbnailUpload = await assetStorage.uploadUserPhoto({
        buffer: thumbnailBuffer,
        mimeType: 'image/jpeg',
        userId: row.userId,
        photoType: 'child_front_thumbnail',
      });

      await db
        .update(childProfiles)
        .set({
          turnaroundSheet: {
            ...turnaroundSheet,
            frontThumbnailUrl: thumbnailUpload.storagePath,
            sourcePhotoUrl: turnaroundSheet.sourcePhotoUrl ?? 'backfill',
          },
        } as any)
        .where(eq(childProfiles.id, row.id));

      processed++;
      logger.info(
        {
          childId: row.id,
          name: row.name,
          frontStoragePath,
          thumbnailStoragePath: thumbnailUpload.storagePath,
          thumbnailSize: thumbnailBuffer.length,
        },
        'Child avatar thumbnail backfilled',
      );
    } catch (err) {
      errors++;
      logger.error({ err, childId: row.id, name: row.name }, 'Failed to backfill child avatar thumbnail');
    }
  }

  logger.info({ processed, skipped, errors, total: rows.length }, 'Child avatar thumbnail backfill completed');
}

backfillChildAvatarThumbnails()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error({ err: error }, 'Child avatar thumbnail backfill failed');
    process.exit(1);
  });
