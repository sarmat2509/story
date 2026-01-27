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
  characters 
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
} from './storyProgress';
import { buildPolicyProfile } from './policyService';
import type { StorySpec } from '../ai/types';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';
import type { CharacterReference } from '../prompts/image';
import { validate as isUUID } from 'uuid';
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
      userNotes: input.userNotes,
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
    
    // Get request details
    const [request] = await db
      .select()
      .from(storyRequests)
      .where(eq(storyRequests.id, requestId))
      .limit(1);
    
    if (!request) {
      throw new Error(`Story request ${requestId} not found`);
    }
    
    // Build story spec
    const { spec, selectedCharacters } = await buildStorySpec(request);
    
    // Get user plan features
    const userPlan = await getPlanFeatures(request.userId);
    
    // Get Domain Services
    const storyDomain = getStoryDomainService();
    const imageDomain = getImageDomainService();
    const assetStorage = getAssetStorageService();
    
    // Task 1: Generate Outline
    await startTask(requestId, STORY_TASKS.GENERATING_OUTLINE);
    const outline = await storyDomain.generateOutline(spec);
    await completeTask(requestId, STORY_TASKS.GENERATING_OUTLINE);
    
    logger.info({ requestId, title: outline.title }, 'Outline generated');
    
    // Extract LLM-generated characters from outline
    const llmCharacters = (outline as any).characters || [];
    
    // Merge user characters with LLM characters
    const mergedCharacters = mergeCharacters(selectedCharacters as CharacterData[], llmCharacters);
    
    // Task 2: Generate Text
    await startTask(requestId, STORY_TASKS.GENERATING_TEXT);
    let text = await storyDomain.generateText(spec, outline);
    await completeTask(requestId, STORY_TASKS.GENERATING_TEXT);
    
    logger.info({ requestId, wordCount: text.wordCount }, 'Text generated');
    
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
    
    // Save story with scenes
    const storyId = await saveStory(request, spec, outline, text, mergedCharacters, Date.now() - startTime);
    
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
              character: character.name,
              stack: error instanceof Error ? error.stack : undefined
            }, 'Failed to generate character portrait');
            // Continue with other portraits (graceful degradation)
          }
        }
      }
      
      await completeTask(requestId, STORY_TASKS.GENERATING_PORTRAITS);
    }
    
    // Task 5: Generate Scene Images (Parallel for all plans)
    await startTask(requestId, STORY_TASKS.GENERATING_IMAGES);
    
    const imagesPerStory = userPlan.imagesPerStory || 0;
    const scenesToGenerate = text.scenes.slice(0, imagesPerStory);
    
    if (scenesToGenerate.length > 0) {
      logger.info({ 
        requestId, 
        sceneCount: scenesToGenerate.length,
        plan: userPlan.allowGeneratedReferences ? 'premium' : 'free'
      }, 'Starting parallel scene image generation');
      
      // Generate ALL images in parallel (regardless of plan)
      await Promise.all(
        scenesToGenerate.map((scene, i) => 
          generateSceneImage(storyId, scene, {
            childProfile: spec.childProfile,
            characters: mergedCharacters,
            userStyle: (spec as any).imageStyle,
            ageGroup: spec.ageGroup,
            userPlan,
            userId: request.userId,
            assetStorage,
            imageDomain,
          }).then(() => {
            return updateTaskProgress(
              requestId,
              STORY_TASKS.GENERATING_IMAGES,
              (i + 1) / scenesToGenerate.length,
              { current: i + 1, total: scenesToGenerate.length }
            );
          }).catch(error => {
            logger.error({ error, sceneId: scene.sceneId }, 'Failed to generate scene image');
            // Continue with other images (graceful degradation)
          })
        )
      );
    }
    
    await completeTask(requestId, STORY_TASKS.GENERATING_IMAGES);
    
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
    logger.error({ error, requestId }, 'Story generation failed');
    
    await db
      .update(storyRequests)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount: sql`${storyRequests.retryCount} + 1`
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
  // Get child profile if specified
  let childName = 'дитя'; // Default name
  let ageGroup = '4-5'; // Default age group
  let childProfile: ChildProfileData | null = null;
  let selectedCharacters: CharacterData[] = [];
  
  if (request.childProfileId) {
    const [profile] = await db
      .select()
      .from(childProfiles)
      .where(eq(childProfiles.id, request.childProfileId))
      .limit(1);
    
    if (profile) {
      childName = profile.name;
      ageGroup = calculateAgeGroup(new Date(profile.birthDate));
      childProfile = profile as ChildProfileData;
      
      // Get characters for this user
      const userCharacters = await db
        .select()
        .from(characters)
        .where(and(
          eq(characters.userId, request.userId),
          eq(characters.isActive, true)
        ))
        .limit(5);
      
      selectedCharacters = userCharacters.map(c => ({
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
    }
  }
  
  // Build policy profile
  const policyProfile = await buildPolicyProfile(ageGroup, request.storyLanguage);
  
  const spec: StorySpec & { childProfile?: ChildProfileData } = {
    language: request.storyLanguage,
    ageGroup,
    childName,
    childProfile: childProfile || undefined,
    goal: request.goal || undefined,
    tone: request.tone || undefined,
    characters: selectedCharacters as any, // Cast to satisfy StorySpec type
    userNotes: request.userNotes || undefined,
    policyProfile
  };
  
  return { spec, selectedCharacters };
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
  
  const merged: CharacterData[] = [...userCharacters];
  
  for (const llmChar of llmCharacters) {
    // Validate LLM character structure
    if (!llmChar || typeof llmChar.name !== 'string') {
      logger.warn({ llmChar }, 'Invalid LLM character structure, skipping');
      continue;
    }
    
    const existingChar = merged.find(
      c => c.name && c.name.toLowerCase() === llmChar.name.toLowerCase()
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
    let referenceImages: Array<{ url: string; characterName: string }> = [];
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
 * Extract reference images for a specific scene
 * Optimized to avoid N+1 queries
 */
async function extractReferenceImagesForScene(
  storyId: string,
  scene: { text: string; sceneId: number },
  characters: CharacterReference[],
  childProfile?: { name: string; referencePhotos?: any[] }
): Promise<Array<{ url: string; characterName: string }>> {
  const references: Array<{ url: string; characterName: string }> = [];
  
  // Extract scene characters by name
  const sceneLower = scene.text.toLowerCase();
  const sceneCharacters = characters.filter(char =>
    sceneLower.includes(char.name.toLowerCase())
  );
  
  // Get user reference photos
  for (const char of sceneCharacters) {
    if (char.referencePhotos && char.referencePhotos.length > 0) {
      references.push({
        url: char.referencePhotos[0].url,
        characterName: char.name,
      });
    }
  }
  
  // Get generated portraits if no user photos (optimized - single query)
  if (references.length === 0) {
    const generatedRefs = await db
      .select({
        characterName: generatedReferences.characterName,
        assetId: generatedReferences.assetId,
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
          if (ref.assetId && sceneCharacters.some(c => c.name === ref.characterName)) {
            const asset = assetMap.get(ref.assetId);
            if (asset && asset.storageUrl) {
              references.push({
                url: asset.storageUrl,
                characterName: ref.characterName || 'unknown',
              });
            }
          }
        }
      }
    }
  }
  
  // Add child profile reference photos if applicable
  if (childProfile?.referencePhotos) {
    for (const photo of childProfile.referencePhotos) {
      if (photo.url) {
        references.push({
          url: photo.url,
          characterName: childProfile.name,
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
        text.scenes.map(scene => 
          tx.insert(scenesTable).values({
            storyId: story.id,
            sceneId: scene.sceneId,
            text: scene.text,
            visualPrompt: scene.visualPrompt,
            generationParams: {
              wordCount: scene.text.split(/\s+/).length,
            },
          })
        )
      );
      
      logger.info({ storyId: story.id, sceneCount: text.scenes.length }, 'Scenes saved to table');
      
      // Link characters if any
      if (spec.characters.length > 0) {
        await Promise.all(
          spec.characters
            .filter(character => character.id)
            .map(character => 
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
        
        logger.info({ storyId: story.id, characterCount: spec.characters.length }, 'Characters linked to story');
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
 * Get story request status
 */
export async function getStoryRequestStatus(requestId: string, userId: string) {
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
    characters: linkedCharacters,
    isFavorite: story.isFavorite,
    createdAt: story.createdAt
  };
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
  } = {}
) {
  const { childProfileId: _childProfileId, language: _language, limit = 20, offset = 0 } = options;
  
  let query = db
    .select({
      id: stories.id,
      title: stories.title,
      language: stories.language,
      ageGroup: stories.ageGroup,
      wordCount: stories.wordCount,
      estimatedReadMinutes: stories.estimatedReadMinutes,
      isFavorite: stories.isFavorite,
      createdAt: stories.createdAt
    })
    .from(stories)
    .where(eq(stories.userId, userId))
    .orderBy(desc(stories.createdAt))
    .limit(limit)
    .offset(offset);
  
  // Apply filters
  // Note: Drizzle ORM filter chaining would need to be done differently
  // For now, simple implementation
  
  const results = await query;
  
  return results;
}

/**
 * Delete story
 */
export async function deleteStory(storyId: string, userId: string): Promise<boolean> {
  await db
    .delete(stories)
    .where(and(
      eq(stories.id, storyId),
      eq(stories.userId, userId)
    ));
  
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
    scenes: storyScenes.map(scene => {
      const sceneAssets = storyAssets.filter(
        a => a.sceneId === scene.id
      );
      
      const imageAsset = sceneAssets.find(a => a.assetType === 'image');
      const audioAsset = sceneAssets.find(a => a.assetType === 'audio');
      
      return {
        sceneId: scene.sceneId,
        text: scene.text,
        visualPrompt: scene.visualPrompt,
        image: imageAsset ? {
          id: imageAsset.id,
          url: imageAsset.signedUrl || imageAsset.storageUrl,
          mimeType: imageAsset.mimeType,
          status: imageAsset.status,
        } : null,
        audio: audioAsset ? {
          id: audioAsset.id,
          url: audioAsset.signedUrl || audioAsset.storageUrl,
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
    userCharacters.map(uc => ({
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



