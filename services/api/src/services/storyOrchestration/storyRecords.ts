/**
 * Story record creation functions
 */

import { getStoryRepository, getCharacterRepository } from '../../repositories';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { normalizeCharacterName, crossScriptIdentityKey } from '../../utils/characterNormalization';
import { stripCharacterIds } from '../../utils/audioTags';
import { findOrCreateLlmCharacter, mapLlmTypeToCharacterType } from './llmCharacterPersistence';
import { createSceneRecords } from './utilities';
import type { CreateStoryParams, CreateStoryStubParams } from './types';
import type { CharacterData } from '../types';

/**
 * Create minimal story stub before text generation.
 * Returns storyId for AI usage tracking. On success, call enrichStoryRecord to fill content.
 */
export async function createStoryStub(params: CreateStoryStubParams): Promise<string> {
  const story = await getStoryRepository().createStory({
    userId: params.userId,
    childProfileId: params.childProfileId,
    storyRequestId: params.storyRequestId,
    title: 'Generating...',
    language: params.spec.language,
    ageGroup: params.spec.ageGroup,
    moralTheme: null,
    outline: null,
    scenes: [],
    fullText: '',
    wordCount: 0,
    estimatedReadMinutes: 0,
    modelVersion: null,
    generationTimeMs: null,
    metadata: null,
    policyChecks: null,
    isPublished: false,
    isFavorite: false,
    visibility: null,
    hidden: params.isScheduledContinuation ?? false,
    ...(params.seriesData && {
      seriesId: params.seriesData.seriesId,
      partNumber: params.seriesData.partNumber,
    }),
  });
  logger.info({ storyId: story.id }, 'Story stub created');
  return story.id;
}

/**
 * Enrich story stub with full content (update story, create scenes, link characters).
 * Call after text generation and validation succeed.
 */
export async function enrichStoryRecord(storyId: string, params: CreateStoryParams): Promise<void> {
  try {
    // Ensure story exists before creating scenes (prevents FK violation)
    const existingStory = await getStoryRepository().findById(storyId);
    if (!existingStory) {
      throw new Error(`Story ${storyId} not found. Cannot enrich — story stub may have been deleted or never created.`);
    }

    const estimatedReadMinutes = Math.ceil(params.text.wordCount / 200);
    const llmCharacters = (params.text as any).characters || [];

    await getStoryRepository().transaction(async (tx) => {
      await getStoryRepository().updateStory(
        storyId,
        {
          title: stripCharacterIds(params.text.title),
          moralTheme: params.goal,
          scenes: params.text.scenes,
          fullText: stripCharacterIds(params.text.fullText),
          wordCount: params.text.wordCount,
          estimatedReadMinutes,
          modelVersion: (params.metadata as any).modelVersion || config.ai.modelVersion,
          generationTimeMs: params.generationTimeMs,
          isPublished: !!params.seriesData,
          ...(params.seriesData ? {} : { visibility: null }),
          hidden: params.isScheduledContinuation ?? false,
          metadata: {
            llmGeneratedCharacters: llmCharacters,
            imageStyle: (params.spec as any).imageStyle,
            mergedCharacters: params.characters,
            ...(params.metadata.plotExampleId && { plotExampleId: params.metadata.plotExampleId }),
            ...(params.metadata.worldRuleId && { worldRuleId: params.metadata.worldRuleId }),
            ...((params.metadata as any).seoDescription && { seoDescription: (params.metadata as any).seoDescription }),
            textGenerationTimeMs: params.metadata.textGenerationTimeMs,
            validationTimeMs: params.metadata.validationTimeMs,
            sceneCount: params.metadata.sceneCount,
            fullTextLength: params.metadata.fullTextLength,
            ...((params.text as any).environments &&
              Array.isArray((params.text as any).environments) &&
              (params.text as any).environments.length > 0 && {
                environments: (params.text as any).environments,
              }),
            ...((params.text as any).outfits &&
              Array.isArray((params.text as any).outfits) &&
              (params.text as any).outfits.length > 0 && {
                outfits: (params.text as any).outfits,
              }),
          },
          policyChecks: {
            outlineValidated: true,
            textValidated: true,
            timestamp: new Date().toISOString(),
          },
        },
        tx
      );

      await createSceneRecords(storyId, params.text, { tx, includeWordCount: true });

      const characterIdsToLink = new Set<string>();
      const characterRoles = new Map<string, string>();

      for (const character of params.spec.characters) {
        if (character.id && character.type !== 'child') {
          characterIdsToLink.add(character.id);
          characterRoles.set(character.id, character.role || 'supporting');
        }
      }
      for (const mc of params.characters as any[]) {
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
                  storyId,
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
      }

      logger.info({ storyId, sceneCount: params.text.scenes.length, characterCount: characterIdsToLink.size }, 'Story enriched with content');
    });

    const { recordUsageEvent } = await import('../usageEventsService');
    await recordUsageEvent(params.userId, 'story_created', 1, {
      childProfileId: params.childProfileId,
      metadata: { storyId },
    });
  } catch (error) {
    logger.error({ error, storyId, storyRequestId: params.storyRequestId }, 'Failed to enrich story');
    throw error;
  }
}

/**
 * Create story record with scenes and character linking
 * Unified for both standard and continuation flows
 */
export async function createStoryRecord(params: CreateStoryParams): Promise<string> {
  try {
    const estimatedReadMinutes = Math.ceil(params.text.wordCount / 200);
    const llmCharacters = (params.text as any).characters || [];
    
    const storyId = await getStoryRepository().transaction(async (tx) => {
      // Create story record with metadata
      const story = await getStoryRepository().createStory({
        userId: params.userId,
        childProfileId: params.childProfileId,
        storyRequestId: params.storyRequestId,
        title: stripCharacterIds(params.text.title),
        language: params.text.language,
        ageGroup: params.spec.ageGroup,
        moralTheme: params.goal,
        outline: null,
        scenes: params.text.scenes,
        fullText: stripCharacterIds(params.text.fullText),
        wordCount: params.text.wordCount,
        estimatedReadMinutes,
        modelVersion: config.ai.modelVersion,
        generationTimeMs: params.generationTimeMs,
        metadata: {
          llmGeneratedCharacters: llmCharacters,
          imageStyle: (params.spec as any).imageStyle,
          mergedCharacters: params.characters,
          ...(params.metadata.plotExampleId && { plotExampleId: params.metadata.plotExampleId }),
          ...(params.metadata.worldRuleId && { worldRuleId: params.metadata.worldRuleId }),
          ...((params.metadata as any).seoDescription && { seoDescription: (params.metadata as any).seoDescription }),
          textGenerationTimeMs: params.metadata.textGenerationTimeMs,
          validationTimeMs: params.metadata.validationTimeMs,
          sceneCount: params.metadata.sceneCount,
          fullTextLength: params.metadata.fullTextLength,
          ...((params.text as any).environments &&
            Array.isArray((params.text as any).environments) &&
            (params.text as any).environments.length > 0 && {
              environments: (params.text as any).environments,
            }),
          ...((params.text as any).outfits &&
            Array.isArray((params.text as any).outfits) &&
            (params.text as any).outfits.length > 0 && {
              outfits: (params.text as any).outfits,
            }),
        },
        policyChecks: {
          outlineValidated: true,
          textValidated: true,
          timestamp: new Date().toISOString()
        },
        isPublished: false,
        isFavorite: false,
        // Series fields (only for continuation)
        ...(params.seriesData && {
          seriesId: params.seriesData.seriesId,
          partNumber: params.seriesData.partNumber,
        }),
      }, tx);
      
      logger.info({ storyId: story.id }, 'Story saved to database');
      
      // Save all scenes with wordCount
      await createSceneRecords(story.id, params.text, { 
        tx, 
        includeWordCount: true 
      });
      
      logger.info({ storyId: story.id, sceneCount: params.text.scenes.length }, 'Scenes saved to table');
      
      // Link characters (for both standard and continuation)
      const characterIdsToLink = new Set<string>();
      const characterRoles = new Map<string, string>();

      for (const character of params.spec.characters) {
        if (character.id && character.type !== 'child') {
          characterIdsToLink.add(character.id);
          characterRoles.set(character.id, character.role || 'supporting');
        }
      }
      
      for (const mc of params.characters as any[]) {
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
          totalInSpec: params.spec.characters.length,
        }, 'Characters linked to story (user + LLM, children excluded)');
      }
      
      return story.id;
    });

    // Record usage event for entitlements/analytics
    const { recordUsageEvent } = await import('../usageEventsService');
    await recordUsageEvent(params.userId, 'story_created', 1, {
      childProfileId: params.childProfileId,
      metadata: { storyId },
    });

    return storyId;
  } catch (error) {
    logger.error({ error, storyRequestId: params.storyRequestId }, 'Failed to save story');
    throw error;
  }
}

/**
 * Merge user/initial characters with LLM-generated characters
 * Used by both standard and continuation flows
 */
export function mergeCharacters(
  initialCharacters: CharacterData[], 
  llmCharacters: any[]
): CharacterData[] {
  // Validate inputs
  if (!Array.isArray(initialCharacters)) {
    logger.warn('initialCharacters is not an array, using empty array');
    initialCharacters = [];
  }
  
  if (!Array.isArray(llmCharacters)) {
    logger.warn('llmCharacters is not an array, using empty array');
    llmCharacters = [];
  }
  
  // Filter out invalid initial characters
  const validInitialCharacters = initialCharacters.filter(c => 
    c && typeof c === 'object' && c.name && typeof c.name === 'string'
  );
  
  if (validInitialCharacters.length < initialCharacters.length) {
    logger.warn({ 
      original: initialCharacters.length, 
      valid: validInitialCharacters.length 
    }, 'Filtered out invalid initial characters');
  }
  
  const merged: CharacterData[] = [...validInitialCharacters];
  
  for (const llmChar of llmCharacters) {
    // Validate LLM character structure
    if (!llmChar || typeof llmChar.name !== 'string') {
      logger.warn({ llmChar }, 'Invalid LLM character structure, skipping');
      continue;
    }
    
    let existingChar: CharacterData | undefined;
    
    // Tier 1: ID match (100% accuracy, language-independent)
    if (llmChar.originalCharacterId) {
      existingChar = merged.find(c => c.id === llmChar.originalCharacterId);
      if (existingChar) {
        logger.debug({ 
          llmName: llmChar.name, 
          userName: existingChar.name, 
          id: llmChar.originalCharacterId 
        }, 'Character matched by ID (tier 1)');
        
        // Store LLM's translated name for reference
        (existingChar as any).nameInStory = llmChar.name;
        
        // Enrich if no photos
        if (!existingChar.referencePhotos || existingChar.referencePhotos.length === 0) {
          existingChar.appearance = llmChar.appearance;
          existingChar.source = 'user_enriched_by_llm';
        }
        continue;
      }
    }
    
    // Tier 2: Cross-script identity (e.g. Emilia <-> Емілія via ...iya -> ...ia)
    const identityKey = crossScriptIdentityKey(llmChar.name);
    existingChar = merged.find(
      c =>
        c.name &&
        typeof c.name === 'string' &&
        crossScriptIdentityKey(c.name) === identityKey,
    );

    if (existingChar) {
      logger.debug({
        llmName: llmChar.name,
        userName: existingChar.name,
        identityKey,
      }, 'Character matched by cross-script identity key (tier 2)');
      
      (existingChar as any).nameInStory = llmChar.name;
      
      if (!existingChar.referencePhotos || existingChar.referencePhotos.length === 0) {
        existingChar.appearance = llmChar.appearance;
        existingChar.source = 'user_enriched_by_llm';
      }
      continue;
    }
    
    // Tier 3: Normalized match (same language, case-insensitive)
    const normalizedName = normalizeCharacterName(llmChar.name);
    existingChar = merged.find(c =>
      c.name && typeof c.name === 'string' && normalizeCharacterName(c.name) === normalizedName
    );
    
    if (existingChar) {
      logger.debug({ 
        llmName: llmChar.name, 
        userName: existingChar.name, 
        normalizedName 
      }, 'Character matched by normalized name (tier 3)');
      
      if (!existingChar.referencePhotos || existingChar.referencePhotos.length === 0) {
        existingChar.appearance = llmChar.appearance;
        existingChar.source = 'user_enriched_by_llm';
      }
      continue;
    }
    
    // No match found - add as new LLM-generated character
    logger.debug({ llmName: llmChar.name }, 'No match found, adding as new LLM character');
    merged.push({
      name: llmChar.name,
      type: mapLlmTypeToCharacterType(llmChar.type || 'unknown'),
      appearance: llmChar.appearance,
      personality: llmChar.personality,
      role: llmChar.role,
      source: 'llm_generated',
    } as CharacterData);
  }
  
  return merged;
}

function buildInitialCharacterExclusionFingerprints(characters: CharacterData[]): Set<string> {
  const fingerprints = new Set<string>();
  for (const c of characters) {
    if (!c?.name || typeof c.name !== 'string') continue;
    fingerprints.add(normalizeCharacterName(c.name));
    fingerprints.add(crossScriptIdentityKey(c.name));
  }
  return fingerprints;
}

/**
 * Persist LLM-generated characters to database with hybrid deduplication
 * Used by both standard and continuation flows
 */
export async function persistLlmCharacters(
  userId: string,
  llmCharacters: Array<{ name: string; type: string; description: string; role?: string; personality?: any; appearance?: string }>,
  initialCharacters: CharacterData[],
): Promise<Map<string, { characterId: string; isNew: boolean; hasTurnaround: boolean }>> {
  const results = new Map<string, { characterId: string; isNew: boolean; hasTurnaround: boolean }>();

  const exclusion = buildInitialCharacterExclusionFingerprints(initialCharacters);

  // Filter to only LLM-only characters (not user-provided / initial cast)
  const purelyLlmChars = llmCharacters.filter(c => {
    const normalized = normalizeCharacterName(c.name);
    const crossKey = crossScriptIdentityKey(c.name);
    return !exclusion.has(normalized) && !exclusion.has(crossKey);
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
