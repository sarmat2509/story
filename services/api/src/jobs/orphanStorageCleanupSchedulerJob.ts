import path from 'node:path';
import config from '../config';
import {
  OrphanStorageScanResult,
  scanOrphanStorageFiles,
} from '../services/orphanStorageCleanupService';
import { logger } from '../utils/logger';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_MAX_DELETE = 100;
const DEFAULT_MIN_AGE_HOURS = 7 * 24;

interface RawOrphanStorageCleanupConfig {
  enabled?: boolean;
  apply?: boolean;
  storageRoot?: string;
  intervalMs?: number;
  initialDelayMs?: number;
  maxDelete?: number;
  minAgeHours?: number;
}

export interface OrphanStorageCleanupScheduleConfig {
  enabled: boolean;
  apply: boolean;
  storageRoot?: string;
  intervalMs: number;
  initialDelayMs: number;
  maxDelete: number;
  minAgeMs: number;
}

let cleanupIntervalId: NodeJS.Timeout | null = null;
let cleanupInitialTimeoutId: NodeJS.Timeout | null = null;
let cleanupRunInFlight = false;

function numberAtLeast(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

export function buildOrphanStorageCleanupScheduleConfig(
  raw: RawOrphanStorageCleanupConfig = config.orphanStorageCleanup
): OrphanStorageCleanupScheduleConfig {
  const storageRoot = raw.storageRoot?.trim();
  const minAgeHours = numberAtLeast(raw.minAgeHours, 1, DEFAULT_MIN_AGE_HOURS);

  return {
    enabled: raw.enabled === true,
    apply: raw.apply === true,
    storageRoot: storageRoot ? path.resolve(storageRoot) : undefined,
    intervalMs: numberAtLeast(raw.intervalMs, 60 * 1000, DEFAULT_INTERVAL_MS),
    initialDelayMs: numberAtLeast(raw.initialDelayMs, 0, DEFAULT_INITIAL_DELAY_MS),
    maxDelete: Math.floor(numberAtLeast(raw.maxDelete, 0, DEFAULT_MAX_DELETE)),
    minAgeMs: Math.floor(minAgeHours * 60 * 60 * 1000),
  };
}

export async function runScheduledOrphanStorageCleanup(): Promise<OrphanStorageScanResult | null> {
  const scheduleConfig = buildOrphanStorageCleanupScheduleConfig();
  if (!scheduleConfig.enabled) {
    return null;
  }

  if (cleanupRunInFlight) {
    logger.warn('Orphan storage cleanup skipped because the previous run is still active');
    return null;
  }

  cleanupRunInFlight = true;
  try {
    const result = await scanOrphanStorageFiles({
      storageRoot: scheduleConfig.storageRoot,
      apply: scheduleConfig.apply,
      maxDelete: scheduleConfig.maxDelete,
      minAgeMs: scheduleConfig.minAgeMs,
    });

    logger.info(
      {
        dryRun: result.dryRun,
        scannedFiles: result.scannedFiles,
        orphanCount: result.orphanPaths.length,
        eligibleOrphanCount: result.eligibleOrphanPaths.length,
        skippedYoungOrphanCount: result.skippedYoungOrphanPaths.length,
        deletedCount: result.deletedPaths.length,
        maxDelete: scheduleConfig.maxDelete,
        minAgeMs: scheduleConfig.minAgeMs,
      },
      'Scheduled orphan storage cleanup completed'
    );

    return result;
  } catch (err) {
    logger.error({ err }, 'Scheduled orphan storage cleanup failed');
    throw err;
  } finally {
    cleanupRunInFlight = false;
  }
}

function scheduleCleanupRun(): void {
  runScheduledOrphanStorageCleanup().catch(() => {
    /* runScheduledOrphanStorageCleanup logs the error */
  });
}

export function startOrphanStorageCleanupScheduler(): void {
  stopOrphanStorageCleanupScheduler();

  const scheduleConfig = buildOrphanStorageCleanupScheduleConfig();
  if (!scheduleConfig.enabled) {
    logger.info('Orphan storage cleanup scheduler disabled');
    return;
  }

  cleanupInitialTimeoutId = setTimeout(scheduleCleanupRun, scheduleConfig.initialDelayMs);
  cleanupInitialTimeoutId.unref?.();

  cleanupIntervalId = setInterval(scheduleCleanupRun, scheduleConfig.intervalMs);
  cleanupIntervalId.unref?.();

  logger.info(
    {
      apply: scheduleConfig.apply,
      dryRun: !scheduleConfig.apply,
      intervalMs: scheduleConfig.intervalMs,
      initialDelayMs: scheduleConfig.initialDelayMs,
      maxDelete: scheduleConfig.maxDelete,
      minAgeMs: scheduleConfig.minAgeMs,
      storageRoot: scheduleConfig.storageRoot,
    },
    'Orphan storage cleanup scheduler started'
  );
}

export function stopOrphanStorageCleanupScheduler(): void {
  if (cleanupInitialTimeoutId) {
    clearTimeout(cleanupInitialTimeoutId);
    cleanupInitialTimeoutId = null;
  }
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info('Orphan storage cleanup scheduler stopped');
  }
}
