import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type GenerationJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface CreateGenerationJobInput {
  id: string;
  queueName: string;
  jobType: string;
  payload: Record<string, unknown>;
  groupKey?: string | null;
  maxRetries: number;
  estimatedTotalMs?: number | null;
  runAfter?: Date;
}

export interface GenerationJobStats {
  name: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

const ACTIVE_STATUSES: GenerationJobStatus[] = ['queued', 'processing'];

export class GenerationJobRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(input: CreateGenerationJobInput): Promise<schema.GenerationJob> {
    const [job] = await this.db
      .insert(schema.generationJobs)
      .values({
        id: input.id,
        queueName: input.queueName,
        jobType: input.jobType,
        payload: input.payload,
        groupKey: input.groupKey ?? null,
        status: 'queued',
        maxRetries: input.maxRetries,
        estimatedTotalMs: input.estimatedTotalMs ?? null,
        runAfter: input.runAfter ?? new Date(),
      })
      .returning();
    if (!job) throw new Error('Failed to create generation job');
    return job;
  }

  async claimNext(params: {
    queueName: string;
    workerId: string;
    limit: number;
    lockMs: number;
    enforceGroupOrdering: boolean;
  }): Promise<schema.GenerationJob[]> {
    if (params.limit <= 0) return [];
    const groupPredicate = params.enforceGroupOrdering
      ? sql`
          AND (
            candidate.group_key IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM generation_jobs active
              WHERE active.queue_name = candidate.queue_name
                AND active.group_key = candidate.group_key
                AND active.status = 'processing'
                AND active.lock_expires_at > NOW()
                AND active.id <> candidate.id
            )
          )
        `
      : sql``;

    const result = params.enforceGroupOrdering
      ? await this.db.execute(sql`
          WITH ranked AS (
            SELECT
              candidate.id,
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(candidate.group_key, candidate.id)
                ORDER BY candidate.created_at ASC
              ) AS group_rank
            FROM generation_jobs candidate
            WHERE candidate.queue_name = ${params.queueName}
              AND candidate.run_after <= NOW()
              AND (
                candidate.status = 'queued'
                OR (
                  candidate.status = 'processing'
                  AND candidate.lock_expires_at IS NOT NULL
                  AND candidate.lock_expires_at <= NOW()
                )
              )
              ${groupPredicate}
          ),
          candidate AS (
            SELECT job.*
            FROM generation_jobs job
            JOIN ranked ON ranked.id = job.id
            WHERE ranked.group_rank = 1
            ORDER BY job.created_at ASC
            LIMIT ${params.limit}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE generation_jobs job
          SET
            status = 'processing',
            locked_by = ${params.workerId},
            locked_at = NOW(),
            lock_expires_at = NOW() + (${params.lockMs} || ' milliseconds')::interval,
            started_at = NOW(),
            updated_at = NOW()
          FROM candidate
          WHERE job.id = candidate.id
          RETURNING job.*
        `)
      : await this.db.execute(sql`
          WITH candidate AS (
            SELECT *
            FROM generation_jobs candidate
            WHERE candidate.queue_name = ${params.queueName}
              AND candidate.run_after <= NOW()
              AND (
                candidate.status = 'queued'
                OR (
                  candidate.status = 'processing'
                  AND candidate.lock_expires_at IS NOT NULL
                  AND candidate.lock_expires_at <= NOW()
                )
              )
            ORDER BY candidate.created_at ASC
            LIMIT ${params.limit}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE generation_jobs job
          SET
            status = 'processing',
            locked_by = ${params.workerId},
            locked_at = NOW(),
            lock_expires_at = NOW() + (${params.lockMs} || ' milliseconds')::interval,
            started_at = NOW(),
            updated_at = NOW()
          FROM candidate
          WHERE job.id = candidate.id
          RETURNING job.*
        `);

    return (result as unknown as { rows?: schema.GenerationJob[] }).rows ?? (result as any);
  }

  async heartbeat(id: string, workerId: string, lockMs: number): Promise<void> {
    await this.db
      .update(schema.generationJobs)
      .set({
        lockExpiresAt: sql`NOW() + (${lockMs} || ' milliseconds')::interval`,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.generationJobs.id, id), eq(schema.generationJobs.lockedBy, workerId)));
  }

  async complete(id: string, workerId: string, actualDurationMs?: number): Promise<void> {
    await this.db
      .update(schema.generationJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        actualDurationMs: actualDurationMs ?? null,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        error: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.generationJobs.id, id), eq(schema.generationJobs.lockedBy, workerId)));
  }

  async failOrRequeue(params: {
    id: string;
    workerId: string;
    error: string;
    retry: boolean;
    retryDelayMs: number;
  }): Promise<void> {
    await this.db
      .update(schema.generationJobs)
      .set({
        status: params.retry ? 'queued' : 'failed',
        retries: sql`${schema.generationJobs.retries} + 1`,
        runAfter: params.retry
          ? sql`NOW() + (${params.retryDelayMs} || ' milliseconds')::interval`
          : sql`${schema.generationJobs.runAfter}`,
        failedAt: params.retry ? null : new Date(),
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        error: params.error,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.generationJobs.id, params.id), eq(schema.generationJobs.lockedBy, params.workerId)));
  }

  async getById(id: string): Promise<schema.GenerationJob | null> {
    const [job] = await this.db
      .select()
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.id, id))
      .limit(1);
    return job ?? null;
  }

  async listRecentForQueue(queueName: string, limit = 500): Promise<schema.GenerationJob[]> {
    return this.db
      .select()
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.queueName, queueName))
      .orderBy(desc(schema.generationJobs.createdAt))
      .limit(limit);
  }

  async listActiveForQueue(queueName: string): Promise<schema.GenerationJob[]> {
    return this.db
      .select()
      .from(schema.generationJobs)
      .where(
        and(
          eq(schema.generationJobs.queueName, queueName),
          inArray(schema.generationJobs.status, ACTIVE_STATUSES)
        )
      )
      .orderBy(desc(schema.generationJobs.createdAt));
  }

  async getStats(queueName: string): Promise<GenerationJobStats> {
    const rows = await this.db
      .select({
        status: schema.generationJobs.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.queueName, queueName))
      .groupBy(schema.generationJobs.status);

    const stats: GenerationJobStats = {
      name: queueName,
      total: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    for (const row of rows) {
      const count = Number(row.count ?? 0);
      stats.total += count;
      if (row.status === 'queued' || row.status === 'processing' || row.status === 'completed' || row.status === 'failed') {
        stats[row.status] = count;
      }
    }
    return stats;
  }

  async cleanupTerminalJobs(olderThan: Date): Promise<void> {
    await this.db
      .delete(schema.generationJobs)
      .where(
        and(
          inArray(schema.generationJobs.status, ['completed', 'failed']),
          sql`${schema.generationJobs.updatedAt} < ${olderThan}`
        )
      );
  }
}
