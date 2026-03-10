import {
  getStoryRepository,
  getSceneRepository,
  getAssetRepository,
  getChildProfileRepository,
  getCharacterRepository,
  getDictionaryRepository,
  getEnvironmentImageCacheRepository,
  getStoryEnvironmentCacheRepository,
} from '../repositories';
import type { CreateStoryRequestInput } from '@wondertales/shared';
import { getStoryDomainService, getImageDomainService, getAudioDomainService, getEnvironmentImageProvider } from './aiService';
import { recordUsage } from './aiUsageService';
import { getAssetStorageService } from './assetStorageService';
import { getPlanFeatures } from './planService';
import {
  STORY_TASKS,
  startTask,
  completeTask,
  updateTaskProgress,
  calculateOverallProgress,
  StoryProgress,
} from './storyProgress';
import { buildPolicyProfile } from './policyService';
import { getGenerationCoefficients } from './generationTimeService';
import type { StorySpec, StoryEnvironment, ImageValidationResult } from '../ai/types';
import { logger } from '../utils/logger';
import { stripCharacterIds, stripAllTags } from '../utils/audioTags';
import { parseCharacterOutfitsString, serializeCharacterOutfitsToStr } from '../utils/characterOutfits';
import type { CharacterReference } from '../prompts/image';
import { buildImageSystemInstruction, buildEnvironmentImagePrompt } from '../prompts/image';
import type { UploadedFile } from '../providers/base/IFileManager';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { validate as isUUID } from 'uuid';
import crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { config } from '../config';
import {
  flattenCameraComposition,
  type StoryRequestData,
  type ChildProfileData,
  type CharacterData,
  type SceneData,
  type SceneVisual,
  type ImageGenerationContext,
  type ReferencePhoto,
  type AppearanceTraits,
} from './types';
// NEW M9: Character-based reference tracking
import { buildCharacterRegistry, normalizeCharacterName, matchCharacterNames, toPhoneticKey, type NormalizedCharacter } from '../utils/characterNormalization';
import { loadReferenceImageData } from './referenceImageTracker';
import { generateEmbedding, cosineSimilarity } from './embeddingService';
import { generateLlmCharacterTurnaround } from './turnaroundSheetService';
import { createStoryStub, enrichStoryRecord } from './storyOrchestration/storyRecords';
import { validateStoryScenes } from './storyOrchestration/validation';
import { mergeDirectorIntoText, extractLlmCharactersFromText, getIllustrationSceneIds, getIllustrationBlockStartSceneIds, composeScenesIntoBlocks } from './storyOrchestration/utilities';

/**
 * Story Orchestration Service (Milestone 3)
 * Coordinates the entire story generation workflow
 * 
 * Architecture:
 * - MUST call Domain Services (NOT providers)
 * - NEVER import or use providers directly
 * - NEVER build prompts or handle LLM details
 * - ONLY manage workflow and progress updates
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

/**
 * Create a new story request
 * Validates limits and creates pending request
 */
export async function createStoryRequest(
  userId: string, 
  input: CreateStoryRequestInput
): Promise<string> {
  try {
    logger.info({ userId, language: input.storyLanguage }, 'Creating story request');
    
    // TODO M3: Check feature limits (stories_per_day)
    // For now, just create the request
    
    // Create story request
    const request = await getStoryRepository().createRequest({
      userId,
      childProfileId: input.childProfileId,
      uiLocale: input.uiLocale,
      storyLanguage: input.storyLanguage,
      goal: input.goal,
      scenarioCardId: input.scenarioCardId,
      imageStyle: (input as any).imageStyle || null, // Image art style
      userNotes: input.userNotes,
      selectedCharacters: input.selectedCharacters ? input.selectedCharacters : null, // Save selected characters
      selectedChildren: (input as any).selectedChildren ? (input as any).selectedChildren : null, // NEW: Save selected children
      status: 'pending',
      progress: 0
    });
    
    logger.info({ requestId: request.id }, 'Story request created');
    return request.id;
  } catch (error) {
    logger.error({ error, userId, stack: error instanceof Error ? error.stack : undefined }, 'Failed to create story request');
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
    moralTheme: string | null;
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
    logger.info({
      userId,
      seriesId: input.seriesId,
      partNumber: input.partNumber,
    }, 'Creating continuation request');
    
    // Create a special story request for continuation
    const request = await getStoryRepository().createRequest({
      userId,
      childProfileId: input.childProfileId,
      uiLocale: 'uk', // Use default, doesn't affect story
      storyLanguage: input.language,
      goal: input.moralTheme, // Use moral theme from original story (can be null)
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
        ...(input.isScheduledContinuation && {
          isScheduledContinuation: true,
          scheduleId: input.scheduleId,
        }),
      },
    });
    
    logger.info({ requestId: request.id, seriesId: input.seriesId }, 'Continuation request created');
    return request.id;
  } catch (error) {
    logger.error({
      error,
      userId,
      seriesId: input.seriesId,
      stack: error instanceof Error ? error.stack : undefined
    }, 'Failed to create continuation request');
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
    
    // Get Domain Services (needed throughout the function)
    const storyDomain = getStoryDomainService();
    const imageDomain = getImageDomainService();
    const assetStorage = getAssetStorageService();
    
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
        selectedCharacters: Array.isArray(request.selectedCharacters) ? request.selectedCharacters : [],
        selectedChildren: Array.isArray(request.selectedChildren) ? request.selectedChildren : [],
      };
      const specData = await buildStorySpec(reqForSpec, isContinuation ? { continuationContext } : undefined);
      spec = specData.spec;
      selectedCharacters = specData.selectedCharacters;
      chosenPlotExampleId = specData.chosenPlotExampleId;
      chosenWorldRuleId = specData.chosenWorldRuleId;

      // Create story stub before text generation for AI usage tracking
      if (checkpoints.storyId) {
        const existingStory = await getStoryRepository().findById(checkpoints.storyId);
        if (existingStory) {
          storyId = checkpoints.storyId;
          logger.info({ requestId, storyId }, 'Reusing story stub from checkpoint');
        }
      }
      if (!storyId) {
        storyId = await createStoryStub({
          userId: request.userId,
          storyRequestId: request.id,
          childProfileId: request.childProfileId,
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
      await startTask(requestId, STORY_TASKS.GENERATING_TEXT, { estimatedMs: coefficients.avgTextMs });

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
            },
          }),
      };

      if (config.features.useDirectorFlow) {
        const plainText = await storyDomain.generateTextPlain(spec, textGenOptions);
        const imagesPerStory = userPlan.imagesPerStory || 0;
        const blocks = composeScenesIntoBlocks(plainText.scenes, imagesPerStory);
        const userCharacters = selectedCharacters.map((c: any) => ({ id: c.id, name: c.name }));
        const directorResult = await storyDomain.callDirector(
          {
            blocks,
            imagesPerStory,
            spec,
            userCharacters,
          },
          { onUsage: (u) => recordUsage(u, usageContext) }
        );
        text = mergeDirectorIntoText(plainText, directorResult, imagesPerStory);
        text.language = spec.language;
      } else {
        text = await storyDomain.generateText(spec, textGenOptions);
      }
      textGenerationTimeMs = Date.now() - textGenStart;
      await completeTask(requestId, STORY_TASKS.GENERATING_TEXT);
      
      logger.info({ requestId, title: text.title, wordCount: text.wordCount, textGenerationTimeMs }, 'Text generated');
      
      // Log environments from LLM output
      const textEnvironments = (text as any).environments;
      if (textEnvironments && textEnvironments.length > 0) {
        logger.info({
          requestId,
          environmentCount: textEnvironments.length,
          environments: textEnvironments.map((e: any) => ({
            id: e.id,
            name: e.name,
            characterOutfits: e.characterOutfits ?? null,
          })),
        }, 'LLM generated story environments');

        // Log scene-to-environment mapping
        const sceneEnvMapping = text.scenes.map((s: any) => ({
          sceneId: s.sceneId,
          environmentId: (s as any).environmentId || 'MISSING',
          hasSceneVisual: !!s.sceneVisual,
          settingPreview: s.sceneVisual?.setting?.substring(0, 80) || s.visualPrompt?.substring(0, 80) || '',
        }));
        logger.info({
          requestId,
          sceneEnvMapping,
        }, 'Scene-to-environment mapping from LLM');
      } else {
        logger.warn({ requestId }, 'LLM did not generate environments array — images will use raw visualPrompt without setting context');
      }

      // Extract LLM-generated characters (same as main flow — includes originalCharacterId from [ID: uuid])
      const llmCharacters = extractLlmCharactersFromText(text);
      
      logger.info({ 
        llmCharacterCount: llmCharacters.length,
        llmCharacterNames: llmCharacters.map(c => c.name).join(', ')
      }, 'Extracted LLM-generated characters from direct text generation');
      
      // Merge user characters
      mergedCharacters = mergeCharacters(selectedCharacters as CharacterData[], llmCharacters);
      
      // Persist LLM characters to DB with hybrid dedup (name + embedding)
      const userCharacterNames = new Set(
        (selectedCharacters as CharacterData[]).map(c => normalizeCharacterName(c.name))
      );
      const llmCharacterResults = await persistLlmCharacters(
        request.userId, llmCharacters, userCharacterNames,
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
      
      logger.info({
        requestId,
        llmCharacterResults: Array.from(llmCharacterResults.entries()).map(([name, r]) => ({
          name, characterId: r.characterId, isNew: r.isNew, hasTurnaround: r.hasTurnaround,
        })),
      }, 'LLM characters persisted and enriched');
      
      // Save checkpoint (preserve storyId from stub)
      const specForCheckpoint = { ...spec, policyProfile: undefined };
      Object.assign(checkpoints, { text, mergedCharacters, spec: specForCheckpoint, selectedCharacters });
      await getStoryRepository().updateRequest(requestId, {
        intermediateData: { ...checkpoints, text, mergedCharacters, spec: specForCheckpoint, selectedCharacters },
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
    
    // CHECKPOINT 4: Enrich stub or reuse already-enriched story
    if (!storyId) {
      throw new Error('Story stub should exist before checkpoint 4');
    }
    const existingStory = await getStoryRepository().findById(storyId);
    const needsEnrich = !existingStory || existingStory.title === 'Generating...';
    if (needsEnrich) {
      await enrichStoryRecord(storyId, {
        userId: request.userId,
        storyRequestId: request.id,
        childProfileId: request.childProfileId,
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
          modelVersion: 'gemini-2.5-flash',
          plotExampleId: chosenPlotExampleId,
          worldRuleId: chosenWorldRuleId,
          llmGeneratedCharacters: (text as any).characters || [],
          imageStyle: (spec as any).imageStyle,
          ...((text as any).description && { seoDescription: (text as any).description }),
        },
        ...(isContinuation && seriesId && partNumber && { seriesData: { seriesId, partNumber } }),
        isScheduledContinuation,
      });
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
    logger.info({ requestId, storyId, duration: Date.now() - startTime }, 'Text+validation phase completed, handing off to image queue');
    
    return { storyId, isScheduledContinuation: isScheduledContinuation || undefined, scheduleId };
    
  } catch (error) {
    logger.error({
      error,
      requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : undefined,
    }, 'Story text generation failed');

    const checkpointsOnError = (await getStoryRepository().findRequestById(requestId))?.intermediateData as Record<string, unknown> | null;
    const stubStoryId = checkpointsOnError?.storyId as string | undefined;
    if (stubStoryId) {
      const existingStory = await getStoryRepository().findById(stubStoryId);
      if (existingStory?.title === 'Generating...') {
        await getStoryRepository().deleteStory(stubStoryId, (await getStoryRepository().findRequestById(requestId))!.userId);
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
  if (charType === 'animal' || charType === 'creature' || charType === 'object') return 'natural appearance';
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
  const environments = (text as any).environments as Array<{ id: string; characterOutfits?: string | Record<string, string> }> | undefined;
  const scenes = (text as any).scenes as Array<{ environmentId?: string; sceneVisual?: { cameraComposition?: { characters?: Array<{ name: string; description?: string }> } } }> | undefined;
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
        const charType = charTypeMap.get(ch.name) ?? charTypeMap.get(ch.name.split(' [ID:')[0]?.trim() ?? '') ?? 'human';
        outfits[ch.name] = extractOutfitFromDescription(ch.description || '', charType);
      }
    }
    if (Object.keys(outfits).length > 0) {
      (env as any).characterOutfits = serializeCharacterOutfitsToStr(outfits);
      logger.info({ requestId, envId: env.id, filledOutfits: outfits }, 'Filled characterOutfits from scene descriptions (LLM returned empty)');
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
    logger.info({
      requestId,
      previousEnvironmentsCount: options.previousEnvironments.length,
      previousEnvIds: options.previousEnvironments.map((e) => e.id),
    }, 'Seeded environment map with previous episode environments');
  }

  const environments = (text as any).environments as StoryEnvironment[] | undefined;
  const scenes = (text as any).scenes as Array<{ environmentId?: string; sceneVisual?: { setting?: string } }> | undefined;

  if (environments && environments.length > 0) {
    for (const env of environments) {
      environmentMap.set(env.id, env);
    }
    logger.info({
      requestId,
      environmentCount: environments.length,
      environmentIds: environments.map(e => e.id),
      environmentNames: environments.map(e => e.name),
      environmentOutfits: environments.map(e => {
        const parsed = typeof e.characterOutfits === 'string'
          ? parseCharacterOutfitsString(e.characterOutfits)
          : (e.characterOutfits as Record<string, string> | undefined) ?? {};
        return { id: e.id, hasCharacterOutfits: hasCharacterOutfits(e.characterOutfits), characterOutfitKeys: Object.keys(parsed) };
      }),
    }, 'Built environment map from LLM output');
  } else {
    logger.warn({ requestId }, 'No environments found in LLM output — visual prompts will not include environment context');
  }

  // Fallback: add synthetic environments for scene environmentIds missing from LLM output
  if (scenes && scenes.length > 0) {
    const envIdsInScenes = new Set(scenes.map(s => s.environmentId).filter(Boolean) as string[]);
    for (const envId of envIdsInScenes) {
      if (environmentMap.has(envId)) continue;
      const firstScene = scenes.find(s => s.environmentId === envId);
      const setting = firstScene?.sceneVisual?.setting?.trim();
      const syntheticName = envId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const synthetic: StoryEnvironment = {
        id: envId,
        name: syntheticName,
        description: setting || `A location described in the story (${syntheticName}).`,
        characterOutfits: '',
      };
      environmentMap.set(envId, synthetic);
      logger.warn({
        requestId,
        environmentId: envId,
        source: 'synthetic',
        descriptionLength: synthetic.description.length,
      }, 'Environment missing from LLM output — created synthetic from scene setting for env image generation');
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
 * Build imaginary friend references for a scene.
 */
function getImaginaryFriendReferencePaths(
  normalizedCharacters: string[],
  characterDescriptionMap: Map<string, CharacterData>,
): string[] {
  const paths: string[] = [];
  for (const [mapKey, char] of characterDescriptionMap.entries()) {
    if (!char.name) continue;
    if (
      normalizedCharacters.includes(mapKey) &&
      (char as any).type === 'imaginary'
    ) {
      const turnaroundSheet = (char as any).turnaroundSheet as
        | { url?: string }
        | null
        | undefined;
      if (turnaroundSheet?.url) {
        const turnaroundPath = extractStoragePath(turnaroundSheet.url);
        logger.info({
          characterName: char.name,
          turnaroundPath,
        }, 'Using turnaround sheet as reference');
        paths.push(turnaroundPath);
        continue;
      }

      // Fallback: use original reference photos (legacy characters or turnaround not yet generated)
      if (char.referencePhotos && char.referencePhotos.length > 0) {
        logger.info({
          characterName: char.name,
          photoCount: char.referencePhotos.length,
        }, 'No turnaround sheet available, using original reference photos');
        for (const photo of char.referencePhotos) {
          if (photo.url) {
            paths.push(extractStoragePath(photo.url));
          }
        }
      }
    }
  }
  return paths;
}

/**
 * Build child profile references for a scene.
 * Similar to getImaginaryFriendReferencePaths but for type='child' characters.
 * Prefers turnaround sheet over raw photos.
 */
function getChildReferencePaths(
  normalizedCharacters: string[],
  characterDescriptionMap: Map<string, CharacterData>,
): string[] {
  const paths: string[] = [];
  for (const [mapKey, char] of characterDescriptionMap.entries()) {
    if (!char.name) continue;
    if (
      normalizedCharacters.includes(mapKey) &&
      (char as any).type === 'child'
    ) {
      // Prefer turnaround sheet over raw photos for better multi-angle consistency
      const turnaroundSheet = (char as any).turnaroundSheet as
        | { url?: string }
        | null
        | undefined;
      if (turnaroundSheet?.url) {
        const turnaroundPath = extractStoragePath(turnaroundSheet.url);
        logger.info({
          characterName: char.name,
          turnaroundPath,
        }, 'Using child turnaround sheet as reference');
        paths.push(turnaroundPath);
        continue;
      }

      // Fallback: use original reference photos
      if (char.referencePhotos && char.referencePhotos.length > 0) {
        logger.info({
          characterName: char.name,
          photoCount: char.referencePhotos.length,
        }, 'No child turnaround sheet available, using original reference photos');
        for (const photo of char.referencePhotos) {
          if (photo.url) {
            paths.push(extractStoragePath(photo.url));
          }
        }
      }
    }
  }
  return paths;
}

/**
 * Shared image generation loop context.
 */
interface ImageGenerationLoopParams {
  storyId: string;
  requestId: string;
  scenesToGenerate: any[];
  sceneIndices: number[];
  allScenes: SceneData[];
  environmentMap: Map<string, StoryEnvironment>;
  characterDescriptionMap: Map<string, CharacterData>;
  characterRegistry: Map<string, NormalizedCharacter>;
  spec: any;
  userPlan: any;
  userId: string;
  assetStorage: any;
  imageDomain: any;
  // Files API: pre-uploaded turnaround sheets (characterName -> UploadedFile)
  uploadedFileMap?: Map<string, UploadedFile>;
  // System instruction for the whole story (built once, reused per scene)
  imageSystemInstruction?: string;
  // When true: after first successful image, mark request completed and continue in background
  enableEarlyCompletion?: boolean;
}

/**
 * Pre-upload turnaround sheets to the Files API and build the system instruction.
 * Called before the image loop so that turnaround sheets are uploaded once and
 * reused via file URI across all scenes. The cacheKey ensures consecutive stories
 * with the same characters don't re-upload the same files.
 */
async function prepareFilesApiAndSystemInstruction(params: {
  characterDescriptionMap: Map<string, CharacterData>;
  imageDomain: any;
  assetStorage: any;
  spec: any;
  userStyle?: string;
}): Promise<{ uploadedFileMap: Map<string, UploadedFile>; imageSystemInstruction: string }> {
  const { characterDescriptionMap, imageDomain, assetStorage, spec } = params;
  const uploadedFileMap = new Map<string, UploadedFile>();

  const filesApiEnabled = config.nanoBanana?.enableFilesApi === true;

  if (filesApiEnabled) {
    logger.info('Files API enabled — pre-uploading turnaround sheets');

    for (const char of characterDescriptionMap.values()) {
      const charType = (char as any).type;
      // Pre-upload turnarounds for imaginary AND child profiles
      if (charType !== 'imaginary' && charType !== 'child') continue;

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
          logger.warn({ characterName: char.name, storagePath }, 'Asset not found for Files API upload');
          continue;
        }

        const mimeType = storagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const displayName = `turnaround_${char.name}`;

        const uploaded = await imageDomain.uploadReferenceFile(buffer, mimeType, displayName, storagePath);
        if (uploaded) {
          uploadedFileMap.set(char.name, uploaded);
          logger.info({
            characterName: char.name,
            charType,
            fileUri: uploaded.uri,
            fileName: uploaded.name,
          }, 'Turnaround sheet uploaded to Files API');
        }
      } catch (err) {
        // Non-fatal: fall back to inline base64 for this character
        logger.warn({ characterName: char.name, error: err }, 'Failed to upload turnaround to Files API — will use inline base64');
      }
    }

    logger.info({ uploadedCount: uploadedFileMap.size }, 'Files API pre-upload complete');
  }

  // Build slim system instruction (role + art style + format + quality only)
  // Character roster and environment are now per-scene in the user prompt
  const allCharacters = Array.from(characterDescriptionMap.values());
  const hasReferenceImage = (c: CharacterData) => {
    const charType = (c as any).type;
    return charType === 'imaginary' || (charType === 'child' && (
      !!(c as any).turnaroundSheet?.url || (c.referencePhotos && c.referencePhotos.length > 0)
    ));
  };
  const hasAnyReferences = allCharacters.some(hasReferenceImage);

  const style = params.userStyle || imageDomain.buildImageStyle(spec.ageGroup);

  const imageSystemInstruction = buildImageSystemInstruction({
    style,
    ageGroup: spec.ageGroup,
    hasReferences: hasAnyReferences,
    hasEnvironmentReference: config.image.enableEnvironmentReference,
    scenarioCardId: spec.scenarioCard?.id,
  });

  logger.info({
    systemInstructionLength: imageSystemInstruction.length,
    filesApiEnabled,
    uploadedFiles: uploadedFileMap.size,
  }, 'Image system instruction and Files API preparation complete');

  return { uploadedFileMap, imageSystemInstruction };
}

/**
 * Shared image generation loop.
 * Runs sequential image generation with character-aware reference tracking.
 * Used by processStoryImages (standard and continuation).
 */
async function runImageGenerationLoop(params: ImageGenerationLoopParams): Promise<void> {
  const {
    storyId, requestId, scenesToGenerate, sceneIndices, allScenes,
    environmentMap, characterDescriptionMap, characterRegistry,
    spec, userPlan, userId,
    assetStorage, imageDomain,
    uploadedFileMap, imageSystemInstruction,
    enableEarlyCompletion = false,
  } = params;

  const parallelStreams = config.image.parallelStreams;

  if (enableEarlyCompletion) {
    const sceneIdsWithImages = scenesToGenerate.map((s: any) => s.sceneId);
    const existingStory = await getStoryRepository().findById(storyId);
    const existingMetadata = (existingStory?.metadata as Record<string, unknown>) || {};
    await getStoryRepository().updateStory(storyId, {
      metadata: { ...existingMetadata, sceneIdsWithImages, imageGenerationComplete: false },
    });
  }

  let firstImageDone = false;
  const failedScenes: Array<{ sceneId: number; errorMessage: string }> = [];

  // Pre-check which scenes already have images (for retry recovery)
  const existingScenes = await getSceneRepository().findByStoryId(storyId);
  const scenesWithImages = new Set(
    existingScenes
      .filter(s => s.imageUrl != null && s.imageUrl !== '')
      .map(s => s.sceneId)
  );

  if (scenesWithImages.size > 0) {
    logger.info({
      storyId,
      alreadyGenerated: Array.from(scenesWithImages),
      total: scenesToGenerate.length,
    }, 'Found scenes with existing images — will skip on retry');
  }

  let progressCount = 0;

  // Pre-compute scenes per environment (for single-scene skip optimization)
  const scenesPerEnvironment = new Map<string, number>();
  for (const scene of scenesToGenerate) {
    const envId = (scene as any).environmentId;
    if (envId) {
      scenesPerEnvironment.set(envId, (scenesPerEnvironment.get(envId) || 0) + 1);
    }
  }

  // On-demand environment image map (shared across parallel scene iterations)
  const environmentImageMap = new Map<string, EnvImageData>();
  const envImagePending = new Map<string, Promise<EnvImageData | null>>();
  const envUploadedFileMap = new Map<string, UploadedFile>();
  const envUploadPending = new Map<string, Promise<UploadedFile | null>>();

  await runWithConcurrencyLimit(scenesToGenerate, parallelStreams, async (scene, i) => {
    // Skip scenes that already have images (retry recovery)
    if (scenesWithImages.has(scene.sceneId)) {
      logger.info({ storyId, sceneId: scene.sceneId }, 'Skipping scene — image already exists');
      if (enableEarlyCompletion && !firstImageDone) {
        firstImageDone = true;
        await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
        await getStoryRepository().updateRequest(requestId, { status: 'completed', storyId });
      }
      progressCount++;
      await updateTaskProgress(
        requestId,
        STORY_TASKS.GENERATING_IMAGES,
        progressCount / scenesToGenerate.length,
        { current: progressCount, total: scenesToGenerate.length },
      );
      return;
    }

    // Extract character names: prefer structured cameraComposition, fall back to old data
    const sceneVisualRaw = scene.sceneVisual || migrateVisualPrompt(scene);
    let sceneCharacters: string[];
    if (sceneVisualRaw?.cameraComposition && typeof sceneVisualRaw.cameraComposition !== 'string') {
      sceneCharacters = flattenCameraComposition(sceneVisualRaw.cameraComposition).characterNames;
    } else {
      // Backward compat: old stories with string cameraComposition or no sceneVisual
      sceneCharacters = (scene as any).visualCharacters || (scene as any).characters || [];
    }
    const normalizedCharacters = matchCharacterNames(sceneCharacters, characterRegistry);

    const currentEnvironmentId = (scene as any).environmentId as string | undefined;
    const currentEnvironment = currentEnvironmentId ? environmentMap.get(currentEnvironmentId) : undefined;

    // Get or create environment image (on-demand, with cache and deduplication for parallel scenes)
    let envImageData: EnvImageData | null = null;
    if (config.image.enableEnvironmentReference && currentEnvironmentId && currentEnvironment) {
      const cached = environmentImageMap.get(currentEnvironmentId);
      if (cached) {
        envImageData = cached;
      } else {
        let pending = envImagePending.get(currentEnvironmentId);
        if (!pending) {
          pending = getOrCreateEnvironmentImage({
            storyId,
            userId,
            storyEnvironmentId: currentEnvironmentId,
            environment: currentEnvironment,
            assetStorage,
            scenarioCardId: spec.scenarioCard?.id,
            scenesUsingThisEnv: scenesPerEnvironment.get(currentEnvironmentId) ?? 0,
          });
          envImagePending.set(currentEnvironmentId, pending);
        }
        envImageData = await pending;
        if (envImageData) {
          environmentImageMap.set(currentEnvironmentId, envImageData);
        }
        envImagePending.delete(currentEnvironmentId);
      }
    }

    // Upload env image to Files API when enabled (reuse across scenes)
    if (envImageData && config.nanoBanana?.enableFilesApi === true) {
      let uploaded = envUploadedFileMap.get(currentEnvironmentId!);
      if (!uploaded) {
        let upPending = envUploadPending.get(currentEnvironmentId!);
        if (!upPending) {
          upPending = (async () => {
            try {
              const buffer = Buffer.from(envImageData!.base64, 'base64');
              const result = await imageDomain.uploadReferenceFile(
                buffer,
                envImageData!.mimeType,
                `env_${currentEnvironmentId}`,
                envImageData!.storagePath,
              );
              return result;
            } catch (err) {
              logger.warn({ err, storyEnvironmentId: currentEnvironmentId }, 'Failed to upload env image to Files API');
              return null;
            }
          })();
          envUploadPending.set(currentEnvironmentId!, upPending);
        }
        uploaded = await upPending;
        if (uploaded) envUploadedFileMap.set(currentEnvironmentId!, uploaded);
        envUploadPending.delete(currentEnvironmentId!);
      }
      if (uploaded) {
        envImageData = { ...envImageData, fileUri: uploaded.uri };
        environmentImageMap.set(currentEnvironmentId!, envImageData);
      }
    }

    // Get imaginary friend reference photo paths
    const imaginaryFriendPaths = getImaginaryFriendReferencePaths(
      normalizedCharacters, characterDescriptionMap,
    );

    // Get child profile reference photo paths
    const childReferencePaths = getChildReferencePaths(
      normalizedCharacters, characterDescriptionMap,
    );

    // Load imaginary friend reference photos with metadata (turnarounds only — no scene refs)
      // When Files API is enabled, use pre-uploaded fileUri instead of inline base64
      const imaginaryFriendData = await Promise.all(
        imaginaryFriendPaths.map(async (url, index) => {
          // Match character by turnaround sheet URL first, then fallback to referencePhotos
          const char = Array.from(characterDescriptionMap.values()).find(c => {
            const turnaround = (c as any).turnaroundSheet as { url?: string } | null | undefined;
            if (turnaround?.url && extractStoragePath(turnaround.url) === url) return true;
            return c.referencePhotos?.some(p => extractStoragePath(p.url) === url);
          });
          const isTurnaround = !!(char && (char as any).turnaroundSheet?.url &&
            extractStoragePath((char as any).turnaroundSheet.url) === url);
          const charName = char?.name || 'unknown';

          // Check if we have a pre-uploaded file for this character
          const uploaded = uploadedFileMap?.get(charName);
          if (uploaded) {
            logger.debug({ charName, fileUri: uploaded.uri }, 'Using Files API URI for imaginary friend reference');
            return {
              base64: '', // Not needed when using fileUri
              mimeType: uploaded.mimeType,
              fileUri: uploaded.uri,
              source: 'imaginary_friend',
              characterName: charName,
              type: 'imaginary',
              isTurnaround,
              url,
              index: index + 1,
            };
          }

          // Fallback: load inline base64
          const data = await loadReferenceImageData(url, assetStorage);
          return {
            ...data,
            source: 'imaginary_friend',
            characterName: charName,
            type: 'imaginary',
            isTurnaround,
            url,
            index: index + 1,
          };
        })
      );

      // Load child reference photos with metadata (turnaround or raw photos)
      const childReferenceData = await Promise.all(
        childReferencePaths.map(async (url, index) => {
          const char = Array.from(characterDescriptionMap.values()).find(c => {
            const turnaround = (c as any).turnaroundSheet as { url?: string } | null | undefined;
            if (turnaround?.url && extractStoragePath(turnaround.url) === url) return true;
            return c.referencePhotos?.some(p => extractStoragePath(p.url) === url);
          });
          const isTurnaround = !!(char && (char as any).turnaroundSheet?.url &&
            extractStoragePath((char as any).turnaroundSheet.url) === url);
          const charName = char?.name || 'unknown';

          // Check if we have a pre-uploaded file for this child
          const uploaded = uploadedFileMap?.get(charName);
          if (uploaded) {
            logger.debug({ charName, fileUri: uploaded.uri }, 'Using Files API URI for child reference');
            return {
              base64: '',
              mimeType: uploaded.mimeType,
              fileUri: uploaded.uri,
              source: 'child_reference',
              characterName: charName,
              type: 'child_reference',
              isTurnaround,
              url,
              index: index + 1,
            };
          }

          // Fallback: load inline base64
          const data = await loadReferenceImageData(url, assetStorage);
          return {
            ...data,
            source: 'child_reference',
            characterName: charName,
            type: 'child_reference',
            isTurnaround,
            url,
            index: index + 1,
          };
        })
      );

    // Prepend environment reference when available (content/layout only, not style)
    const envRefEntry = envImageData
      ? [{
          base64: envImageData.base64,
          mimeType: envImageData.mimeType,
          fileUri: envImageData.fileUri,
          source: 'environment',
          type: 'environment_reference',
          imageIndex: 1,
        }]
      : [];
    // Only turnarounds + child refs (no scene references)
    const referenceImageDataArray = [...envRefEntry, ...childReferenceData, ...imaginaryFriendData];

    // Build imageIndexMap (env ref = 1, then characters)
    const imageIndexMap = new Map<string, number>();
    let imageIndex = 1;
    for (const ref of referenceImageDataArray) {
      if ((ref as any).source === 'environment') {
        (ref as any).imageIndex = imageIndex;
        imageIndex++;
        continue;
      }
      if ((ref as any).type === 'imaginary' || (ref as any).type === 'child_reference') {
        if ((ref as any).characterName && !imageIndexMap.has((ref as any).characterName)) {
          imageIndexMap.set((ref as any).characterName, imageIndex);
        }
      }
      (ref as any).imageIndex = imageIndex;
      imageIndex++;
    }

    const currentEnvironmentForLog = currentEnvironmentId ? environmentMap.get(currentEnvironmentId) : undefined;
    const characterOutfitsForLog = currentEnvironmentForLog?.characterOutfits;
    const characterOutfitKeysForLog = characterOutfitsForLog
      ? (typeof characterOutfitsForLog === 'string'
          ? Object.keys(parseCharacterOutfitsString(characterOutfitsForLog))
          : Object.keys(characterOutfitsForLog))
      : [];

    // Filter character descriptions to only include characters in THIS scene
    const sceneCharacterDescriptions = normalizedCharacters
      .map(normalized => characterDescriptionMap.get(normalized))
      .filter(Boolean) as CharacterData[];

    logger.info({
      storyId,
      sceneId: scene.sceneId,
      normalizedCharacters,
      totalReferenceCount: referenceImageDataArray.length,
      imageIndexMap: Object.fromEntries(imageIndexMap),
      hasCharacterOutfits: !!characterOutfitsForLog,
      characterOutfitKeys: characterOutfitKeysForLog,
    }, 'Generating scene image with references');

    try {
      // Compose enriched sceneVisual with environment + skipped scene context
      const composedSceneVisual = buildComposedSceneVisual({
        storyId,
        scene,
        sceneIndexInAll: sceneIndices[i],
        generatedIndices: sceneIndices,
        allScenes,
        environmentMap,
        hasEnvironmentImageRef: !!envImageData,
      });

      const enrichedScene: SceneData = { ...scene, sceneVisual: composedSceneVisual };

      const imageResult = await generateSceneImageWithReference(storyId, enrichedScene, {
        childProfile: spec.childProfile,
        characters: sceneCharacterDescriptions,
        userStyle: (spec as any).imageStyle,
        ageGroup: spec.ageGroup,
        scenarioCardId: spec.scenarioCard?.id,
        userPlan,
        userId,
        assetStorage,
        imageDomain,
        referenceImageDataArray,
        imageSystemInstruction,
        imageIndexMap,
        currentEnvironmentId,
        currentEnvironment,
      });

      if (enableEarlyCompletion && !firstImageDone) {
        firstImageDone = true;
        await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
        await getStoryRepository().updateRequest(requestId, { status: 'completed', storyId });
        logger.info({ requestId, storyId, sceneId: scene.sceneId }, 'First image done — request marked completed, continuing in background');
      }

      progressCount++;
      await updateTaskProgress(
        requestId,
        STORY_TASKS.GENERATING_IMAGES,
        progressCount / scenesToGenerate.length,
        { current: progressCount, total: scenesToGenerate.length },
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, storyId, sceneId: scene.sceneId }, 'Failed to generate scene image');
      failedScenes.push({ sceneId: scene.sceneId, errorMessage: errMsg });
      progressCount++;

      if (enableEarlyCompletion && !firstImageDone && i === 0) {
        throw error;
      }

      await updateTaskProgress(
        requestId,
        STORY_TASKS.GENERATING_IMAGES,
        progressCount / scenesToGenerate.length,
        { current: progressCount, total: scenesToGenerate.length },
      );
    }
  });

  if (enableEarlyCompletion) {
    const finalMetadata = (await getStoryRepository().findById(storyId))?.metadata as Record<string, unknown> | null;
    await getStoryRepository().updateStory(storyId, {
      metadata: {
        ...(finalMetadata || {}),
        imageGenerationComplete: true,
        ...(failedScenes.length > 0 && { failedScenes }),
      },
    });
  }
}

/**
 * Process story images for a request (runs in image queue after text+validation)
 * Loads all necessary context from intermediateData and generates scene images sequentially.
 */
export async function processStoryImages(requestId: string): Promise<void> {
  const startTime = Date.now();
  
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
    
    if (!storyId || !text) {
      throw new Error(`Missing storyId or text in intermediateData for request ${requestId}`);
    }
    
    // Get services
    const imageDomain = getImageDomainService();
    const assetStorage = getAssetStorageService();
    const coefficients = await getGenerationCoefficients();
    const userPlan = await getPlanFeatures(request.userId);
    
    // Task: Generate Scene Images (Sequential for character-aware reference tracking - M9)
    // Note: Only first image is tracked in progress, rest continue in background after story is marked complete
    await startTask(requestId, STORY_TASKS.GENERATING_IMAGES, {
      estimatedMs: coefficients.avgMsPerImage, // Only first image counts toward progress
    });
    
    let scenesToGenerate: any[] = [];
    if (config.image.skipGeneration) {
      logger.info({ requestId }, 'Image generation skipped (SKIP_IMAGE_GENERATION=true)');
    } else {
    const imagesPerStory = userPlan.imagesPerStory || 0;
    const totalScenes = text.scenes.length;
    const sceneIds = config.features.useDirectorFlow
      ? getIllustrationBlockStartSceneIds(totalScenes, imagesPerStory)
      : getIllustrationSceneIds(totalScenes, imagesPerStory);
    scenesToGenerate = sceneIds
      .map((id) => text.scenes.find((s: any) => s.sceneId === id))
      .filter(Boolean);
    const sceneIndices = scenesToGenerate.map((s: any) =>
      text.scenes.findIndex((sc: any) => sc.sceneId === s.sceneId)
    );

    logger.info({
      requestId,
      storyId,
      totalScenes,
      imagesPerStory,
      selectedSceneIds: scenesToGenerate.map((s: any) => s.sceneId),
      sceneCount: scenesToGenerate.length,
    }, 'Selected scenes for image generation');

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
      // Use phonetic fallback so user "Emilia" matches Director "Емілія" (turnaround refs preserved)
      const characterDescriptionMap = new Map<string, CharacterData>();
      for (const [normalized, char] of characterRegistry.entries()) {
        const fullChar = mergedCharacters.find((c: any) =>
          normalizeCharacterName(c.name) === normalized ||
          toPhoneticKey(c.name) === toPhoneticKey(normalized)
        );
        if (fullChar) {
          characterDescriptionMap.set(normalized, fullChar);
        }
      }
      
      logger.info({
        storyId, requestId,
        totalCharactersInStory: characterDescriptionMap.size,
      }, 'Character registry built for image generation');

      // ── Sequential Image Pipeline (first image = 100%, rest in background) ──
      const sceneIdsWithImages = scenesToGenerate.map(s => s.sceneId);

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

      // 2. Identify LLM characters needing turnarounds (generated on-demand per scene)
      const llmCharsNeedingTurnaround: Array<{ charId: string; name: string; description: string; normalizedName: string }> = [];
      const llmTurnaroundReady = new Set<string>();

      for (const char of mergedCharacters as any[]) {
        if (char.source !== 'llm_generated' || !char.id) continue;
        const normalized = normalizeCharacterName(char.name);
        if (char._llmHasTurnaround) {
          llmTurnaroundReady.add(normalized);
        } else {
          llmCharsNeedingTurnaround.push({
            charId: char.id,
            name: char.name,
            description: char.appearance || char.description || char.name,
            normalizedName: normalized,
          });
        }
      }

      // 3. Build system instruction and prepare Files API uploads for existing turnarounds
      const { uploadedFileMap, imageSystemInstruction } = await prepareFilesApiAndSystemInstruction({
        characterDescriptionMap,
        imageDomain,
        assetStorage,
        spec,
        userStyle: (spec as any).imageStyle,
      });

      // 3.1. Pre-generate all LLM turnarounds in parallel (before scene loop)
      const parallelStreams = config.image.parallelStreams;
      await runWithConcurrencyLimit(llmCharsNeedingTurnaround, parallelStreams, async (llmChar) => {
        if (llmTurnaroundReady.has(llmChar.normalizedName)) return;
        try {
          logger.info({ characterId: llmChar.charId, name: llmChar.name }, 'Generating turnaround (pre-phase)');
          const result = await generateLlmCharacterTurnaround({
            characterId: llmChar.charId,
            userId: request.userId,
            characterName: llmChar.name,
            characterDescription: llmChar.description,
            imageStyle: (spec as any).imageStyle,
            storyId,
          });

          const charData = characterDescriptionMap.get(llmChar.normalizedName);
          if (charData) {
            (charData as any).turnaroundSheet = { url: result.url, generatedAt: result.generatedAt, sourcePhotoUrl: result.sourcePhotoUrl };
          }

          if (config.nanoBanana?.enableFilesApi === true && charData) {
            try {
              const turnaroundPath = extractStoragePath(result.url);
              const buffer = await assetStorage.getAssetByPath(turnaroundPath);
              if (buffer) {
                const mimeType = turnaroundPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
                const uploaded = await imageDomain.uploadReferenceFile(buffer, mimeType, `turnaround_${llmChar.name}`, turnaroundPath);
                if (uploaded) {
                  uploadedFileMap.set(llmChar.name, uploaded);
                }
              }
            } catch (uploadErr) {
              logger.warn({ err: uploadErr, characterName: llmChar.name }, 'Failed to upload LLM turnaround to Files API');
            }
          }

          llmTurnaroundReady.add(llmChar.normalizedName);
          logger.info({ characterId: llmChar.charId, name: llmChar.name }, 'Turnaround complete');
        } catch (err) {
          logger.error({ err, characterId: llmChar.charId, name: llmChar.name }, 'Failed to generate turnaround');
        }
      });

      const existingScenes = await getSceneRepository().findByStoryId(storyId);
      const scenesWithImages = new Set(
        existingScenes
          .filter(s => s.imageUrl != null && s.imageUrl !== '')
          .map(s => s.sceneId)
      );

      // Pre-compute scenes per environment (for single-scene skip optimization)
      const scenesPerEnvironment = new Map<string, number>();
      for (const s of scenesToGenerate) {
        const envId = (s as any).environmentId;
        if (envId) {
          scenesPerEnvironment.set(envId, (scenesPerEnvironment.get(envId) || 0) + 1);
        }
      }

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
      const envUploadedFileMap = new Map<string, UploadedFile>();
      const envUploadPending = new Map<string, Promise<UploadedFile | null>>();

      const failedScenes: Array<{ sceneId: number; errorMessage: string }> = [];
      let firstImageDone = false;
      let imagesCompletedCount = 0; // Track generated images for 2-image early completion threshold
      let progressCount = 0; // Track processed scenes for progress (including skipped)

      // 4. Parallel loop: generate scene images (turnarounds already done)
      await runWithConcurrencyLimit(scenesToGenerate, parallelStreams, async (scene, i) => {
        const sceneIndex = sceneIndices[i];

        if (scenesWithImages.has(scene.sceneId)) {
          logger.info({ storyId, sceneId: scene.sceneId }, 'Skipping scene — image already exists');
          progressCount++;
          await updateTaskProgress(requestId, STORY_TASKS.GENERATING_IMAGES, progressCount / scenesToGenerate.length, { current: progressCount, total: scenesToGenerate.length });
          if (!firstImageDone) firstImageDone = true;
          return;
        }

        const sceneVisualRaw = scene.sceneVisual || migrateVisualPrompt(scene);
        let sceneCharNames: string[];
        if (sceneVisualRaw?.cameraComposition && typeof sceneVisualRaw.cameraComposition !== 'string') {
          sceneCharNames = flattenCameraComposition(sceneVisualRaw.cameraComposition).characterNames;
        } else {
          sceneCharNames = (scene as any).characters || [];
        }
        const normalizedCharacters = matchCharacterNames(sceneCharNames, characterRegistry);

        const currentEnvironmentId = (scene as any).environmentId as string | undefined;
        const currentEnvironment = currentEnvironmentId ? environmentMap.get(currentEnvironmentId) : undefined;

        // Get or create environment image (on-demand, with cache and deduplication for parallel scenes)
        let envImageData: EnvImageData | null = null;
        if (config.image.enableEnvironmentReference && currentEnvironmentId && currentEnvironment) {
          const cached = environmentImageMap.get(currentEnvironmentId);
          if (cached) {
            envImageData = cached;
          } else {
            let pending = envImagePending.get(currentEnvironmentId);
            if (!pending) {
              pending = getOrCreateEnvironmentImage({
                storyId,
                userId: request.userId,
                storyEnvironmentId: currentEnvironmentId,
                environment: currentEnvironment,
                assetStorage,
                scenarioCardId: spec.scenarioCard?.id,
                scenesUsingThisEnv: scenesPerEnvironment.get(currentEnvironmentId) ?? 0,
                ...(previousStoryIds.length > 0 && { previousStoryIds }),
              });
              envImagePending.set(currentEnvironmentId, pending);
            }
            envImageData = await pending;
            if (envImageData) {
              environmentImageMap.set(currentEnvironmentId, envImageData);
            }
            envImagePending.delete(currentEnvironmentId);
          }
        }

        // Upload env image to Files API when enabled (reuse across scenes)
        if (envImageData && config.nanoBanana?.enableFilesApi === true) {
          let uploaded = envUploadedFileMap.get(currentEnvironmentId!);
          if (!uploaded) {
            let upPending = envUploadPending.get(currentEnvironmentId!);
            if (!upPending) {
              upPending = (async () => {
                try {
                  const buffer = Buffer.from(envImageData!.base64, 'base64');
                  const result = await imageDomain.uploadReferenceFile(
                    buffer,
                    envImageData!.mimeType,
                    `env_${currentEnvironmentId}`,
                    envImageData!.storagePath,
                  );
                  return result;
                } catch (err) {
                  logger.warn({ err, storyEnvironmentId: currentEnvironmentId }, 'Failed to upload env image to Files API');
                  return null;
                }
              })();
              envUploadPending.set(currentEnvironmentId!, upPending);
            }
            uploaded = await upPending;
            if (uploaded) envUploadedFileMap.set(currentEnvironmentId!, uploaded);
            envUploadPending.delete(currentEnvironmentId!);
          }
          if (uploaded) {
            envImageData = { ...envImageData, fileUri: uploaded.uri };
            environmentImageMap.set(currentEnvironmentId!, envImageData);
          }
        }

        // Build reference image data (env ref first, then turnarounds)
        const imaginaryFriendPaths = getImaginaryFriendReferencePaths(normalizedCharacters, characterDescriptionMap);
        const childReferencePaths = getChildReferencePaths(normalizedCharacters, characterDescriptionMap);

        const imaginaryFriendData = await Promise.all(
          imaginaryFriendPaths.map(async (url, index) => {
            const char = Array.from(characterDescriptionMap.values()).find(c => {
              const turnaround = (c as any).turnaroundSheet as { url?: string } | null | undefined;
              if (turnaround?.url && extractStoragePath(turnaround.url) === url) return true;
              return c.referencePhotos?.some(p => extractStoragePath(p.url) === url);
            });
            const isTurnaround = !!(char && (char as any).turnaroundSheet?.url && extractStoragePath((char as any).turnaroundSheet.url) === url);
            const charName = char?.name || 'unknown';
            const uploaded = uploadedFileMap?.get(charName);
            if (uploaded) {
              return { base64: '', mimeType: uploaded.mimeType, fileUri: uploaded.uri, source: 'imaginary_friend', characterName: charName, type: 'imaginary', isTurnaround, url, index: index + 1 };
            }
            const data = await loadReferenceImageData(url, assetStorage);
            return { ...data, source: 'imaginary_friend', characterName: charName, type: 'imaginary', isTurnaround, url, index: index + 1 };
          })
        );

        const childReferenceData = await Promise.all(
          childReferencePaths.map(async (url, index) => {
            const char = Array.from(characterDescriptionMap.values()).find(c => {
              const turnaround = (c as any).turnaroundSheet as { url?: string } | null | undefined;
              if (turnaround?.url && extractStoragePath(turnaround.url) === url) return true;
              return c.referencePhotos?.some(p => extractStoragePath(p.url) === url);
            });
            const isTurnaround = !!(char && (char as any).turnaroundSheet?.url && extractStoragePath((char as any).turnaroundSheet.url) === url);
            const charName = char?.name || 'unknown';
            const uploaded = uploadedFileMap?.get(charName);
            if (uploaded) {
              return { base64: '', mimeType: uploaded.mimeType, fileUri: uploaded.uri, source: 'child_reference', characterName: charName, type: 'child_reference', isTurnaround, url, index: index + 1 };
            }
            const data = await loadReferenceImageData(url, assetStorage);
            return { ...data, source: 'child_reference', characterName: charName, type: 'child_reference', isTurnaround, url, index: index + 1 };
          })
        );

        // Child references (real photos) have higher priority than LLM-generated turnarounds
        // Prepend environment reference when available (content/layout only, not style)
        const envRefEntry = envImageData
          ? [{
              base64: envImageData.base64,
              mimeType: envImageData.mimeType,
              fileUri: envImageData.fileUri,
              source: 'environment',
              type: 'environment_reference',
              imageIndex: 1,
            }]
          : [];
        const referenceImageDataArray = [...envRefEntry, ...childReferenceData, ...imaginaryFriendData];

        // Build imageIndexMap (env ref = 1, then characters)
        const imageIndexMap = new Map<string, number>();
        let imageIndex = 1;
        for (const ref of referenceImageDataArray) {
          if ((ref as any).source === 'environment') {
            (ref as any).imageIndex = imageIndex;
            imageIndex++;
            continue;
          }
          if ((ref as any).type === 'imaginary' || (ref as any).type === 'child_reference') {
            if ((ref as any).characterName && !imageIndexMap.has((ref as any).characterName)) {
              imageIndexMap.set((ref as any).characterName, imageIndex);
            }
          }
          (ref as any).imageIndex = imageIndex;
          imageIndex++;
        }

        const sceneCharacterDescriptions = normalizedCharacters
          .map(normalized => characterDescriptionMap.get(normalized))
          .filter(Boolean) as CharacterData[];

        const characterOutfitsRaw = currentEnvironment?.characterOutfits;
        const characterOutfits = characterOutfitsRaw
          ? (typeof characterOutfitsRaw === 'string'
              ? parseCharacterOutfitsString(characterOutfitsRaw)
              : characterOutfitsRaw)
          : undefined;

        logger.info({
          storyId,
          sceneId: scene.sceneId,
          index: i + 1,
          total: scenesToGenerate.length,
          hasCharacterOutfits: !!characterOutfits,
          characterOutfitKeys: characterOutfits ? Object.keys(characterOutfits) : [],
        }, 'Generating scene image (sequential)');

        try {
          const composedSceneVisual = buildComposedSceneVisual({
            storyId, scene, sceneIndexInAll: sceneIndex,
            generatedIndices: sceneIndices, allScenes: text.scenes as SceneData[],
            environmentMap,
            hasEnvironmentImageRef: !!envImageData,
          });
          const enrichedScene: SceneData = { ...scene, sceneVisual: composedSceneVisual };

          const imageResult = await generateSceneImageWithReference(storyId, enrichedScene, {
            childProfile: spec.childProfile,
            characters: sceneCharacterDescriptions,
            userStyle: (spec as any).imageStyle,
            ageGroup: spec.ageGroup,
            scenarioCardId: spec.scenarioCard?.id,
            userPlan, userId: request.userId, assetStorage, imageDomain,
            referenceImageDataArray, imageSystemInstruction, imageIndexMap,
            currentEnvironmentId, currentEnvironment,
          });

          // Update imageUrl in scenes table for progressive loading
          const sceneRecord = await getSceneRepository().findByStoryAndSceneId(storyId, scene.sceneId);
          if (sceneRecord && imageResult.imageUrl) {
            await getSceneRepository().update(sceneRecord.id, {
              imageUrl: imageResult.imageUrl,
            });
          }

          // Count completed images
          imagesCompletedCount++;
          progressCount++;

          // Mark request as completed after 2 images (instead of 1)
          if (!firstImageDone && imagesCompletedCount >= 2) {
            firstImageDone = true;
            await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
            await getStoryRepository().updateRequest(requestId, {
              status: 'completed',
              storyId,
            });
            logger.info({ requestId, storyId, sceneId: scene.sceneId, imagesCompletedCount },
              'First two images done — request marked completed, continuing in background');
          }

          await updateTaskProgress(requestId, STORY_TASKS.GENERATING_IMAGES, progressCount / scenesToGenerate.length, { current: progressCount, total: scenesToGenerate.length });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ err: error, storyId, sceneId: scene.sceneId }, 'Failed to generate scene image');
          failedScenes.push({ sceneId: scene.sceneId, errorMessage: errMsg });
          progressCount++;

          if (!firstImageDone && i === 0) {
            throw error;
          }

          await updateTaskProgress(requestId, STORY_TASKS.GENERATING_IMAGES, progressCount / scenesToGenerate.length, { current: progressCount, total: scenesToGenerate.length });
        }
      });

      // 5. Mark image generation complete, persist failed scenes
      const finalMetadata = (await getStoryRepository().findById(storyId))?.metadata as Record<string, unknown> | null;
      await getStoryRepository().updateStory(storyId, {
        metadata: {
          ...(finalMetadata || {}),
          imageGenerationComplete: true,
          ...(failedScenes.length > 0 && { failedScenes }),
        },
      });

      logger.info({ storyId, totalGenerated: scenesToGenerate.length - failedScenes.length, failedCount: failedScenes.length }, 'Parallel image pipeline complete');
    }
    
    } // end if !skipGeneration

    if (config.image.skipGeneration || scenesToGenerate.length === 0) {
      await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
      await getStoryRepository().updateRequest(requestId, { status: 'completed', storyId });
      
      // Mark image generation as complete even when skipped/no scenes
      const finalMetadata = (await getStoryRepository().findById(storyId))?.metadata as Record<string, unknown> | null;
      await getStoryRepository().updateStory(storyId, {
        metadata: {
          ...(finalMetadata || {}),
          imageGenerationComplete: true,
        },
      });
    }

    // Clear intermediate data now that all images are generated (or skipped)
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: null
    });

    logger.info({ requestId, storyId, checkpoint: 'cleared', duration: Date.now() - startTime }, 'Image generation completed');
    
  } catch (error) {
    logger.error({ 
      error, 
      requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Story image generation failed');
    
    const failedRequest = await getStoryRepository().findRequestById(requestId);
    const failedCheckpoints = (failedRequest?.intermediateData as Record<string, unknown>) || {};
    await getStoryRepository().updateRequest(requestId, {
      status: 'failed',
      storyId: (failedRequest?.storyId ?? failedCheckpoints.storyId) as string | undefined, // So client can retry images only
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
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

  const ids = new Set<string>();
  for (const storyId of series.storyIds as string[]) {
    const story = await getStoryRepository().findById(storyId);
    if (story) {
      const meta = story.metadata as Record<string, any> | null;
      if (meta?.plotExampleId) ids.add(meta.plotExampleId);
    }
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

  const ids = new Set<string>();
  for (const storyId of series.storyIds as string[]) {
    const story = await getStoryRepository().findById(storyId);
    if (story) {
      const meta = story.metadata as Record<string, any> | null;
      if (meta?.worldRuleId) ids.add(meta.worldRuleId);
    }
  }
  return ids;
}

/** Continuation context passed when generating a series continuation */
export interface ContinuationContext {
  previousOutlines: Array<{ title: string; moral: string; scenes: Array<{ setting: string; goal: string }> }>;
  requiredCharacters: CharacterData[];
  optionalCharacters: CharacterData[];
  usedPlots: string[];
}

/**
 * Build story spec from request data
 * When continuationContext is provided, uses requiredCharacters + optionalCharacters instead of loading from request
 */
async function buildStorySpec(
  request: StoryRequestData,
  options?: { continuationContext?: ContinuationContext }
): Promise<{
  spec: StorySpec & { childProfile?: ChildProfileData };
  selectedCharacters: CharacterData[];
  optionalCharacters?: CharacterData[];
  chosenPlotExampleId?: string;
  chosenWorldRuleId?: string;
}> {
  try {
    // Get child profile if specified
    let childName: string | undefined = undefined; // Will be set if child is a character
    let ageGroup = '4-5'; // Default age group
    let childProfile: ChildProfileData | null = null;
    let selectedCharacters: CharacterData[] = [];
    let optionalCharacters: CharacterData[] | undefined;

    let allCharacters: CharacterData[];

    // Continuation mode: use characters from continuationContext
    if (options?.continuationContext) {
      const { requiredCharacters, optionalCharacters: optChars } = options.continuationContext;
      selectedCharacters = [...requiredCharacters];
      optionalCharacters = optChars && optChars.length > 0 ? optChars : undefined;
      allCharacters = [...requiredCharacters, ...(optionalCharacters || [])];
      logger.info({
        requestId: request.id,
        requiredCount: requiredCharacters.length,
        optionalCount: optionalCharacters?.length ?? 0,
        totalCharacters: allCharacters.length,
      }, 'Using continuation context characters');
    } else {
      // Standard mode: load selected characters from request
      if (request.selectedCharacters && request.selectedCharacters.length > 0) {
        const userCharacters = await getCharacterRepository().findByIds(request.userId, request.selectedCharacters);

        selectedCharacters = userCharacters
        .filter(c => c.name) // Only include characters with valid name
        .map(c => ({
          id: c.id,
          name: c.name,
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
      
      logger.info({
        requestId: request.id,
        userId: request.userId,
        selectedCharacterIds: request.selectedCharacters,
        loadedCharactersCount: selectedCharacters.length,
        charactersWithReferences: selectedCharacters.filter(c => c.referencePhotos && c.referencePhotos.length > 0).map(c => ({
          name: c.name,
          type: c.type,
          referencePhotoCount: c.referencePhotos?.length || 0
        }))
      }, 'Loaded selected characters (independent of childProfileId)');
      }
    }

    if (request.childProfileId) {
      const profile = await getChildProfileRepository().findById(request.childProfileId, request.userId);
      
      if (profile && profile.name && profile.birthDate) {
        // DON'T set childName here - will be set later based on allCharacters
        ageGroup = calculateAgeGroup(new Date(profile.birthDate));
        childProfile = profile as ChildProfileData;
      } else {
        logger.warn({ 
          childProfileId: request.childProfileId, 
          profileFound: !!profile,
          hasName: profile?.name,
          hasBirthDate: profile?.birthDate
        }, 'Child profile incomplete or not found, using defaults');
      }
    }
    
    // Load selected children if provided (to include as characters in story)
    let selectedChildrenData: CharacterData[] = [];
    if (request.selectedChildren && request.selectedChildren.length > 0) {
      const childProfilesToInclude = await getChildProfileRepository().findByIds(request.userId, request.selectedChildren);
      
      selectedChildrenData = childProfilesToInclude
        .filter(c => c.name)
        .map(c => ({
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
      
      logger.info({ 
        requestId: request.id,
        selectedChildrenCount: selectedChildrenData.length,
        childNames: selectedChildrenData.map(c => c.name)
      }, 'Loaded selected children as characters');
    }

    // Merge all characters (user characters + selected children) — only in standard mode
    if (!options?.continuationContext) {
      allCharacters = [...selectedCharacters, ...selectedChildrenData];
    }

    // Set childName ONLY if child profile is included as a character in the story
    if (childProfile && request.childProfileId) {
      const isChildInStory = allCharacters.some(
        c => c.type === 'child' && c.id === request.childProfileId
      );
      
      childName = isChildInStory ? childProfile.name : undefined;
      
      logger.info({
        childProfileId: request.childProfileId,
        isChildInStory,
        childName: childName || 'not-set',
        totalCharacters: allCharacters.length
      }, 'Child profile processed for story generation');
    }
    
    // Log detailed character information including reference photos
    const characterDetails = allCharacters.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      hasReferencePhotos: !!(c.referencePhotos && c.referencePhotos.length > 0),
      referencePhotoCount: c.referencePhotos?.length || 0,
      referencePhotoTypes: c.referencePhotos?.map((p: any) => {
        // Extract type from URL or path if possible
        const url = p.url || '';
        if (url.includes('imaginary_friend') || url.includes('character')) {
          return 'imaginary_friend';
        }
        return 'unknown';
      }) || []
    }));
    
    logger.info({ 
      requestId: request.id,
      userCharactersCount: selectedCharacters.length,
      selectedChildrenCount: selectedChildrenData.length,
      totalCharacters: allCharacters.length,
      characterNames: allCharacters.map(c => c.name),
      selectedCharactersInput: request.selectedCharacters,
      selectedChildrenInput: request.selectedChildren,
      characterDetails,
      charactersWithReferences: characterDetails.filter(c => c.hasReferencePhotos).map(c => ({
        name: c.name,
        type: c.type,
        referencePhotoCount: c.referencePhotoCount
      }))
    }, 'Characters prepared for story generation - detailed info with reference photos');
    
    // Load scenario card if specified
    // Load scenario card with guidance
    let scenarioCard: { id: string; name: string; description: string; promptGuidance?: string } | undefined;
    if (request.scenarioCardId) {
      const card = await getDictionaryRepository().findScenarioCardById(request.scenarioCardId);
      
      if (card) {
        // Load translations for name and description (use story language for prompts)
        const translations = await getDictionaryRepository().findTranslations(
          'scenario_card',
          [card.id],
          request.storyLanguage
        );
        
        const nameTranslation = translations.find(t => t.fieldName === 'name');
        const descTranslation = translations.find(t => t.fieldName === 'description');
        
        scenarioCard = {
          id: card.id,
          name: nameTranslation?.value || card.nameKey, // Use translated name or fallback to key
          description: descTranslation?.value || card.descriptionKey, // Use translated description or fallback
          promptGuidance: card.promptGuidance,
        };
      }
    }
    
    // Select a random plot example to replace generic promptGuidance
    let chosenPlotExampleId: string | undefined;
    let chosenWorldRuleId: string | undefined;
    let worldRule: { name: string; description: string } | undefined;
    if (scenarioCard) {
      const plotExamples = await getDictionaryRepository().findActivePlotExamples(scenarioCard.id);
      if (plotExamples.length > 0) {
        let available = plotExamples;

        // Series dedup: exclude examples used in previous parts
        const intermediateData = (request as any).intermediateData as Record<string, any> | undefined;
        const seriesId = intermediateData?.seriesId as string | undefined;
        if (seriesId) {
          const usedIds = await getUsedPlotExampleIds(seriesId);
          const filtered = plotExamples.filter(e => !usedIds.has(e.id));
          if (filtered.length > 0) available = filtered;
          logger.info({
            seriesId,
            totalExamples: plotExamples.length,
            usedCount: usedIds.size,
            availableAfterDedup: available.length,
          }, 'Plot example series dedup');
        }

        const picked = available[Math.floor(Math.random() * available.length)];
        scenarioCard.promptGuidance = picked.setting;
        chosenPlotExampleId = picked.id;

        logger.info({
          scenarioCardId: scenarioCard.id,
          plotExampleId: picked.id,
          setting: picked.setting.substring(0, 80) + '...',
        }, 'Selected plot example for story generation');
      }

      // Select a random world rule for the scenario
      const worldRules = await getDictionaryRepository().findActiveWorldRules(scenarioCard.id);
      if (worldRules.length > 0) {
        let availableRules = worldRules;
        const intermediateData = (request as any).intermediateData as Record<string, any> | undefined;
        const seriesId = intermediateData?.seriesId as string | undefined;
        if (seriesId) {
          const usedWorldRuleIds = await getUsedWorldRuleIds(seriesId);
          const filtered = worldRules.filter(r => !usedWorldRuleIds.has(r.id));
          if (filtered.length > 0) availableRules = filtered;
          logger.info({
            seriesId,
            totalRules: worldRules.length,
            usedCount: usedWorldRuleIds.size,
            availableAfterDedup: availableRules.length,
          }, 'World rule series dedup');
        }
        const pickedRule = availableRules[Math.floor(Math.random() * availableRules.length)];
        chosenWorldRuleId = pickedRule.id;
        worldRule = { name: pickedRule.name, description: pickedRule.description };
        logger.info({
          scenarioCardId: scenarioCard.id,
          worldRuleId: pickedRule.id,
          worldRuleName: pickedRule.name,
        }, 'Selected world rule for story generation');
      }
    }
    
    // Load goal with guidance and translations
    let goalWithGuidance: { slug: string; name: string; promptGuidance: string } | undefined;
    if (request.goal) {
      const goalData = await getDictionaryRepository().findGoalBySlug(request.goal);
      
      if (goalData) {
        // Load translations for goal name (use story language for prompts)
        const translations = await getDictionaryRepository().findTranslations(
          'story_goal',
          [goalData.slug],
          request.storyLanguage
        );
        
        const goalNameTranslation = translations.find(t => t.fieldName === 'name');
        
        goalWithGuidance = {
          slug: goalData.slug,
          name: goalNameTranslation?.value || goalData.slug, // Use translated name or fallback to slug
          promptGuidance: goalData.promptGuidance
        };
      }
    }
    
    // Build policy profile
    const policyProfile = await buildPolicyProfile(ageGroup, request.storyLanguage);
    
    const spec: StorySpec & { childProfile?: ChildProfileData } = {
      language: request.storyLanguage,
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
    };
    
    // Verify characters are included (especially for instant mode)
    logger.debug({
      requestId: request.id,
      specCharacterCount: allCharacters.length,
      characterNames: allCharacters.map(c => c.name),
      isInstantMode: request.selectedCharacters?.length > 0 && !request.selectedChildren?.length,
      imageStyle: spec.imageStyle
    }, 'Story spec created with characters');
    
    return {
      spec,
      selectedCharacters: allCharacters,
      ...(optionalCharacters !== undefined && { optionalCharacters }),
      chosenPlotExampleId,
      chosenWorldRuleId,
    };
  } catch (error) {
    logger.error({ 
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId: request.id,
      childProfileId: request.childProfileId
    }, 'Failed to build story spec');
    throw error;
  }
}

/**
 * Merge user-provided characters with LLM-generated characters
 * User characters with referencePhotos take priority
 */
function mergeCharacters(userCharacters: CharacterData[], llmCharacters: any[]): CharacterData[] {
  // Validate inputs
  if (!Array.isArray(userCharacters)) {
    logger.warn('userCharacters is not an array, using empty array');
    userCharacters = [];
  }
  
  if (!Array.isArray(llmCharacters)) {
    logger.warn('llmCharacters is not an array, using empty array');
    llmCharacters = [];
  }
  
  // Filter out invalid user characters early
  const validUserCharacters = userCharacters.filter(c => 
    c && typeof c === 'object' && c.name && typeof c.name === 'string'
  );
  
  if (validUserCharacters.length < userCharacters.length) {
    logger.warn({ 
      original: userCharacters.length, 
      valid: validUserCharacters.length 
    }, 'Filtered out invalid user characters');
  }
  
  const merged: CharacterData[] = [...validUserCharacters];
  
  for (const llmChar of llmCharacters) {
    // Validate LLM character structure
    if (!llmChar || typeof llmChar.name !== 'string') {
      logger.warn({ llmChar }, 'Invalid LLM character structure, skipping');
      continue;
    }
    
    const existingChar = merged.find(
      c => c.name && typeof c.name === 'string' && c.name.toLowerCase() === llmChar.name.toLowerCase()
    );
    
    if (!existingChar) {
      // LLM added a new character (e.g., friend, companion)
      merged.push({
        name: llmChar.name,
        type: mapLlmTypeToCharacterType(llmChar.type || 'unknown'),
        appearance: llmChar.appearance,
        personality: llmChar.personality,
        role: llmChar.role,
        source: 'llm_generated',
      });
    } else if (!existingChar.referencePhotos || existingChar.referencePhotos.length === 0) {
      // User specified character but without photos - enrich with LLM description
      existingChar.appearance = llmChar.appearance;
      existingChar.source = 'user_enriched_by_llm';
    }
    // If user provided referencePhotos, keep user version as-is
  }
  
  return merged;
}

// ────────────────────────────────────────────────────────
// LLM Character Persistence & Hybrid Deduplication
// ────────────────────────────────────────────────────────

const EMBEDDING_SIMILARITY_THRESHOLD = 0.85;

/**
 * Map LLM-provided character types to existing system character types.
 */
function mapLlmTypeToCharacterType(llmType: string): string {
  switch (llmType) {
    case 'human': return 'person';
    case 'animal': return 'animal';
    case 'creature': return 'imaginary';
    case 'object': return 'imaginary';
    default: return 'imaginary';
  }
}

/**
 * Find or create a hidden character record for an LLM-generated character.
 * Uses a 2-tier matching strategy:
 *   Tier 1: Phonetic name + type (instant, free)
 *   Tier 2: Embedding cosine similarity (1 API call)
 * If no match, creates a new hidden character.
 */
async function findOrCreateLlmCharacter(
  userId: string,
  llmChar: { name: string; type: string; description: string },
  existingHiddenChars: any[],
): Promise<{ characterId: string; isNew: boolean; hasTurnaround: boolean }> {
  const mappedType = mapLlmTypeToCharacterType(llmChar.type);

  // TIER 1: Exact name + type match (free, instant)
  const phoneticKey = toPhoneticKey(llmChar.name);
  const nameMatch = existingHiddenChars.find(c =>
    toPhoneticKey(c.name) === phoneticKey && c.type === mappedType
  );
  if (nameMatch) {
    logger.info({ matched: nameMatch.name, by: 'name' }, 'LLM char matched by name');
    return { characterId: nameMatch.id, isNew: false, hasTurnaround: !!nameMatch.turnaroundSheet };
  }

  // TIER 2: Embedding similarity (1 API call, ~150ms)
  const sameTypeChars = existingHiddenChars.filter(
    c => c.type === mappedType && c.descriptionEmbedding
  );
  let newEmbedding: number[] | null = null;
  if (sameTypeChars.length > 0) {
    try {
      newEmbedding = await generateEmbedding(llmChar.description);
      let bestMatch: { char: any; score: number } | null = null;
      for (const c of sameTypeChars) {
        const score = cosineSimilarity(newEmbedding, c.descriptionEmbedding as number[]);
        if (score > EMBEDDING_SIMILARITY_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { char: c, score };
        }
      }
      if (bestMatch) {
        logger.info({
          matched: bestMatch.char.name, newName: llmChar.name,
          score: bestMatch.score.toFixed(3), by: 'embedding',
        }, 'LLM char matched by visual similarity');
        return {
          characterId: bestMatch.char.id,
          isNew: false,
          hasTurnaround: !!bestMatch.char.turnaroundSheet,
        };
      }
    } catch (err) {
      logger.warn({ err, llmCharName: llmChar.name }, 'Embedding generation failed, skipping Tier 2 dedup');
    }
  }

  // No match — create new hidden character
  const embedding = newEmbedding || await generateEmbedding(llmChar.description).catch(() => null);

  const created = await getCharacterRepository().create({
    userId,
    name: llmChar.name,
    type: mappedType,
    description: llmChar.description,
    aiGeneratedDescription: llmChar.description,
    descriptionEmbedding: embedding,
    isHidden: true,
  } as any);

  // Add to in-memory cache so subsequent chars in same batch can dedup against it
  existingHiddenChars.push(created);

  return { characterId: created.id, isNew: true, hasTurnaround: false };
}

/**
 * Process LLM characters: persist, dedup, and return enriched character data.
 * Returns a map of LLM character name -> { characterId, isNew, hasTurnaround }.
 */
async function persistLlmCharacters(
  userId: string,
  llmCharacters: Array<{ name: string; type: string; description: string; role?: string; personality?: any; appearance?: string }>,
  userCharacterNames: Set<string>,
): Promise<Map<string, { characterId: string; isNew: boolean; hasTurnaround: boolean }>> {
  const results = new Map<string, { characterId: string; isNew: boolean; hasTurnaround: boolean }>();

  // Filter to only LLM-only characters (not user-provided ones)
  const purelyLlmChars = llmCharacters.filter(c => {
    const normalized = normalizeCharacterName(c.name);
    return !userCharacterNames.has(normalized);
  });

  if (purelyLlmChars.length === 0) return results;

  const existingHiddenChars = await getCharacterRepository().findHiddenByUser(userId);
  logger.info({
    userId,
    existingHiddenCount: existingHiddenChars.length,
    llmCharCount: purelyLlmChars.length,
  }, 'Starting LLM character persistence with hybrid dedup');

  for (const llmChar of purelyLlmChars) {
    const result = await findOrCreateLlmCharacter(userId, llmChar, existingHiddenChars);
    results.set(normalizeCharacterName(llmChar.name), result);
    logger.info({
      llmCharName: llmChar.name,
      characterId: result.characterId,
      isNew: result.isNew,
      hasTurnaround: result.hasTurnaround,
    }, 'LLM character processed');
  }

  return results;
}


/**
 * Generate scene image
 */
async function generateSceneImage(
  storyId: string,
  scene: SceneData,
  context: ImageGenerationContext
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Get scene record from database
    const sceneRecord = await getSceneRepository().findByStoryAndSceneId(storyId, scene.sceneId);
    
    if (!sceneRecord) {
      throw new Error(`Scene ${scene.sceneId} not found for story ${storyId}`);
    }
    
    // Determine generation mode
    const hasUserReferencePhotos = context.characters.some(
      c => c.referencePhotos && c.referencePhotos.length > 0
    );
    
    const useReferences = hasUserReferencePhotos;
    const generationMode = useReferences ? 'with_references' : 'without_references';
    
    // Extract reference images if using reference mode
    let referenceImages: Array<{ url: string; characterName: string; subjectDescription?: string }> = [];
    if (useReferences) {
      referenceImages = await extractReferenceImagesForScene(
        storyId,
        scene,
        context.characters,
        context.childProfile
      );
    }
    
    // Generate scene illustration
    const usageContext = { userId: context.userId, storyId };
    const image = await context.imageDomain.generateSceneIllustration(
      {
        sceneVisual: scene.sceneVisual,
        visualPrompt: scene.visualPrompt, // Fallback for old stories
        sceneId: scene.sceneId,
        sceneText: scene.text,
        ageGroup: context.ageGroup,
        style: context.userStyle || context.imageDomain.buildImageStyle(context.ageGroup),
        characters: context.characters,
        referenceImages: referenceImages,
        mode: generationMode,
      },
      { onUsage: (u) => recordUsage(u, usageContext) }
    );
    
    // Upload original image to storage
    const uploadResult = await context.assetStorage.uploadAsset({
      data: image.imageData,
      mimeType: image.mimeType,
      userId: context.userId,
      storyId: storyId,
      sceneId: sceneRecord.id,
      assetType: 'image',
    });
    
    // Generate and upload thumbnail (672×384px JPEG)
    let thumbnailPath: string | null = null;
    let thumbnailUrl: string | null = null;
    
    try {
      // Convert image data to buffer if needed
      const imageBuffer = Buffer.isBuffer(image.imageData) 
        ? image.imageData 
        : Buffer.from(image.imageData, 'base64');
      
      // Generate thumbnail
      const thumbnailBuffer = await context.assetStorage.generateThumbnail(imageBuffer);
      
      // Create thumbnail path (same directory, add _thumb suffix before extension)
      thumbnailPath = uploadResult.storagePath.replace(/(\.[^.]+)$/, '_thumb.jpg');
      
      // Write thumbnail file directly to local storage
      const fs = await import('fs/promises');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), 'uploads', thumbnailPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, thumbnailBuffer);
      
      thumbnailUrl = `/api/v1/assets/${thumbnailPath}`;
      
      logger.debug({ 
        originalPath: uploadResult.storagePath, 
        thumbnailPath,
        thumbnailSize: thumbnailBuffer.length,
      }, 'Thumbnail generated and saved');
    } catch (error) {
      logger.error({ err: error, storyId, sceneId: scene.sceneId }, 'Failed to generate thumbnail, continuing without it');
      // Continue without thumbnail - not a critical failure
    }
    
    // Save asset to database with thumbnail paths
    await getAssetRepository().create({
      storyId: storyId,
      sceneId: sceneRecord.id,
      assetType: 'image',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      thumbnailPath: thumbnailPath,
      thumbnailUrl: thumbnailUrl,
      mimeType: image.mimeType,
      fileSizeBytes: uploadResult.fileSizeBytes,
      generationParams: {
        mode: generationMode,
        style: context.userStyle,
        hasSceneVisual: !!scene.sceneVisual,
        referenceImageCount: referenceImages.length,
      },
      generationTimeMs: Date.now() - startTime,
      status: 'completed',
    });
    
    logger.info({ 
      storyId, 
      sceneId: scene.sceneId,
      mode: generationMode,
      duration: Date.now() - startTime
    }, 'Scene image generated');
    
  } catch (error) {
    logger.error({ 
      err: error, 
      storyId,
      sceneId: scene.sceneId,
    }, 'Failed to generate scene image');
    throw error;
  }
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
  scenesUsingThisEnv?: number;
  /** For continuation: check previous parts in series for cached env image */
  previousStoryIds?: string[];
}): Promise<EnvImageData | null> {
  if (!config.image.enableEnvironmentReference) return null;

  const { storyId, userId, storyEnvironmentId, environment, assetStorage, scenarioCardId, scenesUsingThisEnv, previousStoryIds } = params;
  const envCacheRepo = getEnvironmentImageCacheRepository();
  const storyEnvRepo = getStoryEnvironmentCacheRepository();
  const threshold = config.image.environmentEmbeddingSimilarityThreshold;

  // 1. Check story_environment_cache (current story)
  const existing = await storyEnvRepo.getByStoryAndEnvId(storyId, storyEnvironmentId);
  if (existing) {
    const cached = await envCacheRepo.getById(existing.cacheId);
    if (cached) {
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
        if (cached) {
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
  const embedding = await generateEmbedding(environment.description);
  const similar = await envCacheRepo.findSimilar(embedding, threshold);
  if (similar) {
    const buffer = await assetStorage.getAssetByPath(similar.storagePath);
    await storyEnvRepo.upsert(storyId, storyEnvironmentId, similar.id);
    return {
      base64: buffer.toString('base64'),
      mimeType: 'image/png',
      storagePath: similar.storagePath,
    };
  }

  // 2.5. Skip Imagen 4 for single-scene environments (cost optimization)
  if (
    config.image.skipEnvImageForSingleScene &&
    scenesUsingThisEnv === 1
  ) {
    logger.info(
      { storyEnvironmentId, scenesUsingThisEnv },
      'Skipping Imagen 4 for single-scene environment'
    );
    return null;
  }

  // 3. Generate with Imagen 4 Fast
  try {
    const envProvider = getEnvironmentImageProvider();
    const prompt = buildEnvironmentImagePrompt({ environment, scenarioCardId });
    const usageContext = { userId: userId ?? null, storyId };
    const result = await envProvider.generateImage({
      prompt,
      aspectRatio: '16:9',
      onUsage: (u) => recordUsage(u, usageContext),
      operation: 'image_generate',
    });

    const buffer = Buffer.isBuffer(result.imageData) ? result.imageData : Buffer.from(result.imageData as string, 'base64');
    const cacheId = crypto.randomUUID();
    const { storagePath } = await assetStorage.saveEnvironmentCacheImage(cacheId, buffer, result.mimeType);

    await envCacheRepo.create({
      id: cacheId,
      description: environment.description,
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
    logger.warn({ err, storyEnvironmentId }, 'Environment image generation failed, falling back to text');
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
    logger.info({
      storyId,
      sceneId: scene.sceneId,
      environmentId,
      deltaOnly: true,
    }, 'Composed setting: delta only (env image reference)');
  } else if (environment?.description) {
    // Merge: base description + scene-specific delta
    const basePart = environment.description.trim();
    const deltaPart = composedSetting.trim();
    
    if (deltaPart) {
      composedSetting = `${basePart} ${deltaPart}`;
    } else {
      composedSetting = basePart;
    }
    
    logger.info({
      storyId,
      sceneId: scene.sceneId,
      environmentId,
      baseLength: basePart.length,
      deltaLength: deltaPart.length,
      composedLength: composedSetting.length,
    }, 'Composed setting: base + delta');
  } else {
    logger.warn({
      storyId,
      sceneId: scene.sceneId,
      environmentId,
    }, 'No environment description found - using scene setting only');
  }

  const composed: SceneVisual = {
    setting: composedSetting,
    cameraComposition: sceneVisual.cameraComposition,
    lighting: sceneVisual.lighting,
  };

  logger.info({
    storyId,
    sceneId: scene.sceneId,
    environmentId: environmentId || 'MISSING',
    environmentName: environment?.name || 'N/A',
    hasEnvironmentDescription: !!environment?.description,
    finalSettingLength: composed.setting.length,
  }, 'Composed sceneVisual with base+delta');

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

/**
 * Check if an error is a retryable generation failure (IMAGE_OTHER, content blocked).
 * These are transient failures where the model refused to generate but might succeed on retry.
 */
function isRetryableGenerationError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('image_other') ||
           msg.includes('no image content in candidate') ||
           msg.includes('parts array contains no inlinedata') ||
           msg.includes('blocked or filtered');
  }
  return false;
}

/**
 * Wrapper that retries image generation on transient failures (IMAGE_OTHER).
 * Returns the generated image or throws after all retries are exhausted.
 */
async function generateWithRetry(
  imageDomain: ReturnType<typeof getImageDomainService>,
  generateRequest: Parameters<ReturnType<typeof getImageDomainService>['generateSceneWithReference']>[0],
  context: { storyId: string; sceneId: number; userId?: string },
): Promise<ReturnType<ReturnType<typeof getImageDomainService>['generateSceneWithReference']>> {
  const usageContext = { userId: context.userId ?? null, storyId: context.storyId };
  const onUsage = (u: UsageMetadata) => recordUsage(u, usageContext);
  let lastError: unknown;
  for (let retry = 0; retry <= MAX_GENERATION_RETRIES; retry++) {
    try {
      return await imageDomain.generateSceneWithReference(generateRequest, { onUsage });
    } catch (error) {
      lastError = error;
      if (isRetryableGenerationError(error) && retry < MAX_GENERATION_RETRIES) {
        logger.warn({
          storyId: context.storyId,
          sceneId: context.sceneId,
          retry: retry + 1,
          maxRetries: MAX_GENERATION_RETRIES,
          error: error instanceof Error ? error.message : String(error),
        }, 'Generation failed (IMAGE_OTHER), retrying after delay');
        await new Promise(resolve => setTimeout(resolve, GENERATION_RETRY_DELAY_MS));
        continue;
      }
      // Non-retryable error or retries exhausted
      throw error;
    }
  }
  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Generate image for a single scene using reference-based approach (Nano Banana Pro)
 * Returns the image data (base64) for use as reference in subsequent scenes
 */
/**
 * Generate scene image with character-aware reference selection
 * Determine if ALL validation issues can be fixed by editing the image,
 * or if a full regeneration is needed.
 *
 * Editable: text removal, duplicate removal, color fix, outfit fix, unexpected character removal.
 * NOT editable: character missing or unrecognizable (fundamentally different design).
 */
function isEditableValidationFailure(validation: ImageValidationResult): boolean {
  if (validation.hasRenderingArtifacts) return false;
  for (const c of validation.characters) {
    if (!c.found) return false;
    if ((c.recognizableScore ?? 1) < 0.5) return false;
  }
  return true;
}

/**
 * Compute a 0-100 quality score from image validation results.
 * Higher = better. Score = 100 minus penalties per character and global penalties.
 */
function computeValidationScore(validation: ImageValidationResult): number {
  const p = config.image.validationScoring;
  let score = 100;
  for (const c of validation.characters) {
    const recScore = c.recognizableScore ?? 1;
    score -= (1 - recScore) * p.recognizablePenalty;
    if (c.duplicated) score -= p.duplicatedPenalty;
    if (!c.matchesColors) score -= p.matchesColorsPenalty;
    if (!c.matchesOutfit) score -= p.matchesOutfitPenalty;
  }
  if (validation.hasTextOrLetters) score -= p.textPenalty;
  if (validation.hasUnexpectedCharacters) score -= p.unexpectedCharsPenalty;
  if (validation.hasRenderingArtifacts) score -= p.artifactsPenalty;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

interface ScoredAttempt {
  imageData: Buffer;
  mimeType: string;
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
  score: number;
  validation: ImageValidationResult;
  attempt: number;
}

/**
 * Save a rejected (validation-failed) image to disk for debugging.
 * Stored in: uploads/{env}/{userId}/{storyId}/rejected/scene{sceneId}_attempt{attempt}.png
 * Fire-and-forget: errors are logged but never thrown.
 */
async function saveRejectedImage(params: {
  imageData: string | Buffer;
  mimeType: string;
  storyId: string;
  sceneId: number;
  attempt: number;
  userId: string;
  feedback: string;
}): Promise<void> {
  try {
    const ext = params.mimeType.includes('png') ? '.png' : '.jpg';
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    const rejectedDir = path.join(
      uploadsDir,
      config.nodeEnv,
      params.userId,
      params.storyId,
      'rejected',
    );
    await fs.mkdir(rejectedDir, { recursive: true });

    const filename = `scene${params.sceneId}_attempt${params.attempt}${ext}`;
    const filePath = path.join(rejectedDir, filename);
    const buffer = typeof params.imageData === 'string'
      ? Buffer.from(params.imageData, 'base64')
      : params.imageData;
    await fs.writeFile(filePath, buffer);

    // Also save feedback as a companion text file
    const feedbackPath = path.join(rejectedDir, `scene${params.sceneId}_attempt${params.attempt}.txt`);
    await fs.writeFile(feedbackPath, params.feedback, 'utf-8');

    logger.debug({
      storyId: params.storyId,
      sceneId: params.sceneId,
      attempt: params.attempt,
      filePath,
      size: buffer.length,
    }, 'Rejected image saved for debugging');
  } catch (err) {
    logger.warn({
      err: err instanceof Error ? err.message : String(err),
      storyId: params.storyId,
      sceneId: params.sceneId,
      attempt: params.attempt,
    }, 'Failed to save rejected image (non-fatal)');
  }
}

/**
 * Resolve character outfits for image generation.
 * New: outfit from environment.characterOutfits (per-environment, string or legacy Record).
 * Fallback: old stories with scene.characterOutfits or scene.sceneVisual.characterOutfits.
 */
function resolveCharacterOutfits(
  scene: SceneData,
  context: { currentEnvironment?: { id: string; characterOutfits?: string | Record<string, string> } }
): Record<string, string> | undefined {
  const co = context.currentEnvironment?.characterOutfits;
  if (co) {
    if (typeof co === 'string') return parseCharacterOutfitsString(co);
    return co;
  }
  return (scene.sceneVisual as any)?.characterOutfits ?? (scene as any).characterOutfits;
}

/**
 * Supports multiple reference images for better character consistency (M9)
 * Returns image data plus scene DB ID and URL for reference tracking
 */
async function generateSceneImageWithReference(
  storyId: string,
  scene: SceneData,
  context: ImageGenerationContext & { 
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
  }
): Promise<{ base64: string; mimeType: string; sceneDbId: string; imageUrl: string }> {
  const startTime = Date.now();
  
  try {
    // Get scene record from database
    const sceneRecord = await getSceneRepository().findByStoryAndSceneId(storyId, scene.sceneId);
    
    if (!sceneRecord) {
      throw new Error(`Scene ${scene.sceneId} not found for story ${storyId}`);
    }
    
    // Build character descriptions from AI analysis
    // Prefer English translation (descriptionEn) for better image generation results
    const characterDescriptions = context.characters.map(char => ({
      name: char.name,
      detailedDescription: (char as any).descriptionEn
        || (char as any).aiGeneratedDescription
        || char.appearance
        || char.description
        || `${char.name}`,
      clothing: (char as any).clothing,
      distinctiveFeatures: (char as any).distinctiveFeatures
    }));
    
    // Add child profile as character ONLY if child is included in story characters
    // Check if child profile is in the characters array (would have type: 'child')
    const childIsCharacter = context.characters.some(
      c => c.type === 'child' && c.id === context.childProfile?.id
    );

    if (context.childProfile && childIsCharacter) {
      characterDescriptions.unshift({
        name: context.childProfile.name,
        detailedDescription: (context.childProfile as any).descriptionEn || (context.childProfile as any).aiGeneratedDescription || `${context.childProfile.name}`,
        clothing: (context.childProfile as any).clothing,
        distinctiveFeatures: (context.childProfile as any).distinctiveFeatures
      });
      
      logger.debug({
        storyId,
        sceneId: scene.sceneId,
        childName: context.childProfile.name
      }, 'Added child profile to character descriptions for image generation');
    }
    
    // Build reference images array with Google Asset Graph numbered labels
    const referenceImagesArray = context.referenceImageDataArray?.map((ref, index) => {
      const refSource = (ref as any).source;
      const refImageIndex = (ref as any).imageIndex ?? (index + 1);
      const meta: ReferenceMetadata = {
        imageNumber: index + 1,
        imageIndex: refImageIndex,
        source: refSource === 'environment' ? 'environment' : (refSource === 'imaginary_friend' || refSource === 'child_reference') ? refSource : 'previous_scene',
        characterName: (ref as any).characterName || 'unknown',
        currentEnvironmentId: context.currentEnvironmentId,
      };

      if (refSource === 'environment') {
        // No extra meta for env ref
      } else if ((ref as any).type === 'imaginary' || (ref as any).type === 'child_reference') {
        meta.isTurnaround = !!(ref as any).isTurnaround;
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
      };
    });
    
    // Classify characters into imaginary (with reference images) vs real-world (text description only)
    const imaginaryCharNameSet = new Set<string>();
    const imaginaryCharacters: Array<{ name: string; isTurnaround?: boolean }> = [];
    for (const ref of context.referenceImageDataArray || []) {
      if ((ref.type === 'imaginary' || ref.type === 'child_reference') && ref.characterName && !imaginaryCharNameSet.has(ref.characterName)) {
        imaginaryCharNameSet.add(ref.characterName);
        imaginaryCharacters.push({
          name: ref.characterName,
          isTurnaround: !!(ref as any).isTurnaround,
        });
      }
    }

    // Real-world characters: those NOT in the imaginary set
    const realWorldCharacters = characterDescriptions
      .filter(c => !imaginaryCharNameSet.has(c.name))
      .map(c => ({ name: c.name, description: c.detailedDescription }));

    // Generate scene image with optional validation + retry loop
    const hasEnvironmentImageRef = context.referenceImageDataArray?.some(
      (r: any) => r.source === 'environment'
    ) ?? false;

    const generateRequest = {
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
      currentEnvironment: context.currentEnvironment, // Per-scene environment for user prompt
      characterOutfits: resolveCharacterOutfits(scene, context), // Per-environment outfit; fallback to scene for old stories
      scenarioCardId: context.scenarioCardId,
      hasEnvironmentImageRef,
    };

    const maxAttempts = config.image.enableValidation
      ? config.image.validationMaxRetries + 1
      : 1;

    let image = await generateWithRetry(
      context.imageDomain, generateRequest, { storyId, sceneId: scene.sceneId, userId: context.userId },
    );
    let lastValidation: ImageValidationResult | null = null;

    // Validation + retry loop (only when ENABLE_IMAGE_VALIDATION=true)
    const scoredAttempts: ScoredAttempt[] = [];
    if (config.image.enableValidation && maxAttempts > 1) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Build expected characters from scene visual characters
        // Text descriptions (descriptionEn) are used for validation instead of reference images
        const expectedCharacters = buildExpectedCharactersForValidation(
          scene, context.characters, context.referenceImageDataArray,
        );

        // Collect turnaround sheet references for visual comparison during validation
        // Only turnaround sheets (not scene references) to keep token cost reasonable
        // Use base64 when available; use fileUri when Files API is on (same as image generation)
        const validationReferenceImages: Array<{ characterName: string; imageData?: string; fileUri?: string; mimeType: string }> = [];
        if (context.referenceImageDataArray) {
          for (const ref of context.referenceImageDataArray) {
            if ((ref as any).isTurnaround && (ref as any).characterName && ((ref as any).base64 || (ref as any).fileUri)) {
              if ((ref as any).base64) {
                validationReferenceImages.push({
                  characterName: (ref as any).characterName,
                  imageData: (ref as any).base64,
                  mimeType: (ref as any).mimeType || 'image/jpeg',
                });
              } else if ((ref as any).fileUri) {
                validationReferenceImages.push({
                  characterName: (ref as any).characterName,
                  fileUri: (ref as any).fileUri,
                  mimeType: (ref as any).mimeType || 'image/jpeg',
                });
              }
            }
          }
        }

        try {
          const imgUsageContext = { userId: context.userId, storyId };
          const validation = await context.imageDomain.validateGeneratedImage({
            imageData: image.imageData,
            mimeType: image.mimeType,
            expectedCharacters,
            sceneVisual: scene.sceneVisual || migrateVisualPrompt(scene),
            referenceImages: validationReferenceImages.length > 0 ? validationReferenceImages : undefined,
            onUsage: (u) => recordUsage(u, imgUsageContext),
          });

          lastValidation = validation;

          if (validation.isValid) {
            const score = computeValidationScore(validation);
            logger.info({
              storyId, sceneId: scene.sceneId, attempt, score,
              characterCount: validation.characterCount,
            }, `Image validation passed on attempt ${attempt} (score ${score}/100)`);
            break;
          }

          // Validation failed
          logger.warn({
            storyId, sceneId: scene.sceneId, attempt, maxAttempts,
            characterCount: validation.characterCount,
            expected: validation.expectedCharacterCount,
            hasUnexpectedCharacters: validation.hasUnexpectedCharacters,
            hasTextOrLetters: validation.hasTextOrLetters,
            hasRenderingArtifacts: validation.hasRenderingArtifacts,
            duplicatedCharacters: validation.characters
              .filter((c: ImageValidationResult['characters'][0]) => c.duplicated).map((c: ImageValidationResult['characters'][0]) => c.name),
            missingCharacters: validation.characters
              .filter((c: ImageValidationResult['characters'][0]) => !c.found).map((c: ImageValidationResult['characters'][0]) => c.name),
            feedback: validation.overallFeedback,
          }, 'Image validation failed');

          // Save rejected image for debugging (fire-and-forget)
          saveRejectedImage({
            imageData: image.imageData,
            mimeType: image.mimeType,
            storyId,
            sceneId: scene.sceneId,
            attempt,
            userId: context.userId,
            feedback: validation.overallFeedback || '',
          });

          // Score this attempt for best-pick selection
          const score = computeValidationScore(validation);
          scoredAttempts.push({
            imageData: Buffer.from(image.imageData),
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            format: image.format,
            score,
            validation,
            attempt,
          });
          logger.info({
            storyId, sceneId: scene.sceneId, attempt, score,
            characterScores: validation.characters.map((c: ImageValidationResult['characters'][0]) => ({
              name: c.name, found: c.found, recognizableScore: c.recognizableScore,
              duplicated: c.duplicated, matchesColors: c.matchesColors, matchesOutfit: c.matchesOutfit,
            })),
            hasTextOrLetters: validation.hasTextOrLetters,
            hasUnexpectedCharacters: validation.hasUnexpectedCharacters,
            hasRenderingArtifacts: validation.hasRenderingArtifacts,
          }, `Validation score for attempt ${attempt}: ${score}/100`);

          // High-score early exit: if score > 85, accept despite minor issues
          if (score > 85) {
            logger.info({
              storyId, sceneId: scene.sceneId, attempt, score,
            }, `Score ${score}/100 exceeds threshold (85) — accepting image despite minor validation issues`);
            break;
          }

          // Hybrid retry: edit if issues are fixable, regenerate if character is missing or unrecognizable
          if (attempt < maxAttempts) {
            const editable = isEditableValidationFailure(validation);

            if (editable) {
              // Issues are cosmetic (text, duplicates, colors, outfit) — try editing
              try {
                logger.info({
                  storyId, sceneId: scene.sceneId, attempt,
                  feedback: validation.overallFeedback,
                }, 'Issues are editable, attempting image edit');

                image = await context.imageDomain.editSceneImage({
                  originalImage: image.imageData,
                  originalMimeType: image.mimeType,
                  validationResult: validation,
                  sceneDescription: scene.sceneVisual
                    ? `${scene.sceneVisual.setting || ''} ${flattenCameraComposition(scene.sceneVisual.cameraComposition).text}`.trim()
                    : undefined,
                  aspectRatio: '16:9',
                  referenceImages: generateRequest.referenceImages,
                  systemInstruction: generateRequest.systemInstruction,
                  onUsage: (u) => recordUsage(u, imgUsageContext),
                });

                logger.info({
                  storyId, sceneId: scene.sceneId, attempt,
                }, 'Image edit succeeded, re-validating');
              } catch (editError) {
                logger.warn({
                  err: editError instanceof Error
                    ? { message: editError.message, name: editError.name }
                    : String(editError),
                  storyId, sceneId: scene.sceneId, attempt,
                }, 'Image edit failed, falling back to full regeneration');

                image = await generateWithRetry(
                  context.imageDomain, generateRequest, { storyId, sceneId: scene.sceneId, userId: context.userId },
                );
              }
            } else {
              // Character missing or unrecognizable — edit cannot fix, must regenerate from scratch
              logger.info({
                storyId, sceneId: scene.sceneId, attempt,
                missingCharacters: validation.characters
                  .filter((c: ImageValidationResult['characters'][0]) => !c.found)
                  .map((c: ImageValidationResult['characters'][0]) => c.name),
                unrecognizable: validation.characters
                  .filter((c: ImageValidationResult['characters'][0]) => (c.recognizableScore ?? 1) < 0.5)
                  .map((c: ImageValidationResult['characters'][0]) => c.name),
              }, 'Issues require full regeneration (missing or unrecognizable character)');

              image = await generateWithRetry(
                context.imageDomain, generateRequest, { storyId, sceneId: scene.sceneId, userId: context.userId },
              );
            }
          }
        } catch (validationError) {
          // Validation itself failed (e.g. Vision API error) — skip validation, use current image
          logger.error({
            err: validationError instanceof Error
              ? { message: validationError.message, name: validationError.name, stack: validationError.stack }
              : String(validationError),
            storyId, sceneId: scene.sceneId, attempt,
          }, 'Image validation error — skipping validation, using current image');
          break;
        }
      }

      // All attempts failed — pick the best-scored image instead of blindly using the last
      if (lastValidation && !lastValidation.isValid && scoredAttempts.length > 0) {
        const best = scoredAttempts.reduce((a, b) => a.score >= b.score ? a : b);
        const isLastAttempt = best.attempt === scoredAttempts[scoredAttempts.length - 1].attempt;

        if (!isLastAttempt) {
          image = {
            imageData: best.imageData,
            mimeType: best.mimeType,
            width: best.width,
            height: best.height,
            format: best.format,
          };
        }

        logger.warn({
          storyId, sceneId: scene.sceneId,
          totalAttempts: maxAttempts,
          selectedAttempt: best.attempt,
          selectedScore: best.score,
          allScores: scoredAttempts.map(a => ({
            attempt: a.attempt,
            score: a.score,
            characters: a.validation.characters.map(c => ({
              name: c.name, found: c.found, recognizableScore: c.recognizableScore,
              duplicated: c.duplicated, matchesColors: c.matchesColors, matchesOutfit: c.matchesOutfit,
            })),
          })),
          selectedFeedback: best.validation.overallFeedback,
          selectedBestInsteadOfLast: !isLastAttempt,
        }, `All ${maxAttempts} attempts failed validation — selected attempt ${best.attempt} (score ${best.score}/100)`);
      }
    }

    // Upload original image to storage
    const uploadResult = await context.assetStorage.uploadAsset({
      data: image.imageData,
      mimeType: image.mimeType,
      userId: context.userId,
      storyId: storyId,
      sceneId: sceneRecord.id,
      assetType: 'image',
    });
    
    // Generate and upload thumbnail (672×384px JPEG)
    let thumbnailPath: string | null = null;
    let thumbnailUrl: string | null = null;
    
    try {
      // Convert image data to buffer if needed
      const imageBuffer = Buffer.isBuffer(image.imageData) 
        ? image.imageData 
        : Buffer.from(image.imageData, 'base64');
      
      // Generate thumbnail
      const thumbnailBuffer = await context.assetStorage.generateThumbnail(imageBuffer);
      
      // Create thumbnail path (same directory, add _thumb suffix before extension)
      thumbnailPath = uploadResult.storagePath.replace(/(\.[^.]+)$/, '_thumb.jpg');
      
      // Write thumbnail file directly to local storage
      const fs = await import('fs/promises');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), 'uploads', thumbnailPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, thumbnailBuffer);
      
      thumbnailUrl = `/api/v1/assets/${thumbnailPath}`;
      
      logger.debug({ 
        originalPath: uploadResult.storagePath, 
        thumbnailPath,
        thumbnailSize: thumbnailBuffer.length,
      }, 'Thumbnail generated and saved');
    } catch (error) {
      logger.error({ err: error, storyId, sceneId: scene.sceneId }, 'Failed to generate thumbnail, continuing without it');
      // Continue without thumbnail - not a critical failure
    }
    
    // Save asset to database with thumbnail paths
    await getAssetRepository().create({
      storyId: storyId,
      sceneId: sceneRecord.id,
      assetType: 'image',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      thumbnailPath: thumbnailPath,
      thumbnailUrl: thumbnailUrl,
      mimeType: image.mimeType,
      fileSizeBytes: uploadResult.fileSizeBytes,
      generationParams: {
        mode: referenceImagesArray ? 'with_reference' : 'without_reference',
        referenceCount: referenceImagesArray?.length || 0,
        style: context.userStyle,
        hasSceneVisual: !!scene.sceneVisual,
        referenceImages: context.referenceImageDataArray?.map((ref, index) => ({
          index: index + 1,
          source: ref.source || 'unknown',
          characterName: ref.characterName || 'unknown',
          type: ref.type || 'unknown',
          sceneId: ref.sceneId,
          charactersPresent: (ref as any).charactersPresent || [],
          url: ref.url || 'unknown'
        })) || [],
      },
      generationTimeMs: Date.now() - startTime,
      status: 'completed',
    });
    
    logger.info({ 
      storyId, 
      sceneId: scene.sceneId,
      hasReferences: !!referenceImagesArray,
      referenceCount: referenceImagesArray?.length || 0,
      imageSizeBytes: image.imageData.length,
      duration: Date.now() - startTime
    }, 'Scene image generated with reference approach');
    
    // Return the base64 image data, mime type, scene DB ID, and storage path for reference tracking
    return {
      base64: image.imageData.toString('base64'),
      mimeType: image.mimeType,
      sceneDbId: sceneRecord.id,
      imageUrl: uploadResult.storagePath, // Use storagePath, not storageUrl
    };
    
  } catch (error) {
    logger.error({ 
      err: error, 
      storyId,
      sceneId: scene.sceneId,
    }, 'Failed to generate scene image');
    throw error;
  }
}

/**
 * Metadata for building character-aware reference instruction text.
 * Follows Google's "Image N: <role>" numbered label convention.
 */
interface ReferenceMetadata {
  imageNumber: number;
  source: 'imaginary_friend' | 'child_reference' | 'previous_scene' | 'environment';
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
}

/**
 * Build the expected character list for image validation.
 * Extracts characters from cameraComposition (single source of truth),
 * then maps them against character data to determine type (imaginary vs real-world).
 */
function buildExpectedCharactersForValidation(
  scene: SceneData,
  characters: CharacterData[],
  referenceImageDataArray?: Array<{ source?: string; characterName?: string }>,
): Array<{ name: string; isImaginary: boolean; description?: string }> {
  // Extract characters from cameraComposition (single source of truth)
  let sceneCharacterNames: string[];
  const sv = scene.sceneVisual;
  if (sv?.cameraComposition && typeof sv.cameraComposition !== 'string') {
    sceneCharacterNames = flattenCameraComposition(sv.cameraComposition).characterNames;
  } else {
    // Backward compat: old stories with string cameraComposition or no sceneVisual
    sceneCharacterNames = (scene as any).visualCharacters || (scene as any).characters || [];
  }

  // Build a set of imaginary character names from reference images
  const imaginaryNameSet = new Set(
    (referenceImageDataArray || [])
      .filter(r => r.source === 'imaginary_friend' && r.characterName)
      .map(r => r.characterName!.toLowerCase()),
  );

  return sceneCharacterNames.map(name => {
    const charData = characters.find(
      c => c.name.toLowerCase() === name.toLowerCase(),
    );
    const isImaginary = imaginaryNameSet.has(name.toLowerCase())
      || charData?.type === 'imaginary';

    // All characters (imaginary and real-world) get text descriptions for validation.
    // Validation is text-description-based — no reference images are sent.
    return {
      name,
      isImaginary,
      description: (charData as any)?.descriptionEn
        || (charData as any)?.aiGeneratedDescription
        || charData?.appearance
        || charData?.description
        || name,
    };
  });
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

  if (meta.source === 'imaginary_friend' || meta.source === 'child_reference') {
    const sheetType = meta.isTurnaround ? 'Character sheet' : 'Reference photo';
    return `${imgLabel}: ${sheetType} for "${meta.characterName}".`;
  }

  // Scene reference — env-aware label
  const charList = meta.charactersPresent?.length
    ? meta.charactersPresent.join(', ')
    : meta.characterName;

  const sameLocation = meta.currentEnvironmentId &&
    meta.referenceEnvironmentId &&
    meta.currentEnvironmentId === meta.referenceEnvironmentId;

  if (sameLocation) {
    return `${imgLabel}: Previous scene with ${charList} (same location).`;
  }

  return `${imgLabel}: Previous scene with ${charList} (different location — use for character reference only).`;
}

/**
 * Extract reference images for a specific scene
 * Optimized to avoid N+1 queries
 */
async function extractReferenceImagesForScene(
  storyId: string,
  scene: { text: string; sceneId: number },
  characters: CharacterReference[],
  childProfile?: { name: string; referencePhotos?: any[] }
): Promise<Array<{ url: string; characterName: string; subjectDescription?: string }>> {
  const references: Array<{ url: string; characterName: string; subjectDescription?: string }> = [];
  
  // Extract scene characters by name
  const sceneLower = scene.text.toLowerCase();
  const sceneCharacters = characters.filter(char =>
    char.name && typeof char.name === 'string' && sceneLower.includes(char.name.toLowerCase())
  );
  
  // Get user reference photos
  for (const char of sceneCharacters) {
    if (char.name && char.referencePhotos && char.referencePhotos.length > 0) {
      references.push({
        url: char.referencePhotos[0].url,
        characterName: char.name,
        subjectDescription: char.appearance || char.description || char.name,
      });
    }
  }
  
  // Add child profile reference if applicable — prefer turnaround sheet
  if (childProfile && childProfile.name) {
    const childTurnaround = (childProfile as any).turnaroundSheet as { url?: string } | null | undefined;
    if (childTurnaround?.url) {
      references.push({
        url: childTurnaround.url,
        characterName: childProfile.name,
        subjectDescription: (childProfile as any).descriptionEn || (childProfile as any).aiGeneratedDescription || childProfile.name,
      });
    } else if (childProfile.referencePhotos) {
      for (const photo of childProfile.referencePhotos) {
        if (photo.url) {
          references.push({
            url: photo.url,
            characterName: childProfile.name,
            subjectDescription: childProfile.name,
          });
        }
      }
    }
  }
  
  return references;
}

/**
 * Save generated story to database
 * M4: Also saves scenes to separate table and llmGeneratedCharacters to metadata
 * Uses transaction for atomic operations
 */
async function saveStory(
  request: { id: string; userId: string; childProfileId?: string | null; goal?: string | null },
  spec: StorySpec,
  text: { title: string; language: string; scenes: any[]; fullText: string; wordCount: number; characters?: any[] },
  mergedCharacters: CharacterReference[],
  generationTimeMs: number,
  timingData?: {
    textGenerationTimeMs?: number;
    validationTimeMs?: number;
    sceneCount?: number;
    fullTextLength?: number;
  },
  chosenPlotExampleId?: string,
  chosenWorldRuleId?: string,
): Promise<string> {
  try {
    // Calculate estimated read time (average 200 words per minute)
    const estimatedReadMinutes = Math.ceil(text.wordCount / 200);
    
    // Extract LLM-generated characters
    const llmCharacters = (text as any).characters || [];
    
    // Use transaction for atomic story creation
    const storyId = await getStoryRepository().transaction(async (tx) => {
      // Create story record with metadata
      const story = await getStoryRepository().createStory({
        userId: request.userId,
        childProfileId: request.childProfileId,
        storyRequestId: request.id,
        title: text.title,
        language: text.language,
        ageGroup: spec.ageGroup,
        moralTheme: request.goal,
        outline: null,
        scenes: text.scenes, // Keep for backward compatibility
        fullText: text.fullText,
        wordCount: text.wordCount,
        estimatedReadMinutes,
        modelVersion: 'gemini-2.5-flash',
        generationTimeMs,
        metadata: {
          llmGeneratedCharacters: llmCharacters,
          imageStyle: (spec as any).imageStyle,
          mergedCharacters: mergedCharacters,
          ...(chosenPlotExampleId && { plotExampleId: chosenPlotExampleId }),
          ...(chosenWorldRuleId && { worldRuleId: chosenWorldRuleId }),
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
          timestamp: new Date().toISOString()
        },
        isPublished: false,
        isFavorite: false
      }, tx);
      
      logger.info({ storyId: story.id }, 'Story saved to database');
      
      // Save all scenes in parallel within transaction
      await Promise.all(
        text.scenes.map(scene => {
          // Derive charactersPresent from cameraComposition.characters (single source of truth)
          const cam = scene.sceneVisual?.cameraComposition;
          const charNames = (cam && typeof cam !== 'string')
            ? flattenCameraComposition(cam).characterNames
            : (scene as any).characters || [];
          const normalizedCharacters = charNames.map((name: string) => normalizeCharacterName(name));
          
          return getSceneRepository().create({
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
          }, tx);
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
          Array.from(characterIdsToLink).map(characterId =>
            getStoryRepository()
              .createStoryCharacter(
                {
                  storyId: story.id,
                  characterId,
                  role: characterRoles.get(characterId) || 'supporting',
                },
                tx
              )
              .catch(err => {
                if (!err.message.includes('duplicate')) {
                  logger.error({ error: err, characterId }, 'Failed to link character');
                  throw err;
                }
              })
          )
        );
        
        logger.info({ 
          storyId: story.id, 
          characterCount: characterIdsToLink.size,
          totalInSpec: spec.characters.length,
        }, 'Characters linked to story (user + LLM, children excluded)');
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

/**
 * Check if user has too many active story requests (pending/processing).
 * Returns the count. Callers should reject if count >= threshold.
 */
export async function getUserActiveRequestCount(userId: string): Promise<number> {
  return getStoryRepository().countActiveRequestsByUser(userId);
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
  const activeCount = await getStoryRepository().countActiveRequestsForUpdate(userId);
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
export async function retryStoryImages(requestId: string, userId: string): Promise<{ id: string; status: string }> {
  const { enqueueImageBatch } = await import('../jobs/storyJobProcessor');
  const request = await getStoryRepository().findRequestByIdAndUser(requestId, userId);
  if (!request) {
    throw new Error('Story request not found');
  }
  if (request.status !== 'failed') {
    throw new Error('Request is not in failed state');
  }
  const storyId = request.storyId ?? (request.intermediateData as Record<string, unknown>)?.storyId as string | undefined;
  if (!storyId) {
    throw new Error('Cannot retry images: story data missing');
  }
  const isContinuation = !!(request.intermediateData as Record<string, unknown>)?.isContinuation;
  await getStoryRepository().updateRequest(requestId, {
    status: 'processing',
    errorMessage: null,
    updatedAt: new Date(),
  });
  enqueueImageBatch(requestId, storyId, isContinuation);
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
  
  // Recalculate progress for active tasks based on current time (read-only, no DB save)
  if (request.progressData) {
    const progressData = request.progressData as StoryProgress;
    
    // Update active tasks with current time-based progress
    for (const activeTask of progressData.activeTasks) {
      if (activeTask.details?.startedAt && activeTask.details?.estimatedMs) {
        const elapsed = Date.now() - activeTask.details.startedAt;
        const estimatedMs = activeTask.details.estimatedMs;
        const ratio = elapsed / estimatedMs;
        
        // Cap at 99% if elapsed exceeds estimated time
        if (ratio >= 1) {
          activeTask.progress = 99;
        } else {
          activeTask.progress = Math.round(0.99 * ratio * 100);
        }
      }
    }
    
    // Recalculate overall progress with updated active task progress
    const overallProgress = calculateOverallProgress(
      progressData.completedTasks,
      progressData.activeTasks
    );
    
    // Return updated data (NOT saving to DB - this is read-only recalculation)
    return {
      id: request.id,
      status: request.status,
      progress: overallProgress,
      progressData: {
        ...progressData,
        overallProgress,
      },
      storyId: request.storyId,
      errorMessage: request.errorMessage,
      createdAt: request.createdAt
    };
  }
  
  return {
    id: request.id,
    status: request.status,
    progress: request.progress,
    progressData: request.progressData as StoryProgress | null,
    storyId: request.storyId,
    errorMessage: request.errorMessage,
    createdAt: request.createdAt
  };
}

/**
 * Fetch child profiles associated with a story and map them to the same shape as character objects.
 * Returns only children explicitly selected in story_requests.selected_children.
 */
async function fetchStoryChildren(
  storyRequestId: string | null,
  childProfileId: string | null,
  userId: string,
): Promise<Array<{
  id: string;
  name: string;
  type: string;
  role: string;
  isHidden: boolean;
  description: string | null;
  referencePhotoUrl: string | null;
}>> {
  let childIds: string[] = [];

  if (storyRequestId) {
    const storyRequest = await getStoryRepository().findRequestById(storyRequestId);
    const selected = storyRequest?.selectedChildren as string[] | null;
    if (selected && selected.length > 0) {
      childIds = selected;
    }
  }

  if (childIds.length === 0) return [];

  const childProfiles = await getChildProfileRepository().findByIds(userId, childIds);
  if (childProfiles.length === 0) return [];

  const assetStorage = getAssetStorageService();

  return Promise.all(
    childProfiles.map(async (child) => {
      let referencePhotoUrl: string | null = null;

      const turnaround = child.turnaroundSheet as { url?: string } | null;
      const refPhotos = child.referencePhotos as Array<{ url?: string }> | null;

      const rawPath = turnaround?.url
        || (refPhotos && refPhotos.length > 0 ? refPhotos[0].url : null)
        || null;

      if (rawPath) {
        try {
          const storagePath = rawPath.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1\/assets\//, '');
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
  const enrichedCharacters = await Promise.all(
    linkedCharactersRaw.map(async (char) => {
      let referencePhotoUrl: string | null = null;

      const turnaround = char.turnaroundSheet as { url?: string } | null;
      const refPhotos = char.referencePhotos as Array<{ url?: string }> | null;

      const rawPath = turnaround?.url
        || (refPhotos && refPhotos.length > 0 ? refPhotos[0].url : null)
        || null;

      if (rawPath) {
        try {
          const storagePath = rawPath.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1\/assets\//, '');
          const { signedUrl } = await assetStorage.generateSignedUrl(storagePath, 24);
          referencePhotoUrl = signedUrl;
        } catch {
          // Non-fatal: URL signing failed
        }
      }

      return {
        id: char.id,
        name: char.name,
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
    userId,
  );
  
  return {
    id: story.id,
    title: story.title,
    language: story.language,
    ageGroup: story.ageGroup,
    moralTheme: story.moralTheme,
    scenes: story.scenes,
    fullText: story.fullText,
    wordCount: story.wordCount,
    estimatedReadMinutes: story.estimatedReadMinutes,
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
 * Uses a single SELECT to load all image assets for all stories
 * and builds plain public URLs from storagePath.
 */
export async function enrichAllStoriesWithImages(
  storyRows: Array<{ id: string; scenes: any[] }>
): Promise<Map<string, any[]>> {
  const storyIds = storyRows.map(s => s.id);
  const result = new Map<string, any[]>();

  if (storyIds.length === 0) {
    return result;
  }

  // Single batch query for all image assets across all stories
  const imageAssets = await getAssetRepository().findCompletedImagesByStoryIds(storyIds);

  // Group assets by storyId
  const assetsByStory = new Map<string, typeof imageAssets>();
  for (const asset of imageAssets) {
    const list = assetsByStory.get(asset.storyId) || [];
    list.push(asset);
    assetsByStory.set(asset.storyId, list);
  }

  for (const story of storyRows) {
    const scenes = story.scenes;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      result.set(story.id, scenes || []);
      continue;
    }

    const storyAssets = assetsByStory.get(story.id) || [];

    // Match assets to scenes: prefer sceneId integer, fall back to visualPrompt for old assets
    const enrichedScenes = scenes.map((scene: any) => {
      const matchingAsset = storyAssets.find(a => {
        if (a.sceneNumber != null && a.sceneNumber === scene.sceneId) return true;
        if (a.sceneNumber == null) {
          const scenePrompt = scene.visualPrompt?.trim().replace(/\s+/g, ' ');
          const assetPrompt = a.visualPrompt?.trim().replace(/\s+/g, ' ');
          return scenePrompt && assetPrompt && scenePrompt === assetPrompt;
        }
        return false;
      });

      return {
        ...scene,
        image: matchingAsset?.storagePath ? {
          url: `/api/v1/assets/${matchingAsset.storagePath}`,
          thumbnailUrl: matchingAsset.thumbnailPath 
            ? `/api/v1/assets/${matchingAsset.thumbnailPath}` 
            : null,
        } : null,
      };
    });

    result.set(story.id, enrichedScenes);
  }

  logger.debug({
    totalStories: storyIds.length,
    totalAssets: imageAssets.length,
    storiesWithAssets: assetsByStory.size,
  }, 'enrichAllStoriesWithImages - batch enrichment complete');

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
  } = {}
) {
  const { childProfileId: _childProfileId, language: _language, limit = 20, offset = 0, hasAudio, scenarioCardId } = options;
  
  const results = await getStoryRepository().findByUser(userId, {
    limit,
    offset,
    hasAudio,
    scenarioCardId,
  });
  
  // Batch-enrich all stories with images in a single DB query
  const enrichedScenesMap = await enrichAllStoriesWithImages(
    results.map(r => ({ id: r.id, scenes: r.scenes as any[] }))
  );
  
  const enrichedResults = results.map(story => ({
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
  } = {}
) {
  const { childProfileId: _childProfileId, language: _language, limit = 20, offset = 0, hasAudio, scenarioCardId } = options;

  const results = await getStoryRepository().findSummariesByUser(userId, {
    limit,
    offset,
    hasAudio,
    scenarioCardId,
  });

  // Batch-enrich with images to extract cover image URL
  const enrichedScenesMap = await enrichAllStoriesWithImages(
    results.map(r => ({ id: r.id, scenes: r.scenes as any[] }))
  );

  return results.map(story => {
    const enrichedScenes = enrichedScenesMap.get(story.id) || [];
    const firstSceneWithImage = Array.isArray(enrichedScenes)
      ? enrichedScenes.find((s: any) => s.image?.url)
      : null;

    return {
      id: story.id,
      title: story.title,
      language: story.language,
      status: story.isPublished ? 'completed' : 'draft',
      coverImageUrl: firstSceneWithImage?.image?.url ?? null,
      coverThumbnailUrl: firstSceneWithImage?.image?.thumbnailUrl ?? null,
      hasAudio: !!(story.audioMetadata as any)?.finalAssetId,
      scenarioCardId: story.scenarioCardId ?? null,
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
  } = {}
): Promise<number> {
  const { childProfileId: _childProfileId, language: _language, hasAudio, scenarioCardId } = options;
  
  return getStoryRepository().countByUser(userId, { hasAudio, scenarioCardId });
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
  
  // Delete the story
  await getStoryRepository().deleteStory(storyId, userId);
  
  logger.info({ storyId, userId, hadSeries: !!story.seriesId }, 'Story deleted');
  
  return true;
}

/**
 * Get story manifest with all scenes and assets (M4)
 * Returns scenes with signed URLs for images and audio
 */
export async function getStoryManifest(storyId: string) {
  const story = await getStoryRepository().findById(storyId);
  
  if (!story) {
    throw new Error('Story not found');
  }
  
  // Get all scenes
  const storyScenes = await getSceneRepository().findByStoryId(storyId);
  
  // Get all assets
  const storyAssets = await getAssetRepository().findByStoryId(storyId);
  
  // Get linked characters with enrichment
  const linkedCharactersRaw = await getStoryRepository().findLinkedCharactersByStoryId(storyId);
  const assetStorage = getAssetStorageService();
  
  // Resolve scenario card info for breadcrumbs
  let scenarioCardId: string | null = null;
  let scenarioCardName: string | null = null;
  if (story.storyRequestId) {
    const storyRequest = await getStoryRepository().findRequestById(story.storyRequestId);
    if (storyRequest?.scenarioCardId) {
      scenarioCardId = storyRequest.scenarioCardId;
      const translations = await getDictionaryRepository().findTranslations(
        'scenario_card', [storyRequest.scenarioCardId], story.language
      );
      const nameTranslation = translations.find(t => t.fieldName === 'name');
      if (nameTranslation) {
        scenarioCardName = nameTranslation.value;
      } else {
        const card = await getDictionaryRepository().findScenarioCardById(storyRequest.scenarioCardId);
        scenarioCardName = card?.nameKey || null;
      }
    }
  }
  
  const storyMeta = (story.metadata as Record<string, unknown>) || {};
  const sceneIdsWithImages = (storyMeta.sceneIdsWithImages as number[] | undefined) ?? [];
  const imageGenerationComplete = storyMeta.imageGenerationComplete as boolean | undefined;
  const failedScenes = (storyMeta.failedScenes as Array<{ sceneId: number; errorMessage: string }> | undefined) ?? [];

  const config = (await import('../config')).config;
  const webAppUrl = config.web?.webAppUrl || 'https://app.wondertales.com';

  // Build manifest
  const manifest = {
    storyId: story.id,
    title: stripCharacterIds(story.title),
    language: story.language,
    ageGroup: story.ageGroup,
    isPublished: !!story.isPublished,
    publishedSlug: story.publishedSlug ?? null,
    visibility: story.visibility || (story.publishedSlug ? 'public' : story.shareToken ? 'unlisted' : null),
    shareUrl: story.publishedSlug
      ? `${webAppUrl.replace(/\/$/, '')}/stories/${story.publishedSlug}`
      : story.shareToken
        ? `${webAppUrl.replace(/\/$/, '')}/u/${story.shareToken}`
        : null,
    shareCardSceneId: story.shareCardSceneId ?? null,
    fullText: stripAllTags(story.fullText || ''),
    audioMetadata: story.audioMetadata,
    // M8: Series fields
    seriesId: story.seriesId,
    partNumber: story.partNumber,
    scenarioCardId,
    scenarioCardName,
    imageGenerationComplete: imageGenerationComplete ?? true,
    sceneIdsWithImages,
    failedScenes,
    scenes: storyScenes.map(scene => {
      const sceneAssets = storyAssets.filter(
        a => a.sceneId === scene.id
      );
      
      const imageAsset = sceneAssets.find(a => a.assetType === 'image');
      const audioAsset = sceneAssets.find(a => a.assetType === 'audio');
      
      const assetUrl = (storagePath: string): string => `/api/v1/assets/${storagePath}`;
      
      // Parse sceneVisual from visualPrompt column when it contains JSON
      let sceneVisual: SceneVisual | undefined;
      if (scene.visualPrompt?.startsWith('{')) {
        try {
          const parsed = JSON.parse(scene.visualPrompt);
          if (parsed && typeof parsed.setting === 'string' && parsed.cameraComposition !== undefined) {
            sceneVisual = parsed as SceneVisual;
          }
        } catch (_) {
          // Not valid JSON, keep as legacy visualPrompt
        }
      }

      return {
        sceneId: scene.sceneId,
        text: stripAllTags(scene.text || ''),
        // Return structured sceneVisual when available, otherwise legacy visualPrompt
        ...(sceneVisual
          ? { sceneVisual, visualPrompt: undefined }
          : { visualPrompt: scene.visualPrompt }),
        image: imageAsset ? {
          id: imageAsset.id,
          url: assetUrl(imageAsset.storagePath),
          mimeType: imageAsset.mimeType,
          status: imageAsset.status,
          ...(imageAsset.status === 'failed' && imageAsset.errorMessage && { errorMessage: imageAsset.errorMessage }),
        } : null,
        audio: audioAsset ? {
          id: audioAsset.id,
          url: assetUrl(audioAsset.storagePath),
          mimeType: audioAsset.mimeType,
          status: audioAsset.status,
        } : null,
      };
    }),
    metadata: story.metadata,
    createdAt: story.createdAt,
    characters: [
      ...(await fetchStoryChildren(story.storyRequestId, story.childProfileId, story.userId)),
      ...(await Promise.all(
        linkedCharactersRaw.map(async (char) => {
          let referencePhotoUrl: string | null = null;
          const turnaround = char.turnaroundSheet as { url?: string } | null;
          const refPhotos = char.referencePhotos as Array<{ url?: string }> | null;
          const rawPath = turnaround?.url
            || (refPhotos && refPhotos.length > 0 ? refPhotos[0].url : null)
            || null;
          if (rawPath) {
            try {
              const storagePath = rawPath.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1\/assets\//, '');
              const { signedUrl } = await assetStorage.generateSignedUrl(storagePath, 24);
              referencePhotoUrl = signedUrl;
            } catch {
              // Non-fatal
            }
          }
          return {
            id: char.id,
            name: char.name,
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
      .filter(s => s.imageUrl != null)
      .map(s => ({
        sceneId: s.sceneId,
        imageUrl: `/api/v1/assets/${s.imageUrl!}`,
      }));
  }
  
  return {
    storyId: story.id,
    imageGenerationComplete,
    sceneIdsWithImages: (metadata.sceneIdsWithImages as number[] | undefined) ?? [],
    failedScenes: (metadata.failedScenes as Array<{ sceneId: number; errorMessage: string }> | undefined) ?? [],
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
  
  // Delete old image asset
  const oldAssets = await getAssetRepository().findBySceneId(scene.id, 'image');
  
  const assetStorage = getAssetStorageService();
  
  for (const oldAsset of oldAssets) {
    try {
      await assetStorage.deleteAsset(oldAsset.storagePath);
    } catch (error) {
      logger.warn({ error, assetId: oldAsset.id }, 'Failed to delete old asset from storage');
    }
    await getAssetRepository().deleteById(oldAsset.id);
  }
  
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
  const userCharacters = userCharsWithDetails.filter(Boolean) as Array<{ characters: { id: string; name: string; type: string; referencePhotos?: unknown; appearanceTraits?: unknown; description?: string; personality?: string; turnaroundSheet?: unknown } }>;
  
  const mergedCharacters = mergeCharacters(
    userCharacters
      .filter(uc => uc.characters && uc.characters.name)
      .map(uc => ({
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
  
  // Generate new image
  const imageDomain = getImageDomainService();
  
  await generateSceneImage(storyId, {
    sceneId: scene.sceneId,
    text: scene.text,
    sceneVisual: migrateVisualPrompt(scene),
    visualPrompt: visualPrompt || scene.visualPrompt, // Fallback
  }, {
    childProfile,
    characters: mergedCharacters,
    userStyle: metadata?.imageStyle,
    ageGroup: story.ageGroup,
    userPlan,
    userId: story.userId,
    assetStorage,
    imageDomain,
  });
  
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
  const completedAudio = existingAudio.filter(a => a.status === 'completed');

  if (completedAudio.length > 0 && !voiceId) {
    logger.info({ storyId }, 'Audio already exists, skipping generation');
    return;
  }

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
      planType = (plan && plan.slug !== 'free') ? 'premium' : 'free';
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



