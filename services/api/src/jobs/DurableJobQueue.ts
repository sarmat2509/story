import os from 'os';
import { logger } from '../utils/logger';
import { getGenerationJobRepository } from '../repositories';
import type { BaseJob, QueueInfo, QueueStats } from './ConcurrentJobQueue';
import { estimateWaitMs } from './ConcurrentJobQueue';

export interface DurableJobQueueOptions<T extends BaseJob> {
  name: string;
  maxConcurrency: number | (() => number);
  processor: (job: T) => Promise<void>;
  groupKeyFn?: (job: T) => string;
  onPermanentFailure?: (job: T, error: unknown) => Promise<void> | void;
  maxRetries?: number;
  pollIntervalMs?: number;
  lockMs?: number;
  heartbeatMs?: number;
  retryDelayMs?: number;
  completedRetentionMs?: number;
  failedRetentionMs?: number;
}

function buildWorkerId(queueName: string): string {
  return `${queueName}:${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
}

function buildJobId(queueName: string): string {
  return `${queueName}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rowToJob<T extends BaseJob>(row: any): T {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    ...payload,
    id: row.id,
    status: row.status,
    retries: row.retries ?? 0,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.created_at ?? row.createdAt),
    startedAt: row.startedAt ? new Date(row.startedAt).getTime() : row.started_at ? new Date(row.started_at).getTime() : undefined,
    estimatedTotalMs: row.estimatedTotalMs ?? row.estimated_total_ms ?? undefined,
    actualDurationMs: row.actualDurationMs ?? row.actual_duration_ms ?? undefined,
    error: row.error ?? undefined,
  } as T;
}

export class DurableJobQueue<T extends BaseJob> {
  private activeJobIds = new Set<string>();
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;
  private cleanupTick = 0;

  private readonly name: string;
  private readonly workerId: string;
  private readonly maxConcurrencyFn: () => number;
  private readonly processor: (job: T) => Promise<void>;
  private readonly groupKeyFn?: (job: T) => string;
  private readonly onPermanentFailure?: (job: T, error: unknown) => Promise<void> | void;
  private readonly maxRetries: number;
  private readonly pollIntervalMs: number;
  private readonly lockMs: number;
  private readonly heartbeatMs: number;
  private readonly retryDelayMs: number;
  private readonly completedRetentionMs: number;
  private readonly failedRetentionMs: number;

  constructor(options: DurableJobQueueOptions<T>) {
    this.name = options.name;
    this.workerId = buildWorkerId(options.name);
    this.maxConcurrencyFn =
      typeof options.maxConcurrency === 'function'
        ? options.maxConcurrency
        : () => options.maxConcurrency as number;
    this.processor = options.processor;
    this.groupKeyFn = options.groupKeyFn;
    this.onPermanentFailure = options.onPermanentFailure;
    this.maxRetries = options.maxRetries ?? 2;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.lockMs = options.lockMs ?? 15 * 60 * 1000;
    this.heartbeatMs = options.heartbeatMs ?? 30 * 1000;
    this.retryDelayMs = options.retryDelayMs ?? 2000;
    this.completedRetentionMs = options.completedRetentionMs ?? 60 * 60 * 1000;
    this.failedRetentionMs = options.failedRetentionMs ?? 24 * 60 * 60 * 1000;
  }

  start(): void {
    if (this.intervalId) {
      logger.warn({ queue: this.name }, 'Durable job queue already running');
      return;
    }
    this.isStopped = false;
    logger.info(
      { queue: this.name, workerId: this.workerId, pollInterval: this.pollIntervalMs },
      'Starting durable job queue'
    );
    this.intervalId = setInterval(() => void this.processNext(), this.pollIntervalMs);
    void this.processNext();
  }

  stop(): void {
    this.isStopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info(
      { queue: this.name, activeJobsStillRunning: this.activeJobIds.size },
      'Durable job queue stopped accepting new work'
    );
  }

  async addJob(jobData: Omit<T, 'id' | 'status' | 'retries' | 'createdAt'>): Promise<string> {
    if (this.isStopped) {
      throw new Error(`Queue "${this.name}" is stopped, cannot add new jobs`);
    }

    const id = buildJobId(this.name);
    const payload = jobData as Record<string, unknown>;
    const groupKey = this.groupKeyFn ? this.groupKeyFn({ ...jobData, id } as T) : null;
    await getGenerationJobRepository().create({
      id,
      queueName: this.name,
      jobType: String(payload.type ?? this.name),
      payload,
      groupKey,
      maxRetries: this.maxRetries,
      estimatedTotalMs:
        typeof payload.estimatedTotalMs === 'number' ? payload.estimatedTotalMs : null,
    });

    logger.info({ queue: this.name, jobId: id, groupKey }, 'Durable job added to queue');
    setImmediate(() => void this.processNext());
    return id;
  }

  private async processNext(): Promise<void> {
    if (this.isStopped) return;
    const freeSlots = Math.max(0, this.maxConcurrencyFn() - this.activeJobIds.size);
    if (freeSlots <= 0) return;

    try {
      const rows = await getGenerationJobRepository().claimNext({
        queueName: this.name,
        workerId: this.workerId,
        limit: freeSlots,
        lockMs: this.lockMs,
        enforceGroupOrdering: !!this.groupKeyFn,
      });
      for (const row of rows) {
        const job = rowToJob<T>(row);
        this.startJob(job);
      }
      await this.maybeCleanupTerminalJobs();
    } catch (error) {
      logger.error({ err: error, queue: this.name }, 'Durable queue claim failed');
    }
  }

  private startJob(job: T): void {
    this.activeJobIds.add(job.id);
    const startedAt = Date.now();
    job.status = 'processing';
    job.startedAt = startedAt;

    const heartbeat = setInterval(() => {
      void getGenerationJobRepository().heartbeat(job.id, this.workerId, this.lockMs);
    }, this.heartbeatMs);

    logger.info(
      { queue: this.name, jobId: job.id, activeCount: this.activeJobIds.size },
      'Processing durable job'
    );

    void (async () => {
      try {
        await this.processor(job);
        job.actualDurationMs = Date.now() - startedAt;
        await getGenerationJobRepository().complete(job.id, this.workerId, job.actualDurationMs);
        logger.info(
          { queue: this.name, jobId: job.id, durationMs: job.actualDurationMs },
          'Durable job completed successfully'
        );
      } catch (error) {
        const nextRetries = job.retries + 1;
        const retry = nextRetries < this.maxRetries;
        logger.error(
          {
            queue: this.name,
            jobId: job.id,
            retries: nextRetries,
            retry,
            error: errorMessage(error),
          },
          'Durable job processing failed'
        );

        await getGenerationJobRepository().failOrRequeue({
          id: job.id,
          workerId: this.workerId,
          error: errorMessage(error),
          retry,
          retryDelayMs: this.retryDelayMs,
        });

        if (!retry && this.onPermanentFailure) {
          try {
            job.retries = nextRetries;
            job.status = 'failed';
            await this.onPermanentFailure(job, error);
          } catch (failureHandlerError) {
            logger.error(
              { queue: this.name, jobId: job.id, error: errorMessage(failureHandlerError) },
              'Durable permanent failure handler failed'
            );
          }
        }
      } finally {
        clearInterval(heartbeat);
        this.activeJobIds.delete(job.id);
        setImmediate(() => void this.processNext());
      }
    })();
  }

  async getJobStatus(jobId: string): Promise<T | null> {
    const row = await getGenerationJobRepository().getById(jobId);
    return row ? rowToJob<T>(row) : null;
  }

  async getStats(): Promise<QueueStats> {
    const stats = await getGenerationJobRepository().getStats(this.name);
    return {
      ...stats,
      maxConcurrency: this.maxConcurrencyFn(),
    };
  }

  async findJob(predicate: (j: T) => boolean): Promise<T | null> {
    const rows = await getGenerationJobRepository().listRecentForQueue(this.name);
    return rows.map(rowToJob<T>).find(predicate) ?? null;
  }

  async hasActiveJob(predicate: (j: T) => boolean): Promise<boolean> {
    const rows = await getGenerationJobRepository().listActiveForQueue(this.name);
    return rows.map(rowToJob<T>).some(predicate);
  }

  async getQueueInfo(predicate: (j: T) => boolean): Promise<QueueInfo> {
    const maxConcurrency = this.maxConcurrencyFn();
    const rows = await getGenerationJobRepository().listRecentForQueue(this.name);
    const jobs = rows.map(rowToJob<T>);
    const targetJob = jobs.find(predicate);
    const activeJobs = jobs.filter((job) => job.status === 'processing');
    const queuedJobs = jobs
      .filter((job) => job.status === 'queued')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (!targetJob) {
      return {
        jobStatus: null,
        queuePosition: null,
        activeJobsCount: activeJobs.length,
        maxConcurrency,
        totalWaiting: queuedJobs.length,
        estimatedWaitMs: null,
        processingStartedAt: null,
        estimatedProcessingMs: null,
      };
    }

    if (targetJob.status === 'processing') {
      return {
        jobStatus: 'processing',
        queuePosition: null,
        activeJobsCount: activeJobs.length,
        maxConcurrency,
        totalWaiting: queuedJobs.length,
        estimatedWaitMs: null,
        processingStartedAt: targetJob.startedAt ?? null,
        estimatedProcessingMs: targetJob.estimatedTotalMs ?? null,
      };
    }

    if (targetJob.status !== 'queued') {
      return {
        jobStatus: null,
        queuePosition: null,
        activeJobsCount: activeJobs.length,
        maxConcurrency,
        totalWaiting: queuedJobs.length,
        estimatedWaitMs: null,
        processingStartedAt: null,
        estimatedProcessingMs: null,
      };
    }

    const queuePosition = queuedJobs.findIndex((job) => job.id === targetJob.id) + 1;
    const now = Date.now();
    const sortedRemaining = activeJobs
      .map((job) => {
        if (!job.startedAt || !job.estimatedTotalMs) return 0;
        return Math.max(0, job.estimatedTotalMs - (now - job.startedAt));
      })
      .sort((a, b) => a - b);
    while (sortedRemaining.length < maxConcurrency) {
      sortedRemaining.unshift(0);
    }

    return {
      jobStatus: 'queued',
      queuePosition,
      activeJobsCount: activeJobs.length,
      maxConcurrency,
      totalWaiting: queuedJobs.length,
      estimatedWaitMs: estimateWaitMs(queuePosition, sortedRemaining, 30000),
      processingStartedAt: null,
      estimatedProcessingMs: null,
    };
  }

  private async maybeCleanupTerminalJobs(): Promise<void> {
    this.cleanupTick += 1;
    if (this.cleanupTick % 300 !== 0) return;
    const olderThan = new Date(Date.now() - Math.max(this.completedRetentionMs, this.failedRetentionMs));
    await getGenerationJobRepository().cleanupTerminalJobs(olderThan);
  }
}
