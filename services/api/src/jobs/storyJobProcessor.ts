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

import type { StoryAudioMetadata } from '@wondertales/shared';
import { DEFAULT_LOCALE } from '@wondertales/shared';
import { logger } from '../utils/logger';
import { recordUsage } from '../services/aiUsageService';
import { ConcurrentJobQueue, type BaseJob } from './ConcurrentJobQueue';
import { config } from '../config';
import { assertUserPhotoInputs } from '../services/photoInputSafetyService';
import { assertStoryFromDrawingAccessForPhotos } from '../services/storyFromDrawingAccessService';
import { releaseAudioQuotaReservationForStory } from '../services/audioQuotaReservationService';
import { releaseStoryQuotaReservationForRequest } from '../services/storyQuotaService';
import { releaseGraphicNovelQuotaReservationForRequest } from '../services/graphicNovelQuotaService';
import { getStoryCreationAttributionInputFromRequest } from '../services/storyCreationAttributionService';
import {
  getStoryRepository,
  getSceneRepository,
  getVoiceRepository,
  getUsageEventsRepository,
} from '../repositories';
import { isGrokBlockedForStoryLanguage } from '../providers/audio/grok/supportedLocales';
import { getIllustrationBlockStartSceneIds } from '../services/storyOrchestration/utilities';

const ESTIMATED_SCENE_COUNT_BY_AGE_GROUP: Record<string, number> = {
  '0-1': 5,
  '1y': 5,
  '2-3': 6,
  '4-5': 8,
  '6-8': 9,
  '9-12': 11,
};

function estimateSceneCountForAgeGroup(ageGroup?: string): number {
  if (!ageGroup) return 6;
  return ESTIMATED_SCENE_COUNT_BY_AGE_GROUP[ageGroup] ?? 6;
}

function estimateTrackedImageCount(totalScenes: number, imagesPerStory: number): number {
  if (totalScenes <= 0 || imagesPerStory <= 0) {
    return 0;
  }

  const illustratedSceneCount = getIllustrationBlockStartSceneIds(totalScenes, imagesPerStory).length;

  return Math.min(2, illustratedSceneCount);
}

function estimateProducerMs(illustrationCount: number): number {
  if (illustrationCount <= 0) {
    return 0;
  }

  return Math.max(15000, illustrationCount * 15000);
}

async function warmStoryQuizGeneration(storyId: string, requestId: string): Promise<void> {
  try {
    const story = await getStoryRepository().findById(storyId);
    if (!story) {
      logger.warn({ requestId, storyId }, 'Skipping story quiz warmup: story not found');
      return;
    }

    const { generateStoryQuiz } = await import('../services/storyQuizService');
    await generateStoryQuiz(story, {
      userId: story.userId,
      childProfileId: story.createdByChildProfileId ?? story.childProfileId ?? null,
    });
    logger.info({ requestId, storyId }, 'Story quiz warmup completed');
  } catch (error) {
    logger.warn(
      { err: error, requestId, storyId },
      'Story quiz warmup failed; quiz can still be generated on demand'
    );
  }
}

function startStoryQuizWarmup(storyId: string, requestId: string): void {
  setImmediate(() => {
    void warmStoryQuizGeneration(storyId, requestId);
  });
}

// ── Job Types ──

export interface TextGenerationJob extends BaseJob {
  type: 'text_generation';
  requestId: string;
  isContinuation?: boolean;
}

export interface ImageGenerationJob extends BaseJob {
  type: 'image_generation' | 'image_batch' | 'graphic_novel_pages';
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
  type: 'story_generation' | 'regenerate_scene_image' | 'regenerate_graphic_novel_page_image' | 'audio_generation';
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

interface RegenerateGraphicNovelPageImageJob extends LegacyBaseJob {
  type: 'regenerate_graphic_novel_page_image';
  storyId: string;
  pageNumber: number;
  preferredTemplateId?: string;
  style?: string;
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

type LegacyJob =
  | StoryGenerationLegacyJob
  | RegenerateSceneImageJob
  | RegenerateGraphicNovelPageImageJob
  | AudioGenerationLegacyJob;

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

interface RegenerateGraphicNovelPageImageInput {
  type: 'regenerate_graphic_novel_page_image';
  storyId: string;
  pageNumber: number;
  preferredTemplateId?: string;
  style?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function releaseStoryQuotaAfterPermanentFailure(
  requestId: string,
  reason: 'generation_failed' | 'instant_setup_failed',
  error: unknown
): Promise<void> {
  const result = await releaseStoryQuotaReservationForRequest(requestId, {
    reason,
    errorMessage: errorMessage(error),
  });
  logger.info(
    {
      requestId,
      reason,
      released: result.released,
      skippedReason: result.skippedReason,
      netReserved: result.netReserved,
    },
    'Story quota reservation permanent-failure release checked'
  );
}

async function releaseQuotaAfterTextPermanentFailure(
  requestId: string,
  error: unknown
): Promise<void> {
  await releaseStoryQuotaAfterPermanentFailure(requestId, 'generation_failed', error);

  const request = await getStoryRepository().findRequestById(requestId);
  const generationKind = (request?.intermediateData as Record<string, unknown> | null | undefined)
    ?.generationKind;
  if (generationKind !== 'graphic_novel') {
    return;
  }

  const result = await releaseGraphicNovelQuotaReservationForRequest(requestId, {
    reason: 'generation_failed',
    errorMessage: errorMessage(error),
  });
  logger.info(
    {
      requestId,
      released: result.released,
      netReserved: result.netReserved,
    },
    'Graphic novel quota reservation permanent-failure release checked'
  );
}

async function markImageRequestAfterPermanentFailure(job: ImageGenerationJob, error: unknown): Promise<void> {
  if (job.type !== 'image_batch' && job.type !== 'graphic_novel_pages') {
    return;
  }

  await getStoryRepository().updateRequest(job.requestId, {
    status: 'failed',
    storyId: job.storyId,
    errorMessage:
      job.type === 'graphic_novel_pages'
        ? 'Graphic novel pages could not be completed. Please try again.'
        : 'Story illustrations could not be completed. Please try again.',
    updatedAt: new Date(),
  });

  logger.info(
    {
      requestId: job.requestId,
      storyId: job.storyId,
      retries: job.retries,
      error: errorMessage(error),
    },
    'Image request marked failed after permanent queue failure'
  );
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
  onPermanentFailure: (job, error) =>
    releaseQuotaAfterTextPermanentFailure(job.requestId, error),
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
  onPermanentFailure: markImageRequestAfterPermanentFailure,
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
  onPermanentFailure: async (job, error) => {
    const result = await releaseAudioQuotaReservationForStory(job.userId, job.storyId, {
      reason: 'audio_generation_failed',
      errorMessage: errorMessage(error),
    });
    logger.info(
      {
        storyId: job.storyId,
        userId: job.userId,
        released: result.released,
        skippedReason: result.skippedReason,
        netReserved: result.netReserved,
      },
      'Audio quota reservation permanent-failure release checked'
    );
  },
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
  onPermanentFailure: (job, error) =>
    releaseStoryQuotaAfterPermanentFailure(job.requestId, 'instant_setup_failed', error),
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

  const request = await getStoryRepository().findRequestById(job.requestId);
  const generationKind = (request?.intermediateData as Record<string, unknown> | null | undefined)
    ?.generationKind;

  if (generationKind === 'graphic_novel') {
    const { processGraphicNovelRequest } = await import('../services/graphicNovelOrchestrationService');
    const result = await processGraphicNovelRequest(job.requestId);
    storyId = result.storyId;

    imageQueue.addJob({
      type: 'graphic_novel_pages',
      requestId: job.requestId,
      storyId,
    });

    logger.info({ requestId: job.requestId, storyId }, 'Graphic novel script/layout completed, enqueued page rendering');
    return;
  }

  const { processStoryRequest } = await import('../services/storyOrchestrationService');
  const result = await processStoryRequest(job.requestId);
  storyId = result.storyId;
  startStoryQuizWarmup(storyId, job.requestId);

  if (result.isScheduledContinuation) {
    // Scheduled continuation: add to batch_image_pending for batch worker, skip imageQueue
    logger.info({ requestId: job.requestId, storyId }, 'Text generation completed, adding to batch_image_pending');
    await getStoryRepository().insertBatchImagePending({
      storyId,
      requestId: job.requestId,
      scheduleId: result.scheduleId ?? null,
    });
    return;
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

    const { processStoryImages } = await import('../services/storyOrchestrationService');
    await processStoryImages(job.requestId, {
      takingLongerThanExpected: job.retries > 0,
    });

    logger.info({ storyId: job.storyId, requestId: job.requestId }, 'Image batch completed');
  } else if (job.type === 'graphic_novel_pages') {
    logger.info({
      storyId: job.storyId,
      requestId: job.requestId,
    }, 'Processing graphic novel pages');

    const { processGraphicNovelPages } = await import('../services/graphicNovelOrchestrationService');
    await processGraphicNovelPages(job.requestId);

    logger.info({ storyId: job.storyId, requestId: job.requestId }, 'Graphic novel page rendering completed');
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
  const { getAudioProviderByName } = await import('../services/aiService');

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

  // Get user's plan
  const { getUserSubscription, getPlanById } = await import('../services/planService');
  const subscription = await getUserSubscription(job.userId);
  const plan = subscription ? await getPlanById(subscription.planId) : null;
  const planType = plan?.slug === 'premium' ? 'premium' : 'free';

  // Resolve voice for chunk limits (align with AudioDomainService: inactive / blocked → fallback)
  const voiceId = job.voiceParams?.voiceId;
  let voiceRow = voiceId ? await getVoiceRepository().findById(voiceId) : null;
  if (voiceRow && !voiceRow.isActive) {
    logger.warn(
      { voiceId, storyId: job.storyId },
      'Job voiceId points to inactive catalog row; using fallback for chunk limits'
    );
    voiceRow = null;
  }
  if (voiceRow?.provider === 'grok' && isGrokBlockedForStoryLanguage(story.language)) {
    logger.warn(
      { voiceId, storyLanguage: story.language },
      'Grok not used for this story language; using fallback for chunk limits'
    );
    voiceRow = null;
  }
  if (!voiceRow) {
    voiceRow = await getVoiceRepository().findFallbackByLanguage(story.language);
  }
  const provider = getAudioProviderByName(voiceRow?.provider ?? 'elevenlabs');
  const concurrencyLimit = provider.getMaxConcurrency(plan?.slug);
  const maxCharsPerChunk = provider.getMaxCharsPerChunk();

  // Group scenes for parallel generation (provider-specific char limit)
  const sceneGroups = groupScenesIntoChunks(scenesForAudio, concurrencyLimit, maxCharsPerChunk);

  logger.info(
    {
      storyId: job.storyId,
      concurrencyLimit,
      numGroups: sceneGroups.length,
      jobVoiceId: voiceId ?? null,
      voiceCatalogDbId: voiceRow?.id,
      voiceCatalogProvider: voiceRow?.provider,
      voiceCatalogProviderVoiceId: voiceRow?.providerVoiceId,
      voiceCatalogName: voiceRow?.name,
    },
    'Scene groups created for audio generation',
  );

  const audioDomain = getAudioDomainService();
  const audioGenStart = Date.now();
  const usageContext = { userId: job.userId, storyId: job.storyId };

  try {
    const result = await audioDomain.synthesizeSceneGroups(
      story,
      sceneGroups,
      job.voiceParams || {},
      planType,
      concurrencyLimit,
      { onUsage: (u) => recordUsage(u, usageContext) },
    );

    const audioGenerationTimeMs = Date.now() - audioGenStart;
    const fullTextLength = scenesForAudio.reduce((sum, s) => sum + s.text.length, 0);

    // Merge: synthesizeSceneGroups already wrote timing + sceneGroupAssetIds to audio_metadata
    const freshAfterSynth = await getStoryRepository().findById(job.storyId);
    const metaAfterSynth = (freshAfterSynth?.audioMetadata as StoryAudioMetadata | null) ?? {};

    await getStoryRepository().updateStory(job.storyId, {
      audioMetadata: {
        ...metaAfterSynth,
        voiceId: result.voiceId,
        voiceName: result.voiceName,
        totalDuration: result.duration,
        generatedAt: new Date().toISOString(),
        nightMode: job.voiceParams?.nightMode || false,
        audioGenerationTimeMs,
        fullTextLength,
        concurrencyLimit,
        numChunks: result.numTtsChunks ?? sceneGroups.length,
      },
    });

    // Increment usage
    const { incrementUsage } = await import('../services/planService');
    const durationMinutes = Math.ceil(result.duration / 60);
    await incrementUsage(job.userId, 'audio', durationMinutes);

    // Record usage event for entitlements (one credit per story per billing period; not per regeneration)
    const { recordUsageEvent } = await import('../services/usageEventsService');
    let alreadyBilledThisPeriod = 0;
    if (subscription) {
      const periodStart = subscription.currentPeriodStart;
      const periodEnd = subscription.currentPeriodEnd ?? subscription.resetAt ?? new Date();
      alreadyBilledThisPeriod = await getUsageEventsRepository().sumAudioSynthesizedForStoryInPeriod(
        job.userId,
        job.storyId,
        periodStart,
        periodEnd
      );
    }
    if (alreadyBilledThisPeriod === 0) {
      await recordUsageEvent(job.userId, 'audio_synthesized', 1, {
        metadata: { storyId: job.storyId },
      });
    } else {
      logger.info(
        { userId: job.userId, storyId: job.storyId },
        'Skipping audio_synthesized usage event — already counted this billing period (regeneration)'
      );
    }

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

      const alignedFresh = await getStoryRepository().findById(job.storyId);
      const currentAudioMetadata = (alignedFresh?.audioMetadata as StoryAudioMetadata | null) || {};
      await getStoryRepository().updateStory(job.storyId, {
        audioMetadata: {
          ...currentAudioMetadata,
          voiceId: result.voiceId,
          voiceName: result.voiceName,
          totalDuration: result.duration,
          generatedAt: new Date().toISOString(),
          nightMode: job.voiceParams?.nightMode || false,
          // Explicitly clear previous error (currentAudioMetadata may have error from stale story load)
          error: undefined,
          errorMessage: undefined,
          failedAt: undefined,
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

    const currentMetadata = (story.audioMetadata as StoryAudioMetadata | null) || {};
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

    assertUserPhotoInputs({
      photos,
      userId: request.userId,
      allowedPhotoTypes: ['character', 'child'],
    });
    await assertStoryFromDrawingAccessForPhotos({
      userId: request.userId,
      photoCount: photos.length,
    });
    
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
    
    const language = request.storyLanguage || DEFAULT_LOCALE;

    // Create story stub at start for AI usage tracking (face dedup, character analysis, turnaround)
    const { createStoryStub } = await import('../services/storyOrchestration/storyRecords');
    const { getChildProfileRepository } = await import('../repositories');
    let storyId: string | undefined = intermediateData.storyId;
    let ageGroup = '4-5';
    if (request.childProfileId) {
      const profile = await getChildProfileRepository().findById(request.childProfileId, request.userId);
      if (profile?.birthDate) {
        const { calculateAgeGroup } = await import('../services/childProfileService');
        const ageMonths = Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        ageGroup = calculateAgeGroup(ageMonths);
      }
    }
    if (!storyId) {
      storyId = await createStoryStub({
        userId: request.userId,
        storyRequestId: request.id,
        childProfileId: request.childProfileId,
        ...getStoryCreationAttributionInputFromRequest(request),
        spec: { language: request.storyLanguage || DEFAULT_LOCALE, ageGroup, characters: [] } as any,
      });
      await getStoryRepository().updateRequest(requestId, {
        intermediateData: { ...intermediateData, storyId },
      });
    }
    
    // Step 1: Face deduplication (with progress tracking)
    const { startTask, completeTask, setPlannedTasks, STORY_TASKS } = await import('../services/storyProgress');
    const { getGenerationCoefficients } = await import('../services/generationTimeService');
    const { getPlanFeatures } = await import('../services/planService');
    const coefficients = await getGenerationCoefficients();
    const userPlan = await getPlanFeatures(request.userId);
    const estimatedSceneCount = estimateSceneCountForAgeGroup(ageGroup);
    const trackedImageCount = estimateTrackedImageCount(
      estimatedSceneCount,
      userPlan.imagesPerStory || 0,
    );
    const illustrationCount = userPlan.imagesPerStory > 0
      ? getIllustrationBlockStartSceneIds(estimatedSceneCount, userPlan.imagesPerStory || 0).length
      : 0;

    await setPlannedTasks(requestId, [
      { task: STORY_TASKS.ANALYZING_PHOTOS, estimatedMs: 30000 },
      { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: coefficients.avgTextMs },
      ...(userPlan.imagesPerStory > 0
        ? [{ task: STORY_TASKS.PRODUCING_VISUALS, estimatedMs: estimateProducerMs(illustrationCount) }]
        : []),
      {
        task: STORY_TASKS.VALIDATING,
        estimatedMs: coefficients.avgValidationMsPerScene * Math.max(estimatedSceneCount, 1),
      },
      {
        task: STORY_TASKS.GENERATING_IMAGES,
        estimatedMs: coefficients.avgMsPerImage * trackedImageCount,
      },
    ]);

    await startTask(requestId, STORY_TASKS.ANALYZING_PHOTOS, {
      estimatedMs: 30000,
    });
    
    const { getFaceDeduplicationService } = await import('../services/faceDeduplicationService');
    const faceDeduplicationService = getFaceDeduplicationService();
    const faceDedupUsageContext = { userId: request.userId, storyId };
    const photoGroups = await faceDeduplicationService.groupPhotosByIdentity(photos, {
      onUsage: (u) => recordUsage(u, faceDedupUsageContext),
    });
    
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
    const { generateTurnaroundSheetFromReference, isTurnaroundSheetEnabled } = await import('../services/turnaroundSheetService');
    const { localizeCharacterNames } = await import('../services/translationService');
    const { getCharacterRepository } = await import('../repositories');
    
    const geminiProvider = new GeminiTextProvider(config.google.apiKey, config.ai.modelVersion);
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
        
        const charAnalysisUsageContext = { userId: request.userId, storyId };
        const analysis = await analysisService.analyzeCharacter(
          {
            photos: group.photoUrls,
            characterType: analysisType,
            language
          },
          { onUsage: (u) => recordUsage(u, charAnalysisUsageContext) }
        );
        
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

        localizeCharacterNames(character, {
          onUsage: (u) => recordUsage(u, charAnalysisUsageContext),
          sourceLocale: language,
        }).catch(err => {
          logger.error(
            { err, requestId, characterId: character.id, characterName: character.name },
            'Character name localization failed (instant mode)',
          );
        });
        
        // 2.3: Generate turnaround sheet for ALL character types (person, animal, imaginary)
        if (isTurnaroundSheetEnabled() && group.photoUrls.length > 0) {
          try {
            logger.info({
              characterId: character.id,
              characterName: character.name,
              characterType: group.characterType,
              requestId
            }, 'Generating turnaround sheet (instant mode)');
            
            const turnaroundResult = await generateTurnaroundSheetFromReference({
              targetType: 'character',
              targetId: character.id,
              referencePhotoUrls: group.photoUrls,
              characterName: character.name,
              userId: request.userId,
              storyId,
              aiDescription: analysis.detailedDescription,
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

    const req = await getStoryRepository().findRequestById(requestId);
    const stubStoryId = (req?.intermediateData as Record<string, unknown> | null)?.storyId as string | undefined;
    if (stubStoryId && req) {
      const existingStory = await getStoryRepository().findById(stubStoryId);
      if (existingStory?.title === 'Generating...') {
        await getStoryRepository().deleteStory(stubStoryId, req.userId);
        logger.info({ requestId, storyId: stubStoryId }, 'Deleted story stub after instant setup failure');
      }
    }

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

  async addJob(
    requestIdOrJobData:
      | string
      | AudioGenerationJobInput
      | RegenerateSceneImageInput
      | RegenerateGraphicNovelPageImageInput
  ): Promise<string> {
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
        const { getAudioProviderByName } = await import('../services/aiService');
        const { getUserSubscription, getPlanById } = await import('../services/planService');
        const story = await getStoryRepository().findById(requestIdOrJobData.storyId);
        if (story) {
          const metaFullTextLength = (story.metadata as Record<string, unknown>)?.fullTextLength;
          const fullTextLength: number =
            story.fullText?.length ??
            (typeof metaFullTextLength === 'number' ? metaFullTextLength : 0);
          const voiceId = requestIdOrJobData.voiceParams?.voiceId;
          let voiceRow = voiceId ? await getVoiceRepository().findById(voiceId) : null;
          if (voiceRow && !voiceRow.isActive) {
            voiceRow = null;
          }
          if (voiceRow?.provider === 'grok' && isGrokBlockedForStoryLanguage(story.language)) {
            voiceRow = null;
          }
          if (!voiceRow) {
            voiceRow = await getVoiceRepository().findFallbackByLanguage(story.language);
          }
          const provider = getAudioProviderByName(voiceRow?.provider ?? 'elevenlabs');
          const subscription = await getUserSubscription(requestIdOrJobData.userId);
          const plan = subscription ? await getPlanById(subscription.planId) : null;
          const concurrencyLimit = provider.getMaxConcurrency(plan?.slug);
          const maxCharsPerChunk = provider.getMaxCharsPerChunk();
          const coefficients = await getGenerationCoefficients();
          estimatedTotalMs = estimateAudioGenerationMs(coefficients, fullTextLength, concurrencyLimit, maxCharsPerChunk);
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
      } else if (job.type === 'regenerate_graphic_novel_page_image') {
        await processRegenerateGraphicNovelPageImageLegacy(job as RegenerateGraphicNovelPageImageJob);
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

async function processRegenerateGraphicNovelPageImageLegacy(
  job: RegenerateGraphicNovelPageImageJob
): Promise<void> {
  logger.info(
    {
      storyId: job.storyId,
      pageNumber: job.pageNumber,
      preferredTemplateId: job.preferredTemplateId,
    },
    'Regenerating graphic novel page image (legacy)'
  );
  const { regenerateGraphicNovelPageImage } = await import('../services/graphicNovelOrchestrationService');
  await regenerateGraphicNovelPageImage({
    storyId: job.storyId,
    pageNumber: job.pageNumber,
    preferredTemplateId: job.preferredTemplateId,
    style: job.style,
  });
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
