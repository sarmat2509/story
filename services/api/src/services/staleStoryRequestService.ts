import { and, eq, inArray, or, sql } from 'drizzle-orm';
import db from '../db';
import * as schema from '../db/schema';
import { config } from '../config';
import { logger } from '../utils/logger';
import { releaseStoryQuotaReservationForRequest } from './storyQuotaService';

export interface ExpireStaleStoryRequestsOptions {
  ttlMs?: number;
  limit?: number;
  dryRun?: boolean;
}

export interface ExpireStaleStoryRequestsResult {
  cutoff: string;
  ttlMs: number;
  checked: number;
  expired: number;
  releasedReservations: number;
  skippedReservations: number;
  deletedStubs: number;
  errors: number;
}

type StaleStoryRequestRow = {
  id: string;
  status: string;
  userId?: string;
  user_id?: string;
  storyId?: string | null;
  story_id?: string | null;
  updatedAt?: Date;
  updated_at?: Date;
};

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) || [];
}

function buildCutoff(ttlMs: number): Date {
  return new Date(Date.now() - ttlMs);
}

async function hasGenerationJobsTable(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT to_regclass('public.generation_jobs') IS NOT NULL AS exists
  `);
  const row = rowsOf<{ exists?: boolean }>(result)[0] ?? {};
  return row.exists === true;
}

async function findStaleStoryRequests(cutoff: Date, limit: number): Promise<StaleStoryRequestRow[]> {
  if (!(await hasGenerationJobsTable())) {
    return [];
  }

  const result = await db.execute(sql`
    SELECT sr.id, sr.status, sr.user_id, sr.story_id, sr.updated_at
    FROM story_requests sr
    WHERE sr.status IN ('pending', 'processing')
      AND sr.updated_at < ${cutoff}
      AND NOT EXISTS (
        SELECT 1
        FROM generation_jobs gj
        WHERE gj.status IN ('queued', 'processing')
          AND gj.payload->>'requestId' = sr.id::text
      )
    ORDER BY sr.updated_at ASC
    LIMIT ${limit}
  `);
  return rowsOf<StaleStoryRequestRow>(result);
}

async function expireOneStaleRequest(
  requestId: string,
  cutoff: Date,
  ttlMs: number,
  dryRun: boolean
): Promise<{ expired: boolean; deletedStub: boolean }> {
  if (dryRun) {
    return { expired: true, deletedStub: false };
  }

  return db.transaction(async (tx) => {
    const [request] = await (tx as any)
      .select({
        id: schema.storyRequests.id,
        userId: schema.storyRequests.userId,
        storyId: schema.storyRequests.storyId,
        status: schema.storyRequests.status,
        updatedAt: schema.storyRequests.updatedAt,
      })
      .from(schema.storyRequests)
      .where(eq(schema.storyRequests.id, requestId))
      .limit(1)
      .for('update');

    if (
      !request ||
      !['pending', 'processing'].includes(request.status) ||
      request.updatedAt >= cutoff
    ) {
      return { expired: false, deletedStub: false };
    }

    const activeJobResult = await tx.execute(sql`
      SELECT 1
      FROM generation_jobs
      WHERE status IN ('queued', 'processing')
        AND payload->>'requestId' = ${requestId}
      LIMIT 1
    `);
    if (rowsOf(activeJobResult).length > 0) {
      return { expired: false, deletedStub: false };
    }

    const storyConditions = [eq(schema.stories.storyRequestId, requestId)];
    if (request.storyId) {
      storyConditions.push(eq(schema.stories.id, request.storyId));
    }

    const [story] = await tx
      .select({
        id: schema.stories.id,
        title: schema.stories.title,
        fullText: schema.stories.fullText,
        userId: schema.stories.userId,
      })
      .from(schema.stories)
      .where(or(...storyConditions))
      .limit(1);

    let deletedStub = false;
    if (
      story &&
      story.userId === request.userId &&
      story.title === 'Generating...' &&
      story.fullText.trim().length === 0
    ) {
      await tx
        .delete(schema.stories)
        .where(and(eq(schema.stories.id, story.id), eq(schema.stories.userId, request.userId)));
      deletedStub = true;
    }

    await tx
      .update(schema.storyRequests)
      .set({
        status: 'failed',
        errorMessage: `Generation request expired after ${Math.round(ttlMs / 60000)} minutes without activity.`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.storyRequests.id, requestId),
          inArray(schema.storyRequests.status, ['pending', 'processing'])
        )
      );

    return { expired: true, deletedStub };
  });
}

export async function expireStaleStoryRequests(
  options: ExpireStaleStoryRequestsOptions = {}
): Promise<ExpireStaleStoryRequestsResult> {
  const ttlMs = options.ttlMs ?? config.generation.activeRequestTtlMs;
  const limit = options.limit ?? config.generation.staleRequestCleanupLimit;
  const dryRun = options.dryRun ?? false;
  const cutoff = buildCutoff(ttlMs);
  const staleRequests = await findStaleStoryRequests(cutoff, limit);

  const result: ExpireStaleStoryRequestsResult = {
    cutoff: cutoff.toISOString(),
    ttlMs,
    checked: staleRequests.length,
    expired: 0,
    releasedReservations: 0,
    skippedReservations: 0,
    deletedStubs: 0,
    errors: 0,
  };

  for (const row of staleRequests) {
    try {
      const expired = await expireOneStaleRequest(row.id, cutoff, ttlMs, dryRun);
      if (!expired.expired) {
        continue;
      }

      result.expired += 1;
      if (expired.deletedStub) {
        result.deletedStubs += 1;
      }

      if (!dryRun) {
        const release = await releaseStoryQuotaReservationForRequest(row.id, {
          reason: 'generation_expired',
          errorMessage: `Generation request expired after ${Math.round(ttlMs / 60000)} minutes without activity.`,
        });
        if (release.released) {
          result.releasedReservations += 1;
        } else {
          result.skippedReservations += 1;
        }
      }
    } catch (error) {
      result.errors += 1;
      logger.error({ err: error, requestId: row.id }, 'Failed to expire stale story request');
    }
  }

  logger.info(result, dryRun ? 'Checked stale story requests' : 'Expired stale story requests');
  return result;
}
