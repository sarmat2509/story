/**
 * Create compact WebP display copies for completed comic and mixed-story pages.
 * Original PNG page assets remain untouched and continue to be used for editing,
 * validation, and recomposition.
 *
 * Usage:
 *   pnpm --filter wondertales-api backfill:graphic-novel-page-displays
 *   pnpm --filter wondertales-api backfill:graphic-novel-page-displays -- --apply
 *   pnpm --filter wondertales-api backfill:graphic-novel-page-displays -- --apply --limit=50
 */
import './loadEnvForScripts';
import { closeDatabaseConnection } from '../db';
import { getGraphicNovelRepository } from '../repositories';
import { ensureGraphicNovelPageDisplayImage } from '../services/graphicNovelOrchestrationService';

function positiveIntegerArg(name: string): number | null {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function storyFormatForPage(page: { generationParams: unknown }): 'graphic_novel' | 'mixed_story' {
  const format = (page.generationParams as Record<string, unknown> | null)?.storyFormat;
  return format === 'mixed_story' ? 'mixed_story' : 'graphic_novel';
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const force = process.argv.includes('--force');
  const limit = positiveIntegerArg('limit');
  const rows = await getGraphicNovelRepository().findCompletedPagesWithImages();
  const targets = limit ? rows.slice(0, limit) : rows;
  const summary = { created: 0, wouldCreate: 0, skipped: 0, failed: 0, savedBytes: 0 };

  console.log(
    `Mode: ${apply ? 'apply' : 'dry-run'}. Pages: ${targets.length}/${rows.length}. Force: ${force}.`
  );

  for (const [index, row] of targets.entries()) {
    try {
      const generationParams = (row.page.generationParams as Record<string, unknown> | null) || {};
      const requestId =
        typeof generationParams.requestId === 'string'
          ? generationParams.requestId
          : `graphic-novel-display-backfill-${row.storyId}`;
      const result = await ensureGraphicNovelPageDisplayImage({
        page: row.page,
        storyId: row.storyId,
        userId: row.userId,
        requestId,
        storyFormat: storyFormatForPage(row.page),
        dryRun: !apply,
        force,
      });
      if (result.outcome === 'created') summary.created += 1;
      else if (result.outcome === 'would_create') summary.wouldCreate += 1;
      else summary.skipped += 1;
      if (result.originalFileSizeBytes && result.displayFileSizeBytes) {
        summary.savedBytes += result.originalFileSizeBytes - result.displayFileSizeBytes;
      }
      console.log(
        `${index + 1}/${targets.length} ${result.outcome.toUpperCase()} ` +
          `story=${row.storyId} page=${row.page.pageNumber} ` +
          JSON.stringify({
            originalBytes: result.originalFileSizeBytes ?? null,
            displayBytes: result.displayFileSizeBytes ?? null,
            displayStoragePath: result.displayStoragePath ?? null,
          })
      );
    } catch (error) {
      summary.failed += 1;
      console.error(
        `${index + 1}/${targets.length} FAILED story=${row.storyId} page=${row.page.pageNumber}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(JSON.stringify({ ...summary, savedMegabytes: +(summary.savedBytes / 1024 / 1024).toFixed(2) }));
  if (summary.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
