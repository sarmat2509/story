import './loadEnvForScripts';
import { closeDatabaseConnection } from '../db';
import { scanOrphanStorageFiles } from '../services/orphanStorageCleanupService';

function readArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const summary = process.argv.includes('--summary');
  const storageRoot = readArgValue('--storage-root');
  const maxDeleteRaw = readArgValue('--max-delete');
  const minAgeHoursRaw = readArgValue('--min-age-hours');
  const maxDelete = maxDeleteRaw ? Number.parseInt(maxDeleteRaw, 10) : undefined;
  const minAgeHours = minAgeHoursRaw ? Number.parseFloat(minAgeHoursRaw) : undefined;

  const result = await scanOrphanStorageFiles({
    storageRoot,
    apply,
    maxDelete: Number.isFinite(maxDelete) ? maxDelete : undefined,
    minAgeMs:
      Number.isFinite(minAgeHours) && (minAgeHours ?? 0) > 0
        ? Math.floor((minAgeHours ?? 0) * 60 * 60 * 1000)
        : undefined,
  });

  console.log(JSON.stringify({
    storageRoot: result.storageRoot,
    dryRun: result.dryRun,
    minAgeMs: result.minAgeMs,
    scannedFiles: result.scannedFiles,
    referencedPaths: result.referencedPaths,
    orphanCount: result.orphanPaths.length,
    eligibleOrphanCount: result.eligibleOrphanPaths.length,
    skippedYoungOrphanCount: result.skippedYoungOrphanPaths.length,
    deletedCount: result.deletedPaths.length,
    orphanPaths: summary ? result.orphanPaths.slice(0, 20) : result.orphanPaths,
    eligibleOrphanPaths: summary
      ? result.eligibleOrphanPaths.slice(0, 20)
      : result.eligibleOrphanPaths,
    deletedPaths: summary ? result.deletedPaths.slice(0, 20) : result.deletedPaths,
  }, null, 2));
}

main()
  .then(async () => {
    await closeDatabaseConnection();
  })
  .catch(async (error) => {
    console.error(error);
    await closeDatabaseConnection();
    process.exit(1);
  });
