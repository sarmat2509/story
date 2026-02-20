/**
 * ConcurrentJobQueue - Generic concurrent job queue with group ordering
 * 
 * Features:
 * - Dynamic concurrency (static or function-based)
 * - Group ordering: ensures jobs in the same group run sequentially
 * - Concurrency-aware queue position and estimated wait time
 * - Configurable retry, cleanup, and timeouts
 */

import { logger } from '../utils/logger';

// ── Types ──

export interface BaseJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  retries: number;
  createdAt: Date;
  startedAt?: number;          // timestamp when processing began
  estimatedTotalMs?: number;   // estimated total processing time
  actualDurationMs?: number;   // actual duration after completion
  error?: string;
}

export interface QueueInfo {
  jobStatus: 'queued' | 'processing' | null;
  queuePosition: number | null;      // 1-based among QUEUED jobs
  activeJobsCount: number;            // currently processing
  maxConcurrency: number;             // current max concurrency
  totalWaiting: number;               // total queued (not active)
  estimatedWaitMs: number | null;     // estimated wait before this job starts
  processingStartedAt: number | null;   // timestamp when processing began
  estimatedProcessingMs: number | null; // estimated total processing time
}

export interface QueueStats {
  name: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  maxConcurrency: number;
}

export interface ConcurrentJobQueueOptions<T extends BaseJob> {
  name: string;
  maxConcurrency: number | (() => number);
  processor: (job: T) => Promise<void>;
  groupKeyFn?: (job: T) => string;
  maxRetries?: number;
  pollIntervalMs?: number;
  completedRetentionMs?: number;
  failedRetentionMs?: number;
}

// ── Queue Class ──

export class ConcurrentJobQueue<T extends BaseJob> {
  private queue: Map<string, T> = new Map();
  private activeGroups: Set<string> = new Set();
  private activeJobIds: Set<string> = new Set();
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;

  private readonly name: string;
  private readonly maxConcurrencyFn: () => number;
  private readonly processor: (job: T) => Promise<void>;
  private readonly groupKeyFn?: (job: T) => string;
  private readonly maxRetries: number;
  private readonly pollIntervalMs: number;
  private readonly completedRetentionMs: number;
  private readonly failedRetentionMs: number;

  constructor(options: ConcurrentJobQueueOptions<T>) {
    this.name = options.name;
    this.maxConcurrencyFn = typeof options.maxConcurrency === 'function'
      ? options.maxConcurrency
      : () => options.maxConcurrency as number;
    this.processor = options.processor;
    this.groupKeyFn = options.groupKeyFn;
    this.maxRetries = options.maxRetries ?? 2;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.completedRetentionMs = options.completedRetentionMs ?? 60000;
    this.failedRetentionMs = options.failedRetentionMs ?? 300000;
  }

  // ── Lifecycle ──

  start(): void {
    if (this.intervalId) {
      logger.warn({ queue: this.name }, 'Queue already running');
      return;
    }
    this.isStopped = false;
    logger.info({ queue: this.name, pollInterval: this.pollIntervalMs }, 'Starting concurrent job queue');
    this.intervalId = setInterval(() => this.processNext(), this.pollIntervalMs);
  }

  stop(): void {
    this.isStopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info({ queue: this.name }, 'Job queue stopped');
    }
  }

  // ── Add Job ──

  addJob(jobData: Omit<T, 'id' | 'status' | 'retries' | 'createdAt'>): string {
    if (this.isStopped) {
      throw new Error(`Queue "${this.name}" is stopped, cannot add new jobs`);
    }

    const jobId = `${this.name}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const job = {
      ...jobData,
      id: jobId,
      status: 'queued' as const,
      retries: 0,
      createdAt: new Date(),
    } as T;

    this.queue.set(jobId, job);

    logger.info({
      queue: this.name,
      jobId,
      queueSize: this.queue.size,
      activeCount: this.activeJobIds.size,
    }, 'Job added to queue');

    // Trigger immediate processing attempt
    setImmediate(() => this.processNext());

    return jobId;
  }

  // ── Processing ──

  private async processNext(): Promise<void> {
    if (this.isStopped) return;

    const maxConcurrency = this.maxConcurrencyFn();

    // Start as many jobs as concurrency allows
    const queuedJobs = Array.from(this.queue.values()).filter(j => j.status === 'queued');

    for (const job of queuedJobs) {
      if (this.activeJobIds.size >= maxConcurrency) break;

      // Check group ordering: skip if this job's group is already active
      if (this.groupKeyFn) {
        const groupKey = this.groupKeyFn(job);
        if (this.activeGroups.has(groupKey)) {
          continue; // Another job from same group is processing
        }
      }

      // Start this job
      this.startJob(job);
    }
  }

  private async startJob(job: T): Promise<void> {
    job.status = 'processing';
    job.startedAt = Date.now();
    this.activeJobIds.add(job.id);

    // Track group
    let groupKey: string | undefined;
    if (this.groupKeyFn) {
      groupKey = this.groupKeyFn(job);
      this.activeGroups.add(groupKey);
    }

    logger.info({
      queue: this.name,
      jobId: job.id,
      activeCount: this.activeJobIds.size,
      maxConcurrency: this.maxConcurrencyFn(),
    }, 'Processing job');

    try {
      await this.processor(job);
      job.status = 'completed';
      job.actualDurationMs = job.startedAt ? Date.now() - job.startedAt : undefined;
      logger.info({ queue: this.name, jobId: job.id, durationMs: job.actualDurationMs }, 'Job completed successfully');

      // Schedule cleanup
      setTimeout(() => {
        this.queue.delete(job.id);
      }, this.completedRetentionMs);
    } catch (error) {
      job.retries++;

      logger.error({
        queue: this.name,
        jobId: job.id,
        retries: job.retries,
        error: error instanceof Error ? error.message : String(error),
      }, 'Job processing failed');

      if (job.retries < this.maxRetries) {
        job.status = 'queued';
        job.startedAt = undefined;
        logger.info({ queue: this.name, jobId: job.id, retries: job.retries }, 'Job requeued for retry');
      } else {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';

        setTimeout(() => {
          this.queue.delete(job.id);
        }, this.failedRetentionMs);
      }
    } finally {
      this.activeJobIds.delete(job.id);
      if (groupKey) {
        this.activeGroups.delete(groupKey);
      }

      // Trigger next job processing
      setImmediate(() => this.processNext());
    }
  }

  // ── Queue Info (Concurrency-Aware) ──

  /**
   * Get queue info for a specific job matching a predicate.
   * Queue position and estimated wait are concurrency-aware.
   */
  getQueueInfo(predicate: (j: T) => boolean): QueueInfo {
    const maxConcurrency = this.maxConcurrencyFn();

    // Find the target job
    const targetJob = Array.from(this.queue.values()).find(predicate);

    if (!targetJob) {
      return {
        jobStatus: null,
        queuePosition: null,
        activeJobsCount: this.activeJobIds.size,
        maxConcurrency,
        totalWaiting: this.getQueuedCount(),
        estimatedWaitMs: null,
        processingStartedAt: null,
        estimatedProcessingMs: null,
      };
    }

    if (targetJob.status === 'processing') {
      return {
        jobStatus: 'processing',
        queuePosition: null,
        activeJobsCount: this.activeJobIds.size,
        maxConcurrency,
        totalWaiting: this.getQueuedCount(),
        estimatedWaitMs: null,
        processingStartedAt: targetJob.startedAt ?? null,
        estimatedProcessingMs: targetJob.estimatedTotalMs ?? null,
      };
    }

    if (targetJob.status !== 'queued') {
      return {
        jobStatus: null,
        queuePosition: null,
        activeJobsCount: this.activeJobIds.size,
        maxConcurrency,
        totalWaiting: this.getQueuedCount(),
        estimatedWaitMs: null,
        processingStartedAt: null,
        estimatedProcessingMs: null,
      };
    }

    // Calculate queue position (1-based among queued jobs)
    const queuedJobs = Array.from(this.queue.values())
      .filter(j => j.status === 'queued')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const queuePosition = queuedJobs.findIndex(j => j.id === targetJob.id) + 1;

    // Calculate estimated wait time
    const estimatedWaitMs = this.estimateWaitMs(queuePosition);

    return {
      jobStatus: 'queued',
      queuePosition,
      activeJobsCount: this.activeJobIds.size,
      maxConcurrency,
      totalWaiting: queuedJobs.length,
      estimatedWaitMs,
      processingStartedAt: null,
      estimatedProcessingMs: null,
    };
  }

  /**
   * Estimate wait time for a job at the given queue position.
   * Uses remaining time of active jobs sorted ascending.
   */
  private estimateWaitMs(queuePosition: number): number | null {
    const activeJobs = Array.from(this.queue.values()).filter(j => j.status === 'processing');
    const maxConcurrency = this.maxConcurrencyFn();

    if (activeJobs.length === 0) return 0;

    const now = Date.now();

    // Calculate remaining time for each active job
    const sortedRemaining = activeJobs
      .map(j => {
        if (!j.startedAt || !j.estimatedTotalMs) return 0;
        const elapsed = now - j.startedAt;
        return Math.max(0, j.estimatedTotalMs - elapsed);
      })
      .sort((a, b) => a - b); // Ascending: fastest finishing first

    // Pad with 0s if fewer active jobs than concurrency (some slots are free)
    while (sortedRemaining.length < maxConcurrency) {
      sortedRemaining.unshift(0); // Free slots finish "immediately"
    }

    // Calculate average job time for "2nd wave" estimation
    const avgJobMs = this.calculateAvgJobMs();

    return estimateWaitMs(queuePosition, sortedRemaining, avgJobMs);
  }

  /**
   * Calculate average completed job duration for wave estimation
   */
  private calculateAvgJobMs(): number {
    const completedJobs = Array.from(this.queue.values())
      .filter(j => j.status === 'completed' && j.actualDurationMs && j.actualDurationMs > 0);

    if (completedJobs.length === 0) {
      // Fallback: use average estimatedTotalMs of active jobs
      const activeJobs = Array.from(this.queue.values())
        .filter(j => j.status === 'processing' && j.estimatedTotalMs);
      
      if (activeJobs.length === 0) return 30000; // 30s default
      return activeJobs.reduce((sum, j) => sum + (j.estimatedTotalMs || 30000), 0) / activeJobs.length;
    }

    // Use actual duration of completed jobs
    return completedJobs.reduce((sum, j) => sum + (j.actualDurationMs || 30000), 0) / completedJobs.length;
  }

  // ── Status Helpers ──

  getJobStatus(jobId: string): T | null {
    return this.queue.get(jobId) || null;
  }

  getStats(): QueueStats {
    const stats: QueueStats = {
      name: this.name,
      total: this.queue.size,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      maxConcurrency: this.maxConcurrencyFn(),
    };

    for (const job of this.queue.values()) {
      stats[job.status]++;
    }

    return stats;
  }

  /**
   * Find a job matching a predicate
   */
  findJob(predicate: (j: T) => boolean): T | null {
    return Array.from(this.queue.values()).find(predicate) || null;
  }

  /**
   * Check if any job matching predicate is active (queued or processing)
   */
  hasActiveJob(predicate: (j: T) => boolean): boolean {
    return Array.from(this.queue.values()).some(
      j => predicate(j) && (j.status === 'queued' || j.status === 'processing')
    );
  }

  /**
   * Count completed jobs matching predicate
   */
  getCompletedCount(predicate: (j: T) => boolean): number {
    return Array.from(this.queue.values()).filter(
      j => predicate(j) && j.status === 'completed'
    ).length;
  }

  private getQueuedCount(): number {
    return Array.from(this.queue.values()).filter(j => j.status === 'queued').length;
  }

  clear(): void {
    this.queue.clear();
    this.activeGroups.clear();
    // Note: activeJobIds is NOT cleared -- in-flight jobs still decrement themselves
    // in their finally blocks. Clearing would cause the set to go out of sync.
    logger.info({ queue: this.name, activeJobsStillRunning: this.activeJobIds.size }, 'Job queue cleared');
  }
}

// ── Wait Time Estimation ──

/**
 * Estimate wait time for a job at a given queue position.
 * 
 * sortedRemainingMs: remaining time for each active job, sorted ascending.
 * The Nth queued job starts when the Nth-fastest active job finishes.
 * For positions beyond concurrency, estimates "2nd wave" with avgJobMs.
 */
export function estimateWaitMs(
  queuePosition: number,
  sortedRemainingMs: number[],
  avgJobMs: number,
): number {
  const concurrency = sortedRemainingMs.length;
  if (concurrency === 0) return 0;

  // How many "waves" of concurrent jobs must complete
  const waveIndex = Math.floor((queuePosition - 1) / concurrency);
  const posInWave = (queuePosition - 1) % concurrency;

  if (waveIndex === 0) {
    // First wave: wait for the (posInWave+1)th fastest active job
    return sortedRemainingMs[posInWave] ?? sortedRemainingMs[concurrency - 1];
  }

  // Subsequent waves: last active finishes + extra waves
  const firstWaveEnd = sortedRemainingMs[concurrency - 1];
  return firstWaveEnd + (waveIndex - 1) * avgJobMs + posInWave * (avgJobMs / concurrency);
}
