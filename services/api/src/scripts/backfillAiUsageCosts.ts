/**
 * Recalculate missing ai_usage_events.cost_usd values from the current pricing config.
 *
 * Usage:
 *   cd services/api && pnpm exec tsx src/scripts/backfillAiUsageCosts.ts
 *   pnpm exec tsx src/scripts/backfillAiUsageCosts.ts --dry-run
 *   pnpm exec tsx src/scripts/backfillAiUsageCosts.ts --days=30 --limit=500
 */

import { Pool } from 'pg';
import { estimateStoredUsageCostUsd } from '../services/aiUsageService';

type AiUsageRow = {
  id: string;
  provider: string;
  operation: string;
  model: string | null;
  input_units: number | null;
  output_units: number | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
};

function readNumberArg(name: string): number | null {
  const prefix = `${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const days = readNumberArg('--days');
  const limit = readNumberArg('--limit');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const where: string[] = ['cost_usd IS NULL'];
    const params: Array<number> = [];

    if (days != null && days > 0) {
      params.push(days);
      where.push(`created_at >= NOW() - ($${params.length}::int * INTERVAL '1 day')`);
    }

    let limitClause = '';
    if (limit != null && limit > 0) {
      params.push(Math.floor(limit));
      limitClause = `LIMIT $${params.length}`;
    }

    const result = await pool.query<AiUsageRow>(
      `
        SELECT id, provider, operation, model, input_units, output_units, duration_ms, metadata
        FROM ai_usage_events
        WHERE ${where.join(' AND ')}
        ORDER BY created_at ASC
        ${limitClause}
      `,
      params
    );

    let updated = 0;
    let skipped = 0;
    const byOperation = new Map<string, { rows: number; cost: number }>();

    for (const row of result.rows) {
      const cost = estimateStoredUsageCostUsd({
        provider: row.provider,
        operation: row.operation,
        model: row.model,
        inputUnits: row.input_units,
        outputUnits: row.output_units,
        durationMs: row.duration_ms,
        metadata: row.metadata,
      });

      if (cost == null) {
        skipped += 1;
        continue;
      }

      const key = `${row.provider}:${row.operation}:${row.model ?? '-'}`;
      const aggregate = byOperation.get(key) ?? { rows: 0, cost: 0 };
      aggregate.rows += 1;
      aggregate.cost += cost;
      byOperation.set(key, aggregate);

      if (!dryRun) {
        await pool.query(
          `UPDATE ai_usage_events SET cost_usd = $1 WHERE id = $2 AND cost_usd IS NULL`,
          [cost.toFixed(8), row.id]
        );
      }
      updated += 1;
    }

    const verb = dryRun ? 'Would update' : 'Updated';
    console.log(`${verb} ${updated} ai_usage_events rows; skipped ${skipped}.`);
    for (const [key, aggregate] of [...byOperation.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
      console.log(
        `${key}: ${aggregate.rows} rows, $${aggregate.cost.toFixed(6)} ${dryRun ? 'estimated' : 'backfilled'}`
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
