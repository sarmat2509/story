/**
 * Backfill front images for existing turnaround sheets.
 *
 * Extracts the front (first) character view from turnaround images that don't
 * yet have frontUrl, uploads them, and updates the database.
 *
 * Usage:
 *   pnpm api:script npx tsx src/scripts/backfillTurnaroundFront.ts
 *   pnpm api:script npx tsx src/scripts/backfillTurnaroundFront.ts --force  # re-extract even if frontUrl exists
 */

import { db } from '../db';
import { characters, childProfiles } from '../db/schema';
import { sql, and, isNotNull } from 'drizzle-orm';
import { getAssetStorageService } from '../services/assetStorageService';
import { getCharacterRepository, getChildProfileRepository } from '../repositories';
import { extractFrontFromTurnaround, type RightEdgeDebug } from '../services/turnaroundFrontExtractor';
import { logger } from '../utils/logger';

function extractStoragePath(url: string): string {
  const urlWithoutQuery = url.split('?')[0];
  const urlWithoutProtocol = urlWithoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return urlWithoutProtocol.replace(/^\/api\/v1\/assets\//, '');
}

async function backfillTurnaroundFront() {
  const force = process.argv.includes('--force');
  logger.info({ force }, 'Starting turnaround front backfill...');

  const assetStorage = getAssetStorageService();
  const characterRepo = getCharacterRepository();
  const childProfileRepo = getChildProfileRepository();

  // Base condition: has turnaround url
  const hasTurnaround = and(
    isNotNull(characters.turnaroundSheet),
    sql`${characters.turnaroundSheet}->>'url' IS NOT NULL`,
  );

  const charsNeedingFront = await db
    .select({ id: characters.id, userId: characters.userId, name: characters.name, turnaroundSheet: characters.turnaroundSheet })
    .from(characters)
    .where(
      force
        ? hasTurnaround
        : and(hasTurnaround, sql`${characters.turnaroundSheet}->>'frontUrl' IS NULL`),
    );

  const childHasTurnaround = and(
    isNotNull(childProfiles.turnaroundSheet),
    sql`${childProfiles.turnaroundSheet}->>'url' IS NOT NULL`,
  );

  const childrenNeedingFront = await db
    .select({ id: childProfiles.id, userId: childProfiles.userId, name: childProfiles.name, turnaroundSheet: childProfiles.turnaroundSheet })
    .from(childProfiles)
    .where(
      force
        ? childHasTurnaround
        : and(childHasTurnaround, sql`${childProfiles.turnaroundSheet}->>'frontUrl' IS NULL`),
    );

  const total = charsNeedingFront.length + childrenNeedingFront.length;

  // Diagnostic: show total with turnaround if 0
  if (total === 0) {
    const [charTotal] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(characters)
      .where(and(isNotNull(characters.turnaroundSheet), sql`${characters.turnaroundSheet}->>'url' IS NOT NULL`));
    const [childTotal] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(childProfiles)
      .where(and(isNotNull(childProfiles.turnaroundSheet), sql`${childProfiles.turnaroundSheet}->>'url' IS NOT NULL`));
    logger.info(
      { totalWithTurnaround: (charTotal?.count ?? 0) + (childTotal?.count ?? 0), characters: charTotal?.count ?? 0, children: childTotal?.count ?? 0 },
      'No records to process. Total with turnaround (may already have frontUrl)',
    );
    logger.info('No records to process. Exiting.');
    return;
  }

  logger.info({ characters: charsNeedingFront.length, children: childrenNeedingFront.length, total, force }, 'Found records needing front extraction');

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const char of charsNeedingFront) {
    try {
      const ts = char.turnaroundSheet as { url: string; generatedAt: string; sourcePhotoUrl?: string } | null;
      if (!ts?.url) {
        skipped++;
        continue;
      }

      const storagePath = extractStoragePath(ts.url);
      const buffer = await assetStorage.getAssetByPath(storagePath);
      if (!buffer) {
        logger.warn({ characterId: char.id, path: storagePath }, 'Turnaround asset not found, skipping');
        skipped++;
        continue;
      }

      const frontBuffer = await extractFrontFromTurnaround(buffer, {
        onRightEdge: (d: RightEdgeDebug) =>
          logger.info(
            { characterId: char.id, chosenMethod: d.chosenMethod, delta: d.delta, edgePure: d.edgePure, edgeSoft: d.edgeSoft, rightEdge: d.rightEdge },
            'Front extraction right edge',
          ),
      });
      if (!frontBuffer) {
        logger.warn({ characterId: char.id }, 'Front extraction returned null, skipping');
        skipped++;
        continue;
      }

      const frontUpload = await assetStorage.uploadUserPhoto({
        buffer: frontBuffer,
        mimeType: 'image/png',
        userId: char.userId,
        photoType: 'character_front' as const,
      });

      await characterRepo.updateTurnaroundSheet(char.id, {
        url: ts.url,
        frontUrl: frontUpload.storagePath,
        generatedAt: ts.generatedAt,
        sourcePhotoUrl: ts.sourcePhotoUrl ?? 'backfill',
      });

      processed++;
      if (processed % 5 === 0) {
        logger.info({ processed, errors, skipped, total }, 'Backfill progress');
      }
    } catch (err) {
      errors++;
      logger.error({ err, characterId: char.id, name: char.name }, 'Failed to backfill character front');
    }
  }

  for (const child of childrenNeedingFront) {
    try {
      const ts = child.turnaroundSheet as { url: string; generatedAt: string; sourcePhotoUrl?: string } | null;
      if (!ts?.url) {
        skipped++;
        continue;
      }

      const storagePath = extractStoragePath(ts.url);
      const buffer = await assetStorage.getAssetByPath(storagePath);
      if (!buffer) {
        logger.warn({ childId: child.id, path: storagePath }, 'Turnaround asset not found, skipping');
        skipped++;
        continue;
      }

      const frontBuffer = await extractFrontFromTurnaround(buffer, {
        onRightEdge: (d: RightEdgeDebug) =>
          logger.info(
            { childId: child.id, chosenMethod: d.chosenMethod, delta: d.delta, edgePure: d.edgePure, edgeSoft: d.edgeSoft, rightEdge: d.rightEdge },
            'Front extraction right edge',
          ),
      });
      if (!frontBuffer) {
        logger.warn({ childId: child.id }, 'Front extraction returned null, skipping');
        skipped++;
        continue;
      }

      const frontUpload = await assetStorage.uploadUserPhoto({
        buffer: frontBuffer,
        mimeType: 'image/png',
        userId: child.userId,
        photoType: 'child_front' as const,
      });

      await childProfileRepo.updateTurnaroundSheet(child.id, {
        url: ts.url,
        frontUrl: frontUpload.storagePath,
        generatedAt: ts.generatedAt,
        sourcePhotoUrl: ts.sourcePhotoUrl ?? 'backfill',
      });

      processed++;
      if (processed % 5 === 0) {
        logger.info({ processed, errors, skipped, total }, 'Backfill progress');
      }
    } catch (err) {
      errors++;
      logger.error({ err, childId: child.id, name: child.name }, 'Failed to backfill child front');
    }
  }

  logger.info(
    { processed, errors, skipped, total, successRate: total > 0 ? `${Math.round((processed / total) * 100)}%` : 'N/A' },
    'Turnaround front backfill completed',
  );
}

backfillTurnaroundFront()
  .then(() => {
    logger.info('Backfill script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Backfill script failed');
    process.exit(1);
  });
