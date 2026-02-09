import { processStoryRequest } from '../services/storyOrchestrationService';
import { logger } from '../utils/logger';

/**
 * Simple In-Memory Job Queue for Story Generation (Milestone 3 MVP)
 * M4: Extended to support scene image regeneration
 * For production, migrate to BullMQ/Redis
 */

interface BaseJob {
  id: string;
  type: 'story_generation' | 'regenerate_scene_image' | 'audio_generation';
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

interface AudioGenerationJob extends BaseJob {
  type: 'audio_generation';
  storyId: string;
  userId: string;
  voiceParams?: {
    voiceId?: string;
    speed?: number;
    nightMode?: boolean;
  };
}

type Job = StoryGenerationJob | RegenerateSceneImageJob | AudioGenerationJob;

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
        // Check if this is a continuation request
        const { db } = await import('../db');
        const { storyRequests } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');
        
        const [request] = await db
          .select()
          .from(storyRequests)
          .where(eq(storyRequests.id, job.requestId))
          .limit(1);
        
        const isContinuation = (request?.intermediateData as any)?.isContinuation;
        
        if (isContinuation) {
          const { processContinuationRequest } = await import('../services/storyOrchestrationService');
          await processContinuationRequest(job.requestId);
        } else {
          await processStoryRequest(job.requestId);
        }
      } else if (job.type === 'regenerate_scene_image') {
        await processRegenerateSceneImage(job);
      } else if (job.type === 'audio_generation') {
        await processAudioGeneration(job as AudioGenerationJob);
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
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        jobId: job.id,
        type: job.type,
        retries: job.retries,
        requestId: job.type === 'story_generation' ? (job as StoryGenerationJob).requestId : undefined
      }, 'Job processing failed');
      
      if (job.retries < this.MAX_RETRIES) {
        // Retry the job
        job.status = 'queued';
        logger.info({ jobId: job.id, retries: job.retries }, 'Job requeued for retry');
      } else {
        // Max retries reached
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ 
          jobId: job.id,
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, 'Job failed after max retries');
        
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
   * Get audio job status for a specific story
   * @param storyId - Story ID to check
   * @returns 'queued' | 'processing' | null
   */
  getAudioJobStatus(storyId: string): 'queued' | 'processing' | null {
    const job = Array.from(this.queue.values()).find(
      j => j.type === 'audio_generation' && 
           (j as AudioGenerationJob).storyId === storyId &&
           (j.status === 'queued' || j.status === 'processing')
    );
    
    return job ? job.status : null;
  }
  
  /**
   * Check if there's an active audio job for a story (for backwards compatibility)
   * @param storyId - Story ID to check
   * @returns true if there's a queued or processing audio job
   */
  hasAudioJobForStory(storyId: string): boolean {
    return this.getAudioJobStatus(storyId) !== null;
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

/**
 * Process audio generation job (M5)
 */
async function processAudioGeneration(job: AudioGenerationJob): Promise<void> {
  logger.info({ 
    storyId: job.storyId,
    userId: job.userId 
  }, 'Generating audio for story');
  
  const { getAudioDomainService } = await import('../domain/audio');
  const { groupScenesIntoChunks } = await import('../domain/audio/sceneGrouper');
  const { stories, scenes: scenesTable } = await import('../db/schema');
  const { db } = await import('../db');
  const { eq } = await import('drizzle-orm');
  const { getConcurrencyLimitForPlan } = await import('../config');
  
  // Load story
  const [story] = await db.select().from(stories)
    .where(eq(stories.id, job.storyId))
    .limit(1);
  
  if (!story) {
    throw new Error('Story not found');
  }
  
  // Load scenes (ordered by sceneId)
  const storyScenes = await db.select({
    sceneId: scenesTable.sceneId,
    text: scenesTable.text,
  })
    .from(scenesTable)
    .where(eq(scenesTable.storyId, job.storyId))
    .orderBy(scenesTable.sceneId);
  
  logger.info({
    storyId: job.storyId,
    totalScenes: storyScenes.length,
    totalChars: storyScenes.reduce((sum, s) => sum + s.text.length, 0)
  }, 'Loaded scenes for audio generation');
  
  // Get user's plan type and concurrency limit
  const { getUserSubscription, getPlanById } = await import('../services/planService');
  const subscription = await getUserSubscription(job.userId);
  const plan = subscription ? await getPlanById(subscription.planId) : null;
  const planType = plan?.slug === 'premium' ? 'premium' : 'free';
  const concurrencyLimit = getConcurrencyLimitForPlan(plan?.slug);
  
  // Group scenes optimally for parallel generation
  const sceneGroups = groupScenesIntoChunks(storyScenes, concurrencyLimit);
  
  logger.info({
    storyId: job.storyId,
    concurrencyLimit,
    numGroups: sceneGroups.length,
    planSlug: plan?.slug || 'free'
  }, 'Scene groups created for parallel audio generation');
  
  // Generate audio with optimal parallelism
  const audioDomain = getAudioDomainService();
  
  try {
    const result = await audioDomain.synthesizeSceneGroups(
      story,
      sceneGroups,
      job.voiceParams || {},
      planType,
      concurrencyLimit // Pass concurrency limit for batching
    );
    
    // ✅ Only update story and charge user if successful
    await db.update(stories)
      .set({
        audioMetadata: {
          voiceId: result.voiceId,
          voiceName: result.voiceName,
          totalDuration: result.duration,
          generatedAt: new Date().toISOString(),
          nightMode: job.voiceParams?.nightMode || false,
        }
      })
      .where(eq(stories.id, job.storyId));
    
    // Increment usage (duration in minutes, rounded up)
    const { incrementUsage } = await import('../services/planService');
    const durationMinutes = Math.ceil(result.duration / 60);
    await incrementUsage(job.userId, 'audio', durationMinutes);
    
    logger.info({ 
      storyId: job.storyId, 
      duration: result.duration,
      durationMinutes,
      cached: result.cached 
    }, 'Audio generation completed successfully - user charged');
    
    // M6: Generate forced alignment automatically after audio completes
    try {
      logger.info({ storyId: job.storyId }, 'Starting forced alignment generation');
      
      const { getAlignmentProvider } = await import('../services/aiService');
      const alignmentProvider = getAlignmentProvider();
      
      // Get final audio asset ID from result
      const finalAssetId = result.assetId;
      
      // Generate alignment (works with audio from any provider)
      const alignmentResult = await audioDomain.generateAlignmentForStory(
        job.storyId,
        finalAssetId,
        alignmentProvider
      );
      
      // Update audioMetadata with alignment data
      const currentAudioMetadata = story.audioMetadata as any || {};
      await db.update(stories)
        .set({
          audioMetadata: {
            ...currentAudioMetadata,
            voiceId: result.voiceId,
            voiceName: result.voiceName,
            totalDuration: result.duration,
            generatedAt: new Date().toISOString(),
            nightMode: job.voiceParams?.nightMode || false,
            alignment: {
              characters: alignmentResult.characters,
              words: alignmentResult.words,
              averageConfidence: alignmentResult.averageConfidence,
              provider: alignmentProvider.getProviderName().toLowerCase(),
              language: alignmentResult.language,
              generatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(stories.id, job.storyId));
      
      logger.info({
        storyId: job.storyId,
        wordCount: alignmentResult.words.length,
        averageConfidence: alignmentResult.averageConfidence,
      }, 'Forced alignment generated and saved successfully');
      
    } catch (alignmentError) {
      // Log error but don't fail the audio generation job
      logger.error({
        err: alignmentError,
        storyId: job.storyId,
      }, 'Failed to generate alignment - audio generation still successful');
      
      // Alignment failure should not block audio generation
      // User can still listen to the story without text synchronization
    }
  } catch (error) {
    // ✅ NEW: Mark as failed, DON'T charge user
    logger.error({
      storyId: job.storyId,
      userId: job.userId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    }, 'Audio generation failed - user NOT charged');
    
    // Update story to show error state (preserves partial chunks in metadata)
    const currentMetadata = (story.audioMetadata as any) || {};
    await db.update(stories)
      .set({
        audioMetadata: {
          ...currentMetadata, // Keep sceneGroupAssetIds for retry
          error: true,
          errorMessage: 'Audio generation failed. Please try again.',
          failedAt: new Date().toISOString(),
        }
      })
      .where(eq(stories.id, job.storyId));
    
    throw error; // Re-throw for job retry mechanism
  }
}

// Singleton instance
export const storyJobQueue = new StoryJobQueue();
