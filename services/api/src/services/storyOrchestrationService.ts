import { db } from '../db';
import { 
  storyRequests, 
  stories, 
  scenes as scenesTable,
  assets,
  audioAssets,
  generatedReferences,
  storyCharacters, 
  childProfiles, 
  characters,
  scenarioCards, // NEW: Import scenario cards table
  storyGoals, // NEW: Import story goals table
  translations as translationsTable, // NEW: Import translations table
  storySeries, // NEW: Import story series table for continuation references
} from '../db/schema';
import type { CreateStoryRequestInput } from '@kazka/shared';
import { getStoryDomainService, getImageDomainService, getAudioDomainService } from './aiService';
import { getAssetStorageService } from './assetStorageService';
import { getPlanFeatures } from './planService';
import {
  STORY_TASKS,
  startTask,
  completeTask,
  updateTaskProgress,
  StoryProgress,
} from './storyProgress';
import { buildPolicyProfile } from './policyService';
import type { StorySpec, StoryEnvironment } from '../ai/types';
import { eq, and, desc, inArray, sql, isNotNull } from 'drizzle-orm';
import { logger } from '../utils/logger';
import type { CharacterReference } from '../prompts/image';
import { validate as isUUID } from 'uuid';
import { config } from '../config';
import type {
  StoryRequestData,
  ChildProfileData,
  CharacterData,
  SceneData,
  ImageGenerationContext,
  AssetStorageService as IAssetStorageService,
  ImageDomainService as IImageDomainService,
  ReferencePhoto,
  AppearanceTraits,
} from './types';
// NEW M9: Character-based reference tracking
import { buildCharacterRegistry, normalizeCharacterName, matchCharacterNames } from '../utils/characterNormalization';
import {
  selectReferencesForScene,
  markSceneAsReference,
  loadReferenceImageData,
} from './referenceImageTracker';

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
    const [request] = await db.insert(storyRequests).values({
      userId,
      childProfileId: input.childProfileId,
      uiLocale: input.uiLocale,
      storyLanguage: input.storyLanguage,
      goal: input.goal,
      tone: input.tone,
      scenarioCardId: input.scenarioCardId,
      imageStyle: (input as any).imageStyle || null, // Image art style
      userNotes: input.userNotes,
      selectedCharacters: input.selectedCharacters ? input.selectedCharacters : null, // Save selected characters
      selectedChildren: (input as any).selectedChildren ? (input as any).selectedChildren : null, // NEW: Save selected children
      status: 'pending',
      progress: 0
    }).returning();
    
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
    tone: string | null;
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
  }
): Promise<string> {
  try {
    logger.info({
      userId,
      seriesId: input.seriesId,
      partNumber: input.partNumber,
    }, 'Creating continuation request');
    
    // Create a special story request for continuation
    const [request] = await db.insert(storyRequests).values({
      userId,
      childProfileId: input.childProfileId,
      uiLocale: 'uk', // Use default, doesn't affect story
      storyLanguage: input.language,
      goal: input.moralTheme, // Use moral theme from original story (can be null)
      tone: input.tone,
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
      },
    }).returning();
    
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
 * - Character portrait generation (Premium plan)
 * - Scene image generation (parallel for all plans)
 * - Character consistency via references or descriptions
 */
export async function processStoryRequest(requestId: string): Promise<void> {
  const startTime = Date.now();
  
  try {
    logger.info({ requestId }, 'Processing story request');
    
    // Get request details with intermediate data
    const [request] = await db
      .select()
      .from(storyRequests)
      .where(eq(storyRequests.id, requestId))
      .limit(1);
    
    if (!request) {
      throw new Error(`Story request ${requestId} not found`);
    }
    
    // Update status to 'processing' at the start
    await db
      .update(storyRequests)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(storyRequests.id, requestId));
    
    logger.info({ requestId }, 'Status updated to processing');
    
    // Check for existing checkpoints (from previous failed attempt)
    const checkpoints = (request.intermediateData as any) || {};
    
    let outline, text, mergedCharacters, spec, selectedCharacters;
    
    // Get Domain Services (needed throughout the function)
    const storyDomain = getStoryDomainService();
    const imageDomain = getImageDomainService();
    const assetStorage = getAssetStorageService();
    
    // Get user plan features (needed for later steps)
    const userPlan = await getPlanFeatures(request.userId);
    
    // Determine generation mode
    const useDirectGeneration = config.storyGeneration.useDirectTextGeneration;
    logger.info({ requestId, useDirectGeneration }, 'Story generation mode');
    
    if (useDirectGeneration) {
      // ========================================
      // NEW: Direct Text Generation (1-step)
      // ========================================
      
      // Build story spec
      const specData = await buildStorySpec(request);
      spec = specData.spec;
      selectedCharacters = specData.selectedCharacters;
      
      // Task 1: Generate Text Directly (skip outline)
      await startTask(requestId, STORY_TASKS.GENERATING_TEXT);
      text = await storyDomain.generateTextDirect(spec);
      await completeTask(requestId, STORY_TASKS.GENERATING_TEXT);
      
      logger.info({ requestId, title: text.title, wordCount: text.wordCount }, 'Text generated directly');
      
      // Log environments from LLM output
      const textEnvironments = (text as any).environments;
      if (textEnvironments && textEnvironments.length > 0) {
        logger.info({
          requestId,
          environmentCount: textEnvironments.length,
          environments: textEnvironments.map((e: any) => ({
            id: e.id,
            name: e.name,
            visualDescription: e.visualDescription,
          })),
        }, 'LLM generated story environments (full descriptions)');

        // Log scene-to-environment mapping
        const sceneEnvMapping = text.scenes.map((s: any) => ({
          sceneId: s.sceneId,
          environmentId: (s as any).environmentId || 'MISSING',
          visualPromptPreview: s.visualPrompt?.substring(0, 80) + (s.visualPrompt?.length > 80 ? '...' : ''),
        }));
        logger.info({
          requestId,
          sceneEnvMapping,
        }, 'Scene-to-environment mapping from LLM');
      } else {
        logger.warn({ requestId }, 'LLM did not generate environments array — images will use raw visualPrompt without setting context');
      }

      // Create a minimal outline structure for compatibility (needed for validation and images)
      outline = {
        title: text.title,
        language: text.language,
        moral: text.moral,
        scenes: text.scenes.map((scene, idx) => ({
          sceneId: scene.sceneId,
          setting: '', // Not generated in direct mode
          goal: '',
          emotion: 'neutral' as const,
          beats: [],
          visualPrompt: scene.visualPrompt,
        })),
        safetyNotes: [],
      };
      
      // Extract LLM-generated characters from text if any
      const llmCharacters = (text.characters || []).map(char => ({
        name: char.name,
        type: char.type,
        description: char.description,
        role: char.role,
        personality: char.personality,
        appearance: char.description, // Map description to appearance for image generation
      }));
      
      logger.info({ 
        llmCharacterCount: llmCharacters.length,
        llmCharacterNames: llmCharacters.map(c => c.name).join(', ')
      }, 'Extracted LLM-generated characters from direct text generation');
      
      // Merge user characters
      mergedCharacters = mergeCharacters(selectedCharacters as CharacterData[], llmCharacters);
      
      // Save checkpoint
      const specForCheckpoint = { ...spec, policyProfile: undefined };
      await db.update(storyRequests).set({
        intermediateData: { 
          outline, 
          text,
          mergedCharacters,
          spec: specForCheckpoint,
          selectedCharacters 
        }
      }).where(eq(storyRequests.id, requestId));
      
      logger.info({ requestId, checkpoint: 'direct_text' }, 'Checkpoint saved');
      
    } else {
      // ========================================
      // OLD: Outline-based Generation (2-step)
      // ========================================
      
    // CHECKPOINT 1: Build Spec & Generate Outline
    if (checkpoints.outline && checkpoints.spec && checkpoints.selectedCharacters) {
      logger.info({ requestId }, 'Reusing existing outline from checkpoint');
      outline = checkpoints.outline;
      spec = checkpoints.spec;
      selectedCharacters = checkpoints.selectedCharacters;
      // Restore policy profile properly
      const policyProfile = await buildPolicyProfile(spec.ageGroup, spec.language);
      spec.policyProfile = policyProfile;
    } else {
      // Build story spec
      const specData = await buildStorySpec(request);
      spec = specData.spec;
      selectedCharacters = specData.selectedCharacters;
      
      // Task 1: Generate Outline
      await startTask(requestId, STORY_TASKS.GENERATING_OUTLINE);
      outline = await storyDomain.generateOutline(spec);
      await completeTask(requestId, STORY_TASKS.GENERATING_OUTLINE);
      
      logger.info({ requestId, title: outline.title }, 'Outline generated');
      
      // Save checkpoint (exclude policyProfile to avoid circular refs)
      const specForCheckpoint = { ...spec, policyProfile: undefined };
      await db.update(storyRequests).set({
        intermediateData: { 
          outline, 
          spec: specForCheckpoint,
          selectedCharacters 
        }
      }).where(eq(storyRequests.id, requestId));
      
      logger.info({ requestId, checkpoint: 'outline' }, 'Checkpoint saved');
    }
    
    // CHECKPOINT 2: Generate Text (only for outline-based mode)
    if (!useDirectGeneration) {
    if (checkpoints.text && checkpoints.mergedCharacters) {
      logger.info({ requestId }, 'Reusing existing text from checkpoint');
      text = checkpoints.text;
      mergedCharacters = checkpoints.mergedCharacters;
    } else {
      // Extract LLM-generated characters from outline
      const llmCharacters = (outline as any).characters || [];
      
      // Merge user characters with LLM characters
      mergedCharacters = mergeCharacters(selectedCharacters as CharacterData[], llmCharacters);
      
      // Task 2: Generate Text
      await startTask(requestId, STORY_TASKS.GENERATING_TEXT);
      text = await storyDomain.generateText(spec, outline);
      await completeTask(requestId, STORY_TASKS.GENERATING_TEXT);
      
      logger.info({ requestId, wordCount: text.wordCount }, 'Text generated');
      
      // Save checkpoint
      const currentCheckpoints = checkpoints.outline ? checkpoints : { 
        outline, 
        spec: { ...spec, policyProfile: undefined }, 
        selectedCharacters 
      };
      await db.update(storyRequests).set({
        intermediateData: { 
          ...currentCheckpoints,
          text, 
          mergedCharacters 
        }
      }).where(eq(storyRequests.id, requestId));
      
      logger.info({ requestId, checkpoint: 'text' }, 'Checkpoint saved');
    }
    } // End of outline-based text generation
    } // End of else block for outline-based generation
    
    // CHECKPOINT 3: Validation
    if (checkpoints.validationComplete && checkpoints.validatedText) {
      logger.info({ requestId }, 'Reusing validated text from checkpoint');
      text = checkpoints.validatedText;
    } else {
      // Task 3: Validation with parallel scene validation
      await startTask(requestId, STORY_TASKS.VALIDATING);
    
    logger.info({ requestId, sceneCount: text.scenes.length }, 'Starting parallel scene validation');
    
    const validations = await Promise.all(
      text.scenes.map((scene, idx) => 
        storyDomain.validateScene(
          outline.scenes[idx],
          scene,
          spec.policyProfile,
          idx === text.scenes.length - 1 // isLastScene
        )
      )
    );
    
    // Check which scenes failed
    const failedScenes = validations.filter(v => !v.isValid);
    
    if (failedScenes.length > 0) {
      logger.info({ 
        requestId, 
        failedCount: failedScenes.length,
        sceneIds: failedScenes.map(f => f.sceneId)
      }, 'Some scenes failed validation, starting regeneration');
      
      // SELECTIVE REGENERATION WITH RETRY LOOP
      const MAX_RETRIES = 2;
      const scenesToRegenerate = new Map(failedScenes.map(f => [f.sceneId, 0]));
      
      for (let attempt = 0; attempt < MAX_RETRIES && scenesToRegenerate.size > 0; attempt++) {
        logger.info({ 
          requestId, 
          attempt: attempt + 1, 
          scenesToRegenerate: Array.from(scenesToRegenerate.keys())
        }, 'Regeneration attempt');
        
        const regenerationPromises = Array.from(scenesToRegenerate.keys()).map(sceneId => {
          const validation = validations.find(v => v.sceneId === sceneId);
          const feedback = validation?.violations.map(v => v.message).join('; ') || '';
          return storyDomain.regenerateScene(spec, outline, sceneId, feedback);
        });
        
        const newScenes = await Promise.all(regenerationPromises);
        
        // Replace regenerated scenes
        newScenes.forEach(newScene => {
          const idx = text.scenes.findIndex(s => s.sceneId === newScene.sceneId);
          if (idx !== -1) {
            text.scenes[idx] = newScene;
          }
        });
        
        text.fullText = text.scenes.map(s => s.text).join('\n\n');
        text.wordCount = text.fullText.split(/\s+/).length;
        
        // Re-validate
        const revalidations = await Promise.all(
          newScenes.map((scene, _idx) => {
            const sceneIdx = text.scenes.findIndex(s => s.sceneId === scene.sceneId);
            return storyDomain.validateScene(
              outline.scenes[sceneIdx],
              scene,
              spec.policyProfile,
              sceneIdx === text.scenes.length - 1
            );
          })
        );
        
        revalidations.forEach((validation, idx) => {
          const sceneId = newScenes[idx].sceneId;
          if (validation.isValid) {
            scenesToRegenerate.delete(sceneId);
          } else {
            scenesToRegenerate.set(sceneId, (scenesToRegenerate.get(sceneId) || 0) + 1);
          }
        });
      }
      
      if (scenesToRegenerate.size > 0) {
        logger.warn({ 
          requestId, 
          failedSceneIds: Array.from(scenesToRegenerate.keys())
        }, 'Some scenes still failing validation after max retries');
      }
    }
    
    await completeTask(requestId, STORY_TASKS.VALIDATING);
    
    // Save validation checkpoint
    const currentCheckpoints = checkpoints.text ? checkpoints : { 
      outline, 
      spec: { ...spec, policyProfile: undefined }, 
      selectedCharacters,
      text,
      mergedCharacters
    };
    await db.update(storyRequests).set({
      intermediateData: { 
        ...currentCheckpoints,
        validationComplete: true,
        validatedText: text
      }
    }).where(eq(storyRequests.id, requestId));
    
    logger.info({ requestId, checkpoint: 'validation' }, 'Checkpoint saved');
    }
    
    // CHECKPOINT 4: Story already saved?
    let storyId: string;
    if (checkpoints.storyId) {
      logger.info({ requestId, storyId: checkpoints.storyId }, 'Reusing existing saved story from checkpoint');
      storyId = checkpoints.storyId;
    } else {
      // Save story with scenes
      storyId = await saveStory(request, spec, outline, text, mergedCharacters, Date.now() - startTime);
      
      // Save checkpoint 4
      const currentCheckpoints = checkpoints.validationComplete ? checkpoints : {
        outline,
        spec: { ...spec, policyProfile: undefined },
        selectedCharacters,
        text,
        mergedCharacters,
        validationComplete: true,
        validatedText: text
      };
      
      await db.update(storyRequests).set({
        intermediateData: { 
          ...currentCheckpoints,
          storyId
        }
      }).where(eq(storyRequests.id, requestId));
      
      logger.info({ requestId, storyId, checkpoint: 'story_saved' }, 'Checkpoint 4 saved');
    }
    
    // Task 4: Generate Character Portraits (Premium only)
    if (userPlan.allowGeneratedReferences) {
      await startTask(requestId, STORY_TASKS.GENERATING_PORTRAITS);
      
      const charactersNeedingPortraits = mergedCharacters.filter(c => 
        !c.referencePhotos || c.referencePhotos.length === 0
      );
      
      if (charactersNeedingPortraits.length > 0) {
        logger.info({ 
          requestId, 
          characterCount: charactersNeedingPortraits.length 
        }, 'Generating character portraits');
        
        for (let i = 0; i < charactersNeedingPortraits.length; i++) {
          const character = charactersNeedingPortraits[i];
          
          try {
            await generateCharacterPortrait(storyId, character, {
              style: (spec as any).imageStyle || imageDomain.buildImageStyle(spec.ageGroup),
              ageGroup: spec.ageGroup,
              userId: request.userId,
              assetStorage,
              imageDomain,
            });
            
            await updateTaskProgress(
              requestId,
              STORY_TASKS.GENERATING_PORTRAITS,
              (i + 1) / charactersNeedingPortraits.length,
              { current: i + 1, total: charactersNeedingPortraits.length }
            );
          } catch (error) {
            logger.error({ 
              error, 
              characterName: character?.name || 'unknown',
              characterIndex: i,
              stack: error instanceof Error ? error.stack : undefined
            }, 'Failed to generate character portrait');
            // Continue with other portraits (graceful degradation)
          }
        }
      }
      
      await completeTask(requestId, STORY_TASKS.GENERATING_PORTRAITS);
    }
    
    // Task 5: Generate Scene Images (Sequential for character-aware reference tracking - M9)
    await startTask(requestId, STORY_TASKS.GENERATING_IMAGES);
    
    if (config.image.skipGeneration) {
      logger.info({ requestId }, 'Image generation skipped (SKIP_IMAGE_GENERATION=true)');
    } else {
    
    const imagesPerStory = userPlan.imagesPerStory || 0;
    
    // Calculate evenly distributed scene indices instead of just taking first N
    const sceneIndices: number[] = [];
    const totalScenes = text.scenes.length;
    
    if (imagesPerStory > 0 && totalScenes > 0) {
      for (let i = 0; i < imagesPerStory; i++) {
        // Distribute images evenly across the story
        // Example: 8 scenes, 3 images → indices [1, 4, 6]
        const index = Math.floor((i + 0.5) * totalScenes / imagesPerStory);
        sceneIndices.push(Math.min(index, totalScenes - 1)); // Ensure within bounds
      }
    }
    
    const scenesToGenerate = sceneIndices.map(i => text.scenes[i]);
    
    logger.info({ 
      requestId, 
      totalScenes,
      imagesPerStory,
      selectedIndices: sceneIndices,
      sceneCount: scenesToGenerate.length
    }, 'Selected scenes for image generation (evenly distributed)');
    
    // Build environment map for visual prompt composition
    const environmentMap = new Map<string, StoryEnvironment>();
    const environments = (text as any).environments as StoryEnvironment[] | undefined;
    if (environments && environments.length > 0) {
      for (const env of environments) {
        environmentMap.set(env.id, env);
      }
      logger.info({
        requestId,
        environmentCount: environments.length,
        environmentIds: environments.map(e => e.id),
        environmentNames: environments.map(e => e.name),
      }, 'Built environment map from LLM output');
    } else {
      logger.warn({ requestId }, 'No environments found in LLM output — visual prompts will not include environment context');
    }

    if (scenesToGenerate.length > 0) {
      // Log image generation plan with environment enrichment preview
      const generationPlan = scenesToGenerate.map((s, idx) => {
        const sceneIdx = sceneIndices[idx];
        const prevIdx = idx > 0 ? sceneIndices[idx - 1] : -1;
        const skippedCount = sceneIdx - prevIdx - 1;
        const envId = (s as any).environmentId || 'MISSING';
        const envName = environmentMap.get(envId)?.name || 'N/A';
        return {
          sceneId: s.sceneId,
          sceneIndex: sceneIdx,
          environmentId: envId,
          environmentName: envName,
          skippedScenesBefore: skippedCount,
          willInheritFrom: skippedCount > 0
            ? Array.from({ length: skippedCount }, (_, i) => prevIdx + 1 + i)
                .filter(i => i >= 0 && i < text.scenes.length)
                .map(i => text.scenes[i].sceneId)
            : [],
        };
      });
      logger.info({
        requestId,
        generationPlan,
        totalEnvironments: environmentMap.size,
      }, 'Image generation plan with environment enrichment preview');

      logger.info({ 
        requestId, 
        sceneCount: scenesToGenerate.length,
        plan: userPlan.allowGeneratedReferences ? 'premium' : 'free'
      }, 'Starting character-aware reference image generation (M9)');
      
      // Build character registry for name normalization
      const llmCharacters = (outline as any).characters || (text as any).characters || [];
      const characterRegistry = buildCharacterRegistry(
        spec.characters,
        spec.childProfile,
        llmCharacters
      );
      
      // Build character description map for quick lookup
      const characterDescriptionMap = new Map<string, CharacterData>();
      for (const [normalized, char] of characterRegistry.entries()) {
        // Find the full CharacterData from mergedCharacters
        const fullChar = mergedCharacters.find(c => 
          normalizeCharacterName(c.name) === normalized
        );
        if (fullChar) {
          characterDescriptionMap.set(normalized, fullChar);
        }
      }
      
      // Log selected characters with their reference photos
      const charactersWithReferenceInfo = Array.from(characterDescriptionMap.entries()).map(([normalized, char]) => ({
        normalizedName: normalized,
        name: char.name,
        type: (char as any).type || 'unknown',
        hasReferencePhotos: !!(char.referencePhotos && char.referencePhotos.length > 0),
        referencePhotoCount: char.referencePhotos?.length || 0,
        referencePhotoUrls: char.referencePhotos?.map((p: any) => p.url).slice(0, 3) || [] // First 3 URLs for logging
      }));
      
      logger.info({
        storyId,
        requestId,
        totalCharactersInStory: characterDescriptionMap.size,
        charactersWithReferences: charactersWithReferenceInfo.filter(c => c.hasReferencePhotos),
        charactersWithoutReferences: charactersWithReferenceInfo.filter(c => !c.hasReferencePhotos).map(c => c.name),
        imaginaryFriendCount: charactersWithReferenceInfo.filter(c => c.type === 'imaginary_friend').length,
        imaginaryFriendsWithPhotos: charactersWithReferenceInfo.filter(c => c.type === 'imaginary_friend' && c.hasReferencePhotos).map(c => ({
          name: c.name,
          photoCount: c.referencePhotoCount
        }))
      }, 'Selected characters for story - reference photos analysis');
      
      // Helper function to extract storage path from URL
      // Handles both full URLs (http://localhost:8081/api/v1/assets/path) and relative URLs (/api/v1/assets/path)
      const extractStoragePath = (url: string): string => {
        // Remove protocol and domain if present
        const urlWithoutProtocol = url.replace(/^https?:\/\/[^/]+/, '');
        // Remove /api/v1/assets/ prefix
        const storagePath = urlWithoutProtocol.replace(/^\/api\/v1\/assets\//, '');
        return storagePath;
      };
      
      // IMAGE GENERATION LOOP - Sequential for reference tracking
      for (let i = 0; i < scenesToGenerate.length; i++) {
        const scene = scenesToGenerate[i];
        const outlineScene = outline.scenes.find(s => s.sceneId === scene.sceneId);
        
        // Normalize scene character names
        // Prefer visualCharacters (physically present) over characters (mentioned) for image generation
        const sceneCharacters = (scene as any).visualCharacters || scene.characters || [];
        const normalizedCharacters = matchCharacterNames(sceneCharacters, characterRegistry);
        
        // Extract imaginary friend reference photos for this scene
        const imaginaryFriendReferences: string[] = [];
        
        for (const char of characterDescriptionMap.values()) {
          // Check if character appears in this scene and is imaginary_friend
          if (!char.name) continue; // Skip if no name
          
          // Use normalizedCharacters (from LLM's characters array) instead of text.includes()
          // text.includes() fails with Ukrainian/Russian declensions (e.g. "Стрекориба" vs "Стрекориб")
          const charNormalized = normalizeCharacterName(char.name);
          
          if (normalizedCharacters.includes(charNormalized) && 
              (char as any).type === 'imaginary_friend' &&
              char.referencePhotos && 
              char.referencePhotos.length > 0) {
            
            // Add ALL reference photos for imaginary friends (these are drawings, not real photos)
            for (const photo of char.referencePhotos) {
              if (photo.url) {
                // Extract storage path from URL (handle full or relative URLs)
                const storagePath = extractStoragePath(photo.url);
                imaginaryFriendReferences.push(storagePath);
                
                logger.info({
                  storyId,
                  sceneId: scene.sceneId,
                  characterName: char.name,
                  characterType: 'imaginary_friend',
                  originalUrl: photo.url,
                  storagePath
                }, 'Added imaginary friend reference photo (drawing)');
              }
            }
          }
        }
        
        // Select references for this scene (from previously generated scenes)
        const referenceSelection = await selectReferencesForScene(
          storyId,
          normalizedCharacters,
          scene.sceneId
        );
        
        // Load imaginary friend reference photos with metadata
        const imaginaryFriendData = await Promise.all(
          imaginaryFriendReferences.map(async (url, index) => {
            const data = await loadReferenceImageData(url, assetStorage);
            // Find character name for this reference
            const char = Array.from(characterDescriptionMap.values()).find(c => 
              c.referencePhotos?.some(p => {
                const storagePath = extractStoragePath(p.url);
                return storagePath === url;
              })
            );
            
            const referenceInfo = {
              ...data,
              source: 'imaginary_friend',
              characterName: char?.name || 'unknown',
              type: 'imaginary_friend',
              url: url,
              index: index + 1
            };
            
            logger.info({
              storyId,
              sceneId: scene.sceneId,
              referenceIndex: index + 1,
              characterName: referenceInfo.characterName,
              characterType: 'imaginary_friend',
              storagePath: url,
              dataSizeBytes: data.base64 ? Buffer.from(data.base64, 'base64').length : 0
            }, 'Loaded imaginary friend reference photo for image generation');
            
            return referenceInfo;
          })
        );
        
        // Load reference image data from previously generated scenes with metadata
        const sceneReferenceData = await Promise.all(
          referenceSelection.referenceImages.map(async (ref) => {
            const data = await loadReferenceImageData(ref.imageUrl, assetStorage);
            
            // Determine character name(s) from charactersPresent in the reference
            // Use the first character that matches current scene characters, or first available
            let characterName = 'unknown';
            if (ref.charactersPresent && ref.charactersPresent.length > 0) {
              // Try to find matching character from current scene
              const matchingChar = normalizedCharacters.find(nc => 
                ref.charactersPresent.includes(nc)
              );
              if (matchingChar) {
                // Get actual character name from characterDescriptionMap
                const charData = characterDescriptionMap.get(matchingChar);
                characterName = charData?.name || matchingChar;
              } else {
                // Use first character from reference
                const firstCharNormalized = ref.charactersPresent[0];
                const charData = characterDescriptionMap.get(firstCharNormalized);
                characterName = charData?.name || firstCharNormalized;
              }
            }
            
            return {
              ...data,
              source: 'previous_scene',
              characterName: characterName,
              type: 'scene_reference',
              sceneId: ref.sceneId,
              url: ref.imageUrl,
              charactersPresent: ref.charactersPresent // Include all characters for reference
            };
          })
        );
        
        // Combine imaginary friend photos (first) with scene references
        const referenceImageDataArray = [
          ...imaginaryFriendData,
          ...sceneReferenceData
        ];
        
        // Filter character descriptions to only include characters in THIS scene
        const sceneCharacterDescriptions = normalizedCharacters
          .map(normalized => characterDescriptionMap.get(normalized))
          .filter(Boolean) as CharacterData[];
        
        // Prepare detailed reference information for logging
        const referenceDetails = referenceImageDataArray.map((ref, idx) => ({
          index: idx + 1,
          source: (ref as any).source || 'unknown',
          characterName: (ref as any).characterName || 'unknown',
          type: (ref as any).type || 'unknown',
          sceneId: (ref as any).sceneId || null,
          url: (ref as any).url || 'unknown'
        }));
        
        logger.info({
          storyId,
          sceneId: scene.sceneId,
          charactersInScene: sceneCharacters,
          normalizedCharacters,
          imaginaryFriendReferenceCount: imaginaryFriendData.length,
          sceneReferenceCount: sceneReferenceData.length,
          totalReferenceCount: referenceImageDataArray.length,
          newCharacters: referenceSelection.newCharactersIntroduced,
          referenceDetails,
          imaginaryFriendReferences: imaginaryFriendData.map((ref, idx) => ({
            index: idx + 1,
            characterName: (ref as any).characterName,
            storagePath: (ref as any).url
          })),
          sceneReferences: sceneReferenceData.map((ref, idx) => ({
            index: imaginaryFriendData.length + idx + 1,
            characterName: (ref as any).characterName,
            charactersPresent: (ref as any).charactersPresent || [],
            fromSceneId: (ref as any).sceneId,
            storagePath: (ref as any).url
          }))
        }, 'Generating scene image with character-aware references - full reference list');
        
        try {
          // Compose enriched visual prompt with environment + skipped scene context
          const composedVisualPrompt = buildComposedVisualPrompt({
            scene,
            sceneIndexInAll: sceneIndices[i],
            generatedIndices: sceneIndices,
            allScenes: text.scenes as SceneData[],
            environmentMap,
          });

          // Create scene copy with enriched visual prompt
          const enrichedScene: SceneData = { ...scene, visualPrompt: composedVisualPrompt };

          // Generate image with multiple references
          const imageResult = await generateSceneImageWithReference(storyId, enrichedScene, {
            childProfile: spec.childProfile,
            characters: sceneCharacterDescriptions, // ONLY scene characters
            userStyle: (spec as any).imageStyle,
            ageGroup: spec.ageGroup,
            userPlan,
            userId: request.userId,
            assetStorage,
            imageDomain,
            sceneGoal: outlineScene?.goal,
            sceneBeats: outlineScene?.beats,
            sceneEmotion: outlineScene?.emotion,
            referenceImageDataArray: referenceImageDataArray, // Multiple references
          });
          
          // Mark as reference if it introduces new characters
          if (referenceSelection.shouldMarkAsReference) {
            await markSceneAsReference(
              imageResult.sceneDbId,
              normalizedCharacters,
              imageResult.imageUrl
            );
          }
          
          await updateTaskProgress(
            requestId,
            STORY_TASKS.GENERATING_IMAGES,
            (i + 1) / scenesToGenerate.length,
            { current: i + 1, total: scenesToGenerate.length }
          );
        } catch (error) {
          logger.error({ error, sceneId: scene.sceneId }, 'Failed to generate scene image');
          // Continue with other images (graceful degradation)
        }
      }
      
      logger.info('All scenes generated with character-aware references');
    }
    
    } // end if !skipGeneration
    
    await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
    
    // SUCCESS: Clear intermediate data now that all images are generated
    await db.update(storyRequests).set({
      intermediateData: null
    }).where(eq(storyRequests.id, requestId));
    
    logger.info({ requestId, checkpoint: 'cleared' }, 'Checkpoints cleared after all images generated');
    
    // Update request as completed
    await db
      .update(storyRequests)
      .set({
        status: 'completed',
        storyId
      })
      .where(eq(storyRequests.id, requestId));
    
    logger.info({ requestId, storyId, duration: Date.now() - startTime }, 'Story generation completed');
    
  } catch (error) {
    logger.error({ 
      error, 
      requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : undefined
    }, 'Story generation failed');
    
    await db
      .update(storyRequests)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(storyRequests.id, requestId));
    
    throw error;
  }
}

/**
 * Build story spec from request data
 */
async function buildStorySpec(request: StoryRequestData): Promise<{ 
  spec: StorySpec & { childProfile?: ChildProfileData }; 
  selectedCharacters: CharacterData[] 
}> {
  try {
    // Get child profile if specified
    let childName: string | undefined = undefined; // Will be set if child is a character
    let ageGroup = '4-5'; // Default age group
    let childProfile: ChildProfileData | null = null;
    let selectedCharacters: CharacterData[] = [];
    
    // Load selected characters ALWAYS if provided (not dependent on childProfileId)
    if (request.selectedCharacters && request.selectedCharacters.length > 0) {
      const userCharacters = await db
        .select()
        .from(characters)
        .where(and(
          eq(characters.userId, request.userId),
          eq(characters.isActive, true),
          inArray(characters.id, request.selectedCharacters) // Filter by selection
        ));
      
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
    
    if (request.childProfileId) {
      const [profile] = await db
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, request.childProfileId))
        .limit(1);
      
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
      const childProfilesToInclude = await db
        .select()
        .from(childProfiles)
        .where(and(
          eq(childProfiles.userId, request.userId),
          eq(childProfiles.isActive, true),
          inArray(childProfiles.id, request.selectedChildren)
        ));
      
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
        }));
      
      logger.info({ 
        requestId: request.id,
        selectedChildrenCount: selectedChildrenData.length,
        childNames: selectedChildrenData.map(c => c.name)
      }, 'Loaded selected children as characters');
    }
    
    // Merge all characters (user characters + selected children)
    const allCharacters = [...selectedCharacters, ...selectedChildrenData];
    
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
      const [card] = await db
        .select()
        .from(scenarioCards)
        .where(eq(scenarioCards.id, request.scenarioCardId))
        .limit(1);
      
      if (card) {
        // Load translations for name and description (use story language for prompts)
        const translations = await db
          .select()
          .from(translationsTable)
          .where(and(
            eq(translationsTable.entityType, 'scenario_card'),
            eq(translationsTable.entityId, card.id),
            eq(translationsTable.locale, request.storyLanguage)
          ));
        
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
    
    // Load goal with guidance and translations
    let goalWithGuidance: { slug: string; name: string; promptGuidance: string } | undefined;
    if (request.goal) {
      const [goalData] = await db
        .select()
        .from(storyGoals)
        .where(eq(storyGoals.slug, request.goal))
        .limit(1);
      
      if (goalData) {
        // Load translations for goal name (use story language for prompts)
        const translations = await db
          .select()
          .from(translationsTable)
          .where(and(
            eq(translationsTable.entityType, 'story_goal'),
            eq(translationsTable.entityId, goalData.slug),
            eq(translationsTable.locale, request.storyLanguage)
          ));
        
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
      tone: request.tone || undefined,
      imageStyle: (request as any).imageStyle || undefined, // Image art style
      characters: allCharacters as any, // Merged: user characters + selected children
      userNotes: request.userNotes || undefined,
      policyProfile,
      scenarioCard, // NEW: Add scenario card to spec
      scenarioGuidance: scenarioCard?.promptGuidance, // NEW: Detailed plot guidance
    };
    
    return { spec, selectedCharacters: allCharacters };
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
        type: llmChar.type || 'unknown',
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

/**
 * Generate character portrait for consistency
 */
async function generateCharacterPortrait(
  storyId: string,
  character: CharacterData,
  context: {
    style: string;
    ageGroup: string;
    userId: string;
    assetStorage: IAssetStorageService;
    imageDomain: IImageDomainService;
  }
): Promise<void> {
  // Guard clause: validate character has required data
  if (!character || !character.name) {
    logger.warn({ storyId, character }, 'Cannot generate portrait: invalid character data');
    return;
  }
  
  const startTime = Date.now();
  
  try {
    // Generate portrait using ImageDomainService
    const portrait = await context.imageDomain.generateCharacterPortrait({
      characterName: character.name,
      description: character.appearance || character.description || `${character.name}`,
      style: context.style,
      ageGroup: context.ageGroup,
      characterType: character.type,
    });
    
    // Upload to storage
    const uploadResult = await context.assetStorage.uploadAsset({
      data: portrait.imageData,
      mimeType: portrait.mimeType,
      userId: context.userId,
      storyId: storyId,
      assetType: 'image',
    });
    
    // Save asset to database
    const [assetRecord] = await db.insert(assets).values({
      storyId: storyId,
      sceneId: null, // Portraits are not tied to scenes
      assetType: 'image',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      mimeType: portrait.mimeType,
      fileSizeBytes: uploadResult.fileSizeBytes,
      generationParams: {
        type: 'character_portrait',
        characterName: character.name,
        style: context.style,
        prompt: character.appearance || character.description,
      },
      generationTimeMs: Date.now() - startTime,
      status: 'completed',
    }).returning();
    
    // Save generated reference
    await db.insert(generatedReferences).values({
      storyId: storyId,
      characterId: character.id || null,
      characterName: character.name,
      assetId: assetRecord.id,
      characterDescription: character.appearance || character.description || '',
      generationParams: {
        style: context.style,
        characterType: character.type,
      },
      referenceType: 'generated_portrait',
      source: character.source || 'llm_generated',
    });
    
    logger.info({ 
      storyId, 
      characterName: character.name,
      assetId: assetRecord.id 
    }, 'Character portrait generated and saved');
    
  } catch (error) {
    logger.error({ 
      error, 
      character: character.name,
      stack: error instanceof Error ? error.stack : undefined 
    }, 'Failed to generate character portrait');
    throw error;
  }
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
    const [sceneRecord] = await db
      .select()
      .from(scenesTable)
      .where(and(
        eq(scenesTable.storyId, storyId),
        eq(scenesTable.sceneId, scene.sceneId)
      ))
      .limit(1);
    
    if (!sceneRecord) {
      throw new Error(`Scene ${scene.sceneId} not found for story ${storyId}`);
    }
    
    // Determine generation mode
    const hasUserReferencePhotos = context.characters.some(
      c => c.referencePhotos && c.referencePhotos.length > 0
    );
    
    const hasGeneratedReferences = context.userPlan.allowGeneratedReferences &&
      await hasGeneratedPortraits(storyId);
    
    const useReferences = hasUserReferencePhotos || hasGeneratedReferences;
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
    const image = await context.imageDomain.generateSceneIllustration({
      visualPrompt: scene.visualPrompt,
      sceneId: scene.sceneId,
      sceneText: scene.text,
      ageGroup: context.ageGroup,
      style: context.userStyle || context.imageDomain.buildImageStyle(context.ageGroup),
      characters: context.characters,
      referenceImages: referenceImages,
      mode: generationMode,
      // NEW: Pass scene context for better action/situation depiction
      sceneGoal: context.sceneGoal,
      sceneBeats: context.sceneBeats,
      sceneEmotion: context.sceneEmotion,
    });
    
    // Upload to storage
    const uploadResult = await context.assetStorage.uploadAsset({
      data: image.imageData,
      mimeType: image.mimeType,
      userId: context.userId,
      storyId: storyId,
      sceneId: sceneRecord.id,
      assetType: 'image',
    });
    
    // Save asset to database
    await db.insert(assets).values({
      storyId: storyId,
      sceneId: sceneRecord.id,
      assetType: 'image',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      mimeType: image.mimeType,
      fileSizeBytes: uploadResult.fileSizeBytes,
      generationParams: {
        mode: generationMode,
        style: context.userStyle,
        visualPrompt: scene.visualPrompt,
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
      error, 
      sceneId: scene.sceneId,
      stack: error instanceof Error ? error.stack : undefined 
    }, 'Failed to generate scene image');
    throw error;
  }
}

/**
 * Check if story has generated portraits
 */
async function hasGeneratedPortraits(storyId: string): Promise<boolean> {
  const refs = await db
    .select()
    .from(generatedReferences)
    .where(eq(generatedReferences.storyId, storyId))
    .limit(1);
  
  return refs.length > 0;
}

/**
 * Build a composed visual prompt that combines:
 * 1. Environment description (persistent setting from environments array)
 * 2. Transient context from non-generated neighboring scenes
 * 3. Current scene's action-focused visualPrompt
 *
 * This ensures no visual details are lost when images are generated for a subset of scenes.
 */
function buildComposedVisualPrompt(params: {
  scene: SceneData;
  sceneIndexInAll: number;
  generatedIndices: number[];
  allScenes: SceneData[];
  environmentMap: Map<string, StoryEnvironment>;
}): string {
  const { scene, sceneIndexInAll, generatedIndices, allScenes, environmentMap } = params;

  const parts: string[] = [];

  // 1. Resolve environment (persistent setting)
  const environmentId = (scene as any).environmentId as string | undefined;
  const environment = environmentId ? environmentMap.get(environmentId) : undefined;

  if (environment) {
    parts.push(`SETTING: ${environment.visualDescription}`);
  }

  // 2. Collect transient context from skipped scenes between previous generated and current
  const currentPos = generatedIndices.indexOf(sceneIndexInAll);
  const previousGeneratedIndex = currentPos > 0 ? generatedIndices[currentPos - 1] : -1;

  const skippedContextParts: string[] = [];
  for (let i = previousGeneratedIndex + 1; i < sceneIndexInAll; i++) {
    if (i >= 0 && i < allScenes.length && !generatedIndices.includes(i)) {
      const skippedScene = allScenes[i];
      if (skippedScene.visualPrompt) {
        skippedContextParts.push(`- Scene ${skippedScene.sceneId}: ${skippedScene.visualPrompt}`);
      }
    }
  }

  if (skippedContextParts.length > 0) {
    parts.push(`SCENE CONTEXT (from preceding story moments not illustrated):\n${skippedContextParts.join('\n')}`);
  }

  // 3. Current scene action
  parts.push(`CURRENT SCENE ACTION:\n${scene.visualPrompt}`);

  // 4. If we added context, append instruction to include persistent details
  if (environment || skippedContextParts.length > 0) {
    parts.push('Include relevant environmental and contextual details that naturally persist in the current scene.');
  }

  const composed = parts.join('\n\n');

  logger.info({
    sceneId: scene.sceneId,
    sceneIndexInAll,
    environmentId: environmentId || 'MISSING',
    environmentName: environment?.name || 'N/A',
    environmentResolved: !!environment,
    environmentDescriptionPreview: environment?.visualDescription?.substring(0, 100) || 'N/A',
    skippedSceneIds: skippedContextParts.map(p => {
      const match = p.match(/Scene (\d+)/);
      return match ? parseInt(match[1]) : null;
    }).filter(Boolean),
    skippedScenesCount: skippedContextParts.length,
    originalVisualPrompt: scene.visualPrompt,
    composedLength: composed.length,
  }, 'Composed visual prompt — environment + skipped context + action');

  logger.debug({
    sceneId: scene.sceneId,
    composedVisualPrompt: composed,
  }, 'Full composed visual prompt text');

  return composed;
}

/**
 * Generate image for a single scene using reference-based approach (Nano Banana Pro)
 * Returns the image data (base64) for use as reference in subsequent scenes
 */
/**
 * Generate scene image with character-aware reference selection
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
      source?: string;
      characterName?: string;
      type?: string;
      sceneId?: number;
      url?: string;
    }> 
  }
): Promise<{ base64: string; mimeType: string; sceneDbId: string; imageUrl: string }> {
  const startTime = Date.now();
  
  try {
    // Get scene record from database
    const [sceneRecord] = await db
      .select()
      .from(scenesTable)
      .where(and(
        eq(scenesTable.storyId, storyId),
        eq(scenesTable.sceneId, scene.sceneId)
      ))
      .limit(1);
    
    if (!sceneRecord) {
      throw new Error(`Scene ${scene.sceneId} not found for story ${storyId}`);
    }
    
    // Build character descriptions from AI analysis
    const characterDescriptions = context.characters.map(char => ({
      name: char.name,
      detailedDescription: (char as any).aiGeneratedDescription || char.appearance || char.description || `${char.name}`,
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
        detailedDescription: (context.childProfile as any).aiGeneratedDescription || `${context.childProfile.name}`,
        clothing: (context.childProfile as any).clothing,
        distinctiveFeatures: (context.childProfile as any).distinctiveFeatures
      });
      
      logger.debug({
        storyId,
        sceneId: scene.sceneId,
        childName: context.childProfile.name
      }, 'Added child profile to character descriptions for image generation');
    }
    
    // Build reference images array with character-aware instruction text
    const referenceImagesArray = context.referenceImageDataArray?.map((ref, index) => {
      const meta: ReferenceMetadata = {
        imageNumber: index + 1,
        source: (ref as any).source === 'imaginary_friend' ? 'imaginary_friend' : 'previous_scene',
        characterName: (ref as any).characterName || 'unknown',
      };

      if ((ref as any).type === 'imaginary_friend') {
        // Find this character's description from the descriptions we already built
        const charDesc = characterDescriptions.find(
          c => c.name === (ref as any).characterName
        );
        meta.characterDescription = charDesc?.detailedDescription;
      } else {
        // Scene reference — include all characters present with their descriptions
        meta.charactersPresent = (ref as any).charactersPresent || [];
        meta.sceneId = (ref as any).sceneId;
        meta.characterDescriptions = ((ref as any).charactersPresent || [])
          .map((name: string) => {
            const desc = characterDescriptions.find(
              c => normalizeCharacterName(c.name) === name
            );
            return desc
              ? { name: desc.name, description: desc.detailedDescription }
              : null;
          })
          .filter(Boolean) as Array<{ name: string; description: string }>;
      }

      return {
        base64Data: ref.base64,
        mimeType: ref.mimeType,
        instructionText: buildReferenceInstructionText(meta),
      };
    });
    
    // Generate scene with reference approach
    const image = await context.imageDomain.generateSceneWithReference({
      visualPrompt: scene.visualPrompt,
      sceneId: scene.sceneId,
      sceneText: scene.text,
      ageGroup: context.ageGroup,
      style: context.userStyle || context.imageDomain.buildImageStyle(context.ageGroup),
      characterDescriptions,
      referenceImages: referenceImagesArray, // Array of references
      sceneGoal: context.sceneGoal,
      sceneBeats: context.sceneBeats,
      sceneEmotion: context.sceneEmotion,
    });
    
    // Upload to storage
    const uploadResult = await context.assetStorage.uploadAsset({
      data: image.imageData,
      mimeType: image.mimeType,
      userId: context.userId,
      storyId: storyId,
      sceneId: sceneRecord.id,
      assetType: 'image',
    });
    
    // Save asset to database
    await db.insert(assets).values({
      storyId: storyId,
      sceneId: sceneRecord.id,
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
        style: context.userStyle,
        visualPrompt: scene.visualPrompt,
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
      error, 
      sceneId: scene.sceneId,
      stack: error instanceof Error ? error.stack : undefined 
    }, 'Failed to generate scene image');
    throw error;
  }
}

/**
 * Metadata for building character-aware reference instruction text
 */
interface ReferenceMetadata {
  imageNumber: number;
  source: 'imaginary_friend' | 'previous_scene';
  characterName: string;
  characterDescription?: string;
  charactersPresent?: string[];
  characterDescriptions?: Array<{ name: string; description: string }>;
  sceneId?: number;
}

/**
 * Build character-aware reference instruction text
 * Tells the image model exactly WHO is on each reference image
 */
function buildReferenceInstructionText(meta: ReferenceMetadata): string {
  if (meta.source === 'imaginary_friend') {
    // Imaginary friend drawing — typically one character
    const desc = meta.characterDescription
      ? ` (${meta.characterDescription})`
      : '';
    return `- Image ${meta.imageNumber}: Child's drawing of imaginary friend "${meta.characterName}"${desc}.
Reproduce this character EXACTLY as drawn: same shape, colors, proportions, and distinctive features. This drawing defines what "${meta.characterName}" looks like.
CRITICAL: Do NOT add, invent, or fill in any body parts or facial features that are NOT present in the original drawing. If the drawing has no eyes on the face — do NOT draw eyes on the face. If the drawing has eyes only on stalks — draw eyes ONLY on stalks. Reproduce ONLY what exists in the drawing, nothing more.`;
  }

  // Scene reference — may contain multiple characters
  const charList = meta.charactersPresent?.length
    ? meta.charactersPresent.join(', ')
    : meta.characterName;

  let charDescriptions = '';
  if (meta.characterDescriptions && meta.characterDescriptions.length > 0) {
    charDescriptions = '\nCharacters in this image:\n' +
      meta.characterDescriptions
        .map(c => `  - ${c.name}: ${c.description}`)
        .join('\n');
  }

  return `- Image ${meta.imageNumber}: Previously generated illustration (scene ${meta.sceneId}) showing: ${charList}.${charDescriptions}
Match the EXACT appearance of ALL characters from this image: faces, hair, clothing, body proportions, colors, and distinctive features must remain identical.`;
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
  
  // Get generated portraits if no user photos (optimized - single query)
  if (references.length === 0) {
    const generatedRefs = await db
      .select({
        characterName: generatedReferences.characterName,
        assetId: generatedReferences.assetId,
        characterDescription: generatedReferences.characterDescription,
      })
      .from(generatedReferences)
      .where(eq(generatedReferences.storyId, storyId));
    
    // Get all assets in one query instead of N queries
    if (generatedRefs.length > 0) {
      const assetIds = generatedRefs.map(r => r.assetId).filter((id): id is string => !!id);
      
      if (assetIds.length > 0) {
        const assetRecords = await db
          .select()
          .from(assets)
          .where(inArray(assets.id, assetIds));
        
        const assetMap = new Map(assetRecords.map(a => [a.id, a]));
        
        for (const ref of generatedRefs) {
          if (ref.assetId && sceneCharacters.some(c => c.name && c.name === ref.characterName)) {
            const asset = assetMap.get(ref.assetId);
            if (asset && asset.storageUrl) {
              references.push({
                url: asset.storageUrl,
                characterName: ref.characterName || 'unknown',
                subjectDescription: ref.characterDescription || ref.characterName || 'character',
              });
            }
          }
        }
      }
    }
  }
  
  // Add child profile reference photos if applicable
  if (childProfile?.referencePhotos && childProfile.name) {
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
  
  return references;
}

/**
 * Save generated story to database
 * M4: Also saves scenes to separate table and llmGeneratedCharacters to metadata
 * Uses transaction for atomic operations
 */
async function saveStory(
  request: { id: string; userId: string; childProfileId?: string | null; goal?: string | null; tone?: string | null },
  spec: StorySpec,
  outline: any,
  text: { title: string; language: string; scenes: any[]; fullText: string; wordCount: number },
  mergedCharacters: CharacterReference[],
  generationTimeMs: number
): Promise<string> {
  try {
    // Calculate estimated read time (average 200 words per minute)
    const estimatedReadMinutes = Math.ceil(text.wordCount / 200);
    
    // Extract LLM-generated characters
    const llmCharacters = (outline as any).characters || [];
    
    // Use transaction for atomic story creation
    const storyId = await db.transaction(async (tx) => {
      // Create story record with metadata
      const [story] = await tx.insert(stories).values({
        userId: request.userId,
        childProfileId: request.childProfileId,
        storyRequestId: request.id,
        title: text.title,
        language: text.language,
        ageGroup: spec.ageGroup,
        moralTheme: request.goal,
        tone: request.tone,
        outline: outline,
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
        },
        policyChecks: {
          outlineValidated: true,
          textValidated: true,
          timestamp: new Date().toISOString()
        },
        isPublished: true,
        isFavorite: false
      }).returning();
      
      logger.info({ storyId: story.id }, 'Story saved to database');
      
      // Save all scenes in parallel within transaction
      await Promise.all(
        text.scenes.map(scene => {
          // Normalize character names for storage (M9)
          const normalizedCharacters = (scene.characters || [])
            .map(name => normalizeCharacterName(name));
          
          return tx.insert(scenesTable).values({
            storyId: story.id,
            sceneId: scene.sceneId,
            text: scene.text,
            visualPrompt: scene.visualPrompt,
            charactersPresent: normalizedCharacters, // NEW M9: Store normalized character names
            generationParams: {
              wordCount: scene.text.split(/\s+/).length,
            },
          });
        })
      );
      
      logger.info({ storyId: story.id, sceneCount: text.scenes.length }, 'Scenes saved to table');
      
      // Link characters if any (exclude children - they're in child_profiles, not characters)
      const charactersToLink = spec.characters.filter(
        character => character.id && character.type !== 'child'
      );
      
      if (charactersToLink.length > 0) {
        await Promise.all(
          charactersToLink.map(character => 
            tx.insert(storyCharacters).values({
              storyId: story.id,
              characterId: character.id!,
              role: character.role || 'supporting',
            }).catch(err => {
              // Ignore duplicate key errors
              if (!err.message.includes('duplicate')) {
                logger.error({ error: err, characterId: character.id }, 'Failed to link character');
                throw err;
              }
            })
          )
        );
        
        logger.info({ 
          storyId: story.id, 
          characterCount: charactersToLink.length,
          totalInSpec: spec.characters.length
        }, 'Characters linked to story (children excluded)');
      }
      
      return story.id;
    });
    
    return storyId;
  } catch (error) {
    logger.error({ error, requestId: request.id }, 'Failed to save story');
    throw error;
  }
}

/**
 * Process a continuation request (M8)
 * Similar to processStoryRequest but uses existing series context
 */
export async function processContinuationRequest(requestId: string): Promise<void> {
  const startTime = Date.now();
  
  try {
    logger.info({ requestId }, 'Processing continuation request');
    
    // Get request details
    const [request] = await db
      .select()
      .from(storyRequests)
      .where(eq(storyRequests.id, requestId))
      .limit(1);
    
    if (!request) {
      throw new Error(`Continuation request ${requestId} not found`);
    }
    
    // Extract continuation context from intermediate data
    const intermediateData = (request.intermediateData as any) || {};
    const { seriesId, partNumber, continuationContext } = intermediateData;
    
    if (!seriesId || !continuationContext) {
      throw new Error('Invalid continuation request: missing series context');
    }
    
    // Update status to 'processing'
    await db
      .update(storyRequests)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(storyRequests.id, requestId));
    
    logger.info({ requestId, seriesId, partNumber }, 'Processing continuation');
    
    // Get Domain Services
    const storyDomain = getStoryDomainService();
    const imageDomain = getImageDomainService();
    const assetStorage = getAssetStorageService();
    
    // Get user plan features
    const userPlan = await getPlanFeatures(request.userId);
    
    // Build story spec for continuation
    const specData = await buildStorySpec(request);
    const spec = specData.spec;
    
    // DEBUG: Log language values
    logger.info({
      requestId,
      requestStoryLanguage: request.storyLanguage,
      specLanguage: spec.language,
    }, 'Language values before story creation');
    
    // Task 1: Generate Continuation Text
    await startTask(requestId, STORY_TASKS.GENERATING_TEXT);
    const text = await storyDomain.generateContinuation({
      spec,
      previousOutlines: continuationContext.previousOutlines,
      requiredCharacters: continuationContext.requiredCharacters,
      optionalCharacters: continuationContext.optionalCharacters,
      usedPlots: continuationContext.usedPlots,
    });
    await completeTask(requestId, STORY_TASKS.GENERATING_TEXT);
    
    logger.info({ requestId, title: text.title, wordCount: text.wordCount }, 'Continuation text generated');
    
    // Create outline structure for compatibility
    const outline = {
      title: text.title,
      language: request.storyLanguage || 'uk', // Use storyLanguage field, not language
      moral: text.moral,
      scenes: text.scenes.map((scene, idx) => ({
        sceneId: scene.sceneId,
        setting: '',
        goal: '',
        emotion: 'neutral' as const,
        beats: [],
        visualPrompt: scene.visualPrompt,
      })),
      safetyNotes: [],
    };
    
    // Extract LLM-generated characters (new characters from this episode)
    const llmCharacters = (text.characters || []).map(char => ({
      name: char.name,
      type: char.type,
      description: char.description,
      role: char.role,
      personality: char.personality,
      appearance: char.description,
    }));
    
    logger.info({
      llmCharacterCount: llmCharacters.length,
      llmCharacterNames: llmCharacters.map(c => c.name).join(', ')
    }, 'New characters in continuation');
    
    // Merge ALL characters for image generation (required + optional + new)
    const allCharacters = [
      ...(continuationContext.requiredCharacters || []),
      ...(continuationContext.optionalCharacters || []),
      ...llmCharacters,
    ];
    
    // Create continuation story in database FIRST (to get storyId for scenes and images)
    const [createdStory] = await db.insert(stories).values({
      userId: request.userId,
      childProfileId: request.childProfileId,
      storyRequestId: request.id,
      title: text.title,
      language: request.storyLanguage || 'uk', // Use storyLanguage field from request, fallback to 'uk'
      ageGroup: spec.ageGroup,
      tone: request.tone,
      moralTheme: request.goal,
      outline: outline as any,
      scenes: text.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        text: scene.text,
        visualPrompt: scene.visualPrompt,
        imageUrl: null, // Will be updated after image generation
      })),
      fullText: text.fullText,
      wordCount: text.wordCount,
      estimatedReadMinutes: Math.ceil(text.wordCount / 200),
      metadata: {
        llmGeneratedCharacters: llmCharacters,
        mergedCharacters: allCharacters, // Store all characters
        imageStyle: request.imageStyle,
        generatedAt: new Date().toISOString(),
      },
      modelVersion: 'gemini-2.0-flash-exp',
      generationTimeMs: Date.now() - startTime,
      isPublished: true,
      // Series fields
      seriesId: seriesId,
      partNumber: partNumber,
    }).returning();
    
    const storyId = createdStory.id;
    logger.info({ storyId, seriesId, partNumber }, 'Continuation story created');
    
    // Create scene records in database
    await Promise.all(
      text.scenes.map(async (scene) => {
        // Normalize character names for storage (M9)
        const normalizedCharacters = (scene.characters || [])
          .map(name => normalizeCharacterName(name));
        
        await db.insert(scenesTable).values({
          storyId: storyId,
          sceneId: scene.sceneId,
          text: scene.text,
          visualPrompt: scene.visualPrompt,
          charactersPresent: normalizedCharacters, // NEW M9: Store normalized character names
        });
      })
    );
    
    logger.info({ storyId, sceneCount: text.scenes.length }, 'Continuation scenes saved to DB');
    
    // Task 2: Generate Scene Images (using reference-based approach from FIRST PART)
    await startTask(requestId, STORY_TASKS.GENERATING_IMAGES);
    
    if (config.image.skipGeneration) {
      logger.info({ requestId, storyId }, 'Continuation image generation skipped (SKIP_IMAGE_GENERATION=true)');
    } else {
    
    const imagesPerStory = userPlan.imagesPerStory || 0;
    
    // Calculate evenly distributed scene indices instead of generating ALL scenes
    const sceneIndices: number[] = [];
    const totalScenes = text.scenes.length;
    
    if (imagesPerStory > 0 && totalScenes > 0) {
      for (let i = 0; i < imagesPerStory; i++) {
        // Distribute images evenly across the story
        // Example: 8 scenes, 3 images → indices [1, 4, 6]
        const index = Math.floor((i + 0.5) * totalScenes / imagesPerStory);
        sceneIndices.push(Math.min(index, totalScenes - 1)); // Ensure within bounds
      }
    }
    
    const scenesToGenerate = sceneIndices.map(i => text.scenes[i]);
    
    logger.info({ 
      requestId, 
      totalScenes,
      imagesPerStory,
      sceneIndices,
      sceneCount: scenesToGenerate.length
    }, 'Selected scenes for continuation image generation (evenly distributed)');

    // Build environment map for visual prompt composition (continuation)
    const continuationEnvironmentMap = new Map<string, StoryEnvironment>();
    const continuationEnvironments = (text as any).environments as StoryEnvironment[] | undefined;
    if (continuationEnvironments && continuationEnvironments.length > 0) {
      for (const env of continuationEnvironments) {
        continuationEnvironmentMap.set(env.id, env);
      }
      logger.info({
        requestId,
        environmentCount: continuationEnvironments.length,
        environmentIds: continuationEnvironments.map(e => e.id),
      }, 'Built environment map from continuation LLM output');
    } else {
      logger.warn({ requestId }, 'No environments in continuation LLM output — visual prompts will not include environment context');
    }

    // CRITICAL: Get reference image from FIRST PART of series for visual consistency
    let referenceImageFromFirstPart: { base64: string; mimeType: string } | undefined = undefined;
    
    try {
      // Get the first story ID from series
      const [series] = await db.select().from(storySeries).where(eq(storySeries.id, seriesId));
      
      if (series && series.storyIds && (series.storyIds as string[]).length > 0) {
        const firstStoryId = (series.storyIds as string[])[0];
        logger.info({ firstStoryId, seriesId }, 'Loading reference image from first part of series');
        
        // Get first story's scenes
        const firstStoryScenes = await db
          .select()
          .from(scenesTable)
          .where(eq(scenesTable.storyId, firstStoryId));
        
        logger.debug({ 
          scenesCount: firstStoryScenes.length,
          firstSceneHasImageUrl: !!firstStoryScenes[0]?.imageUrl
        }, 'Loaded scenes from first story');
        
        // Find first scene with an image (check both imageUrl field and assets table)
        let imageStoragePath: string | null = null;
        
        for (const scene of firstStoryScenes) {
          // First check if imageUrl is populated (new stories after M9)
          if (scene.imageUrl) {
            imageStoragePath = scene.imageUrl;
            logger.info({ 
              sceneId: scene.sceneId, 
              imageUrl: scene.imageUrl 
            }, 'Found reference image URL from first part (from scenes.imageUrl)');
            break;
          }
          
          // Fallback: check assets table (older stories before M9)
          const [asset] = await db
            .select()
            .from(assets)
            .where(and(
              eq(assets.sceneId, scene.id),
              eq(assets.assetType, 'image')
            ))
            .limit(1);
          
          if (asset && asset.storagePath) {
            imageStoragePath = asset.storagePath;
            logger.info({ 
              sceneId: scene.sceneId, 
              storagePath: asset.storagePath 
            }, 'Found reference image from first part (from assets table)');
            break;
          }
        }
        
        if (imageStoragePath) {
          // Fetch the image from asset storage
          const imageBuffer = await assetStorage.getAssetByPath(imageStoragePath);
          
          if (imageBuffer) {
            referenceImageFromFirstPart = {
              base64: imageBuffer.toString('base64'),
              mimeType: 'image/png', // Our system stores PNGs
            };
            
            logger.info({ 
              base64Length: referenceImageFromFirstPart.base64.length,
              storagePath: imageStoragePath
            }, 'Successfully loaded reference image from first part');
          } else {
            logger.warn({ imageStoragePath }, 'Image file not found in storage');
          }
        } else {
          logger.warn({ firstStoryId, scenesCount: firstStoryScenes.length }, 'No images found in first part - will generate without reference');
        }
      }
    } catch (error) {
      logger.error({ error, seriesId }, 'Failed to load reference image from first part - continuing without reference');
      // Continue without reference - not a critical error
    }
    
    if (scenesToGenerate.length > 0) {
      // Build character registry and description map (same as main generation M9)
      const characterRegistry = buildCharacterRegistry(
        allCharacters,
        spec.childProfile,
        []
      );
      
      const characterDescriptionMap = new Map<string, any>();
      for (const char of allCharacters) {
        const normalized = normalizeCharacterName(char.name);
        characterDescriptionMap.set(normalized, char);
      }
      
      // SEQUENTIAL IMAGE GENERATION with character-aware references (M9)
      for (let i = 0; i < scenesToGenerate.length; i++) {
        const scene = scenesToGenerate[i];
        
        logger.info({ 
          sceneId: scene.sceneId, 
          sceneIndex: i + 1,
          totalScenes: scenesToGenerate.length 
        }, 'Generating continuation scene image');
        
        // Normalize scene character names
        const sceneCharacters = scene.characters || [];
        const normalizedCharacters = sceneCharacters
          .map(name => normalizeCharacterName(name));
        
        // Select references for this scene
        const referenceSelection = await selectReferencesForScene(
          storyId,
          normalizedCharacters,
          scene.sceneId
        );
        
        // For first scene, prioritize reference from first part
        let referenceImageDataArray: Array<{ base64: string; mimeType: string }> = [];
        
        if (i === 0 && referenceImageFromFirstPart) {
          // Use reference from first part for first scene
          referenceImageDataArray = [referenceImageFromFirstPart];
          logger.info({ sceneId: scene.sceneId }, 'Using reference from first part for first continuation scene');
        } else {
          // Use character-aware reference selection for other scenes
          referenceImageDataArray = await Promise.all(
            referenceSelection.referenceImages.map(ref => 
              loadReferenceImageData(ref.imageUrl, assetStorage)
            )
          );
        }
        
        // Filter character descriptions to only include characters in THIS scene
        const sceneCharacterDescriptions = normalizedCharacters
          .map(normalized => characterDescriptionMap.get(normalized))
          .filter(Boolean) as any[];
        
        logger.info({
          sceneId: scene.sceneId,
          charactersInScene: sceneCharacters,
          normalizedCharacters,
          referenceCount: referenceImageDataArray.length,
          usedReferenceFromFirstPart: i === 0 && !!referenceImageFromFirstPart,
        }, 'Generating continuation scene with character-aware references');
        
        try {
          // Compose enriched visual prompt with environment + skipped scene context
          const composedVisualPrompt = buildComposedVisualPrompt({
            scene,
            sceneIndexInAll: sceneIndices[i],
            generatedIndices: sceneIndices,
            allScenes: text.scenes as SceneData[],
            environmentMap: continuationEnvironmentMap,
          });

          // Create scene copy with enriched visual prompt
          const enrichedScene: SceneData = { ...scene, visualPrompt: composedVisualPrompt };

          const imageResult = await generateSceneImageWithReference(storyId, enrichedScene, {
            childProfile: spec.childProfile,
            characters: sceneCharacterDescriptions, // ONLY scene characters
            userStyle: (spec as any).imageStyle,
            ageGroup: spec.ageGroup,
            userPlan,
            userId: request.userId,
            assetStorage,
            imageDomain,
            sceneGoal: undefined,
            sceneBeats: undefined,
            sceneEmotion: undefined,
            referenceImageDataArray: referenceImageDataArray, // Use array
          });
          
          // Mark as reference if it introduces new characters
          if (referenceSelection.shouldMarkAsReference) {
            await markSceneAsReference(
              imageResult.sceneDbId,
              normalizedCharacters,
              imageResult.imageUrl
            );
          }
          
          await updateTaskProgress(
            requestId,
            STORY_TASKS.GENERATING_IMAGES,
            (i + 1) / scenesToGenerate.length,
            { current: i + 1, total: scenesToGenerate.length }
          );
        } catch (error) {
          logger.error({ error, sceneId: scene.sceneId }, 'Failed to generate continuation scene image');
        }
      }
      
      logger.info('All continuation scenes generated');
    }
    
    } // end if !skipGeneration
    
    await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
    
    logger.info({ storyId }, 'Continuation images complete');
    
    // Fetch actual image URLs from database (already uploaded by generateSceneImageWithReference)
    const sceneRecords = await db
      .select()
      .from(scenesTable)
      .where(eq(scenesTable.storyId, storyId));
    
    // Update story with scene image URLs
    await db.update(stories)
      .set({
        scenes: text.scenes.map((scene) => {
          const sceneRecord = sceneRecords.find(r => r.sceneId === scene.sceneId);
          return {
            sceneId: scene.sceneId,
            text: scene.text,
            visualPrompt: scene.visualPrompt,
            imageUrl: sceneRecord?.imageUrl || null,
          };
        }),
      })
      .where(eq(stories.id, storyId));
    
    logger.info({ storyId }, 'Story updated with image URLs');
    
    // Update series with new story
    const { addContinuationToSeries } = await import('./seriesService');
    await addContinuationToSeries(seriesId, storyId, createdStory);
    
    // Mark request as completed
    await db.update(storyRequests).set({
      status: 'completed',
      progress: 100,
      storyId: storyId,
      updatedAt: new Date(),
    }).where(eq(storyRequests.id, requestId));
    
    const totalTime = Date.now() - startTime;
    logger.info({
      requestId,
      storyId: storyId,
      seriesId,
      partNumber,
      totalTimeMs: totalTime
    }, 'Continuation request completed successfully');
    
  } catch (error) {
    logger.error({ error, requestId }, 'Continuation request failed');
    
    // Mark request as failed
    await db.update(storyRequests).set({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      updatedAt: new Date(),
    }).where(eq(storyRequests.id, requestId));
    
    throw error;
  }
}

/**
 * Get story request status
 */
export async function getStoryRequestStatus(requestId: string, userId: string): Promise<{
  id: string;
  status: string;
  progress: number | null;
  progressData: StoryProgress | null;
  storyId: string | null;
  errorMessage: string | null;
  createdAt: Date;
} | null> {
  const [request] = await db
    .select()
    .from(storyRequests)
    .where(and(
      eq(storyRequests.id, requestId),
      eq(storyRequests.userId, userId)
    ))
    .limit(1);
  
  if (!request) {
    return null;
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
 * Get story by ID
 */
export async function getStory(storyId: string, userId: string) {
  const [story] = await db
    .select()
    .from(stories)
    .where(and(
      eq(stories.id, storyId),
      eq(stories.userId, userId)
    ))
    .limit(1);
  
  if (!story) {
    return null;
  }
  
  // Get linked characters
  const linkedCharacters = await db
    .select({
      id: characters.id,
      name: characters.name,
      type: characters.type,
      role: storyCharacters.role
    })
    .from(storyCharacters)
    .innerJoin(characters, eq(storyCharacters.characterId, characters.id))
    .where(eq(storyCharacters.storyId, storyId));
  
  return {
    id: story.id,
    title: story.title,
    language: story.language,
    ageGroup: story.ageGroup,
    moralTheme: story.moralTheme,
    tone: story.tone,
    scenes: story.scenes,
    fullText: story.fullText,
    wordCount: story.wordCount,
    estimatedReadMinutes: story.estimatedReadMinutes,
    outline: story.outline,
    audioMetadata: story.audioMetadata, // M7: Include audio metadata for alignment
    characters: linkedCharacters,
    isFavorite: story.isFavorite,
    createdAt: story.createdAt,
    // M8: Series fields
    seriesId: story.seriesId,
    partNumber: story.partNumber,
  };
}

/**
 * Enrich scenes with image data from assets table
 */
async function enrichScenesWithImages(storyId: string, scenes: any[]): Promise<any[]> {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return scenes;
  }

  // Get all image assets for this story
  const imageAssets = await db
    .select({
      id: assets.id,
      url: assets.storageUrl,
      signedUrl: assets.signedUrl,
      signedUrlExpiresAt: assets.signedUrlExpiresAt,
      storagePath: assets.storagePath,
      generationParams: assets.generationParams,
      visualPrompt: sql<string>`${assets.generationParams}->>'visualPrompt'`,
    })
    .from(assets)
    .where(and(
      eq(assets.storyId, storyId),
      eq(assets.assetType, 'image'),
      eq(assets.status, 'completed')
    ));

  // Generate fresh signed URLs for assets that need them
  const assetStorage = getAssetStorageService();
  const assetsWithSignedUrls = await Promise.all(
    imageAssets.map(async (asset) => {
      // Always generate fresh signed URLs for library listing
      // to avoid 401 errors from expired or invalid URLs
      if (asset.storagePath) {
        try {
          const { signedUrl, expiresAt } = await assetStorage.generateSignedUrl(
            asset.storagePath,
            24 // 24 hours
          );
          
          // Update asset with new signed URL
          await db
            .update(assets)
            .set({
              signedUrl,
              signedUrlExpiresAt: expiresAt,
            })
            .where(eq(assets.id, asset.id));
          
          return { ...asset, signedUrl, signedUrlExpiresAt: expiresAt };
        } catch (error) {
          logger.error({ err: error, assetId: asset.id }, 'Failed to generate signed URL');
          return asset;
        }
      }
      
      return asset;
    })
  );

  logger.debug({
    storyId,
    imageAssetsCount: assetsWithSignedUrls.length,
    firstAsset: assetsWithSignedUrls[0] ? {
      hasSignedUrl: !!assetsWithSignedUrls[0].signedUrl,
      hasStorageUrl: !!assetsWithSignedUrls[0].url,
      visualPromptLength: assetsWithSignedUrls[0].visualPrompt?.length,
    } : null,
  }, 'enrichScenesWithImages - assets fetched with signed URLs');

  // Match assets to scenes by visualPrompt
  const enrichedScenes = scenes.map(scene => {
    const matchingAsset = assetsWithSignedUrls.find(asset => {
      const scenePrompt = scene.visualPrompt?.trim().replace(/\s+/g, ' ');
      const assetPrompt = asset.visualPrompt?.trim().replace(/\s+/g, ' ');
      return scenePrompt && assetPrompt && scenePrompt === assetPrompt;
    });

    return {
      ...scene,
      image: matchingAsset ? {
        url: matchingAsset.signedUrl || matchingAsset.url,
        expiresAt: matchingAsset.signedUrlExpiresAt,
      } : null,
    };
  });

  logger.debug({
    storyId,
    scenesWithImagesCount: enrichedScenes.filter(s => s.image).length,
    totalScenes: enrichedScenes.length,
  }, 'enrichScenesWithImages - scenes enriched');

  return enrichedScenes;
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
  } = {}
) {
  const { childProfileId: _childProfileId, language: _language, limit = 20, offset = 0, hasAudio } = options;
  
  // Build WHERE conditions
  const whereConditions = [eq(stories.userId, userId)];
  if (hasAudio) {
    whereConditions.push(isNotNull(stories.audioMetadata));
  }
  
  let query = db
    .select({
      id: stories.id,
      title: stories.title,
      language: stories.language,
      ageGroup: stories.ageGroup,
      wordCount: stories.wordCount,
      estimatedReadMinutes: stories.estimatedReadMinutes,
      isFavorite: stories.isFavorite,
      createdAt: stories.createdAt,
      scenes: stories.scenes,
      fullText: stories.fullText,
      audioMetadata: stories.audioMetadata,
      metadata: stories.metadata,
      status: stories.isPublished, // Map isPublished to status for client
      // M8: Series fields
      seriesId: stories.seriesId,
      partNumber: stories.partNumber,
    })
    .from(stories)
    .where(and(...whereConditions))
    .orderBy(desc(stories.createdAt))
    .limit(limit)
    .offset(offset);
  
  // Apply filters
  // Note: Drizzle ORM filter chaining would need to be done differently
  // For now, simple implementation
  
  const results = await query;
  
  // Enrich scenes with images from assets table
  const enrichedResults = await Promise.all(
    results.map(async (story) => {
      const enrichedScenes = await enrichScenesWithImages(story.id, story.scenes as any[]);
      return {
        ...story,
        scenes: enrichedScenes,
        status: story.status ? 'completed' : 'draft', // Convert boolean to status string
      };
    })
  );
  
  return enrichedResults;
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
  } = {}
): Promise<number> {
  const { childProfileId: _childProfileId, language: _language, hasAudio } = options;
  
  // Build WHERE conditions
  const whereConditions = [eq(stories.userId, userId)];
  if (hasAudio) {
    whereConditions.push(isNotNull(stories.audioMetadata));
  }
  
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(stories)
    .where(and(...whereConditions));
  
  return result[0]?.count || 0;
}

/**
 * Delete story
 */
export async function deleteStory(storyId: string, userId: string): Promise<boolean> {
  // Get story to check if it's part of a series
  const [story] = await db
    .select()
    .from(stories)
    .where(and(
      eq(stories.id, storyId),
      eq(stories.userId, userId)
    ));
  
  if (!story) {
    throw new Error('Story not found');
  }
  
  // If story is part of series, update series first
  if (story.seriesId) {
    const { removeStoryFromSeries } = await import('./seriesService');
    await removeStoryFromSeries(storyId, story.seriesId);
  }
  
  // Delete the story
  await db
    .delete(stories)
    .where(and(
      eq(stories.id, storyId),
      eq(stories.userId, userId)
    ));
  
  logger.info({ storyId, userId, hadSeries: !!story.seriesId }, 'Story deleted');
  
  return true;
}

/**
 * Get story manifest with all scenes and assets (M4)
 * Returns scenes with signed URLs for images and audio
 */
export async function getStoryManifest(storyId: string) {
  // Get story
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);
  
  if (!story) {
    throw new Error('Story not found');
  }
  
  // Get all scenes
  const storyScenes = await db
    .select()
    .from(scenesTable)
    .where(eq(scenesTable.storyId, storyId))
    .orderBy(scenesTable.sceneId);
  
  // Get all assets
  const storyAssets = await db
    .select()
    .from(assets)
    .where(eq(assets.storyId, storyId));
  
  // Build manifest
  const manifest = {
    storyId: story.id,
    title: story.title,
    language: story.language,
    ageGroup: story.ageGroup,
    fullText: story.fullText, // M6: Add fullText for alignment sync
    audioMetadata: story.audioMetadata,
    // M8: Series fields
    seriesId: story.seriesId,
    partNumber: story.partNumber,
    scenes: storyScenes.map(scene => {
      const sceneAssets = storyAssets.filter(
        a => a.sceneId === scene.id
      );
      
      const imageAsset = sceneAssets.find(a => a.assetType === 'image');
      const audioAsset = sceneAssets.find(a => a.assetType === 'audio');
      
      // Generate signed URLs for assets
      const generateSignedUrl = (storagePath: string): string => {
        const crypto = require('crypto');
        const secret = process.env.JWT_SECRET || 'dev-secret-key';
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        const token = crypto
          .createHmac('sha256', secret)
          .update(`${storagePath}:${expiresAt}`)
          .digest('hex');
        
        return `/api/v1/assets/${storagePath}?token=${token}&expires=${expiresAt}`;
      };
      
      return {
        sceneId: scene.sceneId,
        text: scene.text,
        visualPrompt: scene.visualPrompt,
        image: imageAsset ? {
          id: imageAsset.id,
          url: generateSignedUrl(imageAsset.storagePath),
          mimeType: imageAsset.mimeType,
          status: imageAsset.status,
        } : null,
        audio: audioAsset ? {
          id: audioAsset.id,
          url: generateSignedUrl(audioAsset.storagePath),
          mimeType: audioAsset.mimeType,
          status: audioAsset.status,
        } : null,
      };
    }),
    metadata: story.metadata,
    createdAt: story.createdAt,
  };
  
  return manifest;
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
  
  // Get story
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);
  
  if (!story) {
    throw new Error('Story not found');
  }
  
  // Get scene
  const [scene] = await db
    .select()
    .from(scenesTable)
    .where(and(
      eq(scenesTable.storyId, storyId),
      eq(scenesTable.sceneId, sceneId)
    ))
    .limit(1);
  
  if (!scene) {
    throw new Error(`Scene ${sceneId} not found`);
  }
  
  // Get user plan
  const userPlan = await getPlanFeatures(story.userId);
  
  // Delete old image asset
  const oldAssets = await db
    .select()
    .from(assets)
    .where(and(
      eq(assets.sceneId, scene.id),
      eq(assets.assetType, 'image')
    ));
  
  const assetStorage = getAssetStorageService();
  
  for (const oldAsset of oldAssets) {
    try {
      await assetStorage.deleteAsset(oldAsset.storagePath);
    } catch (error) {
      logger.warn({ error, assetId: oldAsset.id }, 'Failed to delete old asset from storage');
    }
    await db.delete(assets).where(eq(assets.id, oldAsset.id));
  }
  
  // Get characters from story metadata
  const metadata = story.metadata as any;
  const llmCharacters = metadata?.llmGeneratedCharacters || [];
  
  // Get user characters
  const userCharacters = await db
    .select()
    .from(storyCharacters)
    .innerJoin(characters, eq(storyCharacters.characterId, characters.id))
    .where(eq(storyCharacters.storyId, storyId));
  
  const mergedCharacters = mergeCharacters(
    userCharacters
      .filter(uc => uc.characters && uc.characters.name)  // Filter out null JOINs
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
      })),
    llmCharacters
  );
  
  // Get child profile
  let childProfile: ChildProfileData | undefined = undefined;
  if (story.childProfileId) {
    const [profile] = await db
      .select()
      .from(childProfiles)
      .where(eq(childProfiles.id, story.childProfileId))
      .limit(1);
    childProfile = profile ? profile as ChildProfileData : undefined;
  }
  
  // Generate new image
  const imageDomain = getImageDomainService();
  
  await generateSceneImage(storyId, {
    sceneId: scene.sceneId,
    text: scene.text,
    visualPrompt: visualPrompt || scene.visualPrompt,
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

  // Get story
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);

  if (!story) {
    throw new Error('Story not found');
  }

  // Check if audio already exists (skip if so)
  const existingAudio = await db
    .select()
    .from(audioAssets)
    .where(and(
      eq(audioAssets.storyId, storyId),
      eq(audioAssets.status, 'completed')
    ))
    .limit(1);

  if (existingAudio.length > 0 && !voiceId) {
    logger.info({ storyId }, 'Audio already exists, skipping generation');
    return;
  }

  // Update progress
  if (story.storyRequestId) {
    await updateTaskProgress(story.storyRequestId, STORY_TASKS.GENERATING_AUDIO, 0, {
      voiceId,
    });
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
    const result = await audioDomain.synthesizeStory(
      story, 
      {
        voiceId,
        speed: options?.speed,
        nightMode: options?.nightMode,
      },
      planType // Pass plan type for voice selection logic
    );

    // Update story metadata
    await db
      .update(stories)
      .set({
        audioMetadata: {
          voiceId: result.voiceId,
          voiceName: result.voiceName,
          totalDuration: result.duration,
          generatedAt: new Date().toISOString(),
          nightMode: options?.nightMode || false,
        } as any,
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId));

    // Complete task
    if (story.storyRequestId) {
      await completeTask(story.storyRequestId, STORY_TASKS.GENERATING_AUDIO);
    }

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

    // Update progress with error
    if (story.storyRequestId) {
      await updateTaskProgress(story.storyRequestId, STORY_TASKS.GENERATING_AUDIO, 0, {
        error: 'Audio generation failed',
      });
    }

    throw error;
  }
}



