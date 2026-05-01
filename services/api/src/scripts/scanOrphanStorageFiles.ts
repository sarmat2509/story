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
  const maxDelete = maxDeleteRaw ? Number.parseInt(maxDeleteRaw, 10) : undefined;

  const result = await scanOrphanStorageFiles({
    storageRoot,
    apply,
    maxDelete: Number.isFinite(maxDelete) ? maxDelete : undefined,
  });

  console.log(JSON.stringify({
    storageRoot: result.storageRoot,
    dryRun: result.dryRun,
    scannedFiles: result.scannedFiles,
    referencedPaths: result.referencedPaths,
    orphanCount: result.orphanPaths.length,
    deletedCount: result.deletedPaths.length,
    orphanPaths: summary ? result.orphanPaths.slice(0, 20) : result.orphanPaths,
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
