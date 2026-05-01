import assert from 'node:assert/strict';
import { buildOrphanStorageCleanupScheduleConfig } from '../orphanStorageCleanupSchedulerJob';

void (async function main() {
  assert.deepStrictEqual(
    buildOrphanStorageCleanupScheduleConfig({}),
    {
      enabled: false,
      apply: false,
      storageRoot: undefined,
      intervalMs: 24 * 60 * 60 * 1000,
      initialDelayMs: 5 * 60 * 1000,
      maxDelete: 100,
      minAgeMs: 7 * 24 * 60 * 60 * 1000,
    }
  );

  assert.deepStrictEqual(
    buildOrphanStorageCleanupScheduleConfig({
      enabled: true,
      apply: false,
      storageRoot: '/tmp/wondertales-uploads',
      intervalMs: 60 * 1000,
      initialDelayMs: 0,
      maxDelete: 5,
      minAgeHours: 12,
    }),
    {
      enabled: true,
      apply: false,
      storageRoot: '/tmp/wondertales-uploads',
      intervalMs: 60 * 1000,
      initialDelayMs: 0,
      maxDelete: 5,
      minAgeMs: 12 * 60 * 60 * 1000,
    }
  );

  assert.deepStrictEqual(
    buildOrphanStorageCleanupScheduleConfig({
      enabled: true,
      apply: true,
      intervalMs: Number.NaN,
      initialDelayMs: -1,
      maxDelete: -1,
      minAgeHours: 0,
    }),
    {
      enabled: true,
      apply: true,
      storageRoot: undefined,
      intervalMs: 24 * 60 * 60 * 1000,
      initialDelayMs: 5 * 60 * 1000,
      maxDelete: 100,
      minAgeMs: 7 * 24 * 60 * 60 * 1000,
    }
  );

  console.log('orphanStorageCleanupSchedulerJob tests passed');
})();
