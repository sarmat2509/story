import {
  getStoryRepository,
  getSceneRepository,
  getAssetRepository,
  getChildProfileRepository,
  getCharacterRepository,
  getDictionaryRepository,
  getEnvironmentImageCacheRepository,
  getImageValidationRepository,
  getOutfitPlateCacheRepository,
  getStoryEnvironmentCacheRepository,
  getStoryOutfitPlateCacheRepository,
  getAlignmentRepository,
  getStoryArtifactRepository,
} from '../repositories';
import {
  DEFAULT_LOCALE,
  LOCALE_IDS,
  getBaseStoryTextSizePxForAgeGroup,
  getBaseStoryTextSizePxForAgeYears,
  getStoryTextSizePx,
  isValidLocale,
  normalizeStoryTextSizeMultiplier,
  stripCharacterIdFromName,
  type CreateStoryRequestInput,
  type Locale,
} from '@wondertales/shared';
import {
  getStoryDomainService,
  getImageDomainService,
  getComplexImageDomainService,
  getAudioDomainService,
  getEnvironmentImageProvider,
} from './aiService';
import { recordUsage, USAGE_OP_IMAGE_ENVIRONMENT } from './aiUsageService';
import { getAssetStorageService } from './assetStorageService';
import { getPlanFeatures } from './planService';
import {
  STORY_TASKS,
  startTask,
  completeTask,
  transitionTask,
  updateTaskProgress,
  recalculateStoryProgress,
  setPlannedTasks,
  StoryProgress,
} from './storyProgress';
import { buildPolicyProfile } from './policyService';
import { getGenerationCoefficients } from './generationTimeService';
import type { StorySpec, StoryEnvironment, ImageValidationResult } from '../ai/types';
import {
  charHasIdentityReference,
  findExpectedForValidationChar,
} from '../domain/image/imageValidationRun';
import { logger } from '../utils/logger';
import { incrementLandingRenderVersion, removePublishedSlug } from '../ssr/storyCache';
import {
  extractClosingKeepsakeFromEpisodeText,
  stripCharacterIds,
  stripAllTags,
} from '../utils/audioTags';
import {
  isNaturalAppearanceOutfit,
  parseCharacterOutfitsString,
  serializeCharacterOutfitsToStr,
  lookupOutfitForCharacterName,
  resolveOutfitDescriptionsFromSceneIds,
  lookupOutfitIdForCharacterName,
  type StoryOutfitDefinition,
} from '../utils/characterOutfits';
import {
  applyReferenceBucketLimits,
  assignSequentialImageIndices,
  buildPlaceholderReferenceNameMap,
  collectOutfitPlateImageIndices,
  logReferenceBucketDelivery,
} from './referenceImageBuckets';
import {
  getOrCreateOutfitPlateImage,
  normalizeOutfitPlateCharacterKey,
  sceneCharacterHasVisualReference,
  shouldGenerateOutfitPlateForCharacter,
  omitOutfitProseForNonHumanCharacters,
} from './outfitPlateService';
import type { CharacterReference } from '../prompts/image';
import {
  ENVIRONMENT_REFERENCE_CACHE_PREFIX,
  buildEnvironmentImageCacheDescription,
  buildImageSystemInstruction,
  buildEnvironmentImagePrompt,
  isCurrentEnvironmentImageCacheDescription,
} from '../prompts/image';
import {
  buildImageEditSystemInstruction,
  type ImageEditRepairManifest,
  type ImageEditRepairIssue,
  type ImageEditRepairIssueKind,
} from '../prompts/image/ImageEditPrompt';
import type { UploadedFile } from '../providers/base/IFileManager';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { validate as isUUID } from 'uuid';
import crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { config } from '../config';
import { deleteStoryStorageFiles } from './storyDeletionService';
import { invalidateSitemapCache } from './sitemapService';
import {
  flattenCameraComposition,
  type StoryRequestData,
  type ChildProfileData,
  type CharacterData,
  type SceneData,
  type SceneVisual,
  type ImageGenerationContext,
  type StoryOutfitEntry,
  type ReferencePhoto,
  type AppearanceTraits,
} from './types';
import {
  isGraphicNovelStyleGenerationKind,
  type StoryGenerationKind,
} from './generationKindRouting';
import type { BuiltScenePromptPayload } from '../domain/image/ImageDomainService';
// NEW M9: Character-based reference tracking
import {
  buildCharacterRegistry,
  normalizeCharacterName,
  matchCharacterNames,
  toPhoneticKey,
  crossScriptIdentityKey,
  type NormalizedCharacter,
} from '../utils/characterNormalization';
import { loadReferenceImageData } from './referenceImageTracker';
import { generateEmbedding } from './embeddingService';
import { generateLlmCharacterTurnaround } from './turnaroundSheetService';
import {
  createStoryStub,
  enrichStoryRecord,
  createStoryRecord,
  persistLlmCharacters,
  mergeCharacters,
} from './storyOrchestration/storyRecords';
import { validateStoryScenes } from './storyOrchestration/validation';
import {
  mergeDirectorIntoText,
  extractLlmCharactersFromText,
  getIllustrationBlockStartSceneIds,
  composeScenesIntoBlocks,
} from './storyOrchestration/utilities';
import { persistImageValidationResult } from './imageValidationPersistenceService';
import { persistStoryDirectorScenes } from './storyDirectorScenePersistenceService';
import {
  ensureStoryDefaultCoverAssetId,
  loadStoryCoverAssets,
  refreshStoryCoverAssetForScene,
  setStoryCoverAssetIfMissing,
} from './storyCoverService';
import {
  createStoryRequestWithQuotaReservation,
  isStoryQuotaError,
  type StoryQuotaReservationSource,
} from './storyQuotaService';
import { assertStoryPromptSafety, isPromptSafetyError } from './promptSafetyService';
import { recordStageTiming, withStageTiming } from './generationStageTimingService';
import { assertVoiceAccessForUser } from './voiceAccessService';
import { assertSceneImageGenerationAccessForStory } from './imageStoryLimitService';
import { localizeCharacterNames } from './translationService';
import {
  buildStoryCreationAttribution,
  getStoryCreationAttributionInputFromRequest,
  type StoryCreatedByMode,
} from './storyCreationAttributionService';
import { storyArtifactImageUrls } from './storyArtifactImageService';
import { resolveStoryArtifactTitle, selectStoryArtifactForPrompt } from './storyArtifactService';

const ESTIMATED_SCENE_COUNT_BY_AGE_GROUP: Record<string, number> = {
  '0-1': 5,
  '1y': 5,
  '2-3': 6,
  '4-5': 8,
  '6-8': 9,
  '9-12': 11,
};

const IMAGE_PROMPT_DEBUG_ROOT = path.resolve(__dirname, '../../../..', 'image-prompt-debug');

function estimateSceneCountForAgeGroup(ageGroup?: string): number {
  if (!ageGroup) return 6;
  return ESTIMATED_SCENE_COUNT_BY_AGE_GROUP[ageGroup] ?? 6;
}

function estimateTrackedImageCount(totalScenes: number, imagesPerStory: number): number {
  if (totalScenes <= 0 || imagesPerStory <= 0) {
    return 0;
  }

  const sceneIds = getIllustrationBlockStartSceneIds(totalScenes, imagesPerStory);
  return Math.min(2, sceneIds.length);
}

function estimateProducerMs(illustrationCount: number): number {
  if (illustrationCount <= 0) {
    return 0;
  }

  return Math.max(15000, illustrationCount * 15000);
}

function buildFixedStagePlan(params: {
  coefficients: {
    avgTextMs: number;
    avgValidationMsPerScene: number;
    avgMsPerImage: number;
  };
  sceneCount: number;
  imagesPerStory: number;
  includePhotoAnalysis?: boolean;
  includeProducer?: boolean;
  photoAnalysisMs?: number;
}): Array<{ task: (typeof STORY_TASKS)[keyof typeof STORY_TASKS]; estimatedMs: number }> {
  const {
    coefficients,
    sceneCount,
    imagesPerStory,
    includePhotoAnalysis = false,
    includeProducer = false,
    photoAnalysisMs = 30000,
  } = params;

  const trackedImageCount = estimateTrackedImageCount(sceneCount, imagesPerStory);
  const illustrationCount =
    imagesPerStory > 0 ? getIllustrationBlockStartSceneIds(sceneCount, imagesPerStory).length : 0;

  return [
    ...(includePhotoAnalysis
      ? [{ task: STORY_TASKS.ANALYZING_PHOTOS, estimatedMs: photoAnalysisMs }]
      : []),
    { task: STORY_TASKS.GENERATING_TEXT, estimatedMs: coefficients.avgTextMs },
    ...(includeProducer
      ? [
          {
            task: STORY_TASKS.PRODUCING_VISUALS,
            estimatedMs: estimateProducerMs(illustrationCount),
          },
        ]
      : []),
    {
      task: STORY_TASKS.VALIDATING,
      estimatedMs: coefficients.avgValidationMsPerScene * Math.max(sceneCount, 1),
    },
    {
      task: STORY_TASKS.GENERATING_IMAGES,
      estimatedMs: coefficients.avgMsPerImage * trackedImageCount,
    },
  ];
}

/**
 * Story Orchestration Service (Milestone 3)
 * Coordinates the entire story generation workflow
 *
 * Architecture:
 * - MUST call Domain Services (NOT providers)
 * - NEVER import or use providers directly
 * - NEVER build prompts or handle LLM details
 * - ONLY manage workflow and progress updates
 *
 * Canonical realtime scene illustration path (production):
 * - Queue job `image_batch` → `processStoryImages` (this file)
 * - Per scene (possibly parallel via `parallelStreams`): on-demand environment image
 *   (`getOrCreateEnvironmentImage`) with dedupe maps → optional Files API upload for env
 * → lazy LLM character turnaround when needed (`ensureLlmTurnaroundsForSceneCharacters`)
 * → unified character reference paths (`getSceneCharacterReferencePaths`: turnaround, else photos)
 * → `generateSceneImageWithReference` (Nano Banana / configured image domain).
 * Retry failed images re-enqueues the same job. Regenerate-one-scene should mirror this path.
 * Separate: `batchImageWorkerJob` (text-only batch API) and legacy ops script `regenerateImages.ts`.
 */

/**
 * Backward compatibility: migrate old string visualPrompt to structured sceneVisual.
 *
 * Three cases:
 * 1. Scene already has sceneVisual object → use as-is
 * 2. Scene has visualPrompt that is a JSON string (new stories stored via JSON.stringify) → parse it
 * 3. Scene has visualPrompt that is a plain string (old stories) → put into cameraComposition
 */
function migrateVisualPrompt(scene: any): SceneVisual {
  if (scene.sceneVisual) return scene.sceneVisual as SceneVisual;

  const vp = scene.visualPrompt || '';

  // Try to parse JSON (new stories store JSON.stringify(sceneVisual) in visualPrompt column)
  if (vp.startsWith('{')) {
    try {
      const parsed = JSON.parse(vp);
      if (parsed && typeof parsed.setting === 'string' && parsed.cameraComposition !== undefined) {
        return parsed as SceneVisual;
      }
    } catch (_) {
      // Not valid JSON — fall through to legacy handling
    }
  }

  // Legacy: plain string visualPrompt → best-effort into cameraComposition
  return {
    setting: '',
    cameraComposition: vp,
    lighting: '',
  };
}

/**
 * Run async tasks with concurrency limit (promise pool).
 */
async function runWithConcurrencyLimit<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, concurrency);
  const executing: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const p = fn(item, i).finally(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/**
 * Calculate age group from birth date
 */
function calculateAgeGroup(birthDate: Date): string {
  const ageMonths = Math.floor((Date.now() - birthDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));

  if (ageMonths < 12) return '0-1';
  if (ageMonths < 24) return '1y';
  if (ageMonths < 48) return '2-3';
  if (ageMonths < 72) return '4-5';
  if (ageMonths < 108) return '6-8';
  return '9-12';
}

const RANDOM_MISSING_GOAL_PROBABILITY = 0.5;

function normalizeRequestGoal(goal: string | null | undefined): string | null {
  const trimmed = goal?.trim();
  return trimmed ? trimmed : null;
}

function lowerBoundAgeFromGroup(ageGroup: string | null | undefined): number | null {
  if (!ageGroup) return null;
  if (ageGroup === '1y') return 1;
  const match = ageGroup.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function resolveStoryRequestGoal(
  explicitGoal: string | null | undefined,
  options: {
    source: string;
    ageGroup?: string | null;
    excludedGoal?: string | null;
  }
): Promise<string | null> {
  const normalizedGoal = normalizeRequestGoal(explicitGoal);
  if (normalizedGoal) return normalizedGoal;

  if (Math.random() >= RANDOM_MISSING_GOAL_PROBABILITY) {
    logger.info({ source: options.source }, 'No explicit story goal; keeping story open-ended');
    return null;
  }

  try {
    const goals = await getDictionaryRepository().findAllGoals();
    const ageLowerBound = lowerBoundAgeFromGroup(options.ageGroup);
    const ageEligibleGoals =
      ageLowerBound === null ? goals : goals.filter((goal) => goal.minAge <= ageLowerBound);
    const eligibleGoals = ageEligibleGoals.length > 0 ? ageEligibleGoals : goals;
    const excludedGoal = normalizeRequestGoal(options.excludedGoal);
    const nonExcludedGoals =
      excludedGoal && eligibleGoals.length > 1
        ? eligibleGoals.filter((goal) => goal.slug !== excludedGoal)
        : eligibleGoals;
    const randomGoals = nonExcludedGoals.length > 0 ? nonExcludedGoals : eligibleGoals;
    const pickedGoal = randomGoals[Math.floor(Math.random() * randomGoals.length)];

    if (!pickedGoal) {
      logger.warn({ source: options.source }, 'No story goals available; keeping story open-ended');
      return null;
    }

    logger.info(
      { source: options.source, goal: pickedGoal.slug, excludedGoal },
      'No explicit story goal; selected random goal'
    );
    return pickedGoal.slug;
  } catch (error) {
    logger.warn(
      { err: error, source: options.source },
      'Failed to select random story goal; keeping story open-ended'
    );
    return null;
  }
}

export function resolveContinuationGenerationKind(input: {
  storyMetadata?: unknown;
  requestIntermediateData?: unknown;
}): StoryGenerationKind {
  const requestData =
    input.requestIntermediateData && typeof input.requestIntermediateData === 'object'
      ? (input.requestIntermediateData as Record<string, unknown>)
      : {};
  const storyMetadata =
    input.storyMetadata && typeof input.storyMetadata === 'object'
      ? (input.storyMetadata as Record<string, unknown>)
      : {};
  const requestKind =
    typeof requestData.generationKind === 'string' ? requestData.generationKind : undefined;
  const metadataKind =
    typeof storyMetadata.storyFormat === 'string' ? storyMetadata.storyFormat : undefined;
  const generationKind = requestKind || metadataKind;

  return isGraphicNovelStyleGenerationKind(generationKind) ? generationKind : undefined;
}

/**
 * Create a new story request
 * Validates limits and creates pending request
 */
export async function createStoryRequest(
  userId: string,
  input: CreateStoryRequestInput,
  options?: {
    quotaSource?: StoryQuotaReservationSource;
    createdByMode?: StoryCreatedByMode;
    createdByChildProfileId?: string | null;
    parentReviewRequired?: boolean;
  }
): Promise<string> {
  try {
    logger.info({ userId, language: input.storyLanguage }, 'Creating story request');

    const quotaSource = options?.quotaSource;
    assertStoryPromptSafety({
      userId,
      goal: input.goal,
      userNotes: input.userNotes,
      goalSource:
        quotaSource === 'instant'
          ? 'instant_story_goal'
          : quotaSource === 'child_mode'
            ? 'child_mode_story_goal'
            : 'story_goal',
      notesSource:
        quotaSource === 'instant'
          ? 'instant_story_notes'
          : quotaSource === 'child_mode'
            ? 'child_mode_story_notes'
            : 'story_user_notes',
    });

    const attribution = buildStoryCreationAttribution({
      createdByMode: options?.createdByMode,
      createdByChildProfileId: options?.createdByChildProfileId,
      fallbackChildProfileId: input.childProfileId,
      parentReviewRequired: options?.parentReviewRequired,
    });
    const resolvedGoal = await resolveStoryRequestGoal(input.goal, {
      source: options?.quotaSource ?? 'wizard',
      ageGroup: (input as any).ageGroup,
    });

    const requestData = {
      userId,
      childProfileId: input.childProfileId,
      createdByMode: attribution.createdByMode,
      createdByChildProfileId: attribution.createdByChildProfileId,
      parentReviewRequired: attribution.parentReviewRequired,
      uiLocale: input.uiLocale,
      storyLanguage: input.storyLanguage,
      goal: resolvedGoal,
      scenarioCardId: input.scenarioCardId,
      imageStyle: (input as any).imageStyle || null, // Image art style
      userNotes: input.userNotes,
      selectedCharacters: input.selectedCharacters ? input.selectedCharacters : null, // Save selected characters
      selectedChildren: (input as any).selectedChildren ? (input as any).selectedChildren : null, // NEW: Save selected children
      status: 'pending',
      progress: 0,
    };

    const { requestId } = await createStoryRequestWithQuotaReservation(userId, requestData, {
      source: options?.quotaSource ?? 'wizard',
    });

    logger.info({ requestId }, 'Story request created');
    return requestId;
  } catch (error) {
    if (isStoryQuotaError(error) || isPromptSafetyError(error)) {
      throw error;
    }
    logger.error(
      { error, userId, stack: error instanceof Error ? error.stack : undefined },
      'Failed to create story request'
    );
    // Don't expose internal details to client
    throw new Error('Failed to create story request. Please try again.');
  }
}

/**
 * Create a continuation request for an existing story series
 */
export async function createContinuationRequest(
  userId: string,
  input: {
    language: string;
    ageGroup: string;
    childProfileId: string | null;
    imageStyle: string;
    moralTheme?: string | null;
    excludedMoralTheme?: string | null;
    generationKind?: StoryGenerationKind;
    // Preserved from original request
    scenarioCardId: string | null;
    selectedCharacters: any;
    selectedChildren: any;
    userNotes: string | null;
    // Series context
    seriesId: string;
    partNumber: number;
    continuationContext: any;
    // Scheduled continuation (from scheduler)
    isScheduledContinuation?: boolean;
    scheduleId?: string;
  }
): Promise<string> {
  try {
    logger.info(
      {
        userId,
        seriesId: input.seriesId,
        partNumber: input.partNumber,
      },
      'Creating continuation request'
    );

    assertStoryPromptSafety({
      userId,
      userNotes: input.userNotes,
      notesSource: 'story_continuation_notes',
    });

    const resolvedGoal = await resolveStoryRequestGoal(input.moralTheme, {
      source: input.isScheduledContinuation ? 'scheduled_continuation' : 'continuation',
      ageGroup: input.ageGroup,
      excludedGoal: input.excludedMoralTheme,
    });

    const requestData = {
      userId,
      childProfileId: input.childProfileId,
      uiLocale: 'uk', // Use default, doesn't affect story
      storyLanguage: input.language,
      goal: resolvedGoal,
      scenarioCardId: input.scenarioCardId, // Preserve from original
      imageStyle: input.imageStyle,
      userNotes: input.userNotes, // Preserve from original
      selectedCharacters: input.selectedCharacters, // Preserve from original
      selectedChildren: input.selectedChildren, // Preserve from original
      status: 'pending',
      progress: 0,
      // Store continuation context in intermediate data
      intermediateData: {
        isContinuation: true,
        seriesId: input.seriesId,
        partNumber: input.partNumber,
        continuationContext: input.continuationContext,
        ...(input.generationKind && {
          generationKind: input.generationKind,
        }),
        ...(input.isScheduledContinuation && {
          isScheduledContinuation: true,
          scheduleId: input.scheduleId,
        }),
      },
    };

    const { requestId } = await createStoryRequestWithQuotaReservation(userId, requestData, {
      source: input.isScheduledContinuation ? 'scheduled_continuation' : 'continuation',
    });

    logger.info({ requestId, seriesId: input.seriesId }, 'Continuation request created');
    return requestId;
  } catch (error) {
    if (isStoryQuotaError(error) || isPromptSafetyError(error)) {
      throw error;
    }
    logger.error(
      {
        error,
        userId,
        seriesId: input.seriesId,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to create continuation request'
    );
    throw new Error('Failed to create continuation request. Please try again.');
  }
}

/**
 * Process a story request (main orchestration function)
 * This runs in the job queue
 *
 * M4 Updates:
 * - Task-based progress tracking (supports parallel tasks)
 * - Scene image generation (parallel for all plans)
 * - Character consistency via scene-to-scene reference propagation
 */
export async function processStoryRequest(requestId: string): Promise<{
  storyId: string;
  isScheduledContinuation?: boolean;
  scheduleId?: string;
}> {
  const startTime = Date.now();

  try {
    const request = await getStoryRepository().findRequestById(requestId);

    if (!request) {
      throw new Error(`Story request ${requestId} not found`);
    }

    const intermediateData = (request.intermediateData as any) || {};
    const isContinuation = !!intermediateData.isContinuation;
    const isScheduledContinuation = !!intermediateData.isScheduledContinuation;
    const scheduleId = intermediateData.scheduleId as string | undefined;
    const { seriesId, partNumber, continuationContext } = intermediateData;

    if (isContinuation && (!seriesId || !continuationContext)) {
      throw new Error('Invalid continuation request: missing series context');
    }

    logger.info({ requestId, isContinuation }, 'Processing story request');

    await getStoryRepository().updateRequest(requestId, {
      status: 'processing',
      updatedAt: new Date(),
    });

    const checkpoints = intermediateData;
    let storyId: string | undefined = checkpoints.storyId;

    let text, mergedCharacters, spec, selectedCharacters;
    let textGenerationTimeMs: number | undefined;
    let validationTimeMs: number | undefined;
    let chosenPlotExampleId: string | undefined;
    let chosenWorldRuleId: string | undefined;

    // Get Domain Services (only what the text phase actually needs)
    const storyDomain = getStoryDomainService();

    // Get generation time coefficients for smooth progress estimation
    const coefficients = await getGenerationCoefficients();

    // Get user plan features (needed for later steps)
    const userPlan = await getPlanFeatures(request.userId);

    {
      // ========================================
      // Text Generation (direct, 1-step)
      // ========================================

      // Build story spec (with continuationContext when continuation)
      const reqForSpec: StoryRequestData = {
        ...request,
        selectedCharacters: Array.isArray(request.selectedCharacters)
          ? request.selectedCharacters
          : [],
        selectedChildren: Array.isArray(request.selectedChildren) ? request.selectedChildren : [],
      };
      const specData = await buildStorySpec(
        reqForSpec,
        isContinuation ? { continuationContext } : undefined
      );
      spec = specData.spec;
      selectedCharacters = specData.selectedCharacters;
      chosenPlotExampleId = specData.chosenPlotExampleId;
      chosenWorldRuleId = specData.chosenWorldRuleId;

      await setPlannedTasks(
        requestId,
        buildFixedStagePlan({
          coefficients,
          sceneCount: estimateSceneCountForAgeGroup(spec.ageGroup),
          imagesPerStory: userPlan.imagesPerStory || 0,
          includeProducer: (userPlan.imagesPerStory || 0) > 0,
        })
      );

      // Create story stub before text generation for AI usage tracking
      if (checkpoints.storyId) {
        const existingStory = await getStoryRepository().findById(checkpoints.storyId);
        if (existingStory) {
          storyId = checkpoints.storyId;
          logger.info({ requestId, storyId }, 'Reusing story stub from checkpoint');
        } else {
          // Story was deleted or never committed — clear so we create a new one (fixes FK violation on retry)
          storyId = undefined;
          logger.warn(
            { requestId, orphanStoryId: checkpoints.storyId },
            'Story stub from checkpoint not found in DB, creating new'
          );
        }
      }
      if (!storyId) {
        storyId = await createStoryStub({
          userId: request.userId,
          storyRequestId: request.id,
          childProfileId: request.childProfileId,
          ...getStoryCreationAttributionInputFromRequest(request),
          spec,
          ...(isContinuation && seriesId && partNumber && { seriesData: { seriesId, partNumber } }),
          isScheduledContinuation,
        });
        Object.assign(checkpoints, { storyId });
        await getStoryRepository().updateRequest(requestId, {
          intermediateData: { ...checkpoints, storyId },
        });
      }
      const usageContext = { userId: request.userId, storyId };

      // Task 1: Generate Text (with timing)
      const textGenStart = Date.now();
      await startTask(requestId, STORY_TASKS.GENERATING_TEXT, {
        estimatedMs: coefficients.avgTextMs,
      });

      const textGenOptions = {
        onUsage: (u: any) => recordUsage(u, usageContext),
        ...(isContinuation &&
          continuationContext && {
            isContinuation: true,
            continuationContext: {
              previousOutlines: continuationContext.previousOutlines,
              requiredCharacters: continuationContext.requiredCharacters,
              optionalCharacters: continuationContext.optionalCharacters || [],
              usedPlots: continuationContext.usedPlots || [],
              previousEnvironments: continuationContext.previousEnvironments || [],
              previousOutfits: continuationContext.previousOutfits || [],
            },
          }),
      };

      const plainText = await withStageTiming(
        {
          storyId,
          storyRequestId: requestId,
          userId: request.userId,
          generationKind: 'story',
          pipelinePhase: 'text',
          operation: 'writer_text',
          targetType: 'story',
          metadata: {
            isContinuation,
            language: spec.language,
            ageGroup: spec.ageGroup,
          },
          successMetadata: (result) => ({
            sceneCount: Array.isArray(result.scenes) ? result.scenes.length : 0,
            wordCount: result.wordCount ?? 0,
          }),
        },
        () => storyDomain.generateTextPlain(spec, textGenOptions)
      );
      textGenerationTimeMs = Date.now() - textGenStart;
      const imagesPerStory = userPlan.imagesPerStory || 0;
      if (imagesPerStory > 0) {
        const blocks = composeScenesIntoBlocks(plainText.scenes, imagesPerStory);
        const userCharacters = selectedCharacters.map((c: any) => ({ id: c.id, name: c.name }));
        await transitionTask(
          requestId,
          STORY_TASKS.GENERATING_TEXT,
          STORY_TASKS.PRODUCING_VISUALS,
          {
            estimatedMs: estimateProducerMs(blocks.length),
          }
        );
        const directorResult = await withStageTiming(
          {
            storyId,
            storyRequestId: requestId,
            userId: request.userId,
            generationKind: 'story',
            pipelinePhase: 'visual_planning',
            operation: 'director_scenes',
            targetType: 'story',
            metadata: {
              imagesPerStory,
              blockCount: blocks.length,
              userCharacterCount: userCharacters.length,
            },
            successMetadata: (result) => ({
              illustrationCount: Array.isArray(result.illustrations)
                ? result.illustrations.length
                : 0,
              environmentCount: Array.isArray(result.environments) ? result.environments.length : 0,
              outfitCount: Array.isArray(result.outfits) ? result.outfits.length : 0,
            }),
          },
          () =>
            storyDomain.callDirector(
              {
                blocks,
                imagesPerStory,
                spec,
                userCharacters,
              },
              { onUsage: (u) => recordUsage(u, usageContext) }
            )
        );
        await completeTask(requestId, STORY_TASKS.PRODUCING_VISUALS);
        text = mergeDirectorIntoText(plainText, directorResult, imagesPerStory);
        text.language = spec.language;
        const anchorSceneIds = getIllustrationBlockStartSceneIds(
          plainText.scenes.length,
          imagesPerStory
        );
        logger.info(
          {
            requestId,
            mergedOutfitsCount: Array.isArray((text as any).outfits)
              ? (text as any).outfits.length
              : 0,
            directorOutfitIds: (directorResult.outfits || [])
              .map((o: { id?: string }) => o?.id)
              .filter(Boolean),
            illustrationsWardrobe: (directorResult.illustrations || []).map(
              (ill: any, idx: number) => {
                const chars = ill?.sceneVisual?.cameraComposition?.characters;
                const list = Array.isArray(chars) ? chars : [];
                return {
                  blockIndex: idx,
                  anchorSceneId: anchorSceneIds[idx],
                  cameraCharacterCount: list.length,
                  cameraOutfitsPreview: list.slice(0, 8).map((c: any) => ({
                    name: c?.name,
                    outfitId: c?.outfitId,
                  })),
                };
              }
            ),
          },
          'Director merged into text (outfits + per-block camera outfitIds)'
        );
      } else {
        await completeTask(requestId, STORY_TASKS.GENERATING_TEXT);
        text = {
          title: plainText.title,
          language: spec.language,
          description: plainText.description,
          characters: [],
          environments: [],
          outfits: [],
          scenes: plainText.scenes.map((scene) => ({ ...scene })),
          fullText: plainText.fullText,
          wordCount: plainText.wordCount,
        } as any;
        logger.info({ requestId }, 'Skipped Director because imagesPerStory=0');
      }

      logger.info(
        { requestId, title: text.title, wordCount: text.wordCount, textGenerationTimeMs },
        'Text generated'
      );

      // Log environments from Director output when illustrations are enabled.
      const plannedImagesPerStory = userPlan.imagesPerStory || 0;
      const textEnvironments = (text as any).environments;
      if (textEnvironments && textEnvironments.length > 0) {
        logger.info(
          {
            requestId,
            environmentCount: textEnvironments.length,
            outfitDefinitionsCount: Array.isArray((text as any).outfits)
              ? (text as any).outfits.length
              : 0,
            environments: textEnvironments.map((e: any) => ({
              id: e.id,
              name: e.name,
            })),
          },
          'Director generated story environments'
        );

        // Log scene-to-environment mapping
        const sceneEnvMapping = text.scenes.map((s: any) => ({
          sceneId: s.sceneId,
          environmentId: (s as any).environmentId || 'MISSING',
          hasSceneVisual: !!s.sceneVisual,
          characterOutfitIdKeys:
            s.characterOutfitIds && typeof s.characterOutfitIds === 'object'
              ? Object.keys(s.characterOutfitIds)
              : [],
          settingPreview:
            s.sceneVisual?.setting?.substring(0, 80) || s.visualPrompt?.substring(0, 80) || '',
        }));
        logger.info(
          {
            requestId,
            sceneEnvMapping,
          },
          'Scene-to-environment mapping from Director'
        );
      } else if (plannedImagesPerStory > 0) {
        logger.warn(
          { requestId },
          'Director did not generate environments array — images will use raw visualPrompt without setting context'
        );
      }

      // Extract LLM-generated characters (same as main flow — includes originalCharacterId from [ID: uuid])
      const llmCharacters = extractLlmCharactersFromText(text);

      logger.info(
        {
          llmCharacterCount: llmCharacters.length,
          llmCharacterNames: llmCharacters.map((c) => c.name).join(', '),
        },
        'Extracted LLM-generated characters from direct text generation'
      );

      // Merge user characters
      mergedCharacters = mergeCharacters(selectedCharacters as CharacterData[], llmCharacters);

      // Persist LLM characters to DB with hybrid dedup (name + embedding)
      const llmCharacterResults = await persistLlmCharacters(
        request.userId,
        llmCharacters,
        selectedCharacters as CharacterData[],
        spec.language
      );

      // Enrich mergedCharacters with DB IDs for LLM characters
      for (const char of mergedCharacters) {
        if (char.source === 'llm_generated' && !char.id) {
          const normalized = normalizeCharacterName(char.name);
          const result = llmCharacterResults.get(normalized);
          if (result) {
            char.id = result.characterId;
            (char as any)._llmIsNew = result.isNew;
            (char as any)._llmHasTurnaround = result.hasTurnaround;
          }
        }
      }

      logger.info(
        {
          requestId,
          llmCharacterResults: Array.from(llmCharacterResults.entries()).map(([name, r]) => ({
            name,
            characterId: r.characterId,
            isNew: r.isNew,
            hasTurnaround: r.hasTurnaround,
          })),
        },
        'LLM characters persisted and enriched'
      );

      // Save checkpoint (preserve storyId from stub)
      const specForCheckpoint = { ...spec, policyProfile: undefined };
      Object.assign(checkpoints, {
        text,
        mergedCharacters,
        spec: specForCheckpoint,
        selectedCharacters,
      });
      await getStoryRepository().updateRequest(requestId, {
        intermediateData: {
          ...checkpoints,
          text,
          mergedCharacters,
          spec: specForCheckpoint,
          selectedCharacters,
        },
      });

      logger.info({ requestId, checkpoint: 'text' }, 'Checkpoint saved');
    }

    // CHECKPOINT 3: Validation
    if (checkpoints.validationComplete && checkpoints.validatedText) {
      logger.info({ requestId }, 'Reusing validated text from checkpoint');
      text = checkpoints.validatedText;
    } else {
      const validationResult = await validateStoryScenes({
        requestId,
        userId: request.userId,
        storyId,
        text,
        spec,
        maxRetries: 2,
      });
      text = validationResult.validatedText;
      validationTimeMs = validationResult.validationTimeMs;
      const validationCompletedAt = new Date();
      await recordStageTiming({
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: 'story',
        pipelinePhase: 'validation',
        operation: 'text_validation',
        targetType: 'story',
        startedAt: new Date(validationCompletedAt.getTime() - (validationTimeMs ?? 0)),
        completedAt: validationCompletedAt,
        durationMs: validationTimeMs ?? 0,
        metadata: {
          maxRetries: 2,
          sceneCount: Array.isArray(text?.scenes) ? text.scenes.length : 0,
        },
      });

      // Save validation checkpoint (preserve storyId, text, spec, mergedCharacters)
      const specForValidation = { ...spec, policyProfile: undefined };
      Object.assign(checkpoints, {
        validationComplete: true,
        validatedText: text,
        text,
        spec: specForValidation,
        selectedCharacters,
        mergedCharacters,
      });
      await getStoryRepository().updateRequest(requestId, {
        intermediateData: { ...checkpoints, validationComplete: true, validatedText: text },
      });

      logger.info({ requestId, checkpoint: 'validation' }, 'Checkpoint saved');
    }

    if (storyId) {
      const imagesPerStory = userPlan.imagesPerStory || 0;
      persistStoryDirectorScenes(storyId, text.scenes, imagesPerStory).catch((error) => {
        logger.error(
          {
            err: error,
            requestId,
            storyId,
          },
          'Failed to persist story director scenes snapshot'
        );
      });
    }

    // CHECKPOINT 4: Enrich stub or reuse already-enriched story
    if (!storyId) {
      throw new Error('Story stub should exist before checkpoint 4');
    }
    const existingStory = await getStoryRepository().findById(storyId);
    const needsEnrich = !existingStory || existingStory.title === 'Generating...';
    if (needsEnrich) {
      const enrichParams = {
        userId: request.userId,
        storyRequestId: request.id,
        childProfileId: request.childProfileId,
        ...getStoryCreationAttributionInputFromRequest(request),
        text,
        spec,
        characters: mergedCharacters,
        goal: request.goal,
        generationTimeMs: Date.now() - startTime,
        metadata: {
          textGenerationTimeMs: textGenerationTimeMs ?? 0,
          validationTimeMs: validationTimeMs ?? 0,
          sceneCount: text.scenes.length,
          fullTextLength: text.fullText?.length || 0,
          modelVersion: config.ai.modelVersion,
          plotExampleId: chosenPlotExampleId,
          worldRuleId: chosenWorldRuleId,
          storyArtifactId: spec.closingArtifact?.id,
          storyArtifactCode: spec.closingArtifact?.artifactCode,
          storyArtifactTitle: spec.closingArtifact?.title,
          storyArtifactImagePath: spec.closingArtifact?.imagePath,
          storyArtifactSelection: (spec.closingArtifact as any)?.selection,
          llmGeneratedCharacters: (text as any).characters || [],
          imageStyle: (spec as any).imageStyle,
          ...((text as any).description && { seoDescription: (text as any).description }),
        },
        ...(isContinuation && seriesId && partNumber && { seriesData: { seriesId, partNumber } }),
        isScheduledContinuation,
      };
      if (existingStory) {
        await enrichStoryRecord(storyId, enrichParams);
      } else {
        logger.warn({ requestId, storyId }, 'Story not found, creating from scratch');
        const newStoryId = await createStoryRecord(enrichParams);
        Object.assign(checkpoints, { storyId: newStoryId });
        await getStoryRepository().updateRequest(requestId, {
          intermediateData: { ...checkpoints, storyId: newStoryId },
        });
        storyId = newStoryId;
      }
    }

    if (isContinuation && seriesId && partNumber) {
      const createdStory = await getStoryRepository().findById(storyId);
      if (createdStory) {
        const { addContinuationToSeries } = await import('./seriesService');
        await addContinuationToSeries(seriesId, storyId, createdStory);
        logger.info({ requestId, storyId, seriesId, partNumber }, 'Added continuation to series');
      }
    }

    // Save checkpoint 4: ensure processStoryImages has storyId, validatedText, spec, mergedCharacters
    Object.assign(checkpoints, {
      storyId,
      validatedText: text,
      text,
      ...(isContinuation && { isContinuation: true, seriesId, partNumber }),
      ...(isScheduledContinuation && { isScheduledContinuation: true, scheduleId }),
    });
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: {
        ...checkpoints,
        storyId,
        validatedText: text,
        text,
        spec: { ...spec, policyProfile: undefined },
        mergedCharacters,
        selectedCharacters,
        ...(isContinuation && {
          isContinuation: true,
          seriesId,
          partNumber,
          continuationContext: continuationContext || checkpoints.continuationContext,
        }),
        ...(isScheduledContinuation && { isScheduledContinuation: true, scheduleId }),
      },
    });
    logger.info({ requestId, storyId, checkpoint: 'story_saved' }, 'Checkpoint 4 saved');

    // Text + validation + save complete. Return storyId for image queue (or batch_image_pending if scheduled continuation).
    logger.info(
      { requestId, storyId, duration: Date.now() - startTime },
      'Text+validation phase completed, handing off to image queue'
    );

    return { storyId, isScheduledContinuation: isScheduledContinuation || undefined, scheduleId };
  } catch (error) {
    logger.error(
      {
        error,
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : undefined,
      },
      'Story text generation failed'
    );

    const checkpointsOnError = (await getStoryRepository().findRequestById(requestId))
      ?.intermediateData as Record<string, unknown> | null;
    const stubStoryId = checkpointsOnError?.storyId as string | undefined;
    if (stubStoryId) {
      const existingStory = await getStoryRepository().findById(stubStoryId);
      if (existingStory?.title === 'Generating...') {
        await getStoryRepository().deleteStory(
          stubStoryId,
          (await getStoryRepository().findRequestById(requestId))!.userId
        );
        logger.info({ requestId, storyId: stubStoryId }, 'Deleted story stub after failure');
      }
    }

    await getStoryRepository().updateRequest(requestId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

// ── Shared Image Generation Helpers ──

/**
 * Extract outfit from cameraComposition character description.
 * Looks for "wearing X", "in X", "dressed in X". Returns "natural appearance" if not found (animals/creatures).
 */
function extractOutfitFromDescription(desc: string, charType?: string): string {
  if (!desc || typeof desc !== 'string') return 'natural appearance';
  const lower = desc.toLowerCase();
  if (lower.includes('natural appearance')) return 'natural appearance';
  const wearingMatch = desc.match(/\bwearing\s+([^.,]+?)(?:\.|,|$)/i);
  if (wearingMatch) return wearingMatch[1].trim();
  const inMatch = desc.match(/\bin\s+([^.,]+?)(?:\.|,|$)/i);
  if (inMatch) return inMatch[1].trim();
  const dressedMatch = desc.match(/\bdressed\s+in\s+([^.,]+?)(?:\.|,|$)/i);
  if (dressedMatch) return dressedMatch[1].trim();
  if (charType === 'animal' || charType === 'creature' || charType === 'object')
    return 'natural appearance';
  return 'natural appearance';
}

/**
 * Check if characterOutfits has content (string or legacy Record).
 */
function hasCharacterOutfits(co: string | Record<string, string> | undefined): boolean {
  if (!co) return false;
  if (typeof co === 'string') return co.trim().length > 0;
  return Object.keys(co).length > 0;
}

/**
 * Fill empty characterOutfits from scene cameraComposition.
 * Fallback when LLM returns empty string despite schema/prompt instructions.
 */
function fillCharacterOutfitsFromScenes(text: any, requestId: string): void {
  const outfitsRoot = (text as any).outfits;
  if (Array.isArray(outfitsRoot) && outfitsRoot.length > 0) return;

  const environments = (text as any).environments as
    | Array<{ id: string; characterOutfits?: string | Record<string, string> }>
    | undefined;
  const scenes = (text as any).scenes as
    | Array<{
        environmentId?: string;
        sceneVisual?: {
          cameraComposition?: { characters?: Array<{ name: string; description?: string }> };
        };
      }>
    | undefined;
  const characters = (text as any).characters as Array<{ name: string; type?: string }> | undefined;
  const charTypeMap = new Map<string, string>();
  if (characters) {
    for (const c of characters) {
      charTypeMap.set(c.name, c.type || 'human');
      if (c.name.includes(' [ID:')) {
        charTypeMap.set(c.name.split(' [ID:')[0].trim(), c.type || 'human');
      }
    }
  }
  if (!environments || !scenes) return;
  for (const env of environments) {
    if (hasCharacterOutfits(env.characterOutfits)) continue;
    const outfits: Record<string, string> = {};
    for (const scene of scenes) {
      if (scene.environmentId !== env.id) continue;
      const chars = scene.sceneVisual?.cameraComposition?.characters;
      if (!chars) continue;
      for (const ch of chars) {
        if (!ch.name || outfits[ch.name]) continue;
        const charType =
          charTypeMap.get(ch.name) ??
          charTypeMap.get(ch.name.split(' [ID:')[0]?.trim() ?? '') ??
          'human';
        outfits[ch.name] = extractOutfitFromDescription(ch.description || '', charType);
      }
    }
    if (Object.keys(outfits).length > 0) {
      (env as any).characterOutfits = serializeCharacterOutfitsToStr(outfits);
      logger.info(
        { requestId, envId: env.id, filledOutfits: outfits },
        'Filled characterOutfits from scene descriptions (LLM returned empty)'
      );
    }
  }
}

/**
 * Build environment map from text output.
 * When previousEnvironments provided (continuation), seeds map first so reused env IDs have full description.
 * Fallback: if scenes reference environmentIds not in environments array (LLM schema violation),
 * create synthetic environments from the first scene's sceneVisual.setting so env images can be generated.
 */
function buildEnvironmentMapFromText(
  text: any,
  requestId: string,
  options?: { previousEnvironments?: StoryEnvironment[] }
): Map<string, StoryEnvironment> {
  fillCharacterOutfitsFromScenes(text, requestId);
  const environmentMap = new Map<string, StoryEnvironment>();

  // Seed with previous environments (continuation) — reused env IDs get full description from Part 1
  if (options?.previousEnvironments && options.previousEnvironments.length > 0) {
    for (const env of options.previousEnvironments) {
      environmentMap.set(env.id, env);
    }
    logger.info(
      {
        requestId,
        previousEnvironmentsCount: options.previousEnvironments.length,
        previousEnvIds: options.previousEnvironments.map((e) => e.id),
      },
      'Seeded environment map with previous episode environments'
    );
  }

  const environments = (text as any).environments as StoryEnvironment[] | undefined;
  const scenes = (text as any).scenes as
    | Array<{ environmentId?: string; sceneVisual?: { setting?: string } }>
    | undefined;

  if (environments && environments.length > 0) {
    for (const env of environments) {
      environmentMap.set(env.id, env);
    }
    logger.info(
      {
        requestId,
        environmentCount: environments.length,
        environmentIds: environments.map((e) => e.id),
        environmentNames: environments.map((e) => e.name),
        environmentOutfits: environments.map((e) => {
          const parsed =
            typeof e.characterOutfits === 'string'
              ? parseCharacterOutfitsString(e.characterOutfits)
              : ((e.characterOutfits as Record<string, string> | undefined) ?? {});
          return {
            id: e.id,
            hasCharacterOutfits: hasCharacterOutfits(e.characterOutfits),
            characterOutfitKeys: Object.keys(parsed),
          };
        }),
      },
      'Built environment map from LLM output'
    );
  } else {
    logger.warn(
      { requestId },
      'No environments found in LLM output — visual prompts will not include environment context'
    );
  }

  // Fallback: add synthetic environments for scene environmentIds missing from LLM output
  if (scenes && scenes.length > 0) {
    const envIdsInScenes = new Set(scenes.map((s) => s.environmentId).filter(Boolean) as string[]);
    for (const envId of envIdsInScenes) {
      if (environmentMap.has(envId)) continue;
      const firstScene = scenes.find((s) => s.environmentId === envId);
      const setting = firstScene?.sceneVisual?.setting?.trim();
      const syntheticName = envId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const synthetic: StoryEnvironment = {
        id: envId,
        name: syntheticName,
        description: setting || `A location described in the story (${syntheticName}).`,
      };
      environmentMap.set(envId, synthetic);
      logger.warn(
        {
          requestId,
          environmentId: envId,
          source: 'synthetic',
          descriptionLength: synthetic.description.length,
        },
        'Environment missing from LLM output — created synthetic from scene setting for env image generation'
      );
    }
  }

  return environmentMap;
}

/**
 * Extract storage path from URL.
 */
function extractStoragePath(url: string): string {
  // Strip query parameters (signed URLs contain ?token=...&expires=...)
  const urlWithoutQuery = url.split('?')[0];
  const urlWithoutProtocol = urlWithoutQuery.replace(/^https?:\/\/[^/]+/, '');
  return urlWithoutProtocol.replace(/^\/api\/v1\/assets\//, '');
}

/**
 * Load turnaround sheet URLs from DB for LLM characters that already have a sheet persisted
 * but do not carry `turnaroundSheet` on merged checkpoint data.
 */
async function hydrateLlmTurnaroundSheetsFromDb(
  mergedCharacters: any[],
  characterDescriptionMap: Map<string, CharacterData>,
  userId: string,
  normalizedNamesFilter?: Set<string>
): Promise<void> {
  const ids = [
    ...new Set(
      mergedCharacters
        .filter((c: any) => {
          if (c.source !== 'llm_generated' || !c.id || !c._llmHasTurnaround) return false;
          if (!normalizedNamesFilter || normalizedNamesFilter.size === 0) return true;
          return normalizedNamesFilter.has(normalizeCharacterName(c.name));
        })
        .map((c: any) => c.id as string)
    ),
  ];
  if (ids.length === 0) return;

  const rows = await getCharacterRepository().findByIds(userId, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const char of mergedCharacters as any[]) {
    if (char.source !== 'llm_generated' || !char.id || !char._llmHasTurnaround) continue;
    const row = byId.get(char.id);
    const sheet = row?.turnaroundSheet as
      | { url?: string; frontUrl?: string; generatedAt?: string; sourcePhotoUrl?: string }
      | null
      | undefined;
    if (!sheet?.url) continue;
    for (const [, cd] of characterDescriptionMap.entries()) {
      if (cd.id === char.id) {
        (cd as any).turnaroundSheet = sheet;
      }
    }
  }
}

/**
 * Per-scene lazy LLM turnaround with in-flight deduplication (parallel scene workers).
 */
async function ensureLlmTurnaroundsForSceneCharacters(params: {
  normalizedCharacters: string[];
  characterDescriptionMap: Map<string, CharacterData>;
  storyId: string;
  storyRequestId?: string;
  userId: string;
  imageStyle?: string;
  imageDomain: ReturnType<typeof getImageDomainService>;
  assetStorage: ReturnType<typeof getAssetStorageService>;
  uploadedFileMap: Map<string, UploadedFile>;
  inFlight: Map<string, Promise<void>>;
}): Promise<void> {
  const {
    normalizedCharacters,
    characterDescriptionMap,
    storyId,
    storyRequestId,
    userId,
    imageStyle,
    imageDomain,
    assetStorage,
    uploadedFileMap,
    inFlight,
  } = params;

  for (const mapKey of normalizedCharacters) {
    const charData = characterDescriptionMap.get(mapKey);
    if (!charData || (charData as any).source !== 'llm_generated' || !charData.id) continue;
    if ((charData as any).turnaroundSheet?.url) continue;
    if (charData.referencePhotos && charData.referencePhotos.length > 0) continue;

    const charId = charData.id;
    let flight = inFlight.get(charId);
    if (!flight) {
      flight = (async () => {
        const turnaroundStartedAt = new Date();
        try {
          const result = await generateLlmCharacterTurnaround({
            characterId: charId,
            userId,
            characterName: charData.name,
            characterDescription: charData.appearance || charData.description || charData.name,
            imageStyle,
            storyId,
          });
          await recordStageTiming({
            storyId,
            storyRequestId,
            userId,
            generationKind: 'story',
            pipelinePhase: 'asset_generation',
            operation: 'character_turnaround',
            targetType: 'character',
            targetKey: charId,
            startedAt: turnaroundStartedAt,
            completedAt: new Date(),
            cacheStatus: result.sourcePhotoUrl === 'cache' ? 'hit' : 'miss',
            metadata: {
              characterName: charData.name,
              sourcePhotoUrl: result.sourcePhotoUrl,
              imageStyle,
            },
          });
          const sheet = {
            url: result.url,
            ...(result.frontUrl && { frontUrl: result.frontUrl }),
            generatedAt: result.generatedAt,
            sourcePhotoUrl: result.sourcePhotoUrl,
          };
          for (const [, c] of characterDescriptionMap.entries()) {
            if (c.id === charId) {
              (c as any).turnaroundSheet = sheet;
            }
          }
          if (config.nanoBanana?.enableFilesApi === true) {
            try {
              const turnaroundPath = extractStoragePath(result.url);
              const buffer = await assetStorage.getAssetByPath(turnaroundPath);
              if (buffer) {
                const mimeType = turnaroundPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
                const uploaded = await imageDomain.uploadReferenceFile(
                  buffer,
                  mimeType,
                  `turnaround_${charData.name}`,
                  turnaroundPath
                );
                if (uploaded) {
                  uploadedFileMap.set(charData.name, uploaded);
                }
              }
            } catch (uploadErr) {
              logger.warn(
                { err: uploadErr, characterName: charData.name },
                'Failed to upload LLM turnaround to Files API'
              );
            }
          }
        } catch (err) {
          logger.error(
            { err, characterId: charId, name: charData.name },
            'Failed to generate lazy LLM turnaround'
          );
          await recordStageTiming({
            storyId,
            storyRequestId,
            userId,
            generationKind: 'story',
            pipelinePhase: 'asset_generation',
            operation: 'character_turnaround',
            targetType: 'character',
            targetKey: charId,
            status: 'failed',
            startedAt: turnaroundStartedAt,
            completedAt: new Date(),
            metadata: {
              characterName: charData.name,
              imageStyle,
              errorMessage: err instanceof Error ? err.message : String(err),
            },
          });
        }
      })();
      inFlight.set(charId, flight);
    }
    await flight;
  }
}

/**
 * Storage paths for scene characters (any type): prefer turnaround sheet, else reference photos.
 * Child refs are ordered before other characters so photo-based child refs stay ahead of LLM turnarounds.
 */
function getSceneCharacterReferencePaths(
  normalizedCharacters: string[],
  characterDescriptionMap: Map<string, CharacterData>
): string[] {
  const childPaths: string[] = [];
  const otherPaths: string[] = [];
  const seen = new Set<string>();

  const pushPaths = (bucket: string[], char: CharacterData) => {
    const turnaroundSheet = (char as any).turnaroundSheet as { url?: string } | null | undefined;
    if (turnaroundSheet?.url) {
      const p = extractStoragePath(turnaroundSheet.url);
      if (!seen.has(p)) {
        seen.add(p);
        bucket.push(p);
        logger.info(
          { characterName: char.name, turnaroundPath: p },
          'Using turnaround sheet as reference'
        );
      }
      return;
    }
    if (char.referencePhotos && char.referencePhotos.length > 0) {
      logger.info(
        {
          characterName: char.name,
          photoCount: char.referencePhotos.length,
        },
        'Using reference photos (no turnaround sheet)'
      );
      for (const photo of char.referencePhotos) {
        if (photo.url) {
          const p = extractStoragePath(photo.url);
          if (!seen.has(p)) {
            seen.add(p);
            bucket.push(p);
          }
        }
      }
    }
  };

  for (const mapKey of normalizedCharacters) {
    const char = characterDescriptionMap.get(mapKey);
    if (!char?.name) continue;
    const bucket = (char as any).type === 'child' ? childPaths : otherPaths;
    pushPaths(bucket, char);
  }

  return [...childPaths, ...otherPaths];
}

/** Build reference entries for scene image generation (Files API or inline base64). */
async function buildCharacterReferenceDataArray(
  paths: string[],
  pathMetadataMap: Map<
    string,
    {
      characterName: string;
      isTurnaround: boolean;
      source: string;
      type: string;
    }
  >,
  uploadedFileMap: Map<string, UploadedFile>,
  assetStorage: ReturnType<typeof getAssetStorageService>,
  inlineReferenceCache?: Map<string, { base64: string; mimeType: string }>
): Promise<
  Array<{
    base64: string;
    mimeType: string;
    fileUri?: string;
    source: string;
    characterName: string;
    type: string;
    isTurnaround: boolean;
    url: string;
    index: number;
  }>
> {
  return Promise.all(
    paths.map(async (url, index) => {
      const pathMeta = pathMetadataMap.get(url);
      const isTurnaround = !!pathMeta?.isTurnaround;
      const charName = pathMeta?.characterName || 'unknown';
      const source = pathMeta?.source || 'character_reference';
      const type = pathMeta?.type || 'character_reference';

      const uploaded = uploadedFileMap.get(charName);
      if (uploaded) {
        logger.debug(
          { charName, fileUri: uploaded.uri },
          'Using Files API URI for character reference'
        );
        return {
          base64: '',
          mimeType: uploaded.mimeType,
          fileUri: uploaded.uri,
          source,
          characterName: charName,
          type,
          isTurnaround,
          url,
          index: index + 1,
        };
      }

      let data = inlineReferenceCache?.get(url);
      if (!data) {
        data = await loadReferenceImageData(url, assetStorage);
        inlineReferenceCache?.set(url, data);
      }
      return {
        ...data,
        source,
        characterName: charName,
        type,
        isTurnaround,
        url,
        index: index + 1,
      };
    })
  );
}

/**
 * Pre-upload reference images to the Files API and build the system instruction.
 * Called before the image loop so known assets are uploaded once and reused via file URI.
 */
async function prepareFilesApiAndSystemInstruction(params: {
  characterDescriptionMap: Map<string, CharacterData>;
  imageDomain: any;
  assetStorage: any;
  spec: any;
  userStyle?: string;
  /** Normalized names appearing in illustrated scenes — used for hasReferences when lazy LLM turnarounds are pending */
  characterNamesInIllustratedScenes?: Set<string>;
  mergedCharacters?: any[];
}): Promise<{ uploadedFileMap: Map<string, UploadedFile>; imageSystemInstruction: string }> {
  const { characterDescriptionMap, imageDomain, assetStorage, spec } = params;
  const uploadedFileMap = new Map<string, UploadedFile>();
  const illustrated = params.characterNamesInIllustratedScenes;
  const allCharacters = Array.from(characterDescriptionMap.values());
  const targetCharacters =
    illustrated && illustrated.size > 0
      ? allCharacters.filter((char) => illustrated.has(normalizeCharacterName(char.name)))
      : allCharacters;

  const filesApiEnabled = config.nanoBanana?.enableFilesApi === true;

  if (filesApiEnabled) {
    logger.info('Files API enabled — pre-uploading character reference assets');

    const dedupe = new Set<string>();
    for (const char of targetCharacters) {
      const key = (char.id as string | undefined) || char.name;
      if (dedupe.has(key)) continue;
      dedupe.add(key);

      const turnaround = (char as any).turnaroundSheet as { url?: string } | null | undefined;
      const storagePath = turnaround?.url
        ? extractStoragePath(turnaround.url)
        : char.referencePhotos?.[0]?.url
          ? extractStoragePath(char.referencePhotos[0].url)
          : null;

      if (!storagePath) continue;

      try {
        const buffer = await assetStorage.getAssetByPath(storagePath);
        if (!buffer) {
          logger.warn(
            { characterName: char.name, storagePath },
            'Asset not found for Files API upload'
          );
          continue;
        }

        const mimeType = storagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const displayName = `turnaround_${char.name}`;

        const uploaded = await imageDomain.uploadReferenceFile(
          buffer,
          mimeType,
          displayName,
          storagePath
        );
        if (uploaded) {
          uploadedFileMap.set(char.name, uploaded);
          logger.info(
            {
              characterName: char.name,
              charType: (char as any).type,
              fileUri: uploaded.uri,
              fileName: uploaded.name,
            },
            'Character reference uploaded to Files API'
          );
        }
      } catch (err) {
        logger.warn(
          { characterName: char.name, error: err },
          'Failed to upload character asset to Files API — will use inline base64'
        );
      }
    }

    logger.info({ uploadedCount: uploadedFileMap.size }, 'Files API pre-upload complete');
  }

  const hasVisualAsset = (c: CharacterData) =>
    !!(c as any).turnaroundSheet?.url || (c.referencePhotos && c.referencePhotos.length > 0);

  const merged = params.mergedCharacters || [];
  const hasLazyLlmRefPotential =
    illustrated &&
    merged.some(
      (c: any) =>
        c.source === 'llm_generated' &&
        illustrated.has(normalizeCharacterName(c.name)) &&
        !(c as any).turnaroundSheet?.url &&
        !(c.referencePhotos && c.referencePhotos.length > 0)
    );

  const hasAnyReferences = allCharacters.some(hasVisualAsset) || !!hasLazyLlmRefPotential;

  const style = params.userStyle || imageDomain.buildImageStyle(spec.ageGroup);

  const imageSystemInstruction = buildImageSystemInstruction({
    style,
    ageGroup: spec.ageGroup,
    hasReferences: hasAnyReferences,
    hasEnvironmentReference: false,
    scenarioCardId: spec.scenarioCard?.id,
  });

  logger.info(
    {
      systemInstructionLength: imageSystemInstruction.length,
      filesApiEnabled,
      uploadedFiles: uploadedFileMap.size,
    },
    'Image system instruction and Files API preparation complete'
  );

  return { uploadedFileMap, imageSystemInstruction };
}

function buildCharacterReferencePathMetadataMap(
  characterDescriptionMap: Map<string, CharacterData>
): Map<
  string,
  {
    characterName: string;
    isTurnaround: boolean;
    source: string;
    type: string;
  }
> {
  const byPath = new Map<
    string,
    {
      characterName: string;
      isTurnaround: boolean;
      source: string;
      type: string;
    }
  >();

  for (const char of characterDescriptionMap.values()) {
    const isChild = (char as any)?.type === 'child';
    const source = isChild ? 'child_reference' : 'character_reference';
    const type = isChild ? 'child_reference' : 'character_reference';
    const turnaround = (char as any).turnaroundSheet as { url?: string } | null | undefined;

    if (turnaround?.url) {
      byPath.set(extractStoragePath(turnaround.url), {
        characterName: char.name,
        isTurnaround: true,
        source,
        type,
      });
    }

    for (const photo of char.referencePhotos || []) {
      if (!photo?.url) continue;
      const photoPath = extractStoragePath(photo.url);
      if (!byPath.has(photoPath)) {
        byPath.set(photoPath, {
          characterName: char.name,
          isTurnaround: false,
          source,
          type,
        });
      }
    }
  }

  return byPath;
}

async function loadExistingEnvironmentReferenceImage(params: {
  storyId: string;
  storyEnvironmentId: string;
  assetStorage: ReturnType<typeof getAssetStorageService>;
}): Promise<EnvImageData | null> {
  const storyEnvRepo = getStoryEnvironmentCacheRepository();
  const envCacheRepo = getEnvironmentImageCacheRepository();
  const existing = await storyEnvRepo.getByStoryAndEnvId(params.storyId, params.storyEnvironmentId);
  if (!existing) return null;

  const cached = await envCacheRepo.getById(existing.cacheId);
  if (!cached) return null;

  const buffer = await params.assetStorage.getAssetByPath(cached.storagePath);
  return {
    base64: buffer.toString('base64'),
    mimeType: 'image/png',
    storagePath: cached.storagePath,
  };
}

async function prepareSceneEnvironmentReference(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  storyEnvironmentId?: string;
  environment?: StoryEnvironment;
  assetStorage: ReturnType<typeof getAssetStorageService>;
  imageDomain: ReturnType<typeof getImageDomainService>;
  scenarioCardId?: string;
  previousStoryIds?: string[];
  reuseExistingOnly?: boolean;
}): Promise<EnvImageData | null> {
  const {
    storyId,
    storyRequestId,
    userId,
    storyEnvironmentId,
    environment,
    assetStorage,
    imageDomain,
    scenarioCardId,
    previousStoryIds,
    reuseExistingOnly,
  } = params;
  const startedAt = new Date();

  if (!config.image.enableEnvironmentReference || !storyEnvironmentId || !environment) {
    await recordStageTiming({
      storyId,
      storyRequestId,
      userId,
      generationKind: 'story',
      pipelinePhase: 'asset_generation',
      operation: 'environment_image',
      targetType: 'environment',
      targetKey: storyEnvironmentId ?? null,
      status: 'skipped',
      startedAt,
      completedAt: new Date(),
      metadata: {
        reason: !config.image.enableEnvironmentReference
          ? 'environment_references_disabled'
          : 'missing_environment',
      },
    });
    return null;
  }

  try {
    let envImageData = reuseExistingOnly
      ? await loadExistingEnvironmentReferenceImage({
          storyId,
          storyEnvironmentId,
          assetStorage,
        })
      : await getOrCreateEnvironmentImage({
          storyId,
          userId,
          storyEnvironmentId,
          environment,
          assetStorage,
          scenarioCardId,
          ...(previousStoryIds && previousStoryIds.length > 0 ? { previousStoryIds } : {}),
        });

    if (envImageData && config.nanoBanana?.enableFilesApi === true) {
      try {
        const buffer = Buffer.from(envImageData.base64, 'base64');
        const uploaded = await imageDomain.uploadReferenceFile(
          buffer,
          envImageData.mimeType,
          `env_${storyEnvironmentId}`,
          envImageData.storagePath
        );
        if (uploaded) {
          envImageData = { ...envImageData, fileUri: uploaded.uri };
        }
      } catch (err) {
        logger.warn({ err, storyEnvironmentId }, 'Failed to upload env image to Files API');
      }
    }

    await recordStageTiming({
      storyId,
      storyRequestId,
      userId,
      generationKind: 'story',
      pipelinePhase: 'asset_generation',
      operation: 'environment_image',
      targetType: 'environment',
      targetKey: storyEnvironmentId,
      status: envImageData ? 'completed' : 'skipped',
      startedAt,
      completedAt: new Date(),
      metadata: {
        environmentName: environment.name,
        hasImage: !!envImageData,
        hasFilesApiUpload: !!envImageData?.fileUri,
        previousStoryCount: previousStoryIds?.length ?? 0,
        scenarioCardId,
        reuseExistingOnly: !!reuseExistingOnly,
        cacheStatus: reuseExistingOnly ? (envImageData ? 'hit' : 'miss') : undefined,
      },
    });

    return envImageData;
  } catch (error) {
    await recordStageTiming({
      storyId,
      storyRequestId,
      userId,
      generationKind: 'story',
      pipelinePhase: 'asset_generation',
      operation: 'environment_image',
      targetType: 'environment',
      targetKey: storyEnvironmentId,
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      metadata: {
        environmentName: environment.name,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

type OutfitPlateImageData = NonNullable<Awaited<ReturnType<typeof getOrCreateOutfitPlateImage>>>;

function buildStoryOutfitPlateCacheKey(characterName: string, outfitId?: string | null): string {
  const characterKey = normalizeOutfitPlateCharacterKey(characterName);
  return outfitId?.trim() ? `${characterKey}::${outfitId.trim()}` : characterKey;
}

async function loadExistingOutfitPlateImage(params: {
  storyId: string;
  storyEnvironmentId: string;
  characterName: string;
  outfitId?: string | null;
  assetStorage: ReturnType<typeof getAssetStorageService>;
}): Promise<OutfitPlateImageData | null> {
  const storyPlateKey = buildStoryOutfitPlateCacheKey(params.characterName, params.outfitId);
  const mapping = await getStoryOutfitPlateCacheRepository().getByStoryEnvAndCharacter(
    params.storyId,
    params.storyEnvironmentId,
    storyPlateKey
  );
  if (!mapping) return null;

  const cached = await getOutfitPlateCacheRepository().getById(mapping.cacheId);
  if (!cached) return null;

  const buffer = await params.assetStorage.getAssetByPath(cached.storagePath);
  return {
    base64: buffer.toString('base64'),
    mimeType: 'image/png',
    storagePath: cached.storagePath,
  };
}

async function prepareSceneOutfitPlateReferences(params: {
  storyId: string;
  storyRequestId?: string;
  userId: string;
  normalizedCharacters: string[];
  characterDescriptionMap: Map<string, CharacterData>;
  characterReferenceData: Array<{ characterName: string }>;
  scene: SceneData;
  currentEnvironmentId?: string;
  currentEnvironment?: StoryEnvironment;
  storyOutfits?: StoryOutfitEntry[];
  imageStyle?: string;
  ageGroup: string;
  scenarioCardId?: string;
  assetStorage: ReturnType<typeof getAssetStorageService>;
  imageDomain: ReturnType<typeof getImageDomainService>;
  outfitPlatePending: Map<
    string,
    Promise<Awaited<ReturnType<typeof getOrCreateOutfitPlateImage>> | null>
  >;
  reuseExistingOnly?: boolean;
}): Promise<
  Array<{
    base64: string;
    mimeType: string;
    fileUri?: string;
    source: string;
    type: string;
    characterName: string;
  }>
> {
  const {
    storyId,
    storyRequestId,
    userId,
    normalizedCharacters,
    characterDescriptionMap,
    characterReferenceData,
    scene,
    currentEnvironmentId,
    currentEnvironment,
    storyOutfits,
    imageStyle,
    ageGroup,
    scenarioCardId,
    assetStorage,
    imageDomain,
    outfitPlatePending,
    reuseExistingOnly,
  } = params;

  if (!config.image.enableOutfitPlate || !currentEnvironmentId || !currentEnvironment) {
    return [];
  }

  const outfitsMerged =
    resolveCharacterOutfits(scene, {
      currentEnvironment,
      ...(storyOutfits && storyOutfits.length > 0 ? { storyOutfits } : {}),
    }) || {};
  const maxPlates = config.image.outfitPlateMaxPerScene;
  const candidates: Array<{
    displayName: string;
    outfitPendingKey: string;
  }> = [];

  for (const mapKey of normalizedCharacters) {
    if (candidates.length >= maxPlates) break;
    const charData = characterDescriptionMap.get(mapKey);
    const displayName = charData?.name || mapKey;
    if (!shouldGenerateOutfitPlateForCharacter(charData)) continue;
    if (!sceneCharacterHasVisualReference(displayName, characterReferenceData)) continue;
    const outfitText = lookupOutfitForCharacterName(displayName, outfitsMerged);
    if (!outfitText?.trim()) continue;
    if (isNaturalAppearanceOutfit(outfitText)) continue;
    const outfitId = lookupOutfitIdForCharacterName(displayName, scene.characterOutfitIds);
    const storyPlateKey = buildStoryOutfitPlateCacheKey(displayName, outfitId);
    candidates.push({
      displayName,
      outfitPendingKey: `${storyId}\x1f${currentEnvironmentId}\x1f${storyPlateKey}`,
    });
  }

  return Promise.all(
    candidates.map(async ({ displayName, outfitPendingKey }) => {
      const outfitsMergedLocal =
        resolveCharacterOutfits(scene, {
          currentEnvironment,
          ...(storyOutfits && storyOutfits.length > 0 ? { storyOutfits } : {}),
        }) || {};
      const outfitText = lookupOutfitForCharacterName(displayName, outfitsMergedLocal);
      const outfitId = lookupOutfitIdForCharacterName(displayName, scene.characterOutfitIds);
      let outfitPromise = outfitPlatePending.get(outfitPendingKey);
      if (!outfitPromise) {
        const outfitStartedAt = new Date();
        outfitPromise = (async () => {
          try {
            const plate = reuseExistingOnly
              ? await loadExistingOutfitPlateImage({
                  storyId,
                  storyEnvironmentId: currentEnvironmentId,
                  characterName: displayName,
                  outfitId: outfitId ?? undefined,
                  assetStorage,
                })
              : await getOrCreateOutfitPlateImage({
                  storyId,
                  userId,
                  storyEnvironmentId: currentEnvironmentId,
                  characterName: displayName,
                  outfitTextRaw: outfitText || '',
                  outfitId: outfitId ?? undefined,
                  imageStyle: imageStyle || 'soft_watercolor',
                  ageGroup,
                  scenarioCardId,
                  assetStorage,
                });
            await recordStageTiming({
              storyId,
              storyRequestId,
              userId,
              generationKind: 'story',
              pipelinePhase: 'asset_generation',
              operation: 'outfit_plate_image',
              targetType: 'outfit_plate',
              targetKey: `${currentEnvironmentId}:${normalizeOutfitPlateCharacterKey(displayName)}:${outfitId ?? ''}`,
              status: plate ? 'completed' : 'skipped',
              startedAt: outfitStartedAt,
              completedAt: new Date(),
              metadata: {
                characterName: displayName,
                storyEnvironmentId: currentEnvironmentId,
                outfitId: outfitId ?? null,
                imageStyle: imageStyle || 'soft_watercolor',
                scenarioCardId,
                reuseExistingOnly: !!reuseExistingOnly,
                cacheStatus: reuseExistingOnly ? (plate ? 'hit' : 'miss') : undefined,
              },
            });
            return plate;
          } catch (error) {
            await recordStageTiming({
              storyId,
              storyRequestId,
              userId,
              generationKind: 'story',
              pipelinePhase: 'asset_generation',
              operation: 'outfit_plate_image',
              targetType: 'outfit_plate',
              targetKey: `${currentEnvironmentId}:${normalizeOutfitPlateCharacterKey(displayName)}:${outfitId ?? ''}`,
              status: 'failed',
              startedAt: outfitStartedAt,
              completedAt: new Date(),
              metadata: {
                characterName: displayName,
                storyEnvironmentId: currentEnvironmentId,
                outfitId: outfitId ?? null,
                imageStyle: imageStyle || 'soft_watercolor',
                errorMessage: error instanceof Error ? error.message : String(error),
              },
            });
            throw error;
          } finally {
            outfitPlatePending.delete(outfitPendingKey);
          }
        })();
        outfitPlatePending.set(outfitPendingKey, outfitPromise);
      }

      const plate = await outfitPromise;
      if (!plate) return null;

      let plateFileUri = plate.fileUri;
      if (config.nanoBanana?.enableFilesApi === true && plate.base64) {
        try {
          const buf = Buffer.from(plate.base64, 'base64');
          const uploaded = await imageDomain.uploadReferenceFile(
            buf,
            plate.mimeType,
            `outfit_${normalizeOutfitPlateCharacterKey(displayName)}`,
            plate.storagePath
          );
          if (uploaded) plateFileUri = uploaded.uri;
        } catch (err) {
          logger.warn(
            { err, storyId, characterName: displayName },
            'Failed to upload outfit plate to Files API'
          );
        }
      }

      return {
        base64: plateFileUri ? '' : plate.base64,
        mimeType: plate.mimeType,
        ...(plateFileUri ? { fileUri: plateFileUri } : {}),
        source: 'outfit_plate',
        type: 'outfit_plate_reference',
        characterName: displayName,
      };
    })
  ).then(
    (refs) =>
      refs.filter(Boolean) as Array<{
        base64: string;
        mimeType: string;
        fileUri?: string;
        source: string;
        type: string;
        characterName: string;
      }>
  );
}

/**
 * Process story images for a request (runs in image queue after text+validation)
 * Loads all necessary context from intermediateData and generates scene images sequentially.
 */
export async function processStoryImages(
  requestId: string,
  options: { takingLongerThanExpected?: boolean } = {}
): Promise<void> {
  const startTime = Date.now();
  const batchStartedAt = new Date(startTime);
  let timingStoryId: string | undefined;
  let timingUserId: string | undefined;
  let timingRequestCreatedAt: Date | undefined;
  let timingImagesPerStory = 0;
  let timingSelectedSceneCount = 0;
  let timingTotalScenes = 0;
  let timingFailedSceneCount = 0;

  try {
    // Load request with intermediate data
    const request = await getStoryRepository().findRequestById(requestId);

    if (!request) {
      throw new Error(`Story request ${requestId} not found for image generation`);
    }

    const checkpoints = (request.intermediateData as any) || {};
    const storyId = checkpoints.storyId;
    const text = checkpoints.validatedText || checkpoints.text;
    const spec = checkpoints.spec;
    const mergedCharacters = checkpoints.mergedCharacters || [];
    timingStoryId = storyId;
    timingUserId = request.userId;
    timingRequestCreatedAt = request.createdAt ? new Date(request.createdAt as Date) : batchStartedAt;
    if (Number.isNaN(timingRequestCreatedAt.getTime())) {
      timingRequestCreatedAt = batchStartedAt;
    }

    if (!storyId || !text) {
      throw new Error(`Missing storyId or text in intermediateData for request ${requestId}`);
    }

    // Get services
    const imageDomain = getImageDomainService();
    const complexImageDomain = getComplexImageDomainService();
    const assetStorage = getAssetStorageService();
    const coefficients = await getGenerationCoefficients();
    const userPlan = await getPlanFeatures(request.userId);

    let scenesToGenerate: any[] = [];
    const imagesPerStory = userPlan.imagesPerStory || 0;
    const totalScenes = text.scenes.length;
    const sceneIds = getIllustrationBlockStartSceneIds(totalScenes, imagesPerStory);
    scenesToGenerate = sceneIds
      .map((id) => text.scenes.find((s: any) => s.sceneId === id))
      .filter(Boolean);
    const trackedImageTarget = Math.min(2, scenesToGenerate.length);
    timingImagesPerStory = imagesPerStory;
    timingSelectedSceneCount = scenesToGenerate.length;
    timingTotalScenes = totalScenes;

    // Task: Generate Scene Images (Sequential for character-aware reference tracking - M9)
    // Progress budget is bound to the foreground UX completion threshold, not background renders.
    await startTask(requestId, STORY_TASKS.GENERATING_IMAGES, {
      estimatedMs: coefficients.avgMsPerImage * trackedImageTarget,
      ...(options.takingLongerThanExpected && { takingLongerThanExpected: true }),
    });

    if (config.image.skipGeneration) {
      logger.info({ requestId }, 'Image generation skipped (SKIP_IMAGE_GENERATION=true)');
    } else {
      const sceneIndices = scenesToGenerate.map((s: any) =>
        text.scenes.findIndex((sc: any) => sc.sceneId === s.sceneId)
      );

      logger.info(
        {
          requestId,
          storyId,
          totalScenes,
          imagesPerStory,
          selectedSceneIds: scenesToGenerate.map((s: any) => s.sceneId),
          sceneCount: scenesToGenerate.length,
        },
        'Selected scenes for image generation'
      );

      const isContinuation = !!checkpoints.isContinuation;
      const previousEnvironments = checkpoints.continuationContext?.previousEnvironments;
      const environmentMap = buildEnvironmentMapFromText(text, requestId, {
        ...(isContinuation && previousEnvironments?.length > 0 && { previousEnvironments }),
      });

      if (scenesToGenerate.length > 0) {
        // Build character registry for name normalization
        const llmCharacters = (text as any).characters || [];
        const characterRegistry = buildCharacterRegistry(
          spec.characters || [],
          spec.childProfile,
          llmCharacters
        );

        // Build character description map for quick lookup
        // Normalized + cross-script + phonetic so Latin/Cyrillic variants resolve to the same ref
        const characterDescriptionMap = new Map<string, CharacterData>();
        for (const [normalized] of characterRegistry.entries()) {
          const fullChar = mergedCharacters.find(
            (c: any) =>
              normalizeCharacterName(c.name) === normalized ||
              crossScriptIdentityKey(c.name) === crossScriptIdentityKey(normalized) ||
              toPhoneticKey(c.name) === toPhoneticKey(normalized)
          );
          if (fullChar) {
            characterDescriptionMap.set(normalized, fullChar);
          }
        }

        logger.info(
          {
            storyId,
            requestId,
            totalCharactersInStory: characterDescriptionMap.size,
          },
          'Character registry built for image generation'
        );

        // ── Sequential Image Pipeline (foreground images first, rest in background) ──
        const sceneIdsWithImages = scenesToGenerate.map((s) => s.sceneId);

        // 1. Store metadata for client: which scenes get images
        const existingStory = await getStoryRepository().findById(storyId);
        const existingMetadata = (existingStory?.metadata as Record<string, unknown>) || {};
        await getStoryRepository().updateStory(storyId, {
          metadata: {
            ...existingMetadata,
            sceneIdsWithImages,
            imageGenerationComplete: false,
          },
        });

        // Character names that appear in illustrated scenes (for system instruction + lazy LLM turnaround)
        const characterNamesInIllustratedScenes = new Set<string>();
        for (const scene of scenesToGenerate) {
          const sceneVisualRaw = scene.sceneVisual || migrateVisualPrompt(scene);
          let sceneCharNames: string[];
          if (
            sceneVisualRaw?.cameraComposition &&
            typeof sceneVisualRaw.cameraComposition !== 'string'
          ) {
            sceneCharNames = flattenCameraComposition(
              sceneVisualRaw.cameraComposition
            ).characterNames;
          } else {
            sceneCharNames = (scene as any).characters || (scene as any).visualCharacters || [];
          }
          const matched = matchCharacterNames(sceneCharNames, characterRegistry);
          for (const normalizedName of matched) {
            characterNamesInIllustratedScenes.add(normalizedName);
          }
        }

        await hydrateLlmTurnaroundSheetsFromDb(
          mergedCharacters as any[],
          characterDescriptionMap,
          request.userId,
          characterNamesInIllustratedScenes
        );

        // 2. Build system instruction and prepare Files API uploads for known character assets
        const { uploadedFileMap, imageSystemInstruction } =
          await prepareFilesApiAndSystemInstruction({
            characterDescriptionMap,
            imageDomain,
            assetStorage,
            spec,
            userStyle: (spec as any).imageStyle,
            characterNamesInIllustratedScenes,
            mergedCharacters: mergedCharacters as any[],
          });

        const parallelStreams = config.image.parallelStreams;
        const llmTurnaroundInFlight = new Map<string, Promise<void>>();
        const inlineReferenceCache = new Map<string, { base64: string; mimeType: string }>();

        const existingScenes = await getSceneRepository().findByStoryId(storyId);
        const existingScenesBySceneId = new Map(
          existingScenes.map((scene) => [scene.sceneId, scene])
        );
        const scenesWithImages = new Set(
          existingScenes
            .filter((s) => s.imageUrl != null && s.imageUrl !== '')
            .map((s) => s.sceneId)
        );

        // For continuation: get previous story IDs in series to reuse env images
        let previousStoryIds: string[] = [];
        if (isContinuation && checkpoints.seriesId) {
          const series = await getStoryRepository().findSeriesById(checkpoints.seriesId);
          if (series?.storyIds && Array.isArray(series.storyIds)) {
            previousStoryIds = (series.storyIds as string[]).filter((id) => id !== storyId);
          }
        }

        // On-demand environment image map (shared across parallel scene iterations)
        const environmentImageMap = new Map<string, EnvImageData>();
        const envImagePending = new Map<string, Promise<EnvImageData | null>>();
        const outfitPlatePending = new Map<
          string,
          Promise<Awaited<ReturnType<typeof getOrCreateOutfitPlateImage>> | null>
        >();

        const storyOutfitsList = (
          Array.isArray((text as any).outfits) ? (text as any).outfits : []
        ) as StoryOutfitEntry[];

        logger.info(
          {
            requestId,
            storyId,
            storyOutfitsCount: storyOutfitsList.length,
            storyOutfitIds: storyOutfitsList.map((o) => o.id).filter(Boolean),
            illustratedScenesWardrobe: scenesToGenerate.map((s: any) => ({
              sceneId: s.sceneId,
              characterOutfitIdKeys:
                s.characterOutfitIds && typeof s.characterOutfitIds === 'object'
                  ? Object.keys(s.characterOutfitIds)
                  : [],
            })),
          },
          'Image pipeline: story outfits + characterOutfitIds on illustrated scenes'
        );

        const failedScenes: Array<{ sceneId: number; errorMessage: string }> = [];
        let requestMarkedCompleted = false;
        let readyImagesCount = 0; // Generated or already-existing images that count toward UX completion
        let firstImageReadyRecorded = false;
        let foregroundImagesReadyRecorded = false;

        const recordFirstImageReady = async (
          sceneId: number,
          sceneIndex: number,
          status: 'completed' | 'cached' = 'completed'
        ) => {
          if (firstImageReadyRecorded) {
            return;
          }
          firstImageReadyRecorded = true;
          await recordStageTiming({
            storyId,
            storyRequestId: requestId,
            userId: request.userId,
            generationKind: 'story',
            pipelinePhase: 'asset_generation',
            operation: 'first_image_ready',
            targetType: 'scene',
            targetKey: String(sceneId),
            sceneIndex,
            status,
            startedAt: batchStartedAt,
            completedAt: new Date(),
            metadata: {
              selectedSceneCount: scenesToGenerate.length,
              trackedImageTarget,
              from: 'image_batch_start',
            },
          });
        };

        const recordForegroundImagesReady = async (
          sceneId: number,
          readyReason: 'foreground_threshold' | 'skip_generation' | 'no_scenes'
        ) => {
          if (foregroundImagesReadyRecorded) {
            return;
          }
          foregroundImagesReadyRecorded = true;
          const completedAt = new Date();
          await recordStageTiming({
            storyId,
            storyRequestId: requestId,
            userId: request.userId,
            generationKind: 'story',
            pipelinePhase: 'asset_generation',
            operation: 'foreground_images_ready',
            targetType: 'story',
            targetKey: storyId,
            status:
              readyReason === 'skip_generation' || readyReason === 'no_scenes'
                ? 'skipped'
                : 'completed',
            startedAt: batchStartedAt,
            completedAt,
            metadata: {
              sceneId,
              readyImagesCount,
              trackedImageTarget,
              selectedSceneCount: scenesToGenerate.length,
              readyReason,
            },
          });
          await recordStageTiming({
            storyId,
            storyRequestId: requestId,
            userId: request.userId,
            generationKind: 'story',
            pipelinePhase: 'postprocess',
            operation: 'story_ready',
            targetType: 'story',
            targetKey: storyId,
            startedAt: timingRequestCreatedAt ?? batchStartedAt,
            completedAt,
            metadata: {
              readyReason,
              readyImagesCount,
              trackedImageTarget,
              selectedSceneCount: scenesToGenerate.length,
              totalScenes,
              imagesPerStory,
            },
          });
        };

        const syncForegroundImageProgress = async (details?: Record<string, unknown>) => {
          if (requestMarkedCompleted) {
            return;
          }

          const progressRatio =
            trackedImageTarget === 0 ? 1 : Math.min(1, readyImagesCount / trackedImageTarget);

          await updateTaskProgress(requestId, STORY_TASKS.GENERATING_IMAGES, progressRatio, {
            current: Math.min(readyImagesCount, trackedImageTarget),
            total: trackedImageTarget,
            ...details,
          });
        };

        const markRequestCompletedForUx = async (sceneId: number) => {
          if (requestMarkedCompleted) {
            return;
          }

          requestMarkedCompleted = true;
          await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
          await getStoryRepository().updateRequest(requestId, {
            status: 'completed',
            storyId,
          });
          await recordForegroundImagesReady(sceneId, 'foreground_threshold');
          logger.info(
            { requestId, storyId, sceneId, readyImagesCount, trackedImageTarget },
            'Foreground image threshold reached — request marked completed, continuing in background'
          );
        };

        // 3. Parallel loop: per-scene env image, lazy LLM turnarounds, then scene illustration
        await runWithConcurrencyLimit(scenesToGenerate, parallelStreams, async (scene, i) => {
          const sceneIndex = sceneIndices[i];

          if (scenesWithImages.has(scene.sceneId)) {
            logger.info(
              { storyId, sceneId: scene.sceneId },
              'Skipping scene — image already exists'
            );
            readyImagesCount++;
            await recordFirstImageReady(scene.sceneId, sceneIndex, 'cached');
            await syncForegroundImageProgress();
            if (!requestMarkedCompleted && readyImagesCount >= trackedImageTarget) {
              await markRequestCompletedForUx(scene.sceneId);
            }
            return;
          }

          const sceneVisualRaw = scene.sceneVisual || migrateVisualPrompt(scene);
          let sceneCharNames: string[];
          if (
            sceneVisualRaw?.cameraComposition &&
            typeof sceneVisualRaw.cameraComposition !== 'string'
          ) {
            sceneCharNames = flattenCameraComposition(
              sceneVisualRaw.cameraComposition
            ).characterNames;
          } else {
            sceneCharNames = (scene as any).characters || [];
          }
          const normalizedCharacters = matchCharacterNames(sceneCharNames, characterRegistry);

          const currentEnvironmentId = (scene as any).environmentId as string | undefined;
          const currentEnvironment = currentEnvironmentId
            ? environmentMap.get(currentEnvironmentId)
            : undefined;

          const envReferencePromise = (async (): Promise<EnvImageData | null> => {
            if (
              !config.image.enableEnvironmentReference ||
              !currentEnvironmentId ||
              !currentEnvironment
            ) {
              return null;
            }
            const cached = environmentImageMap.get(currentEnvironmentId);
            if (cached) {
              return cached;
            }

            let pending = envImagePending.get(currentEnvironmentId);
            if (!pending) {
              pending = prepareSceneEnvironmentReference({
                storyId,
                storyRequestId: requestId,
                userId: request.userId,
                storyEnvironmentId: currentEnvironmentId,
                environment: currentEnvironment,
                assetStorage,
                imageDomain,
                scenarioCardId: spec.scenarioCard?.id,
                ...(previousStoryIds.length > 0 ? { previousStoryIds } : {}),
              });
              envImagePending.set(currentEnvironmentId, pending);
            }

            const envImageData = await pending;
            if (envImageData) {
              environmentImageMap.set(currentEnvironmentId, envImageData);
            }
            envImagePending.delete(currentEnvironmentId);
            return envImageData;
          })();

          const characterReferencesPromise = (async () => {
            await ensureLlmTurnaroundsForSceneCharacters({
              normalizedCharacters,
              characterDescriptionMap,
              storyId,
              storyRequestId: requestId,
              userId: request.userId,
              imageStyle: (spec as any).imageStyle,
              imageDomain,
              assetStorage,
              uploadedFileMap,
              inFlight: llmTurnaroundInFlight,
            });

            const characterPaths = getSceneCharacterReferencePaths(
              normalizedCharacters,
              characterDescriptionMap
            );
            const sceneReferencePathMetadataMap =
              buildCharacterReferencePathMetadataMap(characterDescriptionMap);
            return buildCharacterReferenceDataArray(
              characterPaths,
              sceneReferencePathMetadataMap,
              uploadedFileMap,
              assetStorage,
              inlineReferenceCache
            );
          })();

          const outfitPlateRefsPromise = characterReferencesPromise.then((characterReferenceData) =>
            prepareSceneOutfitPlateReferences({
              storyId,
              storyRequestId: requestId,
              userId: request.userId,
              normalizedCharacters,
              characterDescriptionMap,
              characterReferenceData,
              scene,
              currentEnvironmentId,
              currentEnvironment,
              storyOutfits: storyOutfitsList.length > 0 ? storyOutfitsList : undefined,
              imageStyle: (spec as any).imageStyle,
              ageGroup: spec.ageGroup,
              scenarioCardId: spec.scenarioCard?.id,
              assetStorage,
              imageDomain,
              outfitPlatePending,
            })
          );

          const [envImageData, characterReferenceData, outfitPlateRefs] = await Promise.all([
            envReferencePromise,
            characterReferencesPromise,
            outfitPlateRefsPromise,
          ]);

          const envRefEntry = envImageData
            ? [
                {
                  base64: envImageData.base64,
                  mimeType: envImageData.mimeType,
                  fileUri: envImageData.fileUri,
                  source: 'environment',
                  type: 'environment_reference',
                  imageIndex: 1,
                },
              ]
            : [];

          let referenceImageDataArray = [
            ...envRefEntry,
            ...characterReferenceData,
            ...outfitPlateRefs,
          ];
          const bucketResult = applyReferenceBucketLimits(
            referenceImageDataArray,
            config.image.maxCharacterReferenceImages,
            config.image.maxObjectReferenceImages
          );
          referenceImageDataArray = bucketResult.trimmed;
          logReferenceBucketDelivery({
            storyId,
            sceneId: scene.sceneId,
            characterCount: bucketResult.characterCount,
            objectCount: bucketResult.objectCount,
            droppedCharacterCount: bucketResult.droppedCharacterCount,
            droppedObjectCount: bucketResult.droppedObjectCount,
            totalAfterTrim: referenceImageDataArray.length,
          });
          const imageIndexMap = assignSequentialImageIndices(referenceImageDataArray);

          const sceneCharacterDescriptions = normalizedCharacters
            .map((normalized) => characterDescriptionMap.get(normalized))
            .filter(Boolean) as CharacterData[];

          const characterOutfits =
            resolveCharacterOutfits(scene, {
              currentEnvironment,
              storyOutfits: storyOutfitsList.length > 0 ? storyOutfitsList : undefined,
            }) || undefined;

          const rawCo = currentEnvironment?.characterOutfits;
          const legacyEnvOutfitsPresent =
            rawCo === undefined || rawCo === null
              ? false
              : typeof rawCo === 'string'
                ? rawCo.trim().length > 0
                : Object.keys(rawCo as Record<string, string>).length > 0;

          logger.info(
            {
              storyId,
              requestId,
              sceneId: scene.sceneId,
              index: i + 1,
              total: scenesToGenerate.length,
              storyOutfitsCount: storyOutfitsList.length,
              sceneCharacterOutfitIdKeys:
                scene.characterOutfitIds && typeof scene.characterOutfitIds === 'object'
                  ? Object.keys(scene.characterOutfitIds)
                  : [],
              sceneCharacterOutfitIdsSample:
                scene.characterOutfitIds && typeof scene.characterOutfitIds === 'object'
                  ? Object.fromEntries(Object.entries(scene.characterOutfitIds).slice(0, 6))
                  : undefined,
              legacyEnvOutfitsPresent,
              hasResolvedCharacterOutfits: !!characterOutfits,
              resolvedCharacterOutfitKeys: characterOutfits ? Object.keys(characterOutfits) : [],
              outfitPlateRefsCount: outfitPlateRefs.length,
            },
            'Generating scene image (parallel pool)'
          );

          try {
            const composedSceneVisual = buildComposedSceneVisual({
              storyId,
              scene,
              sceneIndexInAll: sceneIndex,
              generatedIndices: sceneIndices,
              allScenes: text.scenes as SceneData[],
              environmentMap,
              hasEnvironmentImageRef: !!envImageData,
            });
            const enrichedScene: SceneData = { ...scene, sceneVisual: composedSceneVisual };

            const sceneImageStartedAt = new Date();
            let imageResult: { imageUrl: string; assetId: string };
            try {
              imageResult = await generateSceneImageWithReference(storyId, enrichedScene, {
                sceneDbId: existingScenesBySceneId.get(scene.sceneId)?.id,
                childProfile: spec.childProfile,
                characters: sceneCharacterDescriptions,
                userStyle: (spec as any).imageStyle,
                ageGroup: spec.ageGroup,
                scenarioCardId: spec.scenarioCard?.id,
                storyOutfits: storyOutfitsList.length > 0 ? storyOutfitsList : undefined,
                userPlan,
                userId: request.userId,
                assetStorage,
                imageDomain,
                complexImageDomain,
                referenceImageDataArray,
                imageSystemInstruction,
                imageIndexMap,
                currentEnvironmentId,
                currentEnvironment,
                requestId,
                onValidationRetry: async () => {
                  await syncForegroundImageProgress({ takingLongerThanExpected: true });
                },
              });
              await recordStageTiming({
                storyId,
                storyRequestId: requestId,
                userId: request.userId,
                generationKind: 'story',
                pipelinePhase: 'asset_generation',
                operation: 'scene_image',
                targetType: 'scene',
                targetKey: String(scene.sceneId),
                sceneIndex,
                assetId: imageResult.assetId,
                startedAt: sceneImageStartedAt,
                completedAt: new Date(),
                metadata: {
                  referenceCount: referenceImageDataArray.length,
                  characterReferenceCount: referenceImageDataArray.filter(
                    (ref) =>
                      ref.source === 'imaginary_friend' ||
                      ref.source === 'child_reference' ||
                      ref.source === 'character_reference'
                  ).length,
                  objectReferenceCount: referenceImageDataArray.filter(
                    (ref) => ref.source === 'environment' || ref.source === 'outfit_plate'
                  ).length,
                  hasEnvironmentImageRef: !!envImageData,
                  outfitPlateRefsCount: outfitPlateRefs.length,
                  currentEnvironmentId,
                  index: i + 1,
                  total: scenesToGenerate.length,
                },
              });
            } catch (imageError) {
              await recordStageTiming({
                storyId,
                storyRequestId: requestId,
                userId: request.userId,
                generationKind: 'story',
                pipelinePhase: 'asset_generation',
                operation: 'scene_image',
                targetType: 'scene',
                targetKey: String(scene.sceneId),
                sceneIndex,
                status: 'failed',
                startedAt: sceneImageStartedAt,
                completedAt: new Date(),
                metadata: {
                  referenceCount: referenceImageDataArray.length,
                  hasEnvironmentImageRef: !!envImageData,
                  outfitPlateRefsCount: outfitPlateRefs.length,
                  currentEnvironmentId,
                  index: i + 1,
                  total: scenesToGenerate.length,
                  errorMessage:
                    imageError instanceof Error ? imageError.message : String(imageError),
                },
              });
              throw imageError;
            }

            const preloadedSceneRecord = existingScenesBySceneId.get(scene.sceneId);
            if (preloadedSceneRecord && imageResult.imageUrl) {
              await getSceneRepository().update(preloadedSceneRecord.id, {
                imageUrl: imageResult.imageUrl,
              });
              if (sceneIndex === sceneIndices[0]) {
                await setStoryCoverAssetIfMissing(storyId, imageResult.assetId);
              }
            }

            // Count completed images toward both UX threshold and background bookkeeping
            readyImagesCount++;
            await recordFirstImageReady(scene.sceneId, sceneIndex, 'completed');

            if (!requestMarkedCompleted) {
              await syncForegroundImageProgress();
            }

            if (!requestMarkedCompleted && readyImagesCount >= trackedImageTarget) {
              await markRequestCompletedForUx(scene.sceneId);
            }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            logger.error(
              { err: error, storyId, sceneId: scene.sceneId },
              'Failed to generate scene image'
            );
            failedScenes.push({ sceneId: scene.sceneId, errorMessage: errMsg });

            if (!requestMarkedCompleted && i === 0) {
              await syncForegroundImageProgress({ takingLongerThanExpected: true });
              throw error;
            }
          }
        });

        await ensureStoryDefaultCoverAssetId(storyId);
        timingFailedSceneCount = failedScenes.length;

        // 5. Mark image generation complete, persist failed scenes
        const finalMetadata = (await getStoryRepository().findById(storyId))?.metadata as Record<
          string,
          unknown
        > | null;
        await getStoryRepository().updateStory(storyId, {
          metadata: {
            ...(finalMetadata || {}),
            imageGenerationComplete: true,
            ...(failedScenes.length > 0 && { failedScenes }),
          },
        });

        logger.info(
          {
            storyId,
            totalGenerated: scenesToGenerate.length - failedScenes.length,
            failedCount: failedScenes.length,
          },
          'Parallel image pipeline complete'
        );
      }
    } // end if !skipGeneration

    if (config.image.skipGeneration || scenesToGenerate.length === 0) {
      await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
      await getStoryRepository().updateRequest(requestId, { status: 'completed', storyId });
      const readyCompletedAt = new Date();
      const readyReason = config.image.skipGeneration ? 'skip_generation' : 'no_scenes';
      await recordStageTiming({
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: 'story',
        pipelinePhase: 'asset_generation',
        operation: 'foreground_images_ready',
        targetType: 'story',
        targetKey: storyId,
        status: 'skipped',
        startedAt: batchStartedAt,
        completedAt: readyCompletedAt,
        metadata: {
          readyReason,
          selectedSceneCount: scenesToGenerate.length,
          totalScenes,
          imagesPerStory,
        },
      });
      await recordStageTiming({
        storyId,
        storyRequestId: requestId,
        userId: request.userId,
        generationKind: 'story',
        pipelinePhase: 'postprocess',
        operation: 'story_ready',
        targetType: 'story',
        targetKey: storyId,
        startedAt: timingRequestCreatedAt ?? batchStartedAt,
        completedAt: readyCompletedAt,
        metadata: {
          readyReason,
          selectedSceneCount: scenesToGenerate.length,
          totalScenes,
          imagesPerStory,
        },
      });

      // Mark image generation as complete even when skipped/no scenes
      const finalMetadata = (await getStoryRepository().findById(storyId))?.metadata as Record<
        string,
        unknown
      > | null;
      await getStoryRepository().updateStory(storyId, {
        metadata: {
          ...(finalMetadata || {}),
          imageGenerationComplete: true,
        },
      });
      await ensureStoryDefaultCoverAssetId(storyId);
    }

    await recordStageTiming({
      storyId,
      storyRequestId: requestId,
      userId: request.userId,
      generationKind: 'story',
      pipelinePhase: 'asset_generation',
      operation: 'image_batch',
      targetType: 'story',
      targetKey: storyId,
      status:
        config.image.skipGeneration || scenesToGenerate.length === 0 ? 'skipped' : 'completed',
      startedAt: batchStartedAt,
      completedAt: new Date(),
      metadata: {
        selectedSceneCount: scenesToGenerate.length,
        failedSceneCount: timingFailedSceneCount,
        totalScenes,
        imagesPerStory,
        skipGeneration: config.image.skipGeneration,
      },
    });

    // Clear intermediate data now that all images are generated (or skipped)
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: null,
    });

    logger.info(
      { requestId, storyId, checkpoint: 'cleared', duration: Date.now() - startTime },
      'Image generation completed'
    );
  } catch (error) {
    logger.error(
      {
        error,
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Story image generation failed'
    );
    await recordStageTiming({
      storyId: timingStoryId ?? null,
      storyRequestId: requestId,
      userId: timingUserId ?? null,
      generationKind: 'story',
      pipelinePhase: 'asset_generation',
      operation: 'image_batch',
      targetType: 'story',
      targetKey: timingStoryId ?? null,
      status: 'failed',
      startedAt: batchStartedAt,
      completedAt: new Date(),
      metadata: {
        selectedSceneCount: timingSelectedSceneCount,
        failedSceneCount: timingFailedSceneCount,
        totalScenes: timingTotalScenes,
        imagesPerStory: timingImagesPerStory,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

/**
 * Collect plot example IDs already used in a series to avoid repetition.
 */
async function getUsedPlotExampleIds(seriesId: string): Promise<Set<string>> {
  const series = await getStoryRepository().findSeriesById(seriesId);
  if (!series || !series.storyIds || (series.storyIds as string[]).length === 0) {
    return new Set();
  }

  const rows = await getStoryRepository().findMetadataByIds(series.storyIds as string[]);
  const ids = new Set<string>();
  for (const row of rows) {
    const meta = row.metadata as Record<string, any> | null;
    if (meta?.plotExampleId) ids.add(meta.plotExampleId);
  }
  return ids;
}

/**
 * Collect world rule IDs already used in a series to avoid repetition.
 */
async function getUsedWorldRuleIds(seriesId: string): Promise<Set<string>> {
  const series = await getStoryRepository().findSeriesById(seriesId);
  if (!series || !series.storyIds || (series.storyIds as string[]).length === 0) {
    return new Set();
  }

  const rows = await getStoryRepository().findMetadataByIds(series.storyIds as string[]);
  const ids = new Set<string>();
  for (const row of rows) {
    const meta = row.metadata as Record<string, any> | null;
    if (meta?.worldRuleId) ids.add(meta.worldRuleId);
  }
  return ids;
}

/** Continuation context passed when generating a series continuation */
export interface ContinuationContext {
  previousOutlines: Array<{
    title: string;
    moral: string;
    scenes: Array<{ setting: string; goal: string }>;
  }>;
  requiredCharacters: CharacterData[];
  optionalCharacters: CharacterData[];
  usedPlots: string[];
  previousEnvironments?: Array<{
    id: string;
    name: string;
    description: string;
    characterOutfits?: string;
  }>;
  previousOutfits?: Array<{ id: string; characterName: string; description: string }>;
}

/**
 * Build story spec from request data
 * When continuationContext is provided, uses requiredCharacters + optionalCharacters instead of loading from request
 */
export async function buildStorySpec(
  request: StoryRequestData,
  options?: {
    continuationContext?: ContinuationContext;
    plotExampleId?: string;
    worldRuleId?: string;
  }
): Promise<{
  spec: StorySpec & { childProfile?: ChildProfileData };
  selectedCharacters: CharacterData[];
  optionalCharacters?: CharacterData[];
  chosenPlotExampleId?: string;
  chosenWorldRuleId?: string;
}> {
  try {
    const scenarioCardBasePromise = request.scenarioCardId
      ? getDictionaryRepository().findScenarioCardById(request.scenarioCardId)
      : Promise.resolve(null);
    const goalDataPromise = request.goal
      ? getDictionaryRepository().findGoalBySlug(request.goal)
      : Promise.resolve(null);
    const storyLanguage = normalizeStoryLocale(request.storyLanguage);

    // Get child profile if specified
    let childName: string | undefined = undefined; // Will be set if child is a character
    let ageGroup = '4-5'; // Default age group
    let childProfile: ChildProfileData | null = null;
    let selectedCharacters: CharacterData[] = [];
    let selectedChildrenData: CharacterData[] = [];
    let optionalCharacters: CharacterData[] | undefined;

    let allCharacters: CharacterData[];

    // Continuation mode: use characters from continuationContext
    if (options?.continuationContext) {
      const { requiredCharacters, optionalCharacters: optChars } = options.continuationContext;
      selectedCharacters = [...requiredCharacters];
      optionalCharacters = optChars && optChars.length > 0 ? optChars : undefined;
      allCharacters = [...requiredCharacters, ...(optionalCharacters || [])];
      logger.info(
        {
          requestId: request.id,
          requiredCount: requiredCharacters.length,
          optionalCount: optionalCharacters?.length ?? 0,
          totalCharacters: allCharacters.length,
        },
        'Using continuation context characters'
      );
    } else {
      const selectedCharactersPromise =
        request.selectedCharacters && request.selectedCharacters.length > 0
          ? getCharacterRepository().findByIds(request.userId, request.selectedCharacters)
          : Promise.resolve([]);
      const childProfilePromise = request.childProfileId
        ? getChildProfileRepository().findById(request.childProfileId, request.userId)
        : Promise.resolve(null);
      const selectedChildrenPromise =
        request.selectedChildren && request.selectedChildren.length > 0
          ? getChildProfileRepository().findByIds(request.userId, request.selectedChildren)
          : Promise.resolve([]);

      const [userCharacters, profile, childProfilesToInclude] = await Promise.all([
        selectedCharactersPromise,
        childProfilePromise,
        selectedChildrenPromise,
      ]);

      // Standard mode: load selected characters from request
      if (userCharacters.length > 0) {
        const characterNameTranslations = new Map<string, string>();
        const translations = await getDictionaryRepository().findTranslations(
          'character',
          userCharacters.map((c) => c.id),
          storyLanguage
        );
        for (const translation of translations) {
          if (translation.fieldName === 'name' && translation.value.trim()) {
            characterNameTranslations.set(translation.entityId, translation.value.trim());
          }
        }
        const missingLocalizedNames = userCharacters.filter(
          (c) => !characterNameTranslations.has(c.id)
        );
        if (missingLocalizedNames.length > 0) {
          await Promise.all(
            missingLocalizedNames.map(async (character) => {
              try {
                const localizations = await localizeCharacterNames(character, {
                  onUsage: (u) =>
                    recordUsage(u, { userId: request.userId, characterId: character.id }),
                  sourceLocale: character.descriptionLanguage,
                });
                characterNameTranslations.set(
                  character.id,
                  localizations[storyLanguage] || character.name
                );
              } catch (err) {
                logger.warn(
                  { err, requestId: request.id, characterId: character.id },
                  'Lazy character name localization failed; using canonical name'
                );
              }
            })
          );
        }

        selectedCharacters = userCharacters
          .filter((c) => c.name) // Only include characters with valid name
          .map((c) => ({
            id: c.id,
            name: characterNameTranslations.get(c.id) || stripCharacterIdFromName(c.name) || c.name,
            canonicalName: c.name,
            type: c.type,
            traits: c.personality || undefined,
            referencePhotos: c.referencePhotos as ReferencePhoto[] | undefined,
            appearanceTraits: c.appearanceTraits as AppearanceTraits | undefined,
            description: c.description || undefined,
            role: undefined,
            appearance: undefined,
            personality: c.personality || undefined,
            turnaroundSheet: (c as any).turnaroundSheet || undefined,
            descriptionEn: (c as any).descriptionEn || undefined,
            aiGeneratedDescription: c.aiGeneratedDescription || undefined,
          }));

        logger.info(
          {
            requestId: request.id,
            userId: request.userId,
            selectedCharacterIds: request.selectedCharacters,
            loadedCharactersCount: selectedCharacters.length,
            charactersWithReferences: selectedCharacters
              .filter((c) => c.referencePhotos && c.referencePhotos.length > 0)
              .map((c) => ({
                name: c.name,
                canonicalName: (c as any).canonicalName,
                type: c.type,
                referencePhotoCount: c.referencePhotos?.length || 0,
              })),
          },
          'Loaded selected characters (independent of childProfileId)'
        );
      }

      if (profile && profile.name && profile.birthDate) {
        // DON'T set childName here - will be set later based on allCharacters
        ageGroup = calculateAgeGroup(new Date(profile.birthDate));
        childProfile = profile as ChildProfileData;
      } else {
        logger.warn(
          {
            childProfileId: request.childProfileId,
            profileFound: !!profile,
            hasName: profile?.name,
            hasBirthDate: profile?.birthDate,
          },
          'Child profile incomplete or not found, using defaults'
        );
      }

      // Load selected children if provided (to include as characters in story)
      selectedChildrenData = childProfilesToInclude
        .filter((c) => c.name)
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: 'child', // Special type for children
          referencePhotos: c.referencePhotos as ReferencePhoto[] | undefined,
          appearanceTraits: c.appearanceTraits as AppearanceTraits | undefined,
          personality: c.personality || undefined,
          traits: c.personality || undefined,
          description: undefined,
          role: undefined,
          appearance: undefined,
          turnaroundSheet: (c as any).turnaroundSheet || undefined,
          descriptionEn: (c as any).descriptionEn || undefined,
          aiGeneratedDescription: c.aiGeneratedDescription || undefined,
          clothing: (c as any).clothing || undefined,
          distinctiveFeatures: (c as any).distinctiveFeatures || undefined,
        }));

      logger.info(
        {
          requestId: request.id,
          selectedChildrenCount: selectedChildrenData.length,
          childNames: selectedChildrenData.map((c) => c.name),
        },
        'Loaded selected children as characters'
      );

      allCharacters = [...selectedCharacters, ...selectedChildrenData];
    }

    allCharacters = await attachCharacterNameAliases(allCharacters);
    const refreshedById = new Map(allCharacters.filter((c) => c.id).map((c) => [c.id!, c]));
    selectedCharacters = selectedCharacters.map((c) => (c.id ? (refreshedById.get(c.id) ?? c) : c));
    selectedChildrenData = selectedChildrenData.map((c) =>
      c.id ? (refreshedById.get(c.id) ?? c) : c
    );
    optionalCharacters = optionalCharacters?.map((c) =>
      c.id ? (refreshedById.get(c.id) ?? c) : c
    );

    // Set childName ONLY if child profile is included as a character in the story
    if (childProfile && request.childProfileId) {
      const isChildInStory = allCharacters.some(
        (c) => c.type === 'child' && c.id === request.childProfileId
      );

      childName = isChildInStory ? childProfile.name : undefined;

      logger.info(
        {
          childProfileId: request.childProfileId,
          isChildInStory,
          childName: childName || 'not-set',
          totalCharacters: allCharacters.length,
        },
        'Child profile processed for story generation'
      );
    }

    // Log detailed character information including reference photos
    const characterDetails = allCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      hasReferencePhotos: !!(c.referencePhotos && c.referencePhotos.length > 0),
      referencePhotoCount: c.referencePhotos?.length || 0,
      referencePhotoTypes:
        c.referencePhotos?.map((p: any) => {
          // Extract type from URL or path if possible
          const url = p.url || '';
          if (url.includes('imaginary_friend') || url.includes('character')) {
            return 'imaginary_friend';
          }
          return 'unknown';
        }) || [],
    }));

    logger.info(
      {
        requestId: request.id,
        userCharactersCount: selectedCharacters.length,
        selectedChildrenCount: selectedChildrenData.length,
        totalCharacters: allCharacters.length,
        characterNames: allCharacters.map((c) => c.name),
        selectedCharactersInput: request.selectedCharacters,
        selectedChildrenInput: request.selectedChildren,
        characterDetails,
        charactersWithReferences: characterDetails
          .filter((c) => c.hasReferencePhotos)
          .map((c) => ({
            name: c.name,
            type: c.type,
            referencePhotoCount: c.referencePhotoCount,
          })),
      },
      'Characters prepared for story generation - detailed info with reference photos'
    );

    // Load scenario card if specified
    // Load scenario card with guidance
    let scenarioCard:
      | { id: string; name: string; description: string; promptGuidance?: string }
      | undefined;
    const card = await scenarioCardBasePromise;
    if (card) {
      // Load translations for name and description (use story language for prompts)
      const translations = await getDictionaryRepository().findTranslations(
        'scenario_card',
        [card.id],
        storyLanguage
      );

      const nameTranslation = translations.find((t) => t.fieldName === 'name');
      const descTranslation = translations.find((t) => t.fieldName === 'description');

      scenarioCard = {
        id: card.id,
        name: nameTranslation?.value || card.nameKey, // Use translated name or fallback to key
        description: descTranslation?.value || card.descriptionKey, // Use translated description or fallback
        promptGuidance: card.promptGuidance,
      };
    }

    // Select a random plot example to replace generic promptGuidance
    let chosenPlotExampleId: string | undefined;
    let chosenWorldRuleId: string | undefined;
    let worldRule: { name: string; description: string } | undefined;
    if (scenarioCard) {
      const plotExamples = await getDictionaryRepository().findActivePlotExamples(scenarioCard.id);
      if (plotExamples.length > 0) {
        let available = plotExamples;
        let picked = options?.plotExampleId
          ? plotExamples.find((e) => e.id === options.plotExampleId)
          : undefined;

        // Series dedup: exclude examples used in previous parts
        const intermediateData = (request as any).intermediateData as
          | Record<string, any>
          | undefined;
        const seriesId = intermediateData?.seriesId as string | undefined;
        if (!picked && seriesId) {
          const usedIds = await getUsedPlotExampleIds(seriesId);
          const filtered = plotExamples.filter((e) => !usedIds.has(e.id));
          if (filtered.length > 0) available = filtered;
          logger.info(
            {
              seriesId,
              totalExamples: plotExamples.length,
              usedCount: usedIds.size,
              availableAfterDedup: available.length,
            },
            'Plot example series dedup'
          );
        }

        if (!picked && options?.plotExampleId) {
          logger.warn(
            {
              scenarioCardId: scenarioCard.id,
              plotExampleId: options.plotExampleId,
            },
            'Requested plot example not found; falling back to random selection'
          );
        }

        picked = picked || available[Math.floor(Math.random() * available.length)];
        scenarioCard.promptGuidance = picked.setting;
        chosenPlotExampleId = picked.id;

        logger.info(
          {
            scenarioCardId: scenarioCard.id,
            plotExampleId: picked.id,
            setting: picked.setting.substring(0, 80) + '...',
          },
          'Selected plot example for story generation'
        );
      }

      // Select a random world rule for the scenario
      const worldRules = await getDictionaryRepository().findActiveWorldRules(scenarioCard.id);
      if (worldRules.length > 0) {
        let availableRules = worldRules;
        let pickedRule = options?.worldRuleId
          ? worldRules.find((r) => r.id === options.worldRuleId)
          : undefined;
        const intermediateData = (request as any).intermediateData as
          | Record<string, any>
          | undefined;
        const seriesId = intermediateData?.seriesId as string | undefined;
        if (!pickedRule && seriesId) {
          const usedWorldRuleIds = await getUsedWorldRuleIds(seriesId);
          const filtered = worldRules.filter((r) => !usedWorldRuleIds.has(r.id));
          if (filtered.length > 0) availableRules = filtered;
          logger.info(
            {
              seriesId,
              totalRules: worldRules.length,
              usedCount: usedWorldRuleIds.size,
              availableAfterDedup: availableRules.length,
            },
            'World rule series dedup'
          );
        }
        if (!pickedRule && options?.worldRuleId) {
          logger.warn(
            {
              scenarioCardId: scenarioCard.id,
              worldRuleId: options.worldRuleId,
            },
            'Requested world rule not found; falling back to random selection'
          );
        }
        pickedRule =
          pickedRule || availableRules[Math.floor(Math.random() * availableRules.length)];
        chosenWorldRuleId = pickedRule.id;
        worldRule = { name: pickedRule.name, description: pickedRule.description };
        logger.info(
          {
            scenarioCardId: scenarioCard.id,
            worldRuleId: pickedRule.id,
            worldRuleName: pickedRule.name,
          },
          'Selected world rule for story generation'
        );
      }
    }

    // Load goal with guidance and translations
    let goalWithGuidance: { slug: string; name: string; promptGuidance: string } | undefined;
    const goalData = await goalDataPromise;
    if (goalData) {
      // Load translations for goal name (use story language for prompts)
      const translations = await getDictionaryRepository().findTranslations(
        'story_goal',
        [goalData.slug],
        storyLanguage
      );

      const goalNameTranslation = translations.find((t) => t.fieldName === 'name');

      goalWithGuidance = {
        slug: goalData.slug,
        name: goalNameTranslation?.value || goalData.slug, // Use translated name or fallback to slug
        promptGuidance: goalData.promptGuidance,
      };
    }

    // Build policy profile
    const policyProfile = await buildPolicyProfile(ageGroup, storyLanguage);

    const closingArtifact = await selectStoryArtifactForPrompt({
      locale: storyLanguage,
      scenarioCard,
      scenarioGuidance: scenarioCard?.promptGuidance,
      goalName: goalWithGuidance?.name,
      goalGuidance: goalWithGuidance?.promptGuidance,
      userNotes: request.userNotes || undefined,
      worldRule,
      childProfile,
    }).catch((err) => {
      logger.warn(
        { err, requestId: request.id, scenarioCardId: scenarioCard?.id },
        'Story artifact selection failed; writer will use generic keepsake rule'
      );
      return undefined;
    });

    const spec: StorySpec & { childProfile?: ChildProfileData } = {
      language: storyLanguage,
      ageGroup,
      childName,
      childProfile: childProfile || undefined,
      goal: goalWithGuidance?.slug || request.goal || undefined,
      goalName: goalWithGuidance?.name, // NEW: Translated goal name for prompts
      goalGuidance: goalWithGuidance?.promptGuidance, // NEW: Detailed goal guidance
      imageStyle: (request as any).imageStyle || undefined, // Image art style
      characters: allCharacters as any, // Merged: user characters + selected children
      userNotes: request.userNotes || undefined,
      policyProfile,
      scenarioCard, // NEW: Add scenario card to spec
      scenarioGuidance: scenarioCard?.promptGuidance, // NEW: Detailed plot guidance
      worldRule,
      closingArtifact,
    };

    // Verify characters are included (especially for instant mode)
    logger.debug(
      {
        requestId: request.id,
        specCharacterCount: allCharacters.length,
        characterNames: allCharacters.map((c) => c.name),
        isInstantMode: request.selectedCharacters?.length > 0 && !request.selectedChildren?.length,
        imageStyle: spec.imageStyle,
      },
      'Story spec created with characters'
    );

    return {
      spec,
      selectedCharacters: allCharacters,
      ...(optionalCharacters !== undefined && { optionalCharacters }),
      chosenPlotExampleId,
      chosenWorldRuleId,
    };
  } catch (error) {
    logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestId: request.id,
        childProfileId: request.childProfileId,
      },
      'Failed to build story spec'
    );
    throw error;
  }
}

function normalizeStoryLocale(language?: string | null): Locale {
  const normalized = language?.slice(0, 2).toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

export interface EnvImageData {
  base64: string;
  mimeType: string;
  fileUri?: string;
  storagePath: string;
}

/**
 * Get or create environment image (on-demand, with cache and story mapping).
 * Uses embedding similarity for global reuse; story_environment_cache for continuation.
 */
async function getOrCreateEnvironmentImage(params: {
  storyId: string;
  userId?: string;
  storyEnvironmentId: string;
  environment: StoryEnvironment;
  assetStorage: ReturnType<typeof getAssetStorageService>;
  scenarioCardId?: string;
  /** For continuation: check previous parts in series for cached env image */
  previousStoryIds?: string[];
}): Promise<EnvImageData | null> {
  if (!config.image.enableEnvironmentReference) return null;

  const {
    storyId,
    userId,
    storyEnvironmentId,
    environment,
    assetStorage,
    scenarioCardId,
    previousStoryIds,
  } = params;
  const envCacheRepo = getEnvironmentImageCacheRepository();
  const storyEnvRepo = getStoryEnvironmentCacheRepository();
  const threshold = config.image.environmentEmbeddingSimilarityThreshold;
  const cacheDescription = buildEnvironmentImageCacheDescription(environment.description);

  // 1. Check story_environment_cache (current story)
  const existing = await storyEnvRepo.getByStoryAndEnvId(storyId, storyEnvironmentId);
  if (existing) {
    const cached = await envCacheRepo.getById(existing.cacheId);
    if (cached && isCurrentEnvironmentImageCacheDescription(cached.description)) {
      const buffer = await assetStorage.getAssetByPath(cached.storagePath);
      return {
        base64: buffer.toString('base64'),
        mimeType: 'image/png',
        storagePath: cached.storagePath,
      };
    }
  }

  // 1.5. For continuation: check previous parts in series for cached env image
  if (previousStoryIds && previousStoryIds.length > 0) {
    for (const prevStoryId of previousStoryIds) {
      const prevExisting = await storyEnvRepo.getByStoryAndEnvId(prevStoryId, storyEnvironmentId);
      if (prevExisting) {
        const cached = await envCacheRepo.getById(prevExisting.cacheId);
        if (cached && isCurrentEnvironmentImageCacheDescription(cached.description)) {
          const buffer = await assetStorage.getAssetByPath(cached.storagePath);
          await storyEnvRepo.upsert(storyId, storyEnvironmentId, prevExisting.cacheId);
          logger.info(
            { storyId, storyEnvironmentId, prevStoryId, cacheId: prevExisting.cacheId },
            'Reused environment image from previous part in series'
          );
          return {
            base64: buffer.toString('base64'),
            mimeType: 'image/png',
            storagePath: cached.storagePath,
          };
        }
      }
    }
  }

  // 2. Embedding search
  const embedding = await generateEmbedding(cacheDescription);
  const similar = await envCacheRepo.findSimilar(embedding, threshold, {
    descriptionPrefix: ENVIRONMENT_REFERENCE_CACHE_PREFIX,
  });
  if (similar) {
    const buffer = await assetStorage.getAssetByPath(similar.storagePath);
    await storyEnvRepo.upsert(storyId, storyEnvironmentId, similar.id);
    return {
      base64: buffer.toString('base64'),
      mimeType: 'image/png',
      storagePath: similar.storagePath,
    };
  }

  // 3. Generate with Gemini Flash Image (env provider)
  try {
    const envProvider = getEnvironmentImageProvider();
    const prompt = buildEnvironmentImagePrompt({ environment, scenarioCardId });
    const usageContext = { userId: userId ?? null, storyId };
    const result = await envProvider.generateImage({
      prompt,
      aspectRatio: '16:9',
      onUsage: (u) => recordUsage(u, usageContext),
      operation: USAGE_OP_IMAGE_ENVIRONMENT,
    });

    const buffer = Buffer.isBuffer(result.imageData)
      ? result.imageData
      : Buffer.from(result.imageData as string, 'base64');
    const cacheId = crypto.randomUUID();
    const { storagePath } = await assetStorage.saveEnvironmentCacheImage(
      cacheId,
      buffer,
      result.mimeType
    );

    await envCacheRepo.create({
      id: cacheId,
      description: cacheDescription,
      descriptionEmbedding: embedding,
      storagePath,
      storageUrl: `/api/v1/assets/${storagePath}`,
    });

    await storyEnvRepo.upsert(storyId, storyEnvironmentId, cacheId);

    return {
      base64: buffer.toString('base64'),
      mimeType: result.mimeType,
      storagePath,
    };
  } catch (err) {
    logger.warn(
      { err, storyEnvironmentId },
      'Environment image generation failed, falling back to text'
    );
    return null;
  }
}

/**
 * Build a composed SceneVisual that enriches the scene's sceneVisual with:
 * 1. Environment description (if sceneVisual.setting is empty, use environment)
 * 2. Transient context from non-generated neighboring scenes (appended to setting)
 * When hasEnvironmentImageRef=true: use only delta (scene-specific) in setting.
 *
 * Returns a SceneVisual object that can be passed directly to buildSceneImagePrompt.
 */
function buildComposedSceneVisual(params: {
  storyId: string;
  scene: SceneData;
  sceneIndexInAll: number;
  generatedIndices: number[];
  allScenes: SceneData[];
  environmentMap: Map<string, StoryEnvironment>;
  hasEnvironmentImageRef?: boolean;
}): SceneVisual {
  const { storyId, scene, environmentMap, hasEnvironmentImageRef } = params;

  const sceneVisual = migrateVisualPrompt(scene);
  const environmentId = (scene as any).environmentId as string | undefined;
  const environment = environmentId ? environmentMap.get(environmentId) : undefined;

  // COMPOSE: base environment + scene delta (or delta only when env image ref is used)
  let composedSetting = sceneVisual.setting || '';

  if (hasEnvironmentImageRef) {
    // Env image provides layout/content — use only scene-specific delta
    composedSetting = composedSetting.trim() || 'Same location as reference.';
    logger.info(
      {
        storyId,
        sceneId: scene.sceneId,
        environmentId,
        deltaOnly: true,
      },
      'Composed setting: delta only (env image reference)'
    );
  } else if (environment?.description) {
    // Merge: base description + scene-specific delta
    const basePart = environment.description.trim();
    const deltaPart = composedSetting.trim();

    if (deltaPart) {
      composedSetting = `${basePart} ${deltaPart}`;
    } else {
      composedSetting = basePart;
    }

    logger.info(
      {
        storyId,
        sceneId: scene.sceneId,
        environmentId,
        baseLength: basePart.length,
        deltaLength: deltaPart.length,
        composedLength: composedSetting.length,
      },
      'Composed setting: base + delta'
    );
  } else {
    logger.warn(
      {
        storyId,
        sceneId: scene.sceneId,
        environmentId,
      },
      'No environment description found - using scene setting only'
    );
  }

  const composed: SceneVisual = {
    setting: composedSetting,
    cameraComposition: sceneVisual.cameraComposition,
    lighting: sceneVisual.lighting,
  };

  logger.info(
    {
      storyId,
      sceneId: scene.sceneId,
      environmentId: environmentId || 'MISSING',
      environmentName: environment?.name || 'N/A',
      hasEnvironmentDescription: !!environment?.description,
      finalSettingLength: composed.setting.length,
    },
    'Composed sceneVisual with base+delta'
  );

  return composed;
}

/**
 * Maximum number of generation-level retries when the model refuses to produce an image
 * (e.g. IMAGE_OTHER / content filtered). This is separate from validation retries.
 */
const MAX_GENERATION_RETRIES = 2;

/**
 * Delay between generation retries (ms). Short delay to avoid hammering the API.
 */
const GENERATION_RETRY_DELAY_MS = 2000;

type SceneImageDomainService = ReturnType<typeof getImageDomainService>;
type SceneImageRoute = 'simple' | 'complex';
type SceneGeneratedImage = Awaited<
  ReturnType<SceneImageDomainService['generateSceneWithReference']>
>;

/**
 * Check if an error is a retryable generation failure (IMAGE_OTHER, content blocked).
 * These are transient failures where the model refused to generate but might succeed on retry.
 */
function isRetryableGenerationError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('image_other') ||
      msg.includes('no image content in candidate') ||
      msg.includes('parts array contains no inlinedata') ||
      msg.includes('blocked or filtered')
    );
  }
  return false;
}

/**
 * Wrapper that retries image generation on transient failures (IMAGE_OTHER).
 * Returns the generated image or throws after all retries are exhausted.
 */
async function generateWithRetry(
  imageDomain: SceneImageDomainService,
  generateRequest: Parameters<SceneImageDomainService['generateSceneWithReference']>[0],
  context: {
    storyId: string;
    sceneId: number;
    userId?: string;
    nextPromptAttemptId?: () => number;
    validationAttempt?: number;
    imageRoute?: SceneImageRoute;
  }
): Promise<ReturnType<SceneImageDomainService['generateSceneWithReference']>> {
  const usageContext = { userId: context.userId ?? null, storyId: context.storyId };
  const onUsage = (u: UsageMetadata) => recordUsage(u, usageContext);
  let lastError: unknown;
  for (let retry = 0; retry <= MAX_GENERATION_RETRIES; retry++) {
    const promptAttemptId = context.nextPromptAttemptId ? context.nextPromptAttemptId() : retry + 1;
    try {
      return await imageDomain.generateSceneWithReference(generateRequest, {
        onUsage,
        onBuiltPrompt: async (payload) => {
          await saveImagePromptDebugArtifact({
            storyId: context.storyId,
            sceneId: context.sceneId,
            attemptId: promptAttemptId,
            providerRetry: retry + 1,
            validationAttempt: context.validationAttempt,
            imageRoute: context.imageRoute,
            payload,
          });
        },
      });
    } catch (error) {
      lastError = error;
      if (isRetryableGenerationError(error) && retry < MAX_GENERATION_RETRIES) {
        logger.warn(
          {
            storyId: context.storyId,
            sceneId: context.sceneId,
            promptAttemptId,
            imageRoute: context.imageRoute,
            retry: retry + 1,
            maxRetries: MAX_GENERATION_RETRIES,
            error: error instanceof Error ? error.message : String(error),
          },
          'Generation failed (IMAGE_OTHER), retrying after delay'
        );
        await new Promise((resolve) => setTimeout(resolve, GENERATION_RETRY_DELAY_MS));
        continue;
      }
      // Non-retryable error or retries exhausted
      throw error;
    }
  }
  // Should never reach here, but TypeScript needs it
  throw lastError;
}

async function saveImagePromptDebugArtifact(params: {
  storyId: string;
  sceneId: number;
  attemptId: number;
  providerRetry: number;
  validationAttempt?: number;
  imageRoute?: SceneImageRoute;
  payload: BuiltScenePromptPayload;
}): Promise<void> {
  try {
    const storyDir = path.join(IMAGE_PROMPT_DEBUG_ROOT, params.storyId);
    await fs.mkdir(storyDir, { recursive: true });

    const filePath = path.join(storyDir, `${params.sceneId}-${params.attemptId}.json`);

    const debugRecord = {
      storyId: params.storyId,
      sceneId: params.sceneId,
      attemptId: params.attemptId,
      providerRetry: params.providerRetry,
      validationAttempt: params.validationAttempt ?? null,
      imageRoute: params.imageRoute ?? null,
      savedAt: new Date().toISOString(),
      primaryRead: params.payload.primaryRead ?? null,
      prompt: params.payload.prompt,
      systemInstruction: params.payload.systemInstruction ?? null,
      aspectRatio: params.payload.aspectRatio ?? null,
      referenceImages: (params.payload.referenceImages ?? []).map((ref, index) => ({
        index: index + 1,
        instructionText: ref.instructionText ?? null,
        characterName: ref.characterName ?? null,
        referenceKind: ref.referenceKind ?? null,
        mimeType: ref.mimeType ?? null,
        fileUri: ref.fileUri ?? null,
        url: ref.url ?? null,
        hasBase64Data: ref.hasBase64Data,
      })),
      fullTextPrompt:
        `PRIMARY READ:\n${params.payload.primaryRead ?? ''}\n\n` +
        `SYSTEM INSTRUCTION:\n${params.payload.systemInstruction ?? ''}\n\n` +
        `USER PROMPT:\n${params.payload.prompt}\n\n` +
        `REFERENCE IMAGES:\n${JSON.stringify(
          (params.payload.referenceImages ?? []).map((ref, index) => ({
            index: index + 1,
            instructionText: ref.instructionText ?? null,
            characterName: ref.characterName ?? null,
            referenceKind: ref.referenceKind ?? null,
            mimeType: ref.mimeType ?? null,
            fileUri: ref.fileUri ?? null,
            url: ref.url ?? null,
            hasBase64Data: ref.hasBase64Data,
          })),
          null,
          2
        )}`,
    };

    await fs.writeFile(filePath, JSON.stringify(debugRecord, null, 2), 'utf-8');
  } catch (error) {
    logger.warn(
      {
        storyId: params.storyId,
        sceneId: params.sceneId,
        attemptId: params.attemptId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to save image prompt debug artifact'
    );
  }
}

/**
 * Compute a 0-100 quality score from image validation results.
 * Higher = better. Score = 100 minus penalties per character and global penalties.
 * Acceptance uses score > threshold only (no LLM isValid). Structural inconsistencies (characterKind vs
 * expected, imaginary design-read flags) add penalties so they cannot pass on model optimism alone.
 */
const SCENE_AUTH_TRANSIENT_FORM_RE =
  /\b(transparent|translucent|see[- ]?through|spectral|ghostly|ethereal|shimmer(?:ing)?(?:\s+outline)?|glow(?:ing)?(?:\s+outline)?|glimmer(?:ing)?|spark(?:le|ling|ly)|luminous|radiant|aura|mist(?:y)?|smok(?:e|y)|semi-transparent)\b/i;
const SCENE_AUTH_EXPRESSION_RE =
  /\b(expression|gaze|startled|surprised|shocked|worried|afraid|scared|sleepy|calm|neutral|happy|sad|angry|excited|delighted|determined|curious|wide-eyed|smil(?:e|ing)|frown(?:ing)?|tearful)\b/i;
const VALIDATION_TRANSIENT_FORM_MISMATCH_RE =
  /\b(transparent|translucent|solid form|opaque|spectral|ghostly|ethereal|shimmer(?:ing)?(?:\s+outline)?|glow(?:ing)?(?:\s+outline)?|outline|aura|mist(?:y)?|smok(?:e|y)|luminous|radiant)\b/i;
const VALIDATION_EXPRESSION_MISMATCH_RE =
  /\b(expression|gaze|emotion|startled|surprised|neutral|happy|sad|angry|excited|wide-eyed|smil(?:e|ing)|frown(?:ing)?|sleepy|worried|afraid)\b/i;
const HARD_IDENTITY_DRIFT_RE =
  /\b(face\s*shape|facial\s*structure|head\s*shape|muzzle|snout|hair|hairstyle|age\s*read|proportion|silhouette|body\s*type|species|subtype|markings|stripes?|spots?|wrong\s+character|different\s+character|extra\s+limb|missing\s+limb)\b/i;

function buildCharacterSceneBrief(
  sceneVisual: SceneVisual | undefined,
  characterName: string
): string {
  if (!sceneVisual) return '';

  const parts: string[] = [];
  if (sceneVisual.setting?.trim()) parts.push(sceneVisual.setting.trim());
  if (sceneVisual.lighting?.trim()) parts.push(sceneVisual.lighting.trim());

  const cameraComposition = sceneVisual.cameraComposition;
  if (typeof cameraComposition === 'string') {
    // For legacy string composition, isolate sentences that mention THIS character so leniency
    // keyed on e.g. "transparent" doesn't leak from one character to all characters in the scene.
    const raw = cameraComposition.trim();
    if (raw) {
      const nameKey = stripCharacterIdFromName(characterName).trim().toLowerCase();
      if (nameKey) {
        const sentences = raw
          .split(/(?<=[.!?])\s+|\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const relevant = sentences.filter((s) => s.toLowerCase().includes(nameKey));
        if (relevant.length > 0) {
          parts.push(relevant.join(' '));
        }
      }
    }
  } else {
    if (cameraComposition.shot?.trim()) parts.push(cameraComposition.shot.trim());
    const targetName = stripCharacterIdFromName(characterName).trim().toLowerCase();
    const matchingRow = cameraComposition.characters.find(
      (row) => stripCharacterIdFromName(row.name).trim().toLowerCase() === targetName
    );
    if (matchingRow?.description?.trim()) {
      parts.push(matchingRow.description.trim());
    }
  }

  return parts.join(' ').toLowerCase();
}

function getSceneAuthorizedValidationLeniency(
  characterName: string,
  sceneVisual: SceneVisual | undefined,
  validationCharacter: ImageValidationResult['characters'][0]
): {
  transientFormAuthorizedConflict: boolean;
  expressionAuthorizedConflict: boolean;
} {
  const sceneBrief = buildCharacterSceneBrief(sceneVisual, characterName);
  if (!sceneBrief) {
    return {
      transientFormAuthorizedConflict: false,
      expressionAuthorizedConflict: false,
    };
  }

  const issueText =
    `${validationCharacter.issue ?? ''} ${validationCharacter.identityComparisonSummary ?? ''}`.toLowerCase();
  const hasHardIdentityDrift = HARD_IDENTITY_DRIFT_RE.test(issueText);

  return {
    transientFormAuthorizedConflict:
      SCENE_AUTH_TRANSIENT_FORM_RE.test(sceneBrief) &&
      VALIDATION_TRANSIENT_FORM_MISMATCH_RE.test(issueText) &&
      !hasHardIdentityDrift,
    expressionAuthorizedConflict:
      SCENE_AUTH_EXPRESSION_RE.test(sceneBrief) &&
      VALIDATION_EXPRESSION_MISMATCH_RE.test(issueText) &&
      !hasHardIdentityDrift,
  };
}

export function computeValidationScore(
  validation: ImageValidationResult,
  options?: {
    referenceNamesNormalized?: Set<string>;
    expectedCharacters?: Array<{ name: string; characterKind: 'human' | 'animal' | 'imaginary' }>;
    sceneVisual?: SceneVisual;
    validationReferenceImages?: Array<{
      characterName: string;
      imageData?: string;
      fileUri?: string;
      mimeType?: string;
      referenceKind?: 'identity' | 'outfit_plate' | 'layout_template';
    }>;
    /** Override scoring params (used by tests); defaults to config.image.validationScoring. */
    scoringOverride?: typeof config.image.validationScoring;
  }
): number {
  const p = options?.scoringOverride ?? config.image.validationScoring;
  const humanHairStructureExtraPenalty = 6;
  let score = 100;
  const refSet = options?.referenceNamesNormalized;
  const expected = options?.expectedCharacters;
  const sceneVisual = options?.sceneVisual;
  const valRefs = options?.validationReferenceImages;

  if (validation.characterCount !== validation.expectedCharacterCount) {
    score -= 35;
  }

  for (const c of validation.characters) {
    const leniency = getSceneAuthorizedValidationLeniency(c.name, sceneVisual, c);
    const identityLenient =
      leniency.transientFormAuthorizedConflict || leniency.expressionAuthorizedConflict;
    const recScoreRaw = c.recognizableScore ?? 1;
    const recScore = leniency.transientFormAuthorizedConflict
      ? Math.max(recScoreRaw, 0.93)
      : leniency.expressionAuthorizedConflict
        ? Math.max(recScoreRaw, 0.96)
        : recScoreRaw;

    score -= (1 - recScore) * p.recognizablePenalty;
    if (c.duplicated) score -= p.duplicatedPenalty;
    if (!c.matchesColors && !leniency.transientFormAuthorizedConflict)
      score -= p.matchesColorsPenalty;
    if (!c.matchesOutfit) score -= p.matchesOutfitPenalty;

    const norm = stripCharacterIdFromName(c.name).trim().toLowerCase();
    const hasRef = !!(refSet && refSet.size > 0 && refSet.has(norm));
    const exp = expected ? findExpectedForValidationChar(c.name, expected) : undefined;
    const expectedKind = exp?.characterKind ?? null;

    // Kind mismatch: single penalty; model branches below keyed on BOTH sides matching the
    // same kind so we never double-dock for our own mis-routing.
    if (expectedKind && c.characterKind !== expectedKind) {
      score -= p.kindMismatchPenalty;
    }

    const humanWithRef = expectedKind === 'human' && c.characterKind === 'human' && hasRef;
    if (humanWithRef) {
      if (c.faceMatchesReference === false && !identityLenient) score -= p.humanIdentityFlagPenalty;
      if (c.hairMatchesReference === false && !identityLenient) {
        score -= p.humanIdentityFlagPenalty + humanHairStructureExtraPenalty;
      }
      if (c.ageReadMatchesReference === false && !identityLenient)
        score -= p.humanIdentityFlagPenalty;
      if (c.proportionsMatchReference === false && !identityLenient)
        score -= p.humanIdentityFlagPenalty;
      if (recScore < p.humanLowRecognizableThreshold) {
        score -= p.humanLowRecognizableExtraPenalty;
      }
    }

    // Unified non-human branch: applies to animals AND imaginary creatures when the model
    // agrees on the kind and we have an identity reference (turnaround / reference photo).
    const nonHumanWithRef =
      expectedKind &&
      expectedKind !== 'human' &&
      c.characterKind !== 'human' &&
      c.characterKind === expectedKind &&
      charHasIdentityReference(c.name, valRefs);
    if (nonHumanWithRef) {
      if (c.sameOverallDesignRead === false && !identityLenient) {
        score -= 22;
      }
      if (c.proportionsMatchReference === false && !identityLenient) {
        score -= p.humanIdentityFlagPenalty;
      }
      if (c.silhouetteDriftSeverity === 'severe' && !identityLenient) {
        score -= 28;
      } else if (c.silhouetteDriftSeverity === 'moderate' && !identityLenient) {
        score -= 14;
      } else if (c.silhouetteDriftSeverity === 'mild' && !identityLenient) {
        score -= 5;
      }
    }
  }
  if (validation.hasTextOrLetters) score -= p.textPenalty;
  if (validation.hasUnexpectedCharacters) score -= p.unexpectedCharsPenalty;
  if (validation.hasRenderingArtifacts) score -= p.artifactsPenalty;
  if (validation.hasArtworkOutsidePanelBounds) score -= p.artifactsPenalty;
  if (validation.hasArtworkOverSpeechBubbles) score -= p.artifactsPenalty;
  if (validation.hasExtraPanelStructure) score -= p.artifactsPenalty;
  if (validation.hasTemplateColorResidue) {
    score -= p.artifactsPenalty;
    const maxPanelResidueRatio = Math.max(
      0,
      ...(validation.templateColorResidueDetails?.panels ?? []).map((panel) => panel.ratio)
    );
    if (maxPanelResidueRatio > 0) {
      score -= Math.min(30, Math.max(10, Math.round(maxPanelResidueRatio * 650)));
    }
  }
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

interface ScoredAttempt {
  imageData: Buffer;
  mimeType: string;
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
  providerInteractionId?: string;
  score: number;
  validation: ImageValidationResult;
  attempt: number;
  imageRoute: SceneImageRoute;
}

type FinalValidationMeta = {
  validation: ImageValidationResult;
  score: number | null;
  attempt: number;
  imageRoute: SceneImageRoute;
};

type EditRepairReferenceImage = {
  base64Data?: string;
  fileUri?: string;
  mimeType?: string;
  instructionText: string;
  characterName?: string;
  source?: string;
  referenceKind?: 'character' | 'object';
};

type TargetedEditRepairPlan = {
  mode: ImageEditRepairManifest['referenceMode'];
  references?: EditRepairReferenceImage[];
  manifest: ImageEditRepairManifest;
};

type InitialSceneEditRepair = {
  originalImage: Buffer;
  originalMimeType: string;
  validation: ImageValidationResult;
  validationScore: number | null;
  previousAttempt: number;
  sourceImageStoragePath?: string;
};

export type GeneratedImageSafetyDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: 'IMAGE_VALIDATION_NOT_COMPLETED' | 'IMAGE_VALIDATION_FAILED';
      message: string;
      details: {
        attempts: number;
        minAcceptScore: number;
        score: number | null;
      };
    };

export function evaluateGeneratedImageSafety(input: {
  imageValidationEnabled: boolean;
  acceptedByValidationScore: boolean;
  finalValidationScore: number | null | undefined;
  validationProviderBlocked?: boolean;
  minAcceptScore: number;
  attempts: number;
}): GeneratedImageSafetyDecision {
  if (!input.imageValidationEnabled || input.acceptedByValidationScore) {
    return { allowed: true };
  }

  if (input.validationProviderBlocked) {
    return { allowed: true };
  }

  const score = input.finalValidationScore ?? null;
  if (score == null) {
    return {
      allowed: false,
      code: 'IMAGE_VALIDATION_NOT_COMPLETED',
      message: 'Image validation did not complete. The generated image was not saved.',
      details: {
        attempts: input.attempts,
        minAcceptScore: input.minAcceptScore,
        score,
      },
    };
  }

  // A completed validation below the acceptance threshold is a QA signal, not a
  // display blocker. The best scored attempt is still persisted for the user;
  // public publishing has a stricter validation gate in storyPublishSafetyService.
  return { allowed: true };
}

function validationCharacterNeedsIdentityRepair(
  c: ImageValidationResult['characters'][0]
): boolean {
  return (
    !c.found ||
    c.faceMatchesReference === false ||
    c.hairMatchesReference === false ||
    c.ageReadMatchesReference === false ||
    c.proportionsMatchReference === false ||
    c.sameOverallDesignRead === false ||
    (c.silhouetteDriftSeverity !== undefined && c.silhouetteDriftSeverity !== 'none') ||
    c.recognizableScore < config.image.validationScoring.humanLowRecognizableThreshold ||
    c.matchesColors === false
  );
}

function validationCharacterNeedsOutfitRepair(c: ImageValidationResult['characters'][0]): boolean {
  return !c.found || c.matchesOutfit === false;
}

function isOutfitRepairReference(ref: EditRepairReferenceImage): boolean {
  return (
    ref.source === 'outfit_plate' || /CLOTHES SOURCE|OUTFIT PLATE/i.test(ref.instructionText ?? '')
  );
}

function isIdentityRepairReference(ref: EditRepairReferenceImage): boolean {
  if (isOutfitRepairReference(ref)) return false;
  if (ref.source === 'environment') return false;
  return (
    ref.source === 'imaginary_friend' ||
    ref.source === 'child_reference' ||
    ref.source === 'character_reference' ||
    ref.referenceKind === 'character'
  );
}

function anonymizeEditRepairReference(ref: EditRepairReferenceImage): EditRepairReferenceImage {
  const outfit = isOutfitRepairReference(ref);
  return {
    ...ref,
    instructionText: outfit
      ? 'CLOTHES SOURCE. Use only the clothing and accessories from this reference. Do not use this image for face, hair, body, age, silhouette, pose, background, or scene layout. Do not draw the mannequin.'
      : 'PERSON SOURCE. Use this reference only for identity traits listed in the validator issues: hairstyle, face/head identity, age read, body proportions, silhouette, skin and hair palette, and stable marks.',
  };
}

function compactValidationText(text: string | null | undefined): string | null {
  const cleaned = text
    ?.replace(/\s+/g, ' ')
    .replace(/\s*\[ID:[^\]]+\]/gi, '')
    .trim();
  return cleaned || null;
}

function makeRepairIssue(
  kind: ImageEditRepairIssueKind,
  note: string | null | undefined
): ImageEditRepairIssue {
  return {
    kind,
    note: note || 'Visual mismatch with the selected reference.',
  };
}

function shouldIncludeSilhouetteRepairIssue(c: ImageValidationResult['characters'][0]): boolean {
  if (!c.silhouetteDriftSeverity || c.silhouetteDriftSeverity === 'none') {
    return false;
  }

  const hasMoreSpecificIdentityIssue =
    c.faceMatchesReference === false ||
    c.hairMatchesReference === false ||
    c.ageReadMatchesReference === false ||
    c.proportionsMatchReference === false ||
    c.sameOverallDesignRead === false;

  return c.silhouetteDriftSeverity !== 'mild' || !hasMoreSpecificIdentityIssue;
}

function collectTargetedRepairIssues(validation: ImageValidationResult): ImageEditRepairIssue[] {
  const issues: ImageEditRepairIssue[] = [];
  for (const c of validation.characters) {
    const needsRepair =
      validationCharacterNeedsIdentityRepair(c) ||
      validationCharacterNeedsOutfitRepair(c) ||
      c.duplicated;
    if (!needsRepair) continue;

    const note =
      compactValidationText(c.issue) || compactValidationText(c.identityComparisonSummary);
    if (!c.found) issues.push(makeRepairIssue('presence', note || 'Missing expected subject.'));
    if (c.duplicated) issues.push(makeRepairIssue('duplicate', note || 'Duplicate subject.'));
    if (c.faceMatchesReference === false)
      issues.push(makeRepairIssue('face', note || 'Face/head identity mismatch.'));
    if (c.hairMatchesReference === false)
      issues.push(makeRepairIssue('hair', note || 'Hairstyle mismatch.'));
    if (c.ageReadMatchesReference === false)
      issues.push(makeRepairIssue('age', note || 'Age read mismatch.'));
    if (c.proportionsMatchReference === false)
      issues.push(makeRepairIssue('body', note || 'Body proportion mismatch.'));
    if (c.sameOverallDesignRead === false)
      issues.push(makeRepairIssue('design', note || 'Overall design mismatch.'));
    if (shouldIncludeSilhouetteRepairIssue(c)) {
      issues.push(
        makeRepairIssue('silhouette', note || `${c.silhouetteDriftSeverity} silhouette drift.`)
      );
    }
    if (c.matchesColors === false)
      issues.push(makeRepairIssue('colors', note || 'Color mismatch.'));
    if (c.matchesOutfit === false)
      issues.push(makeRepairIssue('outfit', note || 'Wardrobe/accessory mismatch.'));
  }

  if (validation.hasUnexpectedCharacters)
    issues.push(makeRepairIssue('unexpected', 'Unexpected extra subject.'));
  if (validation.hasTextOrLetters)
    issues.push(makeRepairIssue('text', 'Visible text or lettering.'));

  const overall = compactValidationText(validation.overallFeedback);
  if (issues.length === 0 && overall) issues.push(makeRepairIssue('generic', overall));
  return issues.slice(0, 4);
}

function buildTargetedEditRepairPlan(
  refs: EditRepairReferenceImage[] | undefined,
  validation: ImageValidationResult
): TargetedEditRepairPlan {
  const needsByName = new Map<
    string,
    {
      displayName: string;
      identity: boolean;
      outfit: boolean;
    }
  >();

  for (const c of validation.characters) {
    const key = stripCharacterIdFromName(c.name).trim().toLowerCase();
    if (!key) continue;
    const identity = validationCharacterNeedsIdentityRepair(c);
    const outfit = validationCharacterNeedsOutfitRepair(c);
    if (identity || outfit) {
      needsByName.set(key, { displayName: c.name, identity, outfit });
    }
  }

  const issues = collectTargetedRepairIssues(validation);
  const selected = (refs ?? []).filter((ref) => {
    if (!ref.characterName) return false;
    const key = stripCharacterIdFromName(ref.characterName).trim().toLowerCase();
    const needs = needsByName.get(key);
    if (!needs) return false;
    if (isOutfitRepairReference(ref)) return needs.outfit;
    if (isIdentityRepairReference(ref)) return needs.identity;
    return false;
  });

  const selectedReferences = selected.map(anonymizeEditRepairReference);
  const needs = Array.from(needsByName.values());
  const hasIdentity = needs.some((n) => n.identity);
  const hasOutfit = needs.some((n) => n.outfit);
  const mode: TargetedEditRepairPlan['mode'] =
    hasIdentity && hasOutfit
      ? 'identity_and_outfit'
      : hasIdentity
        ? 'identity'
        : hasOutfit
          ? 'outfit'
          : 'none';

  return {
    mode,
    references: selectedReferences.length > 0 ? selectedReferences : undefined,
    manifest: {
      referenceMode: mode,
      issues,
    },
  };
}

async function editSceneImageUsingValidationFeedback(params: {
  storyId: string;
  storyRequestId?: string;
  userId?: string;
  scene: SceneData;
  imageDomain: SceneImageDomainService;
  imageRoute: SceneImageRoute;
  originalImage: Buffer;
  originalMimeType: string;
  validation: ImageValidationResult;
  validationScore: number | null;
  referenceImagesArray?: EditRepairReferenceImage[];
  previousAttempt: number;
  repairAttempt: number;
  reason: 'validation_failed' | 'manual_regenerate';
  sourceImageStoragePath?: string;
  previousInteractionId?: string;
}): Promise<SceneGeneratedImage> {
  const repairStartedAt = new Date();
  const repairPlan = buildTargetedEditRepairPlan(
    params.referenceImagesArray,
    params.validation
  );

  logger.info(
    {
      storyId: params.storyId,
      sceneId: params.scene.sceneId,
      previousAttempt: params.previousAttempt,
      repairAttempt: params.repairAttempt,
      reason: params.reason,
      imageRoute: params.imageRoute,
      feedback: params.validation.overallFeedback,
      score: params.validationScore,
      repairMode: repairPlan.mode,
      repairManifest: repairPlan.manifest,
      selectedReferenceCount: repairPlan.references?.length ?? 0,
      selectedReferences: repairPlan.references?.map((ref) => ({
        characterName: ref.characterName,
        source: ref.source,
        referenceKind: ref.referenceKind,
        instructionText: ref.instructionText,
      })),
      sourceImageStoragePath: params.sourceImageStoragePath,
    },
    'Editing scene image using validator feedback'
  );

  try {
    const image = await params.imageDomain.editSceneImage({
      originalImage: params.originalImage,
      originalMimeType: params.originalMimeType,
      validationResult: params.validation,
      aspectRatio: '16:9',
      referenceImages: repairPlan.references,
      targetedRepairManifest: repairPlan.manifest,
      previousInteractionId: params.previousInteractionId,
      systemInstruction: buildImageEditSystemInstruction(),
      personGeneration: 'allow_all',
      onUsage: (u) => recordUsage(u, { userId: params.userId ?? null, storyId: params.storyId }),
    });

    await recordStageTiming({
      storyId: params.storyId,
      storyRequestId: params.storyRequestId,
      userId: params.userId,
      generationKind: 'story',
      pipelinePhase: 'asset_generation',
      operation: 'scene_image_edit_repair',
      targetType: 'scene',
      targetKey: String(params.scene.sceneId),
      sceneIndex: params.scene.sceneId,
      attempt: params.repairAttempt,
      startedAt: repairStartedAt,
      completedAt: new Date(),
      metadata: {
        previousAttempt: params.previousAttempt,
        reason: params.reason,
        validationScore: params.validationScore,
        repairMode: repairPlan.mode,
        selectedReferenceCount: repairPlan.references?.length ?? 0,
        imageRoute: params.imageRoute,
        sourceImageStoragePath: params.sourceImageStoragePath ?? null,
      },
    });

    return image;
  } catch (editError) {
    await recordStageTiming({
      storyId: params.storyId,
      storyRequestId: params.storyRequestId,
      userId: params.userId,
      generationKind: 'story',
      pipelinePhase: 'asset_generation',
      operation: 'scene_image_edit_repair',
      targetType: 'scene',
      targetKey: String(params.scene.sceneId),
      sceneIndex: params.scene.sceneId,
      attempt: params.repairAttempt,
      status: 'failed',
      startedAt: repairStartedAt,
      completedAt: new Date(),
      metadata: {
        previousAttempt: params.previousAttempt,
        reason: params.reason,
        validationScore: params.validationScore,
        imageRoute: params.imageRoute,
        sourceImageStoragePath: params.sourceImageStoragePath ?? null,
        errorMessage: editError instanceof Error ? editError.message : String(editError),
      },
    });

    throw editError;
  }
}

/**
 * Save a rejected (validation-failed) image to disk for debugging.
 * Layout under uploads: {env}/{userId}/{storyId}/rejected/scene{sceneId}_attempt{attempt}.ext
 * @returns Relative storage path (same convention as assets.storagePath), or null on failure.
 */
async function saveRejectedImage(params: {
  imageData: string | Buffer;
  mimeType: string;
  storyId: string;
  sceneId: number;
  attempt: number;
  userId: string;
  feedback: string;
}): Promise<string | null> {
  try {
    const ext = params.mimeType.includes('png') ? '.png' : '.jpg';
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const rejectedDir = path.join(
      uploadsDir,
      config.nodeEnv,
      params.userId,
      params.storyId,
      'rejected'
    );
    await fs.mkdir(rejectedDir, { recursive: true });

    const filename = `scene${params.sceneId}_attempt${params.attempt}${ext}`;
    const filePath = path.join(rejectedDir, filename);
    const buffer =
      typeof params.imageData === 'string'
        ? Buffer.from(params.imageData, 'base64')
        : params.imageData;
    await fs.writeFile(filePath, buffer);

    const feedbackPath = path.join(
      rejectedDir,
      `scene${params.sceneId}_attempt${params.attempt}.txt`
    );
    await fs.writeFile(feedbackPath, params.feedback, 'utf-8');

    const relativePath = `${config.nodeEnv}/${params.userId}/${params.storyId}/rejected/${filename}`;

    logger.debug(
      {
        storyId: params.storyId,
        sceneId: params.sceneId,
        attempt: params.attempt,
        filePath,
        size: buffer.length,
      },
      'Rejected image saved for debugging'
    );
    return relativePath;
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        storyId: params.storyId,
        sceneId: params.sceneId,
        attempt: params.attempt,
      },
      'Failed to save rejected image (non-fatal)'
    );
    return null;
  }
}

function isPersistedImageValidationResult(value: unknown): value is ImageValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<ImageValidationResult>;
  return (
    typeof row.characterCount === 'number' &&
    typeof row.expectedCharacterCount === 'number' &&
    Array.isArray(row.characters) &&
    typeof row.hasUnexpectedCharacters === 'boolean' &&
    typeof row.hasTextOrLetters === 'boolean' &&
    typeof row.hasRenderingArtifacts === 'boolean'
  );
}

function selectCurrentSceneImageAsset(
  sceneImageUrl: string | null | undefined,
  assets: Array<{
    storagePath: string;
    storageUrl: string | null;
    mimeType: string;
    status: string;
    createdAt: Date;
  }>
): {
  storagePath: string;
  storageUrl: string | null;
  mimeType: string;
  status: string;
  createdAt: Date;
} | null {
  const completed = assets
    .filter((asset) => asset.status === 'completed' && asset.storagePath)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (completed.length === 0) return null;

  const currentStoragePath =
    typeof sceneImageUrl === 'string' && sceneImageUrl.trim()
      ? extractStoragePath(sceneImageUrl)
      : null;
  if (!currentStoragePath) return completed[0] ?? null;

  return (
    completed.find(
      (asset) =>
        asset.storagePath === currentStoragePath ||
        (asset.storageUrl ? extractStoragePath(asset.storageUrl) === currentStoragePath : false)
    ) ??
    completed[0] ??
    null
  );
}

async function buildInitialEditRepairFromCurrentSceneImage(params: {
  storyId: string;
  sceneId: number;
  sceneImageUrl?: string | null;
  assets: Array<{
    storagePath: string;
    storageUrl: string | null;
    mimeType: string;
    status: string;
    createdAt: Date;
  }>;
  assetStorage: ReturnType<typeof getAssetStorageService>;
}): Promise<InitialSceneEditRepair | undefined> {
  const currentAsset = selectCurrentSceneImageAsset(params.sceneImageUrl, params.assets);
  if (!currentAsset) {
    logger.info(
      { storyId: params.storyId, sceneId: params.sceneId },
      'Manual regenerate edit repair skipped: no current completed image asset'
    );
    return undefined;
  }

  const validationRows = await getImageValidationRepository().listByStoragePaths([
    currentAsset.storagePath,
  ]);
  const latestValidationRow = validationRows
    .filter((row) => isPersistedImageValidationResult(row.result))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!latestValidationRow || !isPersistedImageValidationResult(latestValidationRow.result)) {
    logger.info(
      {
        storyId: params.storyId,
        sceneId: params.sceneId,
        storagePath: currentAsset.storagePath,
      },
      'Manual regenerate edit repair skipped: no validation result for current image asset'
    );
    return undefined;
  }

  try {
    const originalImage = await params.assetStorage.getAssetByPath(currentAsset.storagePath);
    let validationScore = latestValidationRow.validationScore;
    if (validationScore == null) {
      try {
        validationScore = computeValidationScore(latestValidationRow.result);
      } catch (scoreError) {
        logger.warn(
          {
            err: scoreError,
            storyId: params.storyId,
            sceneId: params.sceneId,
            validationId: latestValidationRow.id,
          },
          'Failed to compute validation score for manual regenerate edit repair'
        );
      }
    }

    return {
      originalImage,
      originalMimeType: currentAsset.mimeType,
      validation: latestValidationRow.result,
      validationScore,
      previousAttempt: latestValidationRow.attempt,
      sourceImageStoragePath: currentAsset.storagePath,
    };
  } catch (error) {
    logger.warn(
      {
        err: error,
        storyId: params.storyId,
        sceneId: params.sceneId,
        storagePath: currentAsset.storagePath,
      },
      'Manual regenerate edit repair skipped: failed to read current image asset'
    );
    return undefined;
  }
}

function runDetachedTask(
  name: string,
  context: Record<string, unknown>,
  task: () => Promise<void>
): void {
  void task().catch((err) => {
    logger.warn(
      {
        ...context,
        err: err instanceof Error ? err.message : String(err),
      },
      `${name} failed in background`
    );
  });
}

function mergeCharacterOutfitRecords(
  env: Record<string, string> | undefined,
  scene: Record<string, string> | undefined
): Record<string, string> | undefined {
  const e = env && Object.keys(env).length ? env : undefined;
  const s = scene && Object.keys(scene).length ? scene : undefined;
  if (!e && !s) return undefined;
  return { ...(e || {}), ...(s || {}) };
}

/**
 * Resolve character outfits for image generation and validation (same source).
 * New format: storyOutfits[] + scene.characterOutfitIds → descriptions (wins over legacy).
 * Legacy: environment characterOutfits + scene-level characterOutfits overlay.
 */
function resolveCharacterOutfits(
  scene: SceneData,
  context: {
    currentEnvironment?: { id: string; characterOutfits?: string | Record<string, string> };
    storyOutfits?: StoryOutfitEntry[];
  }
): Record<string, string> | undefined {
  let fromEnv: Record<string, string> | undefined;
  const co = context.currentEnvironment?.characterOutfits;
  if (co) {
    fromEnv = typeof co === 'string' ? parseCharacterOutfitsString(co) : co;
  }
  const rawScene =
    (scene.sceneVisual as { characterOutfits?: string | Record<string, string> } | undefined)
      ?.characterOutfits ??
    (scene as { characterOutfits?: string | Record<string, string> }).characterOutfits;
  let fromScene: Record<string, string> | undefined;
  if (rawScene) {
    fromScene = typeof rawScene === 'string' ? parseCharacterOutfitsString(rawScene) : rawScene;
  }
  const legacy = mergeCharacterOutfitRecords(fromEnv, fromScene);

  const rawIds = scene.characterOutfitIds;
  if (context.storyOutfits?.length && rawIds && Object.keys(rawIds).length > 0) {
    const fromIds = resolveOutfitDescriptionsFromSceneIds(
      rawIds,
      context.storyOutfits as StoryOutfitDefinition[]
    );
    if (fromIds && Object.keys(fromIds).length > 0) {
      return { ...(legacy || {}), ...fromIds };
    }
  }

  return legacy;
}

/**
 * Supports multiple reference images for better character consistency (M9)
 * Returns image data plus scene DB ID and URL for reference tracking.
 * When validation fails and one retry remains, either edits the failed image
 * using validator feedback (feature flag) or falls back to full regeneration.
 *
 * Single entry for scene illustration validation: used by `processStoryImages` (every parallel
 * scene, including those generated after the request is marked completed) and by `regenerateSceneImage`.
 * There is no separate “background” or “first N images” validation path.
 */
async function generateSceneImageWithReference(
  storyId: string,
  scene: SceneData,
  context: ImageGenerationContext & {
    sceneDbId?: string;
    referenceImageDataArray?: Array<{
      base64: string;
      mimeType: string;
      fileUri?: string; // Files API URI (when available, base64 may be empty)
      source?: string;
      characterName?: string;
      type?: string;
      sceneId?: number;
      url?: string;
      imageIndex?: number;
      referenceEnvironmentId?: string;
    }>;
    imageSystemInstruction?: string;
    imageIndexMap?: Map<string, number>;
    currentEnvironmentId?: string;
    currentEnvironment?: StoryEnvironment;
    requestId?: string;
    onValidationRetry?: () => Promise<void>;
    complexImageDomain?: SceneImageDomainService;
    initialImageRoute?: SceneImageRoute;
    initialEditRepair?: InitialSceneEditRepair;
  }
): Promise<{ imageUrl: string; assetId: string }> {
  const startTime = Date.now();

  try {
    const sceneDbId =
      context.sceneDbId ??
      (await getSceneRepository().findByStoryAndSceneId(storyId, scene.sceneId))?.id;

    if (!sceneDbId) {
      throw new Error(`Scene ${scene.sceneId} not found for story ${storyId}`);
    }

    // Build character descriptions from AI analysis
    // Prefer English translation (descriptionEn) for better image generation results
    const characterDescriptions = context.characters.map((char) => ({
      name: char.name,
      nameAliases: (char as any).nameAliases,
      detailedDescription:
        (char as any).descriptionEn ||
        (char as any).aiGeneratedDescription ||
        char.appearance ||
        char.description ||
        `${char.name}`,
      clothing: (char as any).clothing,
      distinctiveFeatures: (char as any).distinctiveFeatures,
    }));

    // Add child profile as character ONLY if child is included in story characters
    // Check if child profile is in the characters array (would have type: 'child')
    const childIsCharacter = context.characters.some(
      (c) => c.type === 'child' && c.id === context.childProfile?.id
    );

    if (context.childProfile && childIsCharacter) {
      characterDescriptions.unshift({
        name: context.childProfile.name,
        nameAliases: (context.childProfile as any).nameAliases,
        detailedDescription:
          (context.childProfile as any).descriptionEn ||
          (context.childProfile as any).aiGeneratedDescription ||
          `${context.childProfile.name}`,
        clothing: (context.childProfile as any).clothing,
        distinctiveFeatures: (context.childProfile as any).distinctiveFeatures,
      });

      logger.debug(
        {
          storyId,
          sceneId: scene.sceneId,
          childName: context.childProfile.name,
        },
        'Added child profile to character descriptions for image generation'
      );
    }

    const sceneCharacterNamesForRefs = scene.sceneVisual?.cameraComposition
      ? flattenCameraComposition(scene.sceneVisual.cameraComposition).characterNames
      : (scene as any).visualCharacters || (scene as any).characters || [];

    const placeholderReferenceNameMap = buildPlaceholderReferenceNameMap(
      (context.referenceImageDataArray || [])
        .filter(
          (ref) =>
            ref.source === 'imaginary_friend' ||
            ref.source === 'child_reference' ||
            ref.source === 'character_reference'
        )
        .map((ref) => ref.characterName),
      sceneCharacterNamesForRefs
    );

    const resolvedReferenceImageDataArray = context.referenceImageDataArray?.map((ref) => {
      if (!ref.characterName) return ref;
      const resolvedName = placeholderReferenceNameMap.get(ref.characterName);
      return resolvedName && resolvedName !== ref.characterName
        ? { ...ref, characterName: resolvedName }
        : ref;
    });

    const subjectAliasByImageIndex = buildSubjectAliasByImageIndex(context.imageIndexMap);

    // Build reference images array with Google Asset Graph numbered labels
    const referenceImagesArray = resolvedReferenceImageDataArray?.map((ref, index) => {
      const refSource = (ref as any).source;
      const refImageIndex = (ref as any).imageIndex ?? index + 1;
      const meta: ReferenceMetadata = {
        imageNumber: index + 1,
        imageIndex: refImageIndex,
        source:
          refSource === 'environment'
            ? 'environment'
            : refSource === 'outfit_plate'
              ? 'outfit_plate'
              : refSource === 'imaginary_friend' ||
                  refSource === 'child_reference' ||
                  refSource === 'character_reference'
                ? (refSource as ReferenceMetadata['source'])
                : 'previous_scene',
        characterName: (ref as any).characterName || 'unknown',
        currentEnvironmentId: context.currentEnvironmentId,
      };

      if (refSource === 'environment') {
        // No extra meta for env ref
      } else if (refSource === 'outfit_plate') {
        const plateCharName = (ref as any).characterName as string | undefined;
        const map = context.imageIndexMap;
        if (plateCharName && map && map.size > 0) {
          let idIdx = map.get(plateCharName);
          if (idIdx === undefined) {
            const base = stripCharacterIdFromName(plateCharName).trim();
            if (base) idIdx = map.get(base);
          }
          if (idIdx === undefined) {
            const lower = stripCharacterIdFromName(plateCharName).trim().toLowerCase();
            for (const [k, v] of map) {
              if (stripCharacterIdFromName(k).trim().toLowerCase() === lower) {
                idIdx = v;
                break;
              }
            }
          }
          meta.identityImageIndex = idIdx;
          meta.subjectAlias = idIdx !== undefined ? subjectAliasByImageIndex.get(idIdx) : undefined;
          meta.clothesAlias = meta.subjectAlias
            ? meta.subjectAlias.replace(/^Subject\b/, 'Clothes')
            : undefined;
        }
      } else if (
        (ref as any).type === 'imaginary' ||
        (ref as any).type === 'child_reference' ||
        (ref as any).type === 'character_reference'
      ) {
        meta.isTurnaround = !!(ref as any).isTurnaround;
        meta.subjectAlias = subjectAliasByImageIndex.get(refImageIndex);
      } else {
        // Scene reference — carry characters present and environment info
        meta.charactersPresent = (ref as any).charactersPresent || [];
        meta.sceneId = (ref as any).sceneId;
        meta.referenceEnvironmentId = (ref as any).referenceEnvironmentId;
      }

      return {
        base64Data: ref.fileUri ? undefined : ref.base64, // Skip base64 when fileUri is available
        fileUri: ref.fileUri,
        mimeType: ref.mimeType,
        instructionText: buildReferenceInstructionText(meta),
        characterName: (ref as any).characterName || meta.characterName,
        source: refSource,
        referenceKind:
          refSource === 'environment' || refSource === 'outfit_plate'
            ? ('object' as const)
            : ('character' as const),
      };
    });

    // Classify characters into imaginary (with reference images) vs real-world (text description only)
    const imaginaryCharNameSet = new Set<string>();
    const characterAliasByName = new Map<string, string[]>();
    for (const char of context.characters) {
      const aliases = (char as any).nameAliases;
      const namesToIndex = [
        char.name,
        (char as any).canonicalName,
        ...(Array.isArray(aliases) ? aliases : []),
      ];
      for (const name of namesToIndex) {
        if (typeof name !== 'string') continue;
        const key = stripCharacterIdFromName(name).trim().toLowerCase();
        if (key && Array.isArray(aliases)) characterAliasByName.set(key, aliases);
      }
    }

    const imaginaryCharacters: Array<{
      name: string;
      isTurnaround?: boolean;
      nameAliases?: string[];
    }> = [];
    for (const ref of resolvedReferenceImageDataArray || []) {
      if (
        (ref.type === 'imaginary' ||
          ref.type === 'child_reference' ||
          ref.type === 'character_reference') &&
        ref.characterName &&
        !imaginaryCharNameSet.has(ref.characterName)
      ) {
        const aliasKey = stripCharacterIdFromName(ref.characterName).trim().toLowerCase();
        imaginaryCharNameSet.add(ref.characterName);
        imaginaryCharacters.push({
          name: ref.characterName,
          isTurnaround: !!(ref as any).isTurnaround,
          nameAliases: aliasKey ? characterAliasByName.get(aliasKey) : undefined,
        });
      }
    }

    // Real-world characters: those NOT in the imaginary set
    const realWorldCharacters = characterDescriptions
      .filter((c) => !imaginaryCharNameSet.has(c.name))
      .map((c) => ({
        name: c.name,
        description: c.detailedDescription,
        nameAliases: c.nameAliases,
      }));

    // Generate scene image with optional validation + one repair/regeneration pass.
    // Reference images are prepared before this function; validation retries rerender only the
    // final scene image and reuse the same environment/outfit references.
    const hasEnvironmentImageRef =
      context.referenceImageDataArray?.some((r: any) => r.source === 'environment') ?? false;

    const outfitPlateImageIndexByCharacter = collectOutfitPlateImageIndices(
      resolvedReferenceImageDataArray
    );

    const resolvedSceneOutfits = resolveCharacterOutfits(scene, context);
    const characterOutfitsForPrompt = omitOutfitProseForNonHumanCharacters(
      resolvedSceneOutfits,
      context.characters
    );

    const generateRequest = {
      primaryRead: scene.primaryRead,
      sceneVisual: scene.sceneVisual,
      visualPrompt: scene.visualPrompt, // Fallback for old stories
      sceneId: scene.sceneId,
      sceneText: scene.text,
      ageGroup: context.ageGroup,
      style: context.userStyle || context.imageDomain.buildImageStyle(context.ageGroup),
      realWorldCharacters,
      imaginaryCharacters,
      referenceImages: referenceImagesArray, // Array of references
      systemInstruction: context.imageSystemInstruction, // Static: role, art style, format, quality
      imageIndexMap: context.imageIndexMap, // Google Asset Graph: character name -> Image N
      outfitPlateImageIndexByCharacter,
      currentEnvironment: context.currentEnvironment, // Per-scene environment for user prompt
      characterOutfits: characterOutfitsForPrompt,
      scenarioCardId: context.scenarioCardId,
      hasEnvironmentImageRef,
    };

    let imagePromptAttemptCounter = 0;
    const nextPromptAttemptId = () => {
      imagePromptAttemptCounter += 1;
      return imagePromptAttemptCounter;
    };

    const isInitialEditRepair = !!context.initialEditRepair;
    const maxAttempts = isInitialEditRepair
      ? 1
      : config.image.enableValidation
      ? Math.min(config.image.validationMaxRetries + 1, 2)
      : 1;
    const validationRetryImageDomain = context.complexImageDomain ?? context.imageDomain;
    const validationRetryImageRoute: SceneImageRoute = context.complexImageDomain
      ? 'complex'
      : 'simple';
    const initialImageRoute: SceneImageRoute =
      context.initialImageRoute === 'complex' && context.complexImageDomain ? 'complex' : 'simple';
    const initialImageDomain =
      initialImageRoute === 'complex' ? context.complexImageDomain! : context.imageDomain;
    const useEditRepair = config.image.validationUseEditRepair;

    const validationAttemptOffset = context.initialEditRepair?.previousAttempt ?? 0;
    const firstValidationAttempt = validationAttemptOffset + 1;

    let imageRoute: SceneImageRoute = initialImageRoute;
    let image: SceneGeneratedImage;
    if (context.initialEditRepair) {
      try {
        image = await editSceneImageUsingValidationFeedback({
          storyId,
          storyRequestId: context.requestId,
          userId: context.userId,
          scene,
          imageDomain: initialImageDomain,
          imageRoute,
          originalImage: context.initialEditRepair.originalImage,
          originalMimeType: context.initialEditRepair.originalMimeType,
          validation: context.initialEditRepair.validation,
          validationScore: context.initialEditRepair.validationScore,
          referenceImagesArray,
          previousAttempt: context.initialEditRepair.previousAttempt,
          repairAttempt: context.initialEditRepair.previousAttempt + 1,
          reason: 'manual_regenerate',
          sourceImageStoragePath: context.initialEditRepair.sourceImageStoragePath,
        });
      } catch (editError) {
        logger.error(
          {
            err:
              editError instanceof Error
                ? {
                    message: editError.message,
                    name: editError.name,
                    stack: editError.stack,
                  }
                : String(editError),
            storyId,
            sceneId: scene.sceneId,
            imageRoute,
            sourceImageStoragePath: context.initialEditRepair.sourceImageStoragePath,
          },
          'Initial validation edit repair failed'
        );
        throw editError;
      }
    } else {
      image = await generateWithRetry(initialImageDomain, generateRequest, {
        storyId,
        sceneId: scene.sceneId,
        userId: context.userId,
        nextPromptAttemptId,
        validationAttempt: firstValidationAttempt,
        imageRoute,
      });
    }
    let lastValidation: ImageValidationResult | null = null;
    const outfitByCharacter = omitOutfitProseForNonHumanCharacters(
      resolveCharacterOutfits(scene, context),
      context.characters
    );
    const outfitByCharacterForValidation = omitOutfitProseForVisualReferenceCharacters(
      outfitByCharacter,
      resolvedReferenceImageDataArray
    );
    const envCoRaw = context.currentEnvironment?.characterOutfits;
    const sceneCoRaw = (
      scene.sceneVisual as { characterOutfits?: string | Record<string, string> } | undefined
    )?.characterOutfits;
    const sceneCoForValidation = omitOutfitProseForVisualReferenceCharacters(
      normalizeCharacterOutfitsInput(sceneCoRaw),
      resolvedReferenceImageDataArray
    );
    const envCoForValidation = omitOutfitProseForVisualReferenceCharacters(
      normalizeCharacterOutfitsInput(envCoRaw),
      resolvedReferenceImageDataArray
    );
    const sceneCharacterOutfitsText =
      sceneCoForValidation && Object.keys(sceneCoForValidation).length > 0
        ? serializeCharacterOutfitsToStr(sceneCoForValidation)
        : envCoForValidation && Object.keys(envCoForValidation).length > 0
          ? serializeCharacterOutfitsToStr(envCoForValidation)
          : outfitByCharacterForValidation && Object.keys(outfitByCharacterForValidation).length > 0
            ? serializeCharacterOutfitsToStr(outfitByCharacterForValidation)
            : undefined;
    const expectedCharacters = buildExpectedCharactersForValidation(
      scene,
      context.characters,
      resolvedReferenceImageDataArray,
      outfitByCharacterForValidation,
      { storyId, sceneId: scene.sceneId }
    );
    const validationReferenceImages = await buildValidationReferenceImages({
      expectedCharacters,
      characters: context.characters,
      assetStorage: context.assetStorage,
      referenceImageDataArray: resolvedReferenceImageDataArray,
    });
    const validationRefNamesNormalized = new Set(
      validationReferenceImages.map((r) =>
        stripCharacterIdFromName(r.characterName).trim().toLowerCase()
      )
    );

    // Validation + retry loop (only when ENABLE_IMAGE_VALIDATION=true)
    const scoredAttempts: ScoredAttempt[] = [];
    let acceptByValidationScore = false;
    /** Meta for the image buffer we upload (accepted, best-of, or provider-blocked); persisted after upload. */
    let finalValidationMeta: FinalValidationMeta | null = null;
    if (config.image.enableValidation) {
      for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex++) {
        const attempt = validationAttemptOffset + attemptIndex;
        try {
          const imgUsageContext = { userId: context.userId, storyId };
          const validationStartedAt = new Date();
          let validation: ImageValidationResult;
          try {
            validation = await context.imageDomain.validateGeneratedImage({
              imageData: image.imageData,
              mimeType: image.mimeType,
              expectedCharacters,
              sceneVisual: scene.sceneVisual || migrateVisualPrompt(scene),
              sceneCharacterOutfitsText,
              referenceImages:
                validationReferenceImages.length > 0 ? validationReferenceImages : undefined,
              logContext: { storyId, sceneId: scene.sceneId, attempt },
              onUsage: (u) => recordUsage(u, imgUsageContext),
            });
            await recordStageTiming({
              storyId,
              storyRequestId: context.requestId,
              userId: context.userId,
              generationKind: 'story',
              pipelinePhase: 'validation',
              operation: 'scene_image_validation',
              targetType: 'scene',
              targetKey: String(scene.sceneId),
              sceneIndex: scene.sceneId,
              attempt,
              model: config.ai.validationModel || config.ai.geminiVisionModel,
              startedAt: validationStartedAt,
              completedAt: new Date(),
              metadata: {
                validationStatus: validation.validationStatus,
                validationAttemptKind: validation.validationAttemptKind,
                expectedCharacterCount: validation.expectedCharacterCount,
                detectedCharacterCount: validation.characterCount,
                referenceImageCount: validationReferenceImages.length,
              },
            });
          } catch (validationCallError) {
            await recordStageTiming({
              storyId,
              storyRequestId: context.requestId,
              userId: context.userId,
              generationKind: 'story',
              pipelinePhase: 'validation',
              operation: 'scene_image_validation',
              targetType: 'scene',
              targetKey: String(scene.sceneId),
              sceneIndex: scene.sceneId,
              attempt,
              status: 'failed',
              model: config.ai.validationModel || config.ai.geminiVisionModel,
              startedAt: validationStartedAt,
              completedAt: new Date(),
              metadata: {
                referenceImageCount: validationReferenceImages.length,
                errorMessage:
                  validationCallError instanceof Error
                    ? validationCallError.message
                    : String(validationCallError),
              },
            });
            throw validationCallError;
          }

          lastValidation = validation;

          if (validation.validationStatus === 'provider_blocked') {
            finalValidationMeta = { validation, score: null, attempt, imageRoute };
            logger.warn(
              {
                storyId,
                sceneId: scene.sceneId,
                attempt,
                validationAttemptKind: validation.validationAttemptKind,
                providerError: validation.providerError,
              },
              'Image validation provider blocked all attempts; keeping generated image without validation-driven regeneration'
            );
            break;
          }

          const score = computeValidationScore(validation, {
            referenceNamesNormalized: validationRefNamesNormalized,
            expectedCharacters,
            sceneVisual: scene.sceneVisual || migrateVisualPrompt(scene),
            validationReferenceImages,
          });

          scoredAttempts.push({
            imageData: Buffer.from(image.imageData),
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            format: image.format,
            providerInteractionId: image.providerInteractionId,
            score,
            validation,
            attempt,
            imageRoute,
          });

          finalValidationMeta = { validation, score, attempt, imageRoute };

          logger.info(
            {
              storyId,
              sceneId: scene.sceneId,
              attempt,
              score,
              characterScores: validation.characters.map(
                (c: ImageValidationResult['characters'][0]) => ({
                  name: c.name,
                  characterKind: c.characterKind,
                  found: c.found,
                  recognizableScore: c.recognizableScore,
                  faceMatchesReference: c.faceMatchesReference,
                  hairMatchesReference: c.hairMatchesReference,
                  ageReadMatchesReference: c.ageReadMatchesReference,
                  proportionsMatchReference: c.proportionsMatchReference,
                  identityComparisonSummary: c.identityComparisonSummary,
                  duplicated: c.duplicated,
                  matchesColors: c.matchesColors,
                  matchesOutfit: c.matchesOutfit,
                })
              ),
              hasTextOrLetters: validation.hasTextOrLetters,
              hasUnexpectedCharacters: validation.hasUnexpectedCharacters,
              hasRenderingArtifacts: validation.hasRenderingArtifacts,
            },
            `Validation score for attempt ${attempt}: ${score}/100`
          );

          const minAccept = config.image.validationMinAcceptScore;
          if (score > minAccept) {
            acceptByValidationScore = true;
            logger.info(
              {
                storyId,
                sceneId: scene.sceneId,
                attempt,
                score,
                characterCount: validation.characterCount,
              },
              `Image validation accepted (score ${score}/100 > threshold ${minAccept})`
            );
            break;
          }

          logger.warn(
            {
              storyId,
              sceneId: scene.sceneId,
              attempt,
              maxAttempts,
              characterCount: validation.characterCount,
              expected: validation.expectedCharacterCount,
              hasUnexpectedCharacters: validation.hasUnexpectedCharacters,
              hasTextOrLetters: validation.hasTextOrLetters,
              hasRenderingArtifacts: validation.hasRenderingArtifacts,
              score,
              duplicatedCharacters: validation.characters
                .filter((c: ImageValidationResult['characters'][0]) => c.duplicated)
                .map((c: ImageValidationResult['characters'][0]) => c.name),
              missingCharacters: validation.characters
                .filter((c: ImageValidationResult['characters'][0]) => !c.found)
                .map((c: ImageValidationResult['characters'][0]) => c.name),
              feedback: validation.overallFeedback,
            },
            `Image validation score at or below threshold (${minAccept})`
          );

          const rejectedImageData = Buffer.isBuffer(image.imageData)
            ? Buffer.from(image.imageData)
            : image.imageData;
          runDetachedTask(
            'Rejected image persistence',
            { storyId, sceneId: scene.sceneId, attempt },
            async () => {
              const rejectedPath = await saveRejectedImage({
                imageData: rejectedImageData,
                mimeType: image.mimeType,
                storyId,
                sceneId: scene.sceneId,
                attempt,
                userId: context.userId,
                feedback: validation.overallFeedback || '',
              });
              if (!rejectedPath) return;
              await persistImageValidationResult({
                storyId,
                sceneIndex: scene.sceneId,
                attempt,
                imageStoragePath: rejectedPath,
                validationScore: score,
                visionModel: config.ai.validationModel || config.ai.geminiVisionModel,
                validation,
              });
            }
          );

          if (attemptIndex < maxAttempts) {
            await context.onValidationRetry?.();
            if (useEditRepair) {
              try {
                image = await editSceneImageUsingValidationFeedback({
                  storyId,
                  storyRequestId: context.requestId,
                  userId: context.userId,
                  scene,
                  imageDomain: validationRetryImageDomain,
                  imageRoute: validationRetryImageRoute,
                  originalImage: Buffer.from(image.imageData),
                  originalMimeType: image.mimeType,
                  validation,
                  validationScore: score,
                  referenceImagesArray,
                  previousAttempt: attempt,
                  repairAttempt: attempt + 1,
                  reason: 'validation_failed',
                  previousInteractionId: image.providerInteractionId,
                });
                imageRoute = validationRetryImageRoute;
              } catch (editError) {
                logger.warn(
                  {
                    err:
                      editError instanceof Error
                        ? {
                            message: editError.message,
                            name: editError.name,
                            stack: editError.stack,
                          }
                        : String(editError),
                    storyId,
                    sceneId: scene.sceneId,
                    attempt,
                  },
                  'Validation edit repair failed — falling back to full regeneration'
                );

                const regenerationStartedAt = new Date();
                image = await generateWithRetry(validationRetryImageDomain, generateRequest, {
                  storyId,
                  sceneId: scene.sceneId,
                  userId: context.userId,
                  nextPromptAttemptId,
                  validationAttempt: attempt + 1,
                  imageRoute: validationRetryImageRoute,
                });
                imageRoute = validationRetryImageRoute;
                await recordStageTiming({
                  storyId,
                  storyRequestId: context.requestId,
                  userId: context.userId,
                  generationKind: 'story',
                  pipelinePhase: 'asset_generation',
                  operation: 'scene_image_regeneration',
                  targetType: 'scene',
                  targetKey: String(scene.sceneId),
                  sceneIndex: scene.sceneId,
                  attempt: attempt + 1,
                  startedAt: regenerationStartedAt,
                  completedAt: new Date(),
                  metadata: {
                    previousAttempt: attempt,
                    reason: 'edit_repair_failed',
                    validationScore: score,
                    imageRoute,
                  },
                });
              }
            } else {
              logger.info(
                {
                  storyId,
                  sceneId: scene.sceneId,
                  attempt,
                  nextImageRoute: validationRetryImageRoute,
                  feedback: validation.overallFeedback,
                },
                'Validation failed — regenerating scene image from scratch'
              );

              const regenerationStartedAt = new Date();
              image = await generateWithRetry(validationRetryImageDomain, generateRequest, {
                storyId,
                sceneId: scene.sceneId,
                userId: context.userId,
                nextPromptAttemptId,
                validationAttempt: attempt + 1,
                imageRoute: validationRetryImageRoute,
              });
              imageRoute = validationRetryImageRoute;
              await recordStageTiming({
                storyId,
                storyRequestId: context.requestId,
                userId: context.userId,
                generationKind: 'story',
                pipelinePhase: 'asset_generation',
                operation: 'scene_image_regeneration',
                targetType: 'scene',
                targetKey: String(scene.sceneId),
                sceneIndex: scene.sceneId,
                attempt: attempt + 1,
                startedAt: regenerationStartedAt,
                completedAt: new Date(),
                metadata: {
                  previousAttempt: attempt,
                  reason: 'validation_failed',
                  validationScore: score,
                  imageRoute,
                },
              });
            }
          }
        } catch (validationError) {
          // Validation transport/LLM error: do NOT silently auto-accept. Keep acceptByValidationScore
          // false so the caller falls through to best-of-N selection or downstream retry logic.
          finalValidationMeta = null;
          lastValidation = null;
          acceptByValidationScore = false;
          logger.error(
            {
              err:
                validationError instanceof Error
                  ? {
                      message: validationError.message,
                      name: validationError.name,
                      stack: validationError.stack,
                    }
                  : String(validationError),
              storyId,
              sceneId: scene.sceneId,
              attempt,
            },
            'Image validation transport error — not auto-accepting image'
          );
          break;
        }
      }

      // All attempts scored at or below threshold — pick the best-scored image instead of blindly using the last
      if (!acceptByValidationScore && lastValidation && scoredAttempts.length > 0) {
        const best = scoredAttempts.reduce((a, b) => (a.score >= b.score ? a : b));
        const isLastAttempt = best.attempt === scoredAttempts[scoredAttempts.length - 1].attempt;

        if (!isLastAttempt) {
          image = {
            imageData: best.imageData,
            mimeType: best.mimeType,
            width: best.width,
            height: best.height,
            format: best.format,
            providerInteractionId: best.providerInteractionId,
          };
        }
        imageRoute = best.imageRoute;

        finalValidationMeta = {
          validation: best.validation,
          score: best.score,
          attempt: best.attempt,
          imageRoute: best.imageRoute,
        };

        logger.warn(
          {
            storyId,
            sceneId: scene.sceneId,
            totalAttempts: maxAttempts,
            selectedAttempt: best.attempt,
            selectedScore: best.score,
            allScores: scoredAttempts.map((a) => ({
              attempt: a.attempt,
              score: a.score,
              imageRoute: a.imageRoute,
              characters: a.validation.characters.map((c) => ({
                name: c.name,
                found: c.found,
                recognizableScore: c.recognizableScore,
                duplicated: c.duplicated,
                matchesColors: c.matchesColors,
                matchesOutfit: c.matchesOutfit,
              })),
            })),
            selectedFeedback: best.validation.overallFeedback,
            selectedBestInsteadOfLast: !isLastAttempt,
          },
          `All ${maxAttempts} attempts failed validation — best failed attempt ${best.attempt} (score ${best.score}/100)`
        );
      }
    }

    const imageSafetyDecision = evaluateGeneratedImageSafety({
      imageValidationEnabled: config.image.enableValidation,
      acceptedByValidationScore: acceptByValidationScore,
      finalValidationScore: finalValidationMeta?.score ?? null,
      validationProviderBlocked:
        finalValidationMeta?.validation.validationStatus === 'provider_blocked',
      minAcceptScore: config.image.validationMinAcceptScore,
      attempts: scoredAttempts.length,
    });

    if (imageSafetyDecision.allowed === false) {
      logger.warn(
        {
          storyId,
          sceneId: scene.sceneId,
          code: imageSafetyDecision.code,
          details: imageSafetyDecision.details,
        },
        'Generated image blocked before asset upload'
      );
      throw new Error(imageSafetyDecision.message);
    }

    // Upload original image to storage
    const uploadResult = await context.assetStorage.uploadAsset({
      data: image.imageData,
      mimeType: image.mimeType,
      userId: context.userId,
      storyId: storyId,
      sceneId: sceneDbId,
      assetType: 'image',
    });

    if (finalValidationMeta && config.image.enableValidation) {
      await persistImageValidationResult({
        storyId,
        sceneIndex: scene.sceneId,
        attempt: finalValidationMeta.attempt,
        imageStoragePath: uploadResult.storagePath,
        validationScore: finalValidationMeta.score,
        visionModel:
          finalValidationMeta.validation.validationModelUsed ||
          config.ai.validationModel ||
          config.ai.geminiVisionModel,
        validation: finalValidationMeta.validation,
      });
    }

    // Save asset to database with thumbnail paths
    const createdAsset = await getAssetRepository().create({
      storyId: storyId,
      sceneId: sceneDbId,
      assetType: 'image',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      mimeType: image.mimeType,
      fileSizeBytes: uploadResult.fileSizeBytes,
      generationParams: {
        mode: referenceImagesArray ? 'with_reference' : 'without_reference',
        referenceCount: referenceImagesArray?.length || 0,
        validationRepairMode: config.image.enableValidation
          ? useEditRepair
            ? 'edit'
            : 'regenerate'
          : 'disabled',
        providerInteractionId: image.providerInteractionId,
        imageRoute: finalValidationMeta?.imageRoute ?? imageRoute,
        initialImageRoute,
        validationFallbackImageRoute:
          config.image.enableValidation && maxAttempts > 1 ? validationRetryImageRoute : null,
        maxValidationAttempts: maxAttempts,
        style: context.userStyle,
        hasSceneVisual: !!scene.sceneVisual,
        referenceImages:
          resolvedReferenceImageDataArray?.map((ref, index) => ({
            index: index + 1,
            source: ref.source || 'unknown',
            characterName: ref.characterName || 'unknown',
            type: ref.type || 'unknown',
            sceneId: ref.sceneId,
            charactersPresent: (ref as any).charactersPresent || [],
            url: ref.url || 'unknown',
          })) || [],
      },
      generationTimeMs: Date.now() - startTime,
      status: 'completed',
    });

    runDetachedTask(
      'Thumbnail generation',
      { storyId, sceneId: scene.sceneId, assetId: createdAsset.id },
      async () => {
        const imageBuffer = Buffer.isBuffer(image.imageData)
          ? image.imageData
          : Buffer.from(image.imageData, 'base64');
        const thumbnailBuffer = await context.assetStorage.generateThumbnail(imageBuffer);
        const thumbnailPath = uploadResult.storagePath.replace(/(\.[^.]+)$/, '_thumb.jpg');
        const fullPath = path.join(process.cwd(), 'uploads', thumbnailPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, thumbnailBuffer);
        const thumbnailUrl = `/api/v1/assets/${thumbnailPath}`;
        await getAssetRepository().update(createdAsset.id, {
          thumbnailPath,
          thumbnailUrl,
        });
        logger.debug(
          {
            originalPath: uploadResult.storagePath,
            thumbnailPath,
            thumbnailSize: thumbnailBuffer.length,
          },
          'Thumbnail generated and saved in background'
        );
      }
    );

    logger.info(
      {
        storyId,
        sceneId: scene.sceneId,
        hasReferences: !!referenceImagesArray,
        referenceCount: referenceImagesArray?.length || 0,
        imageSizeBytes: image.imageData.length,
        duration: Date.now() - startTime,
      },
      'Scene image generated with reference approach'
    );

    // Return the base64 image data, mime type, scene DB ID, and storage path for reference tracking
    return {
      imageUrl: uploadResult.storagePath, // Use storagePath, not storageUrl
      assetId: createdAsset.id,
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        storyId,
        sceneId: scene.sceneId,
      },
      'Failed to generate scene image'
    );
    throw error;
  }
}

/**
 * Metadata for building character-aware reference instruction text.
 * Follows Google's "Image N: <role>" numbered label convention.
 */
interface ReferenceMetadata {
  imageNumber: number;
  source:
    | 'imaginary_friend'
    | 'child_reference'
    | 'character_reference'
    | 'previous_scene'
    | 'environment'
    | 'outfit_plate';
  characterName: string;
  characterDescription?: string;
  isTurnaround?: boolean; // True when reference is a turnaround sheet (4 views: FRONT, 3/4, SIDE, BACK)
  charactersPresent?: string[];
  characterDescriptions?: Array<{ name: string; description: string }>;
  sceneId?: number;
  // Google Asset Graph pattern fields
  imageIndex: number; // Sequential 1-based index for "Image N:" labels
  currentEnvironmentId?: string; // Environment of the scene being generated
  referenceEnvironmentId?: string; // Environment of the reference scene image
  /** Character sheet / photo index for outfit_plate refs — cross-linked in instruction text */
  identityImageIndex?: number;
  /** Anonymous visual alias sent to the image model instead of the character name */
  subjectAlias?: string;
  /** Anonymous clothing alias paired to subjectAlias, e.g. Subject A -> Clothes A */
  clothesAlias?: string;
}

function referenceAliasSuffix(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function buildSubjectAliasByImageIndex(imageIndexMap?: Map<string, number>): Map<number, string> {
  const out = new Map<number, string>();
  if (!imageIndexMap || imageIndexMap.size === 0) return out;
  const seenNames = new Set<string>();
  const indices = [...imageIndexMap.entries()]
    .filter(([name]) => {
      const normalized = stripCharacterIdFromName(name).trim().toLowerCase();
      if (!normalized || seenNames.has(normalized)) return false;
      seenNames.add(normalized);
      return true;
    })
    .map(([, imageIndex]) => imageIndex)
    .sort((a, b) => a - b);

  indices.forEach((imageIndex, index) => {
    out.set(imageIndex, `Subject ${referenceAliasSuffix(index)}`);
  });
  return out;
}

function lookupOutfitForValidationName(
  compositionName: string,
  outfits: Record<string, string> | undefined
): string | undefined {
  if (!outfits) return undefined;
  const keys = Object.keys(outfits);
  if (keys.length === 0) return undefined;
  if (outfits[compositionName]) return outfits[compositionName];
  const base = stripCharacterIdFromName(compositionName).trim();
  if (outfits[base]) return outfits[base];
  const lower = base.toLowerCase();
  for (const k of keys) {
    if (stripCharacterIdFromName(k).trim().toLowerCase() === lower) return outfits[k];
  }
  return undefined;
}

function outfitFallbackFromCamera(
  compositionName: string,
  cameraComposition: SceneVisual['cameraComposition']
): string | undefined {
  if (!cameraComposition || typeof cameraComposition === 'string') return undefined;
  const base = stripCharacterIdFromName(compositionName).trim().toLowerCase();
  const ch = cameraComposition.characters.find(
    (c) =>
      c.name === compositionName || stripCharacterIdFromName(c.name).trim().toLowerCase() === base
  );
  return ch?.description;
}

type VisualWardrobeReference = {
  source?: string;
  characterName?: string;
};

function normalizeCharacterOutfitsInput(
  raw: string | Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const parsed = typeof raw === 'string' ? parseCharacterOutfitsString(raw) : raw;
  return parsed && Object.keys(parsed).length > 0 ? parsed : undefined;
}

function buildVisualWardrobeGroundedNameSet(
  referenceImageDataArray?: VisualWardrobeReference[]
): Set<string> {
  const names = new Set<string>();
  for (const ref of referenceImageDataArray || []) {
    if (!ref.characterName) continue;
    if (ref.source === 'environment') continue;
    const key = stripCharacterIdFromName(ref.characterName).trim().toLowerCase();
    if (key) names.add(key);
  }
  return names;
}

function omitOutfitProseForVisualReferenceCharacters(
  outfits: Record<string, string> | undefined,
  referenceImageDataArray?: VisualWardrobeReference[]
): Record<string, string> | undefined {
  if (!outfits || Object.keys(outfits).length === 0) return outfits;
  const visualGroundedNames = buildVisualWardrobeGroundedNameSet(referenceImageDataArray);
  if (visualGroundedNames.size === 0) return outfits;

  const filtered: Record<string, string> = {};
  for (const [name, outfit] of Object.entries(outfits)) {
    const key = stripCharacterIdFromName(name).trim().toLowerCase();
    if (key && visualGroundedNames.has(key)) continue;
    filtered[name] = outfit;
  }

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

/**
 * Build the expected character list for image validation.
 * Extracts characters from cameraComposition (single source of truth),
 * then maps each name to a 3-way characterKind (human/animal/imaginary)
 * so the validator compares a hamster against hamster rules, not human rules.
 */
export function buildExpectedCharactersForValidation(
  scene: SceneData,
  characters: CharacterData[],
  referenceImageDataArray?: Array<{ source?: string; characterName?: string }>,
  outfitByCharacter?: Record<string, string>,
  logContext?: { storyId?: string; sceneId?: number }
): Array<{
  name: string;
  characterKind: 'human' | 'animal' | 'imaginary';
  speciesSubtype?: string;
  description?: string;
  expectedOutfitForScene?: string;
}> {
  let sceneCharacterNames: string[];
  const sv = scene.sceneVisual;
  if (sv?.cameraComposition && typeof sv.cameraComposition !== 'string') {
    sceneCharacterNames = flattenCameraComposition(sv.cameraComposition).characterNames;
  } else {
    // Backward compat: old stories with string cameraComposition or no sceneVisual
    sceneCharacterNames = (scene as any).visualCharacters || (scene as any).characters || [];
  }

  // refSource index by normalized character name; used only as fallback when charData.type is unknown.
  const refSourceByName = new Map<string, string>();
  const visualWardrobeGroundedNames = buildVisualWardrobeGroundedNameSet(referenceImageDataArray);
  for (const ref of referenceImageDataArray || []) {
    if (!ref.characterName || !ref.source) continue;
    const key = stripCharacterIdFromName(ref.characterName).trim().toLowerCase();
    if (key && !refSourceByName.has(key)) {
      refSourceByName.set(key, ref.source);
    }
  }

  const roster = sceneCharacterNames.map((name) => {
    const baseLower = stripCharacterIdFromName(name).trim().toLowerCase();
    const charData = characters.find((c) => {
      if (!c?.name) return false;
      return stripCharacterIdFromName(c.name).trim().toLowerCase() === baseLower;
    });

    const t = charData?.type;
    const refSource = refSourceByName.get(baseLower);
    const characterKind: 'human' | 'animal' | 'imaginary' =
      t === 'animal'
        ? 'animal'
        : t === 'imaginary'
          ? 'imaginary'
          : t === 'person' || t === 'child'
            ? 'human'
            : refSource === 'imaginary_friend'
              ? 'imaginary'
              : 'human';

    const subtypeRaw = (charData as any)?.subtype;
    const speciesSubtype =
      typeof subtypeRaw === 'string' && subtypeRaw.trim() ? subtypeRaw.trim() : undefined;

    // expectedOutfitForScene is a HUMAN concept (clothing). Animals and imaginary creatures
    // use "natural appearance" — feeding them pose/camera fallback text confuses matchesOutfit.
    // Humans with an identity reference or outfit plate use that image as wardrobe grounding;
    // do not pass text wardrobe as a competing expectation.
    const fromOutfits = lookupOutfitForValidationName(name, outfitByCharacter);
    const expectedOutfitForScene =
      characterKind === 'human' && !visualWardrobeGroundedNames.has(baseLower)
        ? fromOutfits?.trim() || outfitFallbackFromCamera(name, sv?.cameraComposition) || undefined
        : undefined;

    return {
      name,
      characterKind,
      speciesSubtype,
      description:
        (charData as any)?.descriptionEn ||
        (charData as any)?.aiGeneratedDescription ||
        charData?.appearance ||
        charData?.description ||
        name,
      expectedOutfitForScene,
    };
  });

  logger.debug(
    {
      ...logContext,
      sceneIdFromData: scene.sceneId,
      roster: roster.map((r) => ({
        name: r.name,
        characterKind: r.characterKind,
        speciesSubtype: r.speciesSubtype,
        hasOutfit: !!r.expectedOutfitForScene,
      })),
    },
    'Built expected characters for image validation'
  );

  return roster;
}

function findCharacterForValidationName(
  sceneName: string,
  characters: CharacterData[]
): CharacterData | undefined {
  const normalizedSceneName = stripCharacterIdFromName(sceneName).trim().toLowerCase();
  return characters.find((char) => {
    const charName = stripCharacterIdFromName(char.name).trim().toLowerCase();
    return (
      charName === normalizedSceneName ||
      char.name.trim().toLowerCase() === sceneName.trim().toLowerCase()
    );
  });
}

async function buildValidationReferenceImages(params: {
  expectedCharacters: Array<{ name: string }>;
  characters: CharacterData[];
  assetStorage: ReturnType<typeof getAssetStorageService>;
  referenceImageDataArray?: Array<{
    source?: string;
    characterName?: string;
    base64?: string;
    fileUri?: string;
    mimeType?: string;
  }>;
}): Promise<
  Array<{
    characterName: string;
    imageData?: string;
    fileUri?: string;
    mimeType: string;
    referenceKind?: 'identity' | 'outfit_plate';
  }>
> {
  const refs: Array<{
    characterName: string;
    imageData?: string;
    fileUri?: string;
    mimeType: string;
    referenceKind?: 'identity' | 'outfit_plate';
  }> = [];
  const seenIdentity = new Set<string>();
  const seenOutfitPlate = new Set<string>();

  for (const expected of params.expectedCharacters) {
    const char = findCharacterForValidationName(expected.name, params.characters);
    const resolvedName = char?.name || expected.name;
    const normalizedName = stripCharacterIdFromName(resolvedName).trim().toLowerCase();
    if (!normalizedName || seenIdentity.has(normalizedName)) continue;
    seenIdentity.add(normalizedName);

    const turnaround = (char as any)?.turnaroundSheet as
      | { url?: string; frontUrl?: string }
      | null
      | undefined;
    const referencePhotoUrl = char?.referencePhotos?.find((photo) => photo?.url)?.url;
    const chosenSource = turnaround?.url?.trim()
      ? 'turnaround'
      : turnaround?.frontUrl?.trim()
        ? 'front'
        : referencePhotoUrl?.trim()
          ? 'reference_photo'
          : null;
    const chosenUrl =
      turnaround?.url?.trim() || turnaround?.frontUrl?.trim() || referencePhotoUrl?.trim();

    if (!chosenUrl) continue;

    try {
      const data = await loadReferenceImageData(chosenUrl, params.assetStorage);
      logger.debug(
        { characterName: resolvedName, chosenSource, chosenUrl },
        'Selected identity reference for image validation'
      );
      refs.push({
        characterName: resolvedName,
        imageData: data.base64,
        mimeType: data.mimeType,
        referenceKind: 'identity',
      });
    } catch (err) {
      logger.warn(
        {
          characterName: resolvedName,
          chosenUrl,
          err: err instanceof Error ? err.message : String(err),
        },
        'Failed to load validation reference image'
      );
    }
  }

  for (const ref of params.referenceImageDataArray || []) {
    if (ref.source !== 'outfit_plate' || !ref.characterName || !ref.mimeType) continue;
    const normalizedName = stripCharacterIdFromName(ref.characterName).trim().toLowerCase();
    if (!normalizedName || seenOutfitPlate.has(normalizedName)) continue;

    const refBase = stripCharacterIdFromName(ref.characterName).trim().toLowerCase();
    const expected = params.expectedCharacters.find((c) => {
      const expectedBase = stripCharacterIdFromName(c.name).trim().toLowerCase();
      return (
        expectedBase === refBase ||
        c.name.trim().toLowerCase() === ref.characterName!.trim().toLowerCase()
      );
    });
    if (!expected) continue;

    if (!ref.fileUri && !ref.base64) continue;
    seenOutfitPlate.add(normalizedName);
    refs.push({
      characterName: ref.characterName,
      ...(ref.fileUri ? { fileUri: ref.fileUri } : {}),
      ...(ref.base64 ? { imageData: ref.base64 } : {}),
      mimeType: ref.mimeType,
      referenceKind: 'outfit_plate',
    });
  }

  return refs;
}

/**
 * Build instruction text placed immediately before a reference image.
 * Uses Google's "Image N: <role>" numbered label convention for unambiguous
 * image-to-description mapping. Keeps labels short to avoid text-vs-visual conflicts.
 */
function buildReferenceInstructionText(meta: ReferenceMetadata): string {
  const imgLabel = `Image ${meta.imageIndex}`;

  if (meta.source === 'environment') {
    return `${imgLabel}: Environment reference — content/layout only, not style. Re-draw in scene art style.`;
  }

  if (meta.source === 'outfit_plate') {
    const idIdx = meta.identityImageIndex;
    const subject = meta.subjectAlias ?? 'the matching subject';
    const clothes = meta.clothesAlias ?? 'the clothes source';
    const identityPart = idIdx
      ? `DRAW COMMAND: draw ${subject} from Image ${idIdx} wearing ${clothes} from ${imgLabel}. Image ${idIdx} is PERSON SOURCE. ${imgLabel} is CLOTHES SOURCE only.`
      : `DRAW COMMAND: draw the matching PERSON SOURCE wearing ${clothes} from ${imgLabel}. The character reference is PERSON SOURCE. ${imgLabel} is CLOTHES SOURCE only.`;
    return `${imgLabel}: CLOTHES SOURCE ${clothes}. Use only the clothing/accessories from this image. ${identityPart} Do not use ${imgLabel} for face, hair, body, age, or silhouette. Do not draw the mannequin.`;
  }

  if (
    meta.source === 'imaginary_friend' ||
    meta.source === 'child_reference' ||
    meta.source === 'character_reference'
  ) {
    const sheetType = meta.isTurnaround ? 'Character sheet' : 'Reference photo';
    const subject = meta.subjectAlias ?? 'Subject';
    return `${imgLabel}: PERSON SOURCE ${subject}. ${sheetType}. Use as the locked source of truth for face, exact hairstyle structure, hair placement, age read, body proportions, silhouette, skin/hair palette, and stable marks.`;
  }

  // Scene reference — env-aware label
  const sameLocation =
    meta.currentEnvironmentId &&
    meta.referenceEnvironmentId &&
    meta.currentEnvironmentId === meta.referenceEnvironmentId;

  if (sameLocation) {
    return `${imgLabel}: Previous scene reference (same location).`;
  }

  return `${imgLabel}: Previous scene reference (different location — use for character reference only).`;
}

/**
 * Save generated story to database
 * M4: Also saves scenes to separate table and llmGeneratedCharacters to metadata
 * Uses transaction for atomic operations
 */
async function saveStory(
  request: {
    id: string;
    userId: string;
    childProfileId?: string | null;
    goal?: string | null;
    createdByMode?: string | null;
    createdByChildProfileId?: string | null;
    parentReviewRequired?: boolean | null;
  },
  spec: StorySpec,
  text: {
    title: string;
    language: string;
    scenes: any[];
    fullText: string;
    wordCount: number;
    characters?: any[];
    mapTile?: any;
  },
  mergedCharacters: CharacterReference[],
  generationTimeMs: number,
  timingData?: {
    textGenerationTimeMs?: number;
    validationTimeMs?: number;
    sceneCount?: number;
    fullTextLength?: number;
  },
  chosenPlotExampleId?: string,
  chosenWorldRuleId?: string
): Promise<string> {
  try {
    // Extract LLM-generated characters
    const llmCharacters = (text as any).characters || [];
    const attribution = buildStoryCreationAttribution({
      createdByMode: request.createdByMode,
      createdByChildProfileId: request.createdByChildProfileId,
      fallbackChildProfileId: request.childProfileId,
      parentReviewRequired: request.parentReviewRequired,
    });

    // Use transaction for atomic story creation
    const storyId = await getStoryRepository().transaction(async (tx) => {
      // Create story record with metadata
      const story = await getStoryRepository().createStory(
        {
          userId: request.userId,
          childProfileId: request.childProfileId,
          storyRequestId: request.id,
          createdByMode: attribution.createdByMode,
          createdByChildProfileId: attribution.createdByChildProfileId,
          parentReviewStatus: attribution.parentReviewStatus,
          title: text.title,
          language: text.language,
          ageGroup: spec.ageGroup,
          moralTheme: request.goal,
          outline: null,
          scenes: text.scenes, // Keep for backward compatibility
          fullText: text.fullText,
          wordCount: text.wordCount,
          closingKeepsakeLabel: extractClosingKeepsakeFromEpisodeText({
            fullText: text.fullText,
            scenes: text.scenes,
          }),
          closingArtifactId: spec.closingArtifact?.id ?? null,
          modelVersion: config.ai.modelVersion,
          generationTimeMs,
          metadata: {
            llmGeneratedCharacters: llmCharacters,
            imageStyle: (spec as any).imageStyle,
            mergedCharacters: mergedCharacters,
            mapTile: (text as any).mapTile ?? null,
            ...(chosenPlotExampleId && { plotExampleId: chosenPlotExampleId }),
            ...(chosenWorldRuleId && { worldRuleId: chosenWorldRuleId }),
            ...(spec.closingArtifact && {
              storyArtifactId: spec.closingArtifact.id,
              storyArtifactCode: spec.closingArtifact.artifactCode,
              storyArtifactTitle: spec.closingArtifact.title,
              storyArtifactImagePath: spec.closingArtifact.imagePath,
              storyArtifactSelection: (spec.closingArtifact as any).selection,
            }),
            // Generation timing data for coefficient calculation
            ...(timingData && {
              textGenerationTimeMs: timingData.textGenerationTimeMs,
              validationTimeMs: timingData.validationTimeMs,
              sceneCount: timingData.sceneCount,
              fullTextLength: timingData.fullTextLength,
            }),
          },
          policyChecks: {
            outlineValidated: true,
            textValidated: true,
            timestamp: new Date().toISOString(),
          },
          isPublished: false,
          isFavorite: false,
        },
        tx
      );

      logger.info({ storyId: story.id }, 'Story saved to database');

      // Save all scenes in parallel within transaction
      await Promise.all(
        text.scenes.map((scene) => {
          // Derive charactersPresent from cameraComposition.characters (single source of truth)
          const cam = scene.sceneVisual?.cameraComposition;
          const charNames =
            cam && typeof cam !== 'string'
              ? flattenCameraComposition(cam).characterNames
              : (scene as any).characters || [];
          const normalizedCharacters = charNames.map((name: string) =>
            normalizeCharacterName(name)
          );

          return getSceneRepository().create(
            {
              storyId: story.id,
              sceneId: scene.sceneId,
              text: scene.text,
              visualPrompt: scene.sceneVisual
                ? JSON.stringify(scene.sceneVisual) // Store structured as JSON string for DB
                : scene.visualPrompt, // Fallback for old format
              charactersPresent: normalizedCharacters,
              generationParams: {
                wordCount: scene.text.split(/\s+/).length,
              },
            },
            tx
          );
        })
      );

      logger.info({ storyId: story.id, sceneCount: text.scenes.length }, 'Scenes saved to table');

      // Link characters: user characters from spec + LLM characters from mergedCharacters
      // Collect all unique character IDs to link (exclude children — they're in child_profiles)
      const characterIdsToLink = new Set<string>();
      const characterRoles = new Map<string, string>();

      for (const character of spec.characters) {
        if (character.id && character.type !== 'child') {
          characterIdsToLink.add(character.id);
          characterRoles.set(character.id, character.role || 'supporting');
        }
      }
      // Also link LLM characters that now have DB IDs
      for (const mc of mergedCharacters as any[]) {
        if (mc.id && mc.source === 'llm_generated') {
          characterIdsToLink.add(mc.id);
          characterRoles.set(mc.id, mc.role || 'supporting');
        }
      }

      if (characterIdsToLink.size > 0) {
        await Promise.all(
          Array.from(characterIdsToLink).map((characterId) =>
            getStoryRepository()
              .createStoryCharacter(
                {
                  storyId: story.id,
                  characterId,
                  role: characterRoles.get(characterId) || 'supporting',
                },
                tx
              )
              .catch((err) => {
                if (!err.message.includes('duplicate')) {
                  logger.error({ error: err, characterId }, 'Failed to link character');
                  throw err;
                }
              })
          )
        );

        logger.info(
          {
            storyId: story.id,
            characterCount: characterIdsToLink.size,
            totalInSpec: spec.characters.length,
          },
          'Characters linked to story (user + LLM, children excluded)'
        );
      }

      return story.id;
    });

    return storyId;
  } catch (error) {
    logger.error({ error, requestId: request.id }, 'Failed to save story');
    throw error;
  }
}

// ── Per-User Job Limit ──

const MAX_CONCURRENT_STORY_REQUESTS_PER_USER = 3;

function getActiveStoryRequestCutoff(): Date {
  return new Date(Date.now() - config.generation.activeRequestTtlMs);
}

/**
 * Check if user has too many active story requests (pending/processing).
 * Returns the count. Callers should reject if count >= threshold.
 */
export async function getUserActiveRequestCount(userId: string): Promise<number> {
  return getStoryRepository().countActiveRequestsByUser(userId, getActiveStoryRequestCutoff());
}

/**
 * Enforce per-user job limit atomically using SELECT FOR UPDATE.
 * Prevents TOCTOU race where two concurrent requests both pass the count check
 * before either inserts, which could allow exceeding the limit.
 *
 * Locks the user's active story_requests rows so concurrent requests from the
 * same user are serialized at the DB level.
 */
export async function enforceUserJobLimit(userId: string): Promise<void> {
  const activeCount = await getStoryRepository().countActiveRequestsForUpdate(
    userId,
    getActiveStoryRequestCutoff()
  );
  if (activeCount >= MAX_CONCURRENT_STORY_REQUESTS_PER_USER) {
    throw new Error(
      `Too many active story requests (${activeCount}/${MAX_CONCURRENT_STORY_REQUESTS_PER_USER}). Please wait for current stories to complete.`
    );
  }
}

/**
 * Retry image generation only (for failed requests where text succeeded).
 * Re-enqueues image batch job; used when IMAGE_OTHER or similar fails.
 */
export async function retryStoryImages(
  requestId: string,
  userId: string
): Promise<{ id: string; status: string }> {
  const { enqueueImageBatch } = await import('../jobs/storyJobProcessor');
  const request = await getStoryRepository().findRequestByIdAndUser(requestId, userId);
  if (!request) {
    throw new Error('Story request not found');
  }
  if (request.status !== 'failed') {
    throw new Error('Request is not in failed state');
  }
  const storyId =
    request.storyId ??
    ((request.intermediateData as Record<string, unknown>)?.storyId as string | undefined);
  if (!storyId) {
    throw new Error('Cannot retry images: story data missing');
  }
  const isContinuation = !!(request.intermediateData as Record<string, unknown>)?.isContinuation;
  await getStoryRepository().updateRequest(requestId, {
    status: 'processing',
    errorMessage: null,
    updatedAt: new Date(),
  });
  await enqueueImageBatch(requestId, storyId, isContinuation);
  logger.info({ requestId, storyId, userId }, 'Retry images enqueued');
  return { id: requestId, status: 'processing' };
}

/**
 * Get story request status
 */
export async function getStoryRequestStatus(
  requestId: string,
  userId: string
): Promise<{
  id: string;
  status: string;
  progress: number | null;
  progressData: StoryProgress | null;
  storyId: string | null;
  errorMessage: string | null;
  createdAt: Date;
} | null> {
  const request = await getStoryRepository().findRequestByIdAndUser(requestId, userId);

  if (!request) {
    return null;
  }

  const resolvedStoryId =
    request.storyId ??
    ((request.intermediateData as Record<string, unknown> | null | undefined)?.storyId as
      | string
      | undefined) ??
    null;

  // Recalculate progress for active tasks based on current time (read-only, no DB save)
  if (request.progressData) {
    const progressData = recalculateStoryProgress(request.progressData as StoryProgress);
    const activeTask = progressData.activeTasks[0]?.task ?? null;

    logger.info(
      {
        requestId,
        userId,
        storyId: resolvedStoryId,
        status: request.status,
        overallProgress: progressData.overallProgress,
        activeTask,
        activeTasks: progressData.activeTasks.map((task) => task.task),
        completedTasks: progressData.completedTasks,
        maxOverallProgress: progressData.maxOverallProgress ?? null,
      },
      'Story request status returned'
    );

    // Return updated data (NOT saving to DB - this is read-only recalculation)
    return {
      id: request.id,
      status: request.status,
      progress: progressData.overallProgress,
      progressData,
      storyId: resolvedStoryId,
      errorMessage: request.errorMessage,
      createdAt: request.createdAt,
    };
  }

  logger.info(
    {
      requestId,
      userId,
      storyId: resolvedStoryId,
      status: request.status,
      overallProgress: request.progress,
      activeTask: null,
      activeTasks: [],
      completedTasks: [],
      maxOverallProgress: null,
    },
    'Story request status returned'
  );

  return {
    id: request.id,
    status: request.status,
    progress: request.progress,
    progressData: request.progressData as StoryProgress | null,
    storyId: resolvedStoryId,
    errorMessage: request.errorMessage,
    createdAt: request.createdAt,
  };
}

/**
 * Fetch child profiles associated with a story and map them to the same shape as character objects.
 * Uses story_requests.selected_children order, then appends stories.child_profile_id if not already listed.
 * Includes soft-deleted profiles so the cast matches the generated story.
 */
async function fetchStoryChildren(
  storyRequestId: string | null,
  childProfileId: string | null,
  userId: string
): Promise<
  Array<{
    id: string;
    name: string;
    type: string;
    role: string;
    isHidden: boolean;
    description: string | null;
    referencePhotoUrl: string | null;
  }>
> {
  let childIds: string[] = [];

  if (storyRequestId) {
    const storyRequest = await getStoryRepository().findRequestById(storyRequestId);
    const selected = storyRequest?.selectedChildren as string[] | null;
    if (selected && selected.length > 0) {
      childIds = [...selected];
    }
  }

  if (childProfileId && !childIds.includes(childProfileId)) {
    childIds.push(childProfileId);
  }

  if (childIds.length === 0) return [];

  const childProfiles = await getChildProfileRepository().findByIdsIncludingInactive(
    userId,
    childIds
  );
  if (childProfiles.length === 0) return [];

  const byId = new Map(childProfiles.map((p) => [p.id, p]));
  const orderedProfiles = childIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null);

  const assetStorage = getAssetStorageService();

  return Promise.all(
    orderedProfiles.map(async (child) => {
      let referencePhotoUrl: string | null = null;

      const turnaround = child.turnaroundSheet as { url?: string; frontUrl?: string } | null;
      const refPhotos = child.referencePhotos as Array<{ url?: string }> | null;

      const rawPath =
        turnaround?.frontUrl ||
        turnaround?.url ||
        (refPhotos && refPhotos.length > 0 ? refPhotos[0].url : null) ||
        null;

      if (rawPath) {
        try {
          const storagePath = rawPath
            .split('?')[0]
            .replace(/^https?:\/\/[^/]+/, '')
            .replace(/^\/api\/v1\/assets\//, '');
          const { signedUrl } = await assetStorage.generateSignedUrl(storagePath, 24);
          referencePhotoUrl = signedUrl;
        } catch {
          // Non-fatal
        }
      }

      return {
        id: child.id,
        name: child.name,
        type: 'child',
        role: 'protagonist',
        isHidden: false,
        description: child.aiGeneratedDescription || null,
        referencePhotoUrl,
      };
    })
  );
}

async function getLocalizedCharacterNames(
  characterIds: string[],
  locale: string
): Promise<Map<string, string>> {
  if (characterIds.length === 0) return new Map();

  const translations = await getDictionaryRepository().findTranslations(
    'character',
    characterIds,
    locale
  );
  const names = new Map<string, string>();

  for (const translation of translations) {
    if (translation.fieldName !== 'name') continue;
    const value = stripCharacterIdFromName(translation.value).trim();
    if (value) {
      names.set(translation.entityId, value);
    }
  }

  return names;
}

function pushCleanCharacterNameAlias(out: string[], value: unknown): void {
  if (typeof value !== 'string') return;
  const clean = stripCharacterIdFromName(value).trim().replace(/\s+/g, ' ');
  if (!clean) return;
  if (!out.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
    out.push(clean);
  }
}

async function getAllLocalizedCharacterNameAliases(
  characterIds: string[]
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(characterIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rowsByLocale = await Promise.all(
    LOCALE_IDS.map((locale) =>
      getDictionaryRepository().findTranslations('character', uniqueIds, locale)
    )
  );

  const aliases = new Map<string, string[]>();
  for (const translation of rowsByLocale.flat()) {
    if (translation.fieldName !== 'name') continue;
    const list = aliases.get(translation.entityId) ?? [];
    pushCleanCharacterNameAlias(list, translation.value);
    if (list.length > 0) aliases.set(translation.entityId, list);
  }
  return aliases;
}

async function attachCharacterNameAliases(characters: CharacterData[]): Promise<CharacterData[]> {
  const aliasesById = await getAllLocalizedCharacterNameAliases(
    characters.map((char) => char.id).filter((id): id is string => !!id)
  );

  return characters.map((char) => {
    const aliases: string[] = [];
    pushCleanCharacterNameAlias(aliases, char.name);
    pushCleanCharacterNameAlias(aliases, (char as any).canonicalName);
    for (const alias of (char as any).nameAliases ?? []) {
      pushCleanCharacterNameAlias(aliases, alias);
    }
    for (const alias of char.id ? (aliasesById.get(char.id) ?? []) : []) {
      pushCleanCharacterNameAlias(aliases, alias);
    }

    return aliases.length > 0 ? { ...char, nameAliases: aliases } : char;
  });
}

/**
 * Get story by ID
 */
export async function getStory(storyId: string, userId: string) {
  const story = await getStoryRepository().findByIdAndUser(storyId, userId);

  if (!story) {
    return null;
  }

  // Get linked characters with full details
  const linkedCharactersRaw = await getStoryRepository().findLinkedCharactersByStoryId(storyId);

  // Enrich characters with signed reference photo URL
  const assetStorage = getAssetStorageService();
  const localizedCharacterNames = await getLocalizedCharacterNames(
    linkedCharactersRaw.map((char) => char.id),
    story.language
  );
  const enrichedCharacters = await Promise.all(
    linkedCharactersRaw.map(async (char) => {
      let referencePhotoUrl: string | null = null;

      const turnaround = char.turnaroundSheet as { url?: string; frontUrl?: string } | null;
      const refPhotos = char.referencePhotos as Array<{ url?: string }> | null;

      const rawPath =
        turnaround?.frontUrl ||
        turnaround?.url ||
        (refPhotos && refPhotos.length > 0 ? refPhotos[0].url : null) ||
        null;

      if (rawPath) {
        try {
          const storagePath = rawPath
            .split('?')[0]
            .replace(/^https?:\/\/[^/]+/, '')
            .replace(/^\/api\/v1\/assets\//, '');
          const { signedUrl } = await assetStorage.generateSignedUrl(storagePath, 24);
          referencePhotoUrl = signedUrl;
        } catch {
          // Non-fatal: URL signing failed
        }
      }

      return {
        id: char.id,
        name: char.name,
        localizedName: localizedCharacterNames.get(char.id) ?? null,
        nameTranslations: localizedCharacterNames.has(char.id)
          ? { [story.language]: localizedCharacterNames.get(char.id)! }
          : undefined,
        type: char.type,
        role: char.role,
        isHidden: char.isHidden,
        description: char.description,
        referencePhotoUrl,
      };
    })
  );

  const childCharacters = await fetchStoryChildren(
    story.storyRequestId,
    story.childProfileId,
    userId
  );
  const metadata =
    story.metadata && typeof story.metadata === 'object'
      ? (story.metadata as Record<string, unknown>)
      : {};

  return {
    id: story.id,
    title: story.title,
    language: story.language,
    ageGroup: story.ageGroup,
    moralTheme: story.moralTheme,
    scenes: story.scenes,
    mapTile: metadata.mapTile ?? null,
    fullText: story.fullText,
    wordCount: story.wordCount,
    outline: story.outline,
    audioMetadata: story.audioMetadata,
    characters: [...childCharacters, ...enrichedCharacters],
    isFavorite: story.isFavorite,
    createdAt: story.createdAt,
    seriesId: story.seriesId,
    partNumber: story.partNumber,
  };
}

/**
 * Batch-enrich scenes with image data for multiple stories at once.
 * Uses scenes.imageUrl as the source of truth for the approved scene image.
 * Asset rows are used only to attach a thumbnail for that exact storage path.
 */
export async function enrichAllStoriesWithImages(
  storyRows: Array<{ id: string; scenes: any[] }>
): Promise<Map<string, any[]>> {
  const storyIds = Array.from(new Set(storyRows.map((s) => s.id)));
  const result = new Map<string, any[]>();

  if (storyIds.length === 0) {
    return result;
  }

  const [approvedScenes, imageAssets] = await Promise.all([
    getSceneRepository().findByStoryIds(storyIds),
    getAssetRepository().findCompletedImagesByStoryIds(storyIds),
  ]);

  const approvedSceneByKey = new Map<string, (typeof approvedScenes)[number]>();
  for (const scene of approvedScenes) {
    approvedSceneByKey.set(`${scene.storyId}:${scene.sceneId}`, scene);
  }

  const thumbnailPathByStoragePath = new Map<string, string | null>();
  for (const asset of imageAssets) {
    thumbnailPathByStoragePath.set(asset.storagePath, asset.thumbnailPath);
  }

  for (const story of storyRows) {
    const scenes = story.scenes;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      result.set(story.id, scenes || []);
      continue;
    }

    const enrichedScenes = scenes.map((scene: any) => {
      const approvedScene = approvedSceneByKey.get(`${story.id}:${scene.sceneId}`);
      const approvedImageUrl = approvedScene?.imageUrl ?? null;
      const approvedThumbnailPath = approvedImageUrl
        ? thumbnailPathByStoragePath.get(approvedImageUrl)
        : null;

      return {
        ...scene,
        image: approvedImageUrl
          ? {
              url: `/api/v1/assets/${approvedImageUrl}`,
              thumbnailUrl: approvedThumbnailPath
                ? `/api/v1/assets/${approvedThumbnailPath}`
                : null,
            }
          : null,
      };
    });

    result.set(story.id, enrichedScenes);
  }

  logger.debug(
    {
      totalStories: storyIds.length,
      approvedScenesWithImages: approvedScenes.filter((scene) => !!scene.imageUrl).length,
    },
    'enrichAllStoriesWithImages - batch enrichment complete'
  );

  return result;
}

/**
 * List user stories
 */
export async function listUserStories(
  userId: string,
  options: {
    childProfileId?: string;
    language?: string;
    limit?: number;
    offset?: number;
    hasAudio?: boolean;
    scenarioCardId?: string;
    seriesId?: string;
  } = {}
) {
  const {
    childProfileId,
    language,
    limit = 20,
    offset = 0,
    hasAudio,
    scenarioCardId,
    seriesId,
  } = options;

  const results = await getStoryRepository().findByUser(userId, {
    limit,
    offset,
    hasAudio,
    scenarioCardId,
    seriesId,
    language,
    childProfileId,
  });

  // Batch-enrich all stories with images in a single DB query
  const enrichedScenesMap = await enrichAllStoriesWithImages(
    results.map((r) => ({ id: r.id, scenes: r.scenes as any[] }))
  );

  const enrichedResults = results.map((story) => ({
    ...story,
    scenes: enrichedScenesMap.get(story.id) || story.scenes,
    status: story.isPublished ? 'completed' : 'draft', // Convert boolean to status string
  }));

  return enrichedResults;
}

/**
 * List user stories as lightweight summaries (for library grid view)
 * Returns only the fields the client needs: id, title, language, status, coverImageUrl, hasAudio, createdAt
 */
export async function listUserStorySummaries(
  userId: string,
  options: {
    childProfileId?: string;
    language?: string;
    limit?: number;
    offset?: number;
    hasAudio?: boolean;
    scenarioCardId?: string;
    seriesId?: string;
  } = {}
) {
  const {
    childProfileId,
    language,
    limit = 20,
    offset = 0,
    hasAudio,
    scenarioCardId,
    seriesId,
  } = options;

  const results = await getStoryRepository().findSummariesByUser(userId, {
    limit,
    offset,
    hasAudio,
    scenarioCardId,
    seriesId,
    language,
    childProfileId,
  });

  const coverByStoryId = await loadStoryCoverAssets(
    results.map((story) => ({ id: story.id, coverAssetId: story.coverAssetId }))
  );

  return results.map((story) => {
    const cover = coverByStoryId.get(story.id);

    return {
      id: story.id,
      title: story.title,
      language: story.language,
      status: story.isPublished ? 'completed' : 'draft',
      coverAssetId: cover?.assetId ?? null,
      coverImageUrl: cover?.imageUrl ?? null,
      coverThumbnailUrl: cover?.thumbnailUrl ?? null,
      hasAudio: !!(story.audioMetadata as any)?.finalAssetId,
      scenarioCardId: story.scenarioCardId ?? null,
      partNumber: (story as any).partNumber ?? null,
      createdByMode: story.createdByMode,
      createdByChildProfileId: story.createdByChildProfileId ?? null,
      parentReviewStatus: story.parentReviewStatus,
      createdAt: story.createdAt,
    };
  });
}

/**
 * Get total count of user stories (for pagination)
 */
export async function getTotalUserStoriesCount(
  userId: string,
  options: {
    childProfileId?: string;
    language?: string;
    hasAudio?: boolean;
    scenarioCardId?: string;
    seriesId?: string;
  } = {}
): Promise<number> {
  const { childProfileId, language, hasAudio, scenarioCardId, seriesId } = options;

  return getStoryRepository().countByUser(userId, {
    hasAudio,
    scenarioCardId,
    seriesId,
    language,
    childProfileId,
  });
}

/**
 * Distinct language codes for the user's non-hidden stories (for library filter).
 */
export async function listUserStoryLanguages(
  userId: string,
  options: { childProfileId?: string } = {}
): Promise<string[]> {
  return getStoryRepository().listDistinctLanguagesByUser(userId, options);
}

/**
 * Delete story
 */
export async function deleteStory(storyId: string, userId: string): Promise<boolean> {
  const story = await getStoryRepository().findByIdAndUser(storyId, userId);

  if (!story) {
    throw new Error('Story not found');
  }

  // If story is part of series, update series first
  if (story.seriesId) {
    const { removeStoryFromSeries } = await import('./seriesService');
    await removeStoryFromSeries(storyId, story.seriesId);
  }

  const storageDeletion = await deleteStoryStorageFiles(storyId);

  // Delete the story
  await getStoryRepository().deleteStory(storyId, userId);

  if (story.publishedSlug) {
    await removePublishedSlug(story.publishedSlug);
    await invalidateSitemapCache();
  }

  if (story.showOnHomePage === true) {
    await incrementLandingRenderVersion();
  }

  logger.info(
    {
      storyId,
      userId,
      hadSeries: !!story.seriesId,
      storageFilesAttempted: storageDeletion.attempted,
      storageFilesDeleted: storageDeletion.deleted,
    },
    'Story deleted'
  );

  return true;
}

/**
 * Get story manifest with all scenes and assets (M4)
 * Returns scenes with signed URLs for images and audio
 */

const inlineNoSpaceBeforeRe = /^[\s,.;:!?…)\]}»”’"'%]/;
const inlineOpeningBoundaryRe = /[\s([{«„“"']$/;

function needsInlineSpaceBefore(previousText: string, currentText: string): boolean {
  return Boolean(
    previousText &&
    currentText &&
    !inlineOpeningBoundaryRe.test(previousText) &&
    !inlineNoSpaceBeforeRe.test(currentText)
  );
}

function needsInlineSpaceAfter(currentText: string, nextText: string): boolean {
  return Boolean(currentText && nextText && !inlineNoSpaceBeforeRe.test(nextText));
}

function buildArtifactTextSegments(
  rawText: string,
  artifact: { id: string } | null
): {
  label: string;
  segments: Array<
    | { type: 'text'; text: string }
    | { type: 'artifact'; text: string; label: string; artifactId: string }
  >;
} | null {
  if (!artifact) return null;

  const match = rawText.match(/\{([^{}]+)\}/);
  if (!match || match.index === undefined) return null;

  const before = stripAllTags(rawText.slice(0, match.index));
  const label = stripAllTags(match[1]).trim();
  const after = stripAllTags(rawText.slice(match.index + match[0].length));

  if (!label) return null;

  const segments = [
    before
      ? {
          type: 'text' as const,
          text: `${before}${needsInlineSpaceBefore(before, label) ? ' ' : ''}`,
        }
      : null,
    { type: 'artifact' as const, text: label, label, artifactId: artifact.id },
    after
      ? { type: 'text' as const, text: `${needsInlineSpaceAfter(label, after) ? ' ' : ''}${after}` }
      : null,
  ].filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));

  return { label, segments };
}

type ManifestSceneRow = {
  id: string;
  storyId: string;
  sceneId: number;
  text: string;
  visualPrompt: string;
  charactersPresent?: string[] | null;
  isReferenceImage?: boolean | null;
  imageUrl?: string | null;
  generationParams?: unknown;
  generationTimeMs?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function fallbackSceneUuid(sceneId: number): string {
  return `00000000-0000-4000-8000-${String(sceneId).padStart(12, '0').slice(-12)}`;
}

function buildManifestSceneRowsFromStoryJson(story: {
  id: string;
  scenes: unknown;
}): ManifestSceneRow[] {
  if (!Array.isArray(story.scenes)) return [];

  return story.scenes
    .map((scene: any, index): ManifestSceneRow | null => {
      const text = typeof scene?.text === 'string' ? scene.text : '';
      if (!text.trim()) return null;

      const sceneId = Number.isFinite(Number(scene?.sceneId)) ? Number(scene.sceneId) : index + 1;
      return {
        id: fallbackSceneUuid(sceneId),
        storyId: story.id,
        sceneId,
        text,
        visualPrompt: typeof scene?.visualPrompt === 'string' ? scene.visualPrompt : '',
        charactersPresent: Array.isArray(scene?.charactersPresent) ? scene.charactersPresent : [],
        isReferenceImage: false,
        imageUrl: typeof scene?.imageUrl === 'string' ? scene.imageUrl : null,
        generationParams: { source: 'story.scenes_fallback' },
        generationTimeMs: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
    })
    .filter((scene): scene is ManifestSceneRow => Boolean(scene));
}

function getAgeYearsFromBirthDateForReadingSettings(
  birthDate: Date | string | null
): number | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let ageYears = now.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (birthdayThisYear > now) {
    ageYears -= 1;
  }
  return Math.max(0, ageYears);
}

export async function getStoryManifest(storyId: string) {
  const story = await getStoryRepository().findById(storyId);

  if (!story) {
    throw new Error('Story not found');
  }

  // Get all scenes
  const persistedStoryScenes = await getSceneRepository().findByStoryId(storyId);
  const storyScenes: ManifestSceneRow[] =
    persistedStoryScenes.length > 0
      ? persistedStoryScenes
      : buildManifestSceneRowsFromStoryJson(story);

  // Get all assets
  const storyAssets = await getAssetRepository().findByStoryId(storyId);

  // Get linked characters with enrichment
  const linkedCharactersRaw = await getStoryRepository().findLinkedCharactersByStoryId(storyId);
  const assetStorage = getAssetStorageService();
  const localizedCharacterNames = await getLocalizedCharacterNames(
    linkedCharactersRaw.map((char) => char.id),
    story.language
  );

  // Resolve scenario card info for breadcrumbs
  let scenarioCardId: string | null = null;
  let scenarioCardName: string | null = null;
  if (story.storyRequestId) {
    const storyRequest = await getStoryRepository().findRequestById(story.storyRequestId);
    if (storyRequest?.scenarioCardId) {
      scenarioCardId = storyRequest.scenarioCardId;
      const translations = await getDictionaryRepository().findTranslations(
        'scenario_card',
        [storyRequest.scenarioCardId],
        story.language
      );
      const nameTranslation = translations.find((t) => t.fieldName === 'name');
      if (nameTranslation) {
        scenarioCardName = nameTranslation.value;
      } else {
        const card = await getDictionaryRepository().findScenarioCardById(
          storyRequest.scenarioCardId
        );
        scenarioCardName = card?.nameKey || null;
      }
    }
  }

  const storyMeta = (story.metadata as Record<string, unknown>) || {};
  const sceneIdsWithImages = (storyMeta.sceneIdsWithImages as number[] | undefined) ?? [];
  const imageGenerationComplete = storyMeta.imageGenerationComplete as boolean | undefined;
  const failedScenes =
    (storyMeta.failedScenes as Array<{ sceneId: number; errorMessage: string }> | undefined) ?? [];
  const storySceneExtrasBySceneId = new Map<number, Record<string, unknown>>();
  if (Array.isArray(story.scenes)) {
    for (const scene of story.scenes as any[]) {
      const sceneId = Number(scene?.sceneId);
      if (Number.isFinite(sceneId)) {
        storySceneExtrasBySceneId.set(sceneId, scene as Record<string, unknown>);
      }
    }
  }
  const closingArtifact = story.closingArtifactId
    ? await getStoryArtifactRepository().findById(story.closingArtifactId)
    : null;
  const localizedClosingArtifactTitle = closingArtifact
    ? await resolveStoryArtifactTitle(closingArtifact, story.language)
    : null;
  const closingArtifactImage = closingArtifact
    ? storyArtifactImageUrls(closingArtifact.imagePath)
    : null;
  const closingArtifactPayload = closingArtifact
    ? {
        id: closingArtifact.id,
        artifactCode: closingArtifact.artifactCode,
        title: localizedClosingArtifactTitle || closingArtifact.title,
        description: closingArtifact.description,
        imagePath: closingArtifact.imagePath,
        fullImagePath: closingArtifactImage!.fullImagePath,
        fullImageUrl: closingArtifactImage!.fullImageUrl,
        thumbnailPath: closingArtifactImage!.thumbnailPath,
        thumbnailUrl: closingArtifactImage!.thumbnailUrl,
        imageUrl: closingArtifactImage!.imageUrl,
      }
    : null;

  const config = (await import('../config')).config;
  const webAppUrl = config.web?.webAppUrl || 'https://app.wondertales.com';

  // M6: Merge alignment from alignments table into audioMetadata (Phase 2)
  // Alignment is stored in alignments table; manifest must include it for highlight toggle
  let audioMetadata = story.audioMetadata;
  if (audioMetadata && !(audioMetadata as any).error) {
    const alignmentRow = await getAlignmentRepository().findByStoryId(storyId);
    const alignment = alignmentRow?.data ?? (audioMetadata as any)?.alignment;
    if (alignment && typeof audioMetadata === 'object' && audioMetadata !== null) {
      audioMetadata = { ...audioMetadata, alignment } as typeof audioMetadata;
    }
  }

  const readingProfileId = story.childProfileId ?? story.createdByChildProfileId ?? null;
  const readingProfile = readingProfileId
    ? await getChildProfileRepository().findById(readingProfileId, story.userId)
    : null;
  const readingProfileAgeYears = readingProfile
    ? getAgeYearsFromBirthDateForReadingSettings(readingProfile.birthDate)
    : null;
  const baseTextSizePx =
    readingProfileAgeYears !== null
      ? getBaseStoryTextSizePxForAgeYears(readingProfileAgeYears)
      : getBaseStoryTextSizePxForAgeGroup(story.ageGroup);
  const textSizeMultiplier = normalizeStoryTextSizeMultiplier(
    readingProfile?.storyTextSizeMultiplier
  );
  const readingSettings = {
    baseTextSizePx,
    textSizeMultiplier,
    textSizePx: getStoryTextSizePx(baseTextSizePx, textSizeMultiplier),
  };

  // Build manifest
  const manifest = {
    storyId: story.id,
    title: stripCharacterIds(story.title),
    language: story.language,
    ageGroup: story.ageGroup,
    isPublished: !!story.isPublished,
    publishedSlug: story.publishedSlug ?? null,
    visibility:
      story.visibility || (story.publishedSlug ? 'public' : story.shareToken ? 'unlisted' : null),
    shareUrl: story.publishedSlug
      ? `${webAppUrl.replace(/\/$/, '')}/stories/${story.publishedSlug}`
      : story.shareToken
        ? `${webAppUrl.replace(/\/$/, '')}/u/${story.shareToken}`
        : null,
    coverAssetId: story.coverAssetId ?? null,
    createdByMode: story.createdByMode,
    createdByChildProfileId: story.createdByChildProfileId ?? null,
    parentReviewStatus: story.parentReviewStatus,
    readingSettings,
    closingArtifact: closingArtifactPayload,
    fullText: stripAllTags(story.fullText || ''),
    audioMetadata,
    // M8: Series fields
    seriesId: story.seriesId,
    partNumber: story.partNumber,
    scenarioCardId,
    scenarioCardName,
    imageGenerationComplete: imageGenerationComplete ?? true,
    sceneIdsWithImages,
    failedScenes,
    scenes: storyScenes.map((scene) => {
      const rawSceneText = scene.text || '';
      const sceneExtras = storySceneExtrasBySceneId.get(scene.sceneId) || {};
      const artifactText = buildArtifactTextSegments(rawSceneText, closingArtifactPayload);
      const sceneAssets = storyAssets.filter((a) => a.sceneId === scene.id);

      const imageAsset = sceneAssets.find((a) => a.assetType === 'image');
      const audioAsset = sceneAssets.find((a) => a.assetType === 'audio');

      const assetUrl = (storagePath: string): string => `/api/v1/assets/${storagePath}`;

      // Parse sceneVisual from visualPrompt column when it contains JSON
      let sceneVisual: SceneVisual | undefined;
      if (scene.visualPrompt?.startsWith('{')) {
        try {
          const parsed = JSON.parse(scene.visualPrompt);
          if (
            parsed &&
            typeof parsed.setting === 'string' &&
            parsed.cameraComposition !== undefined
          ) {
            sceneVisual = parsed as SceneVisual;
          }
        } catch (_) {
          // Not valid JSON, keep as legacy visualPrompt
        }
      }

      return {
        sceneId: scene.sceneId,
        text: stripAllTags(rawSceneText),
        ...(typeof sceneExtras.mixedStoryBlockKind === 'string'
          ? { mixedStoryBlockKind: sceneExtras.mixedStoryBlockKind }
          : {}),
        ...(typeof sceneExtras.mixedStoryScreenOrder === 'number'
          ? { mixedStoryScreenOrder: sceneExtras.mixedStoryScreenOrder }
          : {}),
        ...(Array.isArray(sceneExtras.mixedStorySourceSceneIds)
          ? { mixedStorySourceSceneIds: sceneExtras.mixedStorySourceSceneIds }
          : {}),
        ...(typeof sceneExtras.mixedStoryAnchorSceneId === 'number'
          ? { mixedStoryAnchorSceneId: sceneExtras.mixedStoryAnchorSceneId }
          : {}),
        ...(typeof sceneExtras.graphicNovelPageNumber === 'number'
          ? { graphicNovelPageNumber: sceneExtras.graphicNovelPageNumber }
          : {}),
        ...(typeof sceneExtras.graphicNovelTextMode === 'string'
          ? { graphicNovelTextMode: sceneExtras.graphicNovelTextMode }
          : {}),
        ...(Array.isArray(sceneExtras.graphicNovelTextSegmentIds)
          ? { graphicNovelTextSegmentIds: sceneExtras.graphicNovelTextSegmentIds }
          : {}),
        artifactMention: artifactText
          ? { artifactId: closingArtifactPayload!.id, label: artifactText.label }
          : null,
        ...(artifactText ? { textSegments: artifactText.segments } : {}),
        // Return structured sceneVisual when available, otherwise legacy visualPrompt
        ...(sceneVisual
          ? { sceneVisual, visualPrompt: undefined }
          : { visualPrompt: scene.visualPrompt }),
        image: imageAsset
          ? {
              id: imageAsset.id,
              url: assetUrl(imageAsset.storagePath),
              mimeType: imageAsset.mimeType,
              status: imageAsset.status,
              ...(imageAsset.status === 'failed' &&
                imageAsset.errorMessage && { errorMessage: imageAsset.errorMessage }),
            }
          : null,
        audio: audioAsset
          ? {
              id: audioAsset.id,
              url: assetUrl(audioAsset.storagePath),
              mimeType: audioAsset.mimeType,
              status: audioAsset.status,
            }
          : null,
      };
    }),
    metadata: story.metadata,
    createdAt: story.createdAt,
    characters: [
      ...(await fetchStoryChildren(story.storyRequestId, story.childProfileId, story.userId)),
      ...(await Promise.all(
        linkedCharactersRaw.map(async (char) => {
          let referencePhotoUrl: string | null = null;
          const turnaround = char.turnaroundSheet as { url?: string; frontUrl?: string } | null;
          const refPhotos = char.referencePhotos as Array<{ url?: string }> | null;
          const rawPath =
            turnaround?.frontUrl ||
            turnaround?.url ||
            (refPhotos && refPhotos.length > 0 ? refPhotos[0].url : null) ||
            null;
          if (rawPath) {
            try {
              const storagePath = rawPath
                .split('?')[0]
                .replace(/^https?:\/\/[^/]+/, '')
                .replace(/^\/api\/v1\/assets\//, '');
              const { signedUrl } = await assetStorage.generateSignedUrl(storagePath, 24);
              referencePhotoUrl = signedUrl;
            } catch {
              // Non-fatal
            }
          }
          return {
            id: char.id,
            name: char.name,
            localizedName: localizedCharacterNames.get(char.id) ?? null,
            nameTranslations: localizedCharacterNames.has(char.id)
              ? { [story.language]: localizedCharacterNames.get(char.id)! }
              : undefined,
            type: char.type,
            role: char.role,
            isHidden: char.isHidden,
            description: char.description,
            referencePhotoUrl,
          };
        })
      )),
    ],
  };

  return manifest;
}

/**
 * Get lightweight generation status for polling (metadata only, no JOINs)
 */
export async function getStoryGenerationStatus(storyId: string, userId: string) {
  const story = await getStoryRepository().findById(storyId);

  if (!story || story.userId !== userId) {
    return null;
  }

  const metadata = (story.metadata as Record<string, unknown>) || {};
  const imageGenerationComplete = (metadata.imageGenerationComplete as boolean | undefined) ?? true;

  // If generation is still in progress - load scenes with imageUrl
  let scenesWithImages: Array<{ sceneId: number; imageUrl: string }> = [];
  if (!imageGenerationComplete) {
    const sceneRecords = await getSceneRepository().findByStoryId(storyId);
    scenesWithImages = sceneRecords
      .filter((s) => s.imageUrl != null)
      .map((s) => ({
        sceneId: s.sceneId,
        imageUrl: `/api/v1/assets/${s.imageUrl!}`,
      }));
  }

  return {
    storyId: story.id,
    imageGenerationComplete,
    sceneIdsWithImages: (metadata.sceneIdsWithImages as number[] | undefined) ?? [],
    failedScenes:
      (metadata.failedScenes as Array<{ sceneId: number; errorMessage: string }> | undefined) ?? [],
    scenesWithImages, // NEW: array of {sceneId, imageUrl}
  };
}

/**
 * Regenerate image for a specific scene (M4)
 */
export async function regenerateSceneImage(
  storyId: string,
  sceneId: number,
  visualPrompt?: string
): Promise<void> {
  // Validate inputs
  if (!isUUID(storyId)) {
    throw new Error('Invalid story ID format');
  }

  if (!Number.isInteger(sceneId) || sceneId < 0) {
    throw new Error('Invalid scene ID');
  }

  logger.info({ storyId, sceneId }, 'Regenerating scene image');

  const story = await getStoryRepository().findById(storyId);

  if (!story) {
    throw new Error('Story not found');
  }

  const scene = await getSceneRepository().findByStoryAndSceneId(storyId, sceneId);

  if (!scene) {
    throw new Error(`Scene ${sceneId} not found`);
  }

  // Get user plan
  const userPlan = await getPlanFeatures(story.userId);
  await assertSceneImageGenerationAccessForStory({ story, sceneId });

  // Keep the old image until the replacement passes validation and is saved.
  const oldAssets = await getAssetRepository().findBySceneId(scene.id, 'image');

  const assetStorage = getAssetStorageService();
  const initialEditRepair = await buildInitialEditRepairFromCurrentSceneImage({
    storyId,
    sceneId,
    sceneImageUrl: scene.imageUrl,
    assets: oldAssets,
    assetStorage,
  });

  // Get characters from story metadata
  const metadata = story.metadata as any;
  const llmCharacters = metadata?.llmGeneratedCharacters || [];

  // Get user characters
  const linkedChars = await getStoryRepository().findLinkedCharactersByStoryId(storyId);
  const userCharsWithDetails = await Promise.all(
    linkedChars.map(async (lc) => {
      const c = await getCharacterRepository().findById(lc.id, story.userId);
      return c ? { characters: c } : null;
    })
  );
  const userCharacters = userCharsWithDetails.filter(Boolean) as Array<{
    characters: {
      id: string;
      name: string;
      type: string;
      referencePhotos?: unknown;
      appearanceTraits?: unknown;
      description?: string;
      personality?: string;
      turnaroundSheet?: unknown;
    };
  }>;

  const mergedCharacters = mergeCharacters(
    userCharacters
      .filter((uc) => uc.characters && uc.characters.name)
      .map((uc) => ({
        id: uc.characters.id,
        name: uc.characters.name,
        type: uc.characters.type,
        referencePhotos: uc.characters.referencePhotos as ReferencePhoto[] | undefined,
        appearanceTraits: uc.characters.appearanceTraits as AppearanceTraits | undefined,
        description: uc.characters.description || undefined,
        role: undefined,
        appearance: undefined,
        personality: uc.characters.personality || undefined,
        turnaroundSheet: (uc.characters as any).turnaroundSheet || undefined,
        descriptionEn: (uc.characters as any).descriptionEn || undefined,
        aiGeneratedDescription: (uc.characters as any).aiGeneratedDescription || undefined,
      })),
    llmCharacters
  );

  // Get child profile
  let childProfile: ChildProfileData | undefined = undefined;
  if (story.childProfileId) {
    const profile = await getChildProfileRepository().findById(story.childProfileId, story.userId);
    childProfile = profile ? (profile as ChildProfileData) : undefined;
  }

  const imageDomain = getImageDomainService();
  const complexImageDomain = getComplexImageDomainService();
  let scenarioCardId: string | undefined = metadata?.scenarioCardId;
  if (!scenarioCardId && story.storyRequestId) {
    const sr = await getStoryRepository().findRequestById(story.storyRequestId);
    scenarioCardId = (sr as { scenarioCardId?: string } | null)?.scenarioCardId ?? undefined;
  }

  const spec = {
    ageGroup: story.ageGroup,
    childProfile,
    characters: mergedCharacters.filter((c: any) => c.source !== 'llm_generated'),
    scenarioCard: scenarioCardId ? { id: scenarioCardId } : undefined,
    imageStyle: metadata?.imageStyle,
  };

  const scenesFromStory = Array.isArray(story.scenes) ? (story.scenes as any[]) : [];
  const sceneFromJson = scenesFromStory.find((s: any) => s.sceneId === sceneId) || {};
  const effectiveVisualPrompt = visualPrompt !== undefined ? visualPrompt : scene.visualPrompt;
  const sceneData: SceneData = {
    sceneId: scene.sceneId,
    text: scene.text,
    visualPrompt: effectiveVisualPrompt,
    sceneVisual:
      sceneFromJson.sceneVisual ?? migrateVisualPrompt({ visualPrompt: effectiveVisualPrompt }),
    ...(sceneFromJson.environmentId ? { environmentId: sceneFromJson.environmentId } : {}),
    ...(sceneFromJson.characterOutfitIds && Object.keys(sceneFromJson.characterOutfitIds).length > 0
      ? { characterOutfitIds: sceneFromJson.characterOutfitIds as Record<string, string> }
      : {}),
  } as SceneData;

  const storyOutfitsRegen = (
    Array.isArray(metadata?.outfits) ? metadata.outfits : []
  ) as StoryOutfitEntry[];

  const textForEnv = {
    scenes: scenesFromStory,
    environments: metadata?.environments,
    outfits: metadata?.outfits,
  };
  const environmentMap = buildEnvironmentMapFromText(textForEnv, `regenerate-${storyId}`);

  const characterRegistry = buildCharacterRegistry(
    mergedCharacters.filter((c: any) => c.source !== 'llm_generated'),
    childProfile,
    llmCharacters
  );

  const characterDescriptionMap = new Map<string, CharacterData>();
  for (const [normalized] of characterRegistry.entries()) {
    const fullChar = mergedCharacters.find(
      (c: any) =>
        normalizeCharacterName(c.name) === normalized ||
        crossScriptIdentityKey(c.name) === crossScriptIdentityKey(normalized) ||
        toPhoneticKey(c.name) === toPhoneticKey(normalized)
    );
    if (fullChar) {
      characterDescriptionMap.set(normalized, fullChar);
    }
  }

  const sceneVisualForNames = sceneData.sceneVisual || migrateVisualPrompt(sceneData);
  let sceneCharNames: string[];
  if (
    sceneVisualForNames?.cameraComposition &&
    typeof sceneVisualForNames.cameraComposition !== 'string'
  ) {
    sceneCharNames = flattenCameraComposition(sceneVisualForNames.cameraComposition).characterNames;
  } else {
    sceneCharNames =
      sceneFromJson.characters ||
      (sceneData as any).characters ||
      (scene as any).charactersPresent ||
      [];
  }
  const normalizedCharacters = matchCharacterNames(sceneCharNames, characterRegistry);
  const characterNamesInIllustratedScenes = new Set(normalizedCharacters);

  await hydrateLlmTurnaroundSheetsFromDb(
    mergedCharacters as any[],
    characterDescriptionMap,
    story.userId,
    characterNamesInIllustratedScenes
  );

  const { uploadedFileMap, imageSystemInstruction } = await prepareFilesApiAndSystemInstruction({
    characterDescriptionMap,
    imageDomain,
    assetStorage,
    spec,
    userStyle: metadata?.imageStyle,
    characterNamesInIllustratedScenes,
    mergedCharacters: mergedCharacters as any[],
  });
  const inlineReferenceCache = new Map<string, { base64: string; mimeType: string }>();

  const currentEnvironmentId = (sceneData as any).environmentId as string | undefined;
  const currentEnvironment = currentEnvironmentId
    ? environmentMap.get(currentEnvironmentId)
    : undefined;
  const llmTurnaroundInFlight = new Map<string, Promise<void>>();
  let previousStoryIds: string[] = [];
  if (story.seriesId) {
    const series = await getStoryRepository().findSeriesById(story.seriesId);
    if (series?.storyIds && Array.isArray(series.storyIds)) {
      previousStoryIds = (series.storyIds as string[]).filter((id) => id !== storyId);
    }
  }

  const envReferencePromise = initialEditRepair
    ? Promise.resolve<EnvImageData | null>(null)
    : prepareSceneEnvironmentReference({
        storyId,
        storyRequestId: story.storyRequestId ?? undefined,
        userId: story.userId,
        storyEnvironmentId: currentEnvironmentId,
        environment: currentEnvironment,
        assetStorage,
        imageDomain,
        scenarioCardId,
        ...(previousStoryIds.length > 0 ? { previousStoryIds } : {}),
        reuseExistingOnly: true,
      });

  const characterReferencesPromise = (async () => {
    await ensureLlmTurnaroundsForSceneCharacters({
      normalizedCharacters,
      characterDescriptionMap,
      storyId,
      storyRequestId: story.storyRequestId ?? undefined,
      userId: story.userId,
      imageStyle: metadata?.imageStyle,
      imageDomain,
      assetStorage,
      uploadedFileMap,
      inFlight: llmTurnaroundInFlight,
    });

    const characterPaths = getSceneCharacterReferencePaths(
      normalizedCharacters,
      characterDescriptionMap
    );
    const sceneReferencePathMetadataMap =
      buildCharacterReferencePathMetadataMap(characterDescriptionMap);
    return buildCharacterReferenceDataArray(
      characterPaths,
      sceneReferencePathMetadataMap,
      uploadedFileMap,
      assetStorage,
      inlineReferenceCache
    );
  })();

  const outfitPlatePendingRegen = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getOrCreateOutfitPlateImage>> | null>
  >();
  const initialRepairNeedsOutfitReferences = initialEditRepair
    ? initialEditRepair.validation.characters.some(validationCharacterNeedsOutfitRepair)
    : true;
  const outfitPlateRefsPromise =
    initialEditRepair && !initialRepairNeedsOutfitReferences
      ? Promise.resolve([])
      : characterReferencesPromise.then((characterReferenceData) =>
          prepareSceneOutfitPlateReferences({
            storyId,
            storyRequestId: story.storyRequestId ?? undefined,
            userId: story.userId,
            normalizedCharacters,
            characterDescriptionMap,
            characterReferenceData,
            scene: sceneData,
            currentEnvironmentId,
            currentEnvironment,
            storyOutfits: storyOutfitsRegen.length > 0 ? storyOutfitsRegen : undefined,
            imageStyle: metadata?.imageStyle,
            ageGroup: story.ageGroup,
            scenarioCardId,
            assetStorage,
            imageDomain,
            outfitPlatePending: outfitPlatePendingRegen,
            reuseExistingOnly: true,
          })
        );

  const [envImageData, characterReferenceData, outfitPlateRefs] = await Promise.all([
    envReferencePromise,
    characterReferencesPromise,
    outfitPlateRefsPromise,
  ]);

  const envRefEntry = envImageData
    ? [
        {
          base64: envImageData.base64,
          mimeType: envImageData.mimeType,
          fileUri: envImageData.fileUri,
          source: 'environment',
          type: 'environment_reference',
          imageIndex: 1,
        },
      ]
    : [];

  let referenceImageDataArray = [...envRefEntry, ...characterReferenceData, ...outfitPlateRefs];
  const bucketResult = applyReferenceBucketLimits(
    referenceImageDataArray,
    config.image.maxCharacterReferenceImages,
    config.image.maxObjectReferenceImages
  );
  referenceImageDataArray = bucketResult.trimmed;
  logReferenceBucketDelivery({
    storyId,
    sceneId,
    characterCount: bucketResult.characterCount,
    objectCount: bucketResult.objectCount,
    droppedCharacterCount: bucketResult.droppedCharacterCount,
    droppedObjectCount: bucketResult.droppedObjectCount,
    totalAfterTrim: referenceImageDataArray.length,
  });
  const imageIndexMap = assignSequentialImageIndices(referenceImageDataArray);

  const sceneCharacterDescriptions = normalizedCharacters
    .map((n) => characterDescriptionMap.get(n))
    .filter(Boolean) as CharacterData[];

  const allScenes = scenesFromStory as SceneData[];
  const sceneIndexInAll = allScenes.findIndex((s) => s.sceneId === sceneId);

  const composedSceneVisual = buildComposedSceneVisual({
    storyId,
    scene: sceneData,
    sceneIndexInAll: sceneIndexInAll >= 0 ? sceneIndexInAll : 0,
    generatedIndices: sceneIndexInAll >= 0 ? [sceneIndexInAll] : [0],
    allScenes: allScenes.length > 0 ? allScenes : [sceneData],
    environmentMap,
    hasEnvironmentImageRef: !!envImageData,
  });
  const enrichedScene: SceneData = { ...sceneData, sceneVisual: composedSceneVisual };

  const characterOutfitsRegen =
    resolveCharacterOutfits(sceneData, {
      currentEnvironment,
      storyOutfits: storyOutfitsRegen.length > 0 ? storyOutfitsRegen : undefined,
    }) || undefined;

  const rawCoRegen = currentEnvironment?.characterOutfits;
  const legacyEnvOutfitsPresentRegen =
    rawCoRegen === undefined || rawCoRegen === null
      ? false
      : typeof rawCoRegen === 'string'
        ? rawCoRegen.trim().length > 0
        : Object.keys(rawCoRegen as Record<string, string>).length > 0;

  logger.info(
    {
      storyId,
      sceneId,
      storyOutfitsCount: storyOutfitsRegen.length,
      sceneCharacterOutfitIdKeys:
        sceneData.characterOutfitIds && typeof sceneData.characterOutfitIds === 'object'
          ? Object.keys(sceneData.characterOutfitIds)
          : [],
      sceneCharacterOutfitIdsSample:
        sceneData.characterOutfitIds && typeof sceneData.characterOutfitIds === 'object'
          ? Object.fromEntries(Object.entries(sceneData.characterOutfitIds).slice(0, 6))
          : undefined,
      legacyEnvOutfitsPresent: legacyEnvOutfitsPresentRegen,
      hasResolvedCharacterOutfits: !!characterOutfitsRegen,
      resolvedCharacterOutfitKeys: characterOutfitsRegen ? Object.keys(characterOutfitsRegen) : [],
      outfitPlateRefsCount: outfitPlateRefs.length,
    },
    'Regenerate scene image: wardrobe context'
  );

  const imageResult = await generateSceneImageWithReference(storyId, enrichedScene, {
    sceneDbId: scene.id,
    childProfile,
    characters: sceneCharacterDescriptions,
    userStyle: metadata?.imageStyle,
    ageGroup: story.ageGroup,
    scenarioCardId,
    storyOutfits: storyOutfitsRegen.length > 0 ? storyOutfitsRegen : undefined,
    userPlan,
    userId: story.userId,
    assetStorage,
    imageDomain,
    complexImageDomain,
    referenceImageDataArray,
    imageSystemInstruction,
    imageIndexMap,
    currentEnvironmentId,
    currentEnvironment,
    initialImageRoute: 'complex',
    initialEditRepair,
  });

  if (imageResult.imageUrl) {
    await getSceneRepository().update(scene.id, {
      imageUrl: imageResult.imageUrl,
    });
    await refreshStoryCoverAssetForScene(storyId, scene.id, imageResult.assetId);
  }

  for (const oldAsset of oldAssets) {
    try {
      await assetStorage.deleteAsset(oldAsset.storagePath);
    } catch (error) {
      logger.warn({ error, assetId: oldAsset.id }, 'Failed to delete old asset from storage');
    }
    await getAssetRepository().deleteById(oldAsset.id);
  }

  logger.info({ storyId, sceneId }, 'Scene image regenerated successfully');
}

/**
 * Generate audio for story (M5)
 */
export async function generateStoryAudio(
  storyId: string,
  voiceId?: string,
  options?: {
    speed?: number;
    nightMode?: boolean;
  }
): Promise<void> {
  // Validate inputs
  if (!isUUID(storyId)) {
    throw new Error('Invalid story ID format');
  }

  logger.info({ storyId, voiceId, options }, 'Generating story audio');

  const story = await getStoryRepository().findById(storyId);

  if (!story) {
    throw new Error('Story not found');
  }

  // Check if audio already exists (skip if so)
  const existingAudio = await getAssetRepository().findAudioAssetsByStoryId(storyId);
  const completedAudio = existingAudio.filter((a) => a.status === 'completed');

  if (completedAudio.length > 0 && !voiceId) {
    logger.info({ storyId }, 'Audio already exists, skipping generation');
    return;
  }

  await assertVoiceAccessForUser(story.userId, voiceId);

  try {
    // Get audio domain service
    const audioDomain = getAudioDomainService();

    // Load user subscription to determine plan type
    const { getUserSubscription, getPlanById } = await import('./planService');
    const subscription = await getUserSubscription(story.userId);

    let planType: 'free' | 'premium' = 'free';
    if (subscription) {
      const plan = await getPlanById(subscription.planId);
      // Determine if premium based on plan slug
      planType = plan && plan.slug !== 'free' ? 'premium' : 'free';
    }

    // Generate audio with plan type
    const usageContext = { userId: story.userId, storyId };
    const result = await audioDomain.synthesizeStory(
      story,
      {
        voiceId,
        speed: options?.speed,
        nightMode: options?.nightMode,
      },
      planType, // Pass plan type for voice selection logic
      { onUsage: (u) => recordUsage(u, usageContext) }
    );

    // Update story metadata
    await getStoryRepository().updateStory(storyId, {
      audioMetadata: {
        voiceId: result.voiceId,
        voiceName: result.voiceName,
        totalDuration: result.duration,
        generatedAt: new Date().toISOString(),
        nightMode: options?.nightMode || false,
      } as any,
      updatedAt: new Date(),
    });

    logger.info(
      {
        storyId,
        duration: result.duration,
        voiceName: result.voiceName,
        cached: result.cached,
      },
      'Story audio generated successfully'
    );
  } catch (error) {
    logger.error({ error, storyId }, 'Audio generation failed');

    throw error;
  }
}
