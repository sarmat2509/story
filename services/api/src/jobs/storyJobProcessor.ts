import { processStoryRequest } from '../services/storyOrchestrationService';
import { logger } from '../utils/logger';

/**
 * Simple In-Memory Job Queue for Story Generation (Milestone 3 MVP)
 * M4: Extended to support scene image regeneration
 * For production, migrate to BullMQ/Redis
 */

interface BaseJob {
  id: string;
  type: 'story_generation' | 'regenerate_scene_image';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  retries: number;
  createdAt: Date;
  error?: string;
}

interface StoryGenerationJob extends BaseJob {
  type: 'story_generation';
  requestId: string;
}

interface RegenerateSceneImageJob extends BaseJob {
  type: 'regenerate_scene_image';
  storyId: string;
  sceneId: number;
  visualPrompt?: string;
}

type Job = StoryGenerationJob | RegenerateSceneImageJob;

class StoryJobQueue {
  private queue: Map<string, Job> = new Map();
  private processing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 2;
  private readonly POLL_INTERVAL_MS = 2000;
  
  /**
   * Start the job processor
   */
  start() {
    if (this.intervalId) {
      logger.warn('Job queue already running');
      return;
    }
    
    logger.info({ pollInterval: this.POLL_INTERVAL_MS }, 'Starting story job queue');
    this.intervalId = setInterval(() => this.processNext(), this.POLL_INTERVAL_MS);
  }
  
  /**
   * Stop the job processor
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Story job queue stopped');
    }
  }
  
  /**
   * Add a story generation job to the queue
   */
  addJob(requestId: string): string;
  addJob(jobData: Omit<RegenerateSceneImageJob, 'id' | 'status' | 'retries' | 'createdAt'>): string;
  addJob(requestIdOrJobData: string | any): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    let job: Job;
    
    if (typeof requestIdOrJobData === 'string') {
      // Story generation job
      job = {
        id: jobId,
        type: 'story_generation',
        requestId: requestIdOrJobData,
        status: 'queued',
        retries: 0,
        createdAt: new Date(),
      };
    } else {
      // Other job types
      job = {
        ...requestIdOrJobData,
        id: jobId,
        status: 'queued' as const,
        retries: 0,
        createdAt: new Date(),
      };
    }
    
    this.queue.set(jobId, job);
    
    logger.info({ jobId, type: job.type, queueSize: this.queue.size }, 'Job added to queue');
    
    return jobId;
  }
  
  /**
   * Process the next job in queue
   */
  private async processNext() {
    if (this.processing) {
      return; // Already processing a job
    }
    
    // Find next queued job
    const job = Array.from(this.queue.values()).find(j => j.status === 'queued');
    
    if (!job) {
      return; // No jobs to process
    }
    
    this.processing = true;
    job.status = 'processing';
    
    logger.info({ jobId: job.id, type: job.type }, 'Processing job');
    
    try {
      // Process based on job type
      if (job.type === 'story_generation') {
        await processStoryRequest(job.requestId);
      } else if (job.type === 'regenerate_scene_image') {
        await processRegenerateSceneImage(job);
      }
      
      job.status = 'completed';
      logger.info({ jobId: job.id, type: job.type }, 'Job completed successfully');
      
      // Remove completed job after a delay
      setTimeout(() => {
        this.queue.delete(job.id);
        logger.debug({ jobId: job.id }, 'Job removed from queue');
      }, 60000); // Keep for 1 minute for status checks
      
    } catch (error) {
      job.retries++;
      
      logger.error({ 
        error, 
        jobId: job.id,
        type: job.type,
        retries: job.retries 
      }, 'Job processing failed');
      
      if (job.retries < this.MAX_RETRIES) {
        // Retry the job
        job.status = 'queued';
        logger.info({ jobId: job.id, retries: job.retries }, 'Job requeued for retry');
      } else {
        // Max retries reached
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ jobId: job.id }, 'Job failed after max retries');
        
        // Remove failed job after a delay
        setTimeout(() => {
          this.queue.delete(job.id);
        }, 300000); // Keep for 5 minutes
      }
    } finally {
      this.processing = false;
    }
  }
  
  /**
   * Get job status
   */
  getJobStatus(jobId: string): Job | null {
    return this.queue.get(jobId) || null;
  }
  
  /**
   * Get queue statistics
   */
  getStats() {
    const stats = {
      total: this.queue.size,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };
    
    for (const job of this.queue.values()) {
      stats[job.status]++;
    }
    
    return stats;
  }
  
  /**
   * Clear all jobs (for testing)
   */
  clear() {
    this.queue.clear();
    logger.info('Job queue cleared');
  }
}

/**
 * Process scene image regeneration job (M4)
 */
async function processRegenerateSceneImage(job: RegenerateSceneImageJob): Promise<void> {
  logger.info({ 
    storyId: job.storyId, 
    sceneId: job.sceneId 
  }, 'Regenerating scene image');
  
  // Import here to avoid circular dependencies
  const { regenerateSceneImage } = await import('../services/storyOrchestrationService');
  
  await regenerateSceneImage(job.storyId, job.sceneId, job.visualPrompt);
  
  logger.info({ 
    storyId: job.storyId, 
    sceneId: job.sceneId 
  }, 'Scene image regenerated successfully');
}

// Singleton instance
export const storyJobQueue = new StoryJobQueue();
