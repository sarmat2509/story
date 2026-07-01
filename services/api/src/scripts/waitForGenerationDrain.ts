import '../scripts/loadEnvForScripts';
import { sql } from 'drizzle-orm';
import db from '../db';

type DrainCounts = {
  activeRequests: number;
  activeJobs: number;
  staleActiveRequests: number;
};

function getArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function getDrainCounts(activeRequestWindowMs: number): Promise<DrainCounts> {
  const result = await db.execute(sql`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM story_requests
        WHERE status IN ('pending', 'processing')
          AND updated_at >= NOW() - (${activeRequestWindowMs} || ' milliseconds')::interval
      ) AS active_requests,
      (
        SELECT COUNT(*)::int
        FROM story_requests
        WHERE status IN ('pending', 'processing')
          AND updated_at < NOW() - (${activeRequestWindowMs} || ' milliseconds')::interval
      ) AS stale_active_requests,
      CASE
        WHEN to_regclass('public.generation_jobs') IS NULL THEN 0
        ELSE (
          SELECT COUNT(*)::int
          FROM generation_jobs
          WHERE status IN ('queued', 'processing')
        )
      END AS active_jobs
  `);
  const row = ((result as any).rows ?? result)[0] ?? {};
  return {
    activeRequests: Number(row.active_requests ?? row.activeRequests ?? 0),
    activeJobs: Number(row.active_jobs ?? row.activeJobs ?? 0),
    staleActiveRequests: Number(row.stale_active_requests ?? row.staleActiveRequests ?? 0),
  };
}

async function main() {
  const timeoutMs = Number.parseInt(getArg('timeout-ms', '900000'), 10);
  const pollMs = Number.parseInt(getArg('poll-ms', '5000'), 10);
  const activeRequestWindowMs = Number.parseInt(getArg('active-request-window-ms', '600000'), 10);
  const startedAt = Date.now();

  while (true) {
    const counts = await getDrainCounts(activeRequestWindowMs);
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...counts,
      })
    );

    if (counts.activeRequests === 0 && counts.activeJobs === 0) {
      return;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(
        `Timed out waiting for generation drain: ${counts.activeRequests} active requests, ${counts.activeJobs} active jobs`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
