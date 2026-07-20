/**
 * Create missing graphic-novel and mixed-story covers from persisted art-only pages.
 *
 * This never calls an AI provider. Dry-run is the default.
 *
 * Usage:
 *   pnpm --filter wondertales-api backfill:graphic-novel-covers -- --story-ids=<uuid>,<uuid>
 *   pnpm --filter wondertales-api backfill:graphic-novel-covers -- --story-ids=<uuid>,<uuid> --apply
 */
import './loadEnvForScripts';
import { closeDatabaseConnection } from '../db';
import { backfillGraphicNovelCoverFromStoredPage } from '../services/graphicNovelOrchestrationService';

function parseStoryIds(): string[] {
  const values = process.argv
    .filter((arg) => arg.startsWith('--story-ids='))
    .flatMap((arg) => arg.slice('--story-ids='.length).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

async function main(): Promise<void> {
  const storyIds = parseStoryIds();
  const apply = process.argv.includes('--apply');
  if (storyIds.length === 0) {
    throw new Error('Pass at least one story id via --story-ids=<uuid>,<uuid>');
  }

  console.log(`Mode: ${apply ? 'apply' : 'dry-run'}. Stories: ${storyIds.length}.`);
  let created = 0;
  let wouldCreate = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, storyId] of storyIds.entries()) {
    try {
      const result = await backfillGraphicNovelCoverFromStoredPage({
        storyId,
        dryRun: !apply,
      });
      if (result.outcome === 'created') created += 1;
      else if (result.outcome === 'would_create') wouldCreate += 1;
      else skipped += 1;
      console.log(
        `${index + 1}/${storyIds.length} ${result.outcome.toUpperCase()} ${storyId} ` +
          JSON.stringify({
            reason: result.reason ?? null,
            pageNumber: result.pageNumber ?? null,
            panelIndex: result.panelIndex ?? null,
            sourceAspectRatio: result.sourceAspectRatio ?? null,
            aspectRatioRelativeDistance: result.aspectRatioRelativeDistance ?? null,
            coverAssetId: result.coverAssetId ?? null,
          })
      );
    } catch (error) {
      failed += 1;
      console.error(
        `${index + 1}/${storyIds.length} FAILED ${storyId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(
    `Done. Created: ${created}. Would create: ${wouldCreate}. Skipped: ${skipped}. Failed: ${failed}.`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
