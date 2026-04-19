/**
 * Backfill front images for existing turnaround sheets.
 *
 * Extracts the front (first) character view from turnaround images that don't
 * yet have frontUrl, uploads them, and updates the database.
 *
 * Usage:
 *   pnpm api:script npx tsx src/scripts/backfillTurnaroundFront.ts
 *   pnpm api:script npx tsx src/scripts/backfillTurnaroundFront.ts --force  # re-extract even if frontUrl exists
 *   pnpm api:script npx tsx src/scripts/backfillTurnaroundFront.ts --limit=5 --offset=0 --entity=characters --sleep-ms=1000
 *   pnpm api:script npx tsx src/scripts/backfillTurnaroundFront.ts --limit=20 --allow-large-batch --ignore-system-load
 */

import './loadEnvForScripts';
import os from 'os';
import { db } from '../db';
import { characters, childProfiles } from '../db/schema';
import { sql, and, isNotNull } from 'drizzle-orm';
import { getAssetStorageService } from '../services/assetStorageService';
import { getCharacterRepository, getChildProfileRepository } from '../repositories';
import {
  extractFrontFromTurnaround,
  type RightEdgeDebug,
  type TurnaroundRightEdgeLogContext,
} from '../services/turnaroundFrontExtractor';
import { logger } from '../utils/logger';

type BackfillEntity = 'all' | 'characters' | 'children';

interface ScriptOptions {
  force: boolean;
  limit: number;
  offset: number;
  entity: BackfillEntity;
  sleepMs: number;
  allowLargeBatch: boolean;
  ignoreSystemLoad: boolean;
}

function parseNumberArg(name: string, defaultValue: number): number {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return defaultValue;
  const value = Number.parseInt(arg.split('=')[1] ?? '', 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid --${name} value: ${arg}`);
  }
  return value;
}

function parseEntityArg(): BackfillEntity {
  const arg = process.argv.find((entry) => entry.startsWith('--entity='));
  if (!arg) return 'all';
  const value = arg.split('=')[1] as BackfillEntity | undefined;
  if (value === 'all' || value === 'characters' || value === 'children') {
    return value;
  }
  throw new Error(`Invalid --entity value: ${arg}`);
}

function parseOptions(): ScriptOptions {
  return {
    force: process.argv.includes('--force'),
    limit: parseNumberArg('limit', 25),
    offset: parseNumberArg('offset', 0),
    entity: parseEntityArg(),
    sleepMs: parseNumberArg('sleep-ms', 0),
    allowLargeBatch: process.argv.includes('--allow-large-batch'),
    ignoreSystemLoad: process.argv.includes('--ignore-system-load'),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertSafeStart(options: ScriptOptions): void {
  const cpuCount = Math.max(os.cpus().length, 1);
  const load1 = os.loadavg()[0];
  const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
  const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);

  logger.info(
    {
      entity: options.entity,
      limit: options.limit,
      offset: options.offset,
      sleepMs: options.sleepMs,
      cpuCount,
      load1,
      freeMemMb,
      totalMemMb,
    },
    'Backfill safety pre-check',
  );

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  if (options.limit === 0) {
    throw new Error('--limit must be greater than 0');
  }

  if (!options.allowLargeBatch && options.limit > 10) {
    throw new Error(
      `Unsafe batch size: --limit=${options.limit}. Use 10 or less, or add --allow-large-batch if you really want to override.`,
    );
  }

  if (!options.allowLargeBatch && options.entity === 'all') {
    throw new Error(
      'Unsafe entity scope: --entity=all is blocked by default. Run characters and children separately, or add --allow-large-batch to override.',
    );
  }

  if (!options.ignoreSystemLoad && load1 >= Math.max(0.9, cpuCount * 0.9)) {
    throw new Error(
      `System load is already high (load1=${load1.toFixed(2)}, cpuCount=${cpuCount}). Retry later or pass --ignore-system-load to override.`,
    );
  }

  if (!options.ignoreSystemLoad && freeMemMb < 256) {
    throw new Error(
      `Free memory is too low (${freeMemMb} MB / ${totalMemMb} MB). Retry later or pass --ignore-system-load to override.`,
    );
  }
}

function extractStoragePath(url: string): string {
  const urlWithoutQuery = url.split('?')[0];
  const urlWithoutProtocol = urlWithoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return urlWithoutProtocol.replace(/^\/api\/v1\/assets\//, '');
}

async function deletePreviousFrontAsset(
  assetStorage: ReturnType<typeof getAssetStorageService>,
  frontUrl: string | undefined,
  options: ScriptOptions,
  logFields: Record<string, unknown>,
): Promise<void> {
  if (!options.force || !frontUrl) return;
  try {
    const oldPath = extractStoragePath(frontUrl);
    await assetStorage.deleteAsset(oldPath);
    logger.info({ ...logFields, oldFrontStoragePath: oldPath }, 'Deleted previous turnaround front asset before re-extract');
  } catch (err) {
    logger.warn({ err, ...logFields, frontUrl }, 'Failed to delete previous turnaround front asset (continuing)');
  }
}

async function backfillTurnaroundFront() {
  const options = parseOptions();
  assertSafeStart(options);
  logger.info({ ...options }, 'Starting turnaround front backfill...');

  const assetStorage = getAssetStorageService();
  const characterRepo = getCharacterRepository();
  const childProfileRepo = getChildProfileRepository();

  // Base condition: has turnaround url
  const hasTurnaround = and(
    isNotNull(characters.turnaroundSheet),
    sql`${characters.turnaroundSheet}->>'url' IS NOT NULL`,
  );

  const charsNeedingFront = options.entity === 'children'
    ? []
    : await db
        .select({ id: characters.id, userId: characters.userId, name: characters.name, turnaroundSheet: characters.turnaroundSheet })
        .from(characters)
        .where(
          options.force
            ? hasTurnaround
            : and(hasTurnaround, sql`${characters.turnaroundSheet}->>'frontUrl' IS NULL`),
        )
        .orderBy(characters.id)
        .limit(options.limit)
        .offset(options.offset);

  const childHasTurnaround = and(
    isNotNull(childProfiles.turnaroundSheet),
    sql`${childProfiles.turnaroundSheet}->>'url' IS NOT NULL`,
  );

  const childrenNeedingFront = options.entity === 'characters'
    ? []
    : await db
        .select({ id: childProfiles.id, userId: childProfiles.userId, name: childProfiles.name, turnaroundSheet: childProfiles.turnaroundSheet })
        .from(childProfiles)
        .where(
          options.force
            ? childHasTurnaround
            : and(childHasTurnaround, sql`${childProfiles.turnaroundSheet}->>'frontUrl' IS NULL`),
        )
        .orderBy(childProfiles.id)
        .limit(options.limit)
        .offset(options.offset);

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

  logger.info(
    {
      entity: options.entity,
      limit: options.limit,
      offset: options.offset,
      sleepMs: options.sleepMs,
      characters: charsNeedingFront.length,
      children: childrenNeedingFront.length,
      total,
      force: options.force,
    },
    'Found records needing front extraction',
  );

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const char of charsNeedingFront) {
    try {
      logger.info({ characterId: char.id, name: char.name, processed, total }, 'Processing character turnaround front');
      const ts = char.turnaroundSheet as {
        url: string;
        frontUrl?: string;
        generatedAt: string;
        sourcePhotoUrl?: string;
      } | null;
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

      await deletePreviousFrontAsset(assetStorage, ts.frontUrl, options, { characterId: char.id, name: char.name });

      const rightEdgeLogContext: TurnaroundRightEdgeLogContext = {
        turnaroundStoragePath: storagePath,
        characterId: char.id,
      };
      const frontBuffer = await extractFrontFromTurnaround(buffer, {
        rightEdgeLogContext,
        onRightEdge: (d: RightEdgeDebug) =>
          logger.info(
            {
              characterId: char.id,
              turnaroundStoragePath: storagePath,
              chosenMethod: d.chosenMethod,
              delta: d.delta,
              edgePure: d.edgePure,
              edgeSoft: d.edgeSoft,
              rightEdge: d.rightEdge,
              maskCcLargeComponents: d.maskCcLargeComponents ?? null,
              maskCcLeftBlobMaxX: d.maskCcLeftBlobMaxX ?? null,
              maskCcLeftBlobMinX: d.maskCcLeftBlobMinX ?? null,
              maskCcLeftBlobMaxY: d.maskCcLeftBlobMaxY ?? null,
              maskCcBgDelta: d.maskCcBgDelta ?? null,
            },
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
      logger.info({ processed, errors, skipped, total, characterId: char.id, name: char.name }, 'Character front backfilled');
      if (options.sleepMs > 0) await sleep(options.sleepMs);
    } catch (err) {
      errors++;
      logger.error({ err, characterId: char.id, name: char.name }, 'Failed to backfill character front');
    }
  }

  for (const child of childrenNeedingFront) {
    try {
      logger.info({ childId: child.id, name: child.name, processed, total }, 'Processing child turnaround front');
      const ts = child.turnaroundSheet as {
        url: string;
        frontUrl?: string;
        generatedAt: string;
        sourcePhotoUrl?: string;
      } | null;
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

      await deletePreviousFrontAsset(assetStorage, ts.frontUrl, options, { childId: child.id, name: child.name });

      const rightEdgeLogContext: TurnaroundRightEdgeLogContext = {
        turnaroundStoragePath: storagePath,
        childId: child.id,
      };
      const frontBuffer = await extractFrontFromTurnaround(buffer, {
        rightEdgeLogContext,
        onRightEdge: (d: RightEdgeDebug) =>
          logger.info(
            {
              childId: child.id,
              turnaroundStoragePath: storagePath,
              chosenMethod: d.chosenMethod,
              delta: d.delta,
              edgePure: d.edgePure,
              edgeSoft: d.edgeSoft,
              rightEdge: d.rightEdge,
              maskCcLargeComponents: d.maskCcLargeComponents ?? null,
              maskCcLeftBlobMaxX: d.maskCcLeftBlobMaxX ?? null,
              maskCcLeftBlobMinX: d.maskCcLeftBlobMinX ?? null,
              maskCcLeftBlobMaxY: d.maskCcLeftBlobMaxY ?? null,
              maskCcBgDelta: d.maskCcBgDelta ?? null,
            },
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
      logger.info({ processed, errors, skipped, total, childId: child.id, name: child.name }, 'Child front backfilled');
      if (options.sleepMs > 0) await sleep(options.sleepMs);
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
