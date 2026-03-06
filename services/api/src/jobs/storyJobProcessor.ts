/**
 * Story Job Processor
 * 
 * Three independent concurrent queues:
 * - textQueue: story text generation (outline-free direct + validation)
 * - imageQueue: per-image generation with per-story group ordering
 * - audioQueue: audio generation (TTS + alignment)
 * 
 * Also includes the legacy StoryJobQueue for scene image regeneration
 * (will be migrated to imageQueue in a future step).
 */

import { logger } from '../utils/logger';
import { ConcurrentJobQueue, type BaseJob } from './ConcurrentJobQueue';
import { config } from '../config';
import { getStoryRepository, getSceneRepository } from '../repositories';

// ── Job Types ──

export interface TextGenerationJob extends BaseJob {
  type: 'text_generation';
  requestId: string;
  isContinuation?: boolean;
}

export interface ImageGenerationJob extends BaseJob {
  type: 'image_generation' | 'image_batch';
  requestId: string;
  storyId: string;
  isContinuation?: boolean;
  // For individual scene regeneration:
  sceneId?: number;
  sceneIndex?: number;
  totalImages?: number;
}

export interface AudioGenerationJob extends BaseJob {
  type: 'audio_generation';
  storyId: string;
  userId: string;
  voiceParams?: {
    voiceId?: string;
    speed?: number;
    nightMode?: boolean;
  };
}

export interface InstantCharacterSetupJob extends BaseJob {
  type: 'instant_character_setup';
  requestId: string;
}

// Legacy job types (for backwards compatibility during migration)
interface LegacyBaseJob {
  id: string;
  type: 'story_generation' | 'regenerate_scene_image' | 'audio_generation';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  retries: number;
  createdAt: Date;
  error?: string;
}

interface StoryGenerationLegacyJob extends LegacyBaseJob {
  type: 'story_generation';
  requestId: string;
}

interface RegenerateSceneImageJob extends LegacyBaseJob {
  type: 'regenerate_scene_image';
  storyId: string;
  sceneId: number;
  visualPrompt?: string;
}

interface AudioGenerationLegacyJob extends LegacyBaseJob {
  type: 'audio_generation';
  storyId: string;
  userId: string;
  voiceParams?: {
    voiceId?: string;
    speed?: number;
    nightMode?: boolean;
  };
}

type LegacyJob = StoryGenerationLegacyJob | RegenerateSceneImageJob | AudioGenerationLegacyJob;

// Input types for StoryJobQueue.addJob (no BaseJob/LegacyBaseJob fields)
interface AudioGenerationJobInput {
  type: 'audio_generation';
  storyId: string;
  userId: string;
  voiceParams?: {
    voiceId?: string;
    speed?: number;
    nightMode?: boolean;
  };
}

interface RegenerateSceneImageInput {
  type: 'regenerate_scene_image';
  storyId: string;
  sceneId: number;
  visualPrompt?: string;
}

// ── New Queue Instances ──

/**
 * Text generation queue
 * Concurrency from text rate limiter (default: 3)
 */
export const textQueue = new ConcurrentJobQueue<TextGenerationJob>({
  name: 'text',
  maxConcurrency: () => config.queue.textConcurrency,
  processor: processTextGeneration,
  pollIntervalMs: config.queue.pollIntervalMs,
});

/**
 * Image generation queue
 * Concurrency from image rate limiter (default: 10)
 * Group ordering by storyId ensures per-story sequential, cross-story parallel
 */
export const imageQueue = new ConcurrentJobQueue<ImageGenerationJob>({
  name: 'image',
  maxConcurrency: () => config.queue.imageConcurrency,
  processor: processImageGeneration,
  groupKeyFn: (job) => job.storyId,
  pollIntervalMs: config.queue.pollIntervalMs,
});

/**
 * Enqueue image batch job directly (e.g. for retry-images after IMAGE_OTHER failure).
 */
export function enqueueImageBatch(requestId: string, storyId: string, isContinuation = false): string {
  return imageQueue.addJob({
    type: 'image_batch',
    requestId,
    storyId,
    isContinuation,
  });
}

/**
 * Audio generation queue
 * Concurrency from audio rate limiter (default: 2)
 */
export const audioQueue = new ConcurrentJobQueue<AudioGenerationJob>({
  name: 'audio',
  maxConcurrency: () => config.queue.audioConcurrency,
  processor: processAudioGeneration,
  pollIntervalMs: config.queue.pollIntervalMs,
});

/**
 * Instant character setup queue
 * For photo analysis, character creation, and turnaround generation in instant mode
 * Concurrency controlled by config (default: 3)
 */
export const instantQueue = new ConcurrentJobQueue<InstantCharacterSetupJob>({
  name: 'instant-character-setup',
  maxConcurrency: () => config.queue.instantConcurrency || 3,
  processor: processInstantCharacterSetup,
  pollIntervalMs: config.queue.pollIntervalMs,
});

// ── Processors ──

/**
 * Process text generation job (direct text + validation)
 * On completion, enqueues an image batch job in imageQueue to release the text slot
 */
async function processTextGeneration(job: TextGenerationJob): Promise<void> {
  logger.info({ requestId: job.requestId, isContinuation: job.isContinuation }, 'Processing text generation');

  let storyId: string;

  if (job.isContinuation) {
    const { processContinuationRequest } = await import('../services/storyOrchestrationService');
    const result = await processContinuationRequest(job.requestId);
    storyId = result.storyId;
  } else {
    const { processStoryRequest } = await import('../services/storyOrchestrationService');
    const result = await processStoryRequest(job.requestId);
    storyId = result.storyId;
  }

  logger.info({ requestId: job.requestId, storyId }, 'Text generation completed, enqueuing image batch');

  // Enqueue image batch job to run in imageQueue (releases text slot)
  try {
    imageQueue.addJob({
      type: 'image_batch',
      requestId: job.requestId,
      storyId,
      isContinuation: job.isContinuation,
    });
  } catch (enqueueError) {
    // Text generation succeeded and story is saved -- mark request as completed
    // even though images won't be generated. User can retry image generation later.
    logger.error({
      requestId: job.requestId,
      storyId,
      err: enqueueError,
    }, 'Failed to enqueue image batch after text generation. Story saved without images.');

    try {
      await getStoryRepository().updateRequest(job.requestId, {
        status: 'completed',
        storyId,
        updatedAt: new Date(),
      });
    } catch (dbError) {
      logger.error({ requestId: job.requestId, err: dbError }, 'Failed to mark request as completed after image enqueue failure');
    }
  }
}

/**
 * Process image generation job
 * Handles both batch (full story images) and individual (scene regeneration)
 */
async function processImageGeneration(job: ImageGenerationJob): Promise<void> {
  if (job.type === 'image_batch') {
    // Batch image generation: all images for a story
    logger.info({
      storyId: job.storyId,
      requestId: job.requestId,
      isContinuation: job.isContinuation,
    }, 'Processing image batch');

    if (job.isContinuation) {
      const { processContinuationImages } = await import('../services/storyOrchestrationService');
      await processContinuationImages(job.requestId);
    } else {
      const { processStoryImages } = await import('../services/storyOrchestrationService');
      await processStoryImages(job.requestId);
    }

    logger.info({ storyId: job.storyId, requestId: job.requestId }, 'Image batch completed');
  } else {
    // Individual scene image regeneration
    logger.info({
      storyId: job.storyId,
      sceneId: job.sceneId,
    }, 'Processing single image regeneration');

    const { regenerateSceneImage } = await import('../services/storyOrchestrationService');
    await regenerateSceneImage(job.storyId, job.sceneId!);

    logger.info({ storyId: job.storyId, sceneId: job.sceneId }, 'Image regeneration completed');
  }
}

/**
 * Process audio generation job (TTS + alignment)
 */
async function processAudioGeneration(job: AudioGenerationJob): Promise<void> {
  logger.info({
    storyId: job.storyId,
    userId: job.userId,
  }, 'Processing audio generation');

  const { getAudioDomainService } = await import('../domain/audio');
  const { groupScenesIntoChunks } = await import('../domain/audio/sceneGrouper');
  const { getConcurrencyLimitForPlan } = await import('../config');

  // Load story
  const story = await getStoryRepository().findById(job.storyId);

  if (!story) {
    throw new Error('Story not found');
  }

  // Load scenes ordered by sceneId; strip character IDs but keep allowed audio tags
  const { stripForAudio } = await import('../utils/audioTags');
  const storyScenes = await getSceneRepository().findByStoryId(job.storyId);
  const scenesForAudio = storyScenes.map((s) => ({
    sceneId: s.sceneId,
    text: stripForAudio(s.text || ''),
  }));

  logger.info({
    storyId: job.storyId,
    totalScenes: scenesForAudio.length,
    totalChars: scenesForAudio.reduce((sum, s) => sum + s.text.length, 0),
  }, 'Loaded scenes for audio generation');

  // Get user's plan and concurrency limit
  const { getUserSubscription, getPlanById } = await import('../services/planService');
  const subscription = await getUserSubscription(job.userId);
  const plan = subscription ? await getPlanById(subscription.planId) : null;
  const planType = plan?.slug === 'premium' ? 'premium' : 'free';
  const concurrencyLimit = getConcurrencyLimitForPlan(plan?.slug);

  // Group scenes for parallel generation
  const sceneGroups = groupScenesIntoChunks(scenesForAudio, concurrencyLimit);

  logger.info({
    storyId: job.storyId,
    concurrencyLimit,
    numGroups: sceneGroups.length,
  }, 'Scene groups created for audio generation');

  const audioDomain = getAudioDomainService();
  const audioGenStart = Date.now();

  try {
    const result = await audioDomain.synthesizeSceneGroups(
      story,
      sceneGroups,
      job.voiceParams || {},
      planType,
      concurrencyLimit,
    );

    const audioGenerationTimeMs = Date.now() - audioGenStart;
    const fullTextLength = scenesForAudio.reduce((sum, s) => sum + s.text.length, 0);

    // Update story with audio metadata + generation timing
    await getStoryRepository().updateStory(job.storyId, {
      audioMetadata: {
        voiceId: result.voiceId,
        voiceName: result.voiceName,
        totalDuration: result.duration,
        generatedAt: new Date().toISOString(),
        nightMode: job.voiceParams?.nightMode || false,
        audioGenerationTimeMs,
        fullTextLength,
      },
    });

    // Increment usage
    const { incrementUsage } = await import('../services/planService');
    const durationMinutes = Math.ceil(result.duration / 60);
    await incrementUsage(job.userId, 'audio', durationMinutes);

    logger.info({
      storyId: job.storyId,
      duration: result.duration,
      durationMinutes,
    }, 'Audio generation completed - user charged');

    // Generate forced alignment
    try {
      const { getAlignmentProvider } = await import('../services/aiService');
      const alignmentProvider = getAlignmentProvider();
      const finalAssetId = result.assetId;

      const alignmentResult = await audioDomain.generateAlignmentForStory(
        job.storyId,
        finalAssetId,
        alignmentProvider,
      );

      const alignmentData = {
        characters: alignmentResult.characters,
        words: alignmentResult.words,
        averageConfidence: alignmentResult.averageConfidence,
        provider: alignmentProvider.getProviderName().toLowerCase(),
        language: alignmentResult.language,
        generatedAt: new Date().toISOString(),
      };

      // Phase 2: Store alignment in dedicated table
      const { getAlignmentRepository } = await import('../repositories');
      await getAlignmentRepository().upsert(job.storyId, alignmentData, finalAssetId);

      const currentAudioMetadata = (story.audioMetadata as Record<string, unknown>) || {};
      await getStoryRepository().updateStory(job.storyId, {
        audioMetadata: {
          ...currentAudioMetadata,
          voiceId: result.voiceId,
          voiceName: result.voiceName,
          totalDuration: result.duration,
          generatedAt: new Date().toISOString(),
          nightMode: job.voiceParams?.nightMode || false,
        },
        updatedAt: new Date(),
      });

      logger.info({
        storyId: job.storyId,
        wordCount: alignmentResult.words.length,
      }, 'Forced alignment generated');
    } catch (alignmentError) {
      logger.error({ err: alignmentError, storyId: job.storyId }, 'Alignment failed (audio still OK)');
    }

    // Bump public_render_version for published stories (SSR cache invalidation)
    if (story.isPublished && story.publishedSlug) {
      await getStoryRepository().incrementPublicRenderVersion(job.storyId);
    }
  } catch (error) {
    logger.error({
      storyId: job.storyId,
      userId: job.userId,
      error: (error as Error).message,
    }, 'Audio generation failed - user NOT charged');

    const currentMetadata = (story.audioMetadata as Record<string, unknown>) || {};
    await getStoryRepository().updateStory(job.storyId, {
      audioMetadata: {
        ...currentMetadata,
        error: true,
        errorMessage: 'Audio generation failed. Please try again.',
        failedAt: new Date().toISOString(),
      },
    });

    throw error;
  }
}

/**
 * Process instant character setup job
 * Handles photo deduplication, character analysis, creation, and turnaround generation
 * Then enqueues text generation job
 */
async function processInstantCharacterSetup(job: InstantCharacterSetupJob): Promise<void> {
  const { requestId } = job;
  
  try {
    logger.info({ requestId, jobId: job.id }, 'Starting instant character setup');
    
    // Load request with intermediate data
    const request = await getStoryRepository().findRequestById(requestId);
    if (!request) {
      throw new Error(`Story request ${requestId} not found`);
    }
    
    const intermediateData = (request.intermediateData as any) || {};
    const photos: string[] = intermediateData.photos || [];
    
    if (photos.length === 0) {
      throw new Error('No photos found in intermediate data');
    }
    
    // Check if already processed (idempotency)
    if (intermediateData.characterSetupComplete === true) {
      logger.info({ requestId }, 'Character setup already complete, skipping to story generation');
      await textQueue.addJob({
        type: 'text_generation',
        requestId,
        isContinuation: false,
      });
      return;
    }
    
    const language = request.storyLanguage || 'uk';
    
    // Step 1: Face deduplication (with progress tracking)
    const { startTask, completeTask, STORY_TASKS } = await import('../services/storyProgress');
    await startTask(requestId, STORY_TASKS.ANALYZING_PHOTOS, {
      estimatedMs: 30000,
    });
    
    const { getFaceDeduplicationService } = await import('../services/faceDeduplicationService');
    const faceDeduplicationService = getFaceDeduplicationService();
    const photoGroups = await faceDeduplicationService.groupPhotosByIdentity(photos);
    
    logger.info({
      requestId,
      totalPhotos: photos.length,
      groupsFound: photoGroups.length
    }, 'Photos deduplicated into groups');
    
    // Save photo groups for potential retry
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: {
        ...intermediateData,
        photoGroups,
      }
    });
    
    // Step 2: Create characters from photo groups
    const createdCharacterIds: string[] = [];
    
    const { CharacterAnalysisService } = await import('../services/characterAnalysisService');
    const { GeminiTextProvider } = await import('../providers/text/gemini/GeminiTextProvider');
    const { generateTurnaroundSheet, isTurnaroundSheetEnabled } = await import('../services/turnaroundSheetService');
    const { getCharacterRepository } = await import('../repositories');
    
    const geminiProvider = new GeminiTextProvider(config.google.apiKey);
    const analysisService = new CharacterAnalysisService(geminiProvider);
    
    for (const group of photoGroups) {
      try {
        // 2.1: Analyze photos
        const analysisType = group.characterType === 'animal' ? 'animal' :
                            group.characterType === 'imaginary' ? 'imaginary' :
                            'person';
        
        logger.info({
          requestId,
          groupName: group.name,
          photoCount: group.photoUrls.length,
          characterType: analysisType
        }, 'Analyzing character from photos (instant mode)');
        
        const analysis = await analysisService.analyzeCharacter({
          photos: group.photoUrls,
          characterType: analysisType,
          language
        });
        
        const characterName = analysis.suggestedName || group.name;
        
        // 2.2: Map face deduplication type to DB schema with default subtypes
        const typeMapping: Record<'person' | 'animal' | 'imaginary', { type: string; subtype: string }> = {
          person: { type: 'person', subtype: 'other_adult' },
          animal: { type: 'animal', subtype: 'other_animal' },
          imaginary: { type: 'imaginary', subtype: 'imaginary_friend' }
        };
        
        const { type, subtype } = typeMapping[group.characterType];
        
        // 2.3: Create character record
        const character = await getCharacterRepository().create({
          userId: request.userId,
          name: characterName,
          type,
          subtype,
          description: analysis.detailedDescription,
          aiGeneratedDescription: analysis.detailedDescription,
          referencePhotos: group.photoUrls.map(url => ({ url })),
          appearanceTraits: analysis.appearanceTraits,
          isHidden: false,
        } as any);
        
        logger.info({
          requestId,
          characterId: character.id,
          characterName: character.name,
          characterType: character.type,
          characterSubtype: character.subtype,
          detectedFrom: group.characterType
        }, 'Character created from photos (instant mode)');
        
        // 2.3: Generate turnaround sheet for ALL character types (person, animal, imaginary)
        if (isTurnaroundSheetEnabled() && group.photoUrls.length > 0) {
          try {
            logger.info({
              characterId: character.id,
              characterName: character.name,
              characterType: group.characterType,
              requestId
            }, 'Generating turnaround sheet (instant mode)');
            
            const turnaroundResult = await generateTurnaroundSheet({
              characterId: character.id,
              userId: request.userId,
              referencePhotoUrl: group.photoUrls[0],
              characterName: character.name,
              aiDescription: analysis.detailedDescription
            });
            
            logger.info({
              characterId: character.id,
              turnaroundUrl: turnaroundResult.url,
              characterType: group.characterType,
              requestId
            }, 'Turnaround sheet generated (instant mode)');
          } catch (turnaroundError) {
            logger.error({
              error: turnaroundError,
              characterId: character.id,
              characterType: group.characterType,
              requestId
            }, 'Turnaround generation failed (continuing without it)');
          }
        }
        
        createdCharacterIds.push(character.id);
        
      } catch (error) {
        logger.error({
          error,
          groupName: group.name,
          requestId
        }, 'Failed to create character from photo group');
      }
    }
    
    await completeTask(requestId, STORY_TASKS.ANALYZING_PHOTOS);
    
    if (createdCharacterIds.length === 0) {
      throw new Error('Failed to create any characters from photos');
    }
    
    logger.info({
      requestId,
      charactersCreated: createdCharacterIds.length
    }, 'Characters created successfully');
    
    // Step 3: Update story request with character IDs and mark setup complete
    await getStoryRepository().updateRequest(requestId, {
      selectedCharacters: createdCharacterIds,
      intermediateData: {
        ...intermediateData,
        photoGroups,
        createdCharacterIds,
        characterSetupComplete: true,
      }
    });
    
    logger.info({
      requestId,
      selectedCharacters: createdCharacterIds,
      characterCount: createdCharacterIds.length,
    }, 'Story request updated with auto-selected characters');
    
    // Step 4: Enqueue text generation job
    await textQueue.addJob({
      type: 'text_generation',
      requestId,
      isContinuation: false,
    });
    
    logger.info({ requestId }, 'Text generation job enqueued after character setup');
    
  } catch (error) {
    logger.error({
      error,
      requestId,
      jobId: job.id
    }, 'Instant character setup failed');
    
    await getStoryRepository().updateRequest(requestId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Character setup failed',
      updatedAt: new Date(),
    });
    
    throw error;
  }
}

// ── Legacy StoryJobQueue (for scene image regeneration only) ──

class StoryJobQueue {
  private queue: Map<string, LegacyJob> = new Map();
  private processing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 2;
  private readonly POLL_INTERVAL_MS = 2000;

  start() {
    if (this.intervalId) return;
    logger.info({ pollInterval: this.POLL_INTERVAL_MS }, 'Starting legacy job queue (regeneration only)');
    this.intervalId = setInterval(() => this.processNext(), this.POLL_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async addJob(requestIdOrJobData: string | AudioGenerationJobInput | RegenerateSceneImageInput): Promise<string> {
    let job: LegacyJob;

    if (typeof requestIdOrJobData === 'string') {
      // Story generation -- redirect to appropriate queue based on request type
      // Check if this is instant mode or continuation by reading intermediateData from DB
      const request = await getStoryRepository().findRequestById(requestIdOrJobData);
      const intermediateData = request?.intermediateData as Record<string, unknown> | null;
      
      // Check if instant mode
      if (intermediateData?.instantMode === true) {
        const actualJobId = instantQueue.addJob({
          type: 'instant_character_setup',
          requestId: requestIdOrJobData,
        });
        return actualJobId;
      }
      
      // Check if continuation
      const isContinuation = !!intermediateData?.isContinuation;

      const actualJobId = textQueue.addJob({
        type: 'text_generation',
        requestId: requestIdOrJobData,
        isContinuation,
      });
      return actualJobId;
    } else if (requestIdOrJobData.type === 'audio_generation') {
      // Audio generation -- redirect to audioQueue with estimated time
      let estimatedTotalMs: number | undefined;
      try {
        const { getGenerationCoefficients, estimateAudioGenerationMs } = await import('../services/generationTimeService');
        const story = await getStoryRepository().findById(requestIdOrJobData.storyId);
        if (story) {
          const val = (story.metadata as Record<string, unknown>)?.fullTextLength;
          const fullTextLength = typeof val === 'number' ? val : 0;
          const coefficients = await getGenerationCoefficients();
          estimatedTotalMs = estimateAudioGenerationMs(coefficients, fullTextLength);
        }
      } catch (err) {
        logger.warn({ err, storyId: requestIdOrJobData.storyId }, 'Failed to estimate audio time, using default');
      }

      const actualJobId = audioQueue.addJob({
        type: 'audio_generation',
        storyId: requestIdOrJobData.storyId,
        userId: requestIdOrJobData.userId,
        voiceParams: requestIdOrJobData.voiceParams,
        estimatedTotalMs,
      });
      return actualJobId;
    } else {
      // Regenerate scene image -- handle via legacy queue
      const legacyJobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      job = {
        ...requestIdOrJobData,
        id: legacyJobId,
        status: 'queued' as const,
        retries: 0,
        createdAt: new Date(),
      };
      this.queue.set(legacyJobId, job);
      logger.info({ jobId: legacyJobId, type: job.type, queueSize: this.queue.size }, 'Job added to legacy queue');
      return legacyJobId;
    }
  }

  private async processNext() {
    if (this.processing) return;

    const job = Array.from(this.queue.values()).find(j => j.status === 'queued');
    if (!job) return;

    this.processing = true;
    job.status = 'processing';

    try {
      if (job.type === 'regenerate_scene_image') {
        await processRegenerateSceneImageLegacy(job as RegenerateSceneImageJob);
      }
      job.status = 'completed';
      setTimeout(() => this.queue.delete(job.id), 60000);
    } catch (error) {
      job.retries++;
      if (job.retries < this.MAX_RETRIES) {
        job.status = 'queued';
      } else {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        setTimeout(() => this.queue.delete(job.id), 300000);
      }
    } finally {
      this.processing = false;
    }
  }

  getJobStatus(jobId: string): LegacyJob | null {
    return this.queue.get(jobId) || null;
  }

  getStats() {
    const stats = { total: this.queue.size, queued: 0, processing: 0, completed: 0, failed: 0 };
    for (const job of this.queue.values()) {
      stats[job.status]++;
    }
    return stats;
  }

  /**
   * Get audio job status -- delegates to audioQueue
   */
  getAudioJobStatus(storyId: string): 'queued' | 'processing' | null {
    const info = audioQueue.getQueueInfo(j => j.storyId === storyId);
    return info.jobStatus;
  }

  hasAudioJobForStory(storyId: string): boolean {
    return this.getAudioJobStatus(storyId) !== null;
  }

  clear() {
    this.queue.clear();
  }
}

async function processRegenerateSceneImageLegacy(job: RegenerateSceneImageJob): Promise<void> {
  logger.info({ storyId: job.storyId, sceneId: job.sceneId }, 'Regenerating scene image (legacy)');
  const { regenerateSceneImage } = await import('../services/storyOrchestrationService');
  await regenerateSceneImage(job.storyId, job.sceneId, job.visualPrompt);
}

// ── Exports ──

export const storyJobQueue = new StoryJobQueue();

/**
 * Start all queues
 */
export function startAllQueues(): void {
  textQueue.start();
  imageQueue.start();
  audioQueue.start();
  storyJobQueue.start();
  logger.info('All job queues started');
}

/**
 * Stop all queues
 */
export function stopAllQueues(): void {
  textQueue.stop();
  imageQueue.stop();
  audioQueue.stop();
  storyJobQueue.stop();
  logger.info('All job queues stopped');
}
