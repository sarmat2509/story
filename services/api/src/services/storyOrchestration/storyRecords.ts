/**
 * Story record creation functions
 */

import { getStoryRepository, getCharacterRepository } from '../../repositories';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { normalizeCharacterName, crossScriptIdentityKey } from '../../utils/characterNormalization';
import { extractClosingKeepsakeFromEpisodeText, stripCharacterIds } from '../../utils/audioTags';
import { findOrCreateLlmCharacter, mapLlmTypeToCharacterType } from './llmCharacterPersistence';
import { createSceneRecords } from './utilities';
import type { CreateStoryParams, CreateStoryStubParams } from './types';
import type { CharacterData } from '../types';
import { buildStoryCreationAttribution } from '../storyCreationAttributionService';
import type { Locale } from '@wondertales/shared';

function resolveClosingKeepsakeLabel(params: CreateStoryParams): string | null {
  return extractClosingKeepsakeFromEpisodeText({
    fullText: params.text.fullText,
    scenes: params.text.scenes as Array<{ text?: string }> | undefined,
  });
}

/**
 * Create minimal story stub before text generation.
 * Returns storyId for AI usage tracking. On success, call enrichStoryRecord to fill content.
 */
export async function createStoryStub(params: CreateStoryStubParams): Promise<string> {
  const attribution = buildStoryCreationAttribution({
    createdByMode: params.createdByMode,
    createdByChildProfileId: params.createdByChildProfileId,
    fallbackChildProfileId: params.childProfileId,
    parentReviewRequired: params.parentReviewRequired,
  });
  const story = await getStoryRepository().createStory({
    userId: params.userId,
    childProfileId: params.childProfileId,
    storyRequestId: params.storyRequestId,
    createdByMode: attribution.createdByMode,
    createdByChildProfileId: attribution.createdByChildProfileId,
    parentReviewStatus: attribution.parentReviewStatus,
    title: 'Generating...',
    language: params.spec.language,
    ageGroup: params.spec.ageGroup,
    moralTheme: null,
    outline: null,
    scenes: [],
    fullText: '',
    wordCount: 0,
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

    const llmCharacters = (params.text as any).characters || [];
    const attribution = buildStoryCreationAttribution({
      createdByMode: params.createdByMode,
      createdByChildProfileId: params.createdByChildProfileId,
      fallbackChildProfileId: params.childProfileId,
      parentReviewRequired: params.parentReviewRequired,
    });

    const closingKeepsakeLabel = resolveClosingKeepsakeLabel(params);

    await getStoryRepository().transaction(async (tx) => {
      await getStoryRepository().updateStory(
        storyId,
        {
          title: stripCharacterIds(params.text.title),
          createdByMode: attribution.createdByMode,
          createdByChildProfileId: attribution.createdByChildProfileId,
          parentReviewStatus: attribution.parentReviewStatus,
          moralTheme: params.goal,
          scenes: params.text.scenes,
          fullText: stripCharacterIds(params.text.fullText),
          wordCount: params.text.wordCount,
          closingKeepsakeLabel,
          closingArtifactId: params.spec.closingArtifact?.id ?? null,
          modelVersion: (params.metadata as any).modelVersion || config.ai.modelVersion,
          generationTimeMs: params.generationTimeMs,
          isPublished: !!params.seriesData,
          ...(params.seriesData ? {} : { visibility: null }),
          hidden: params.isScheduledContinuation ?? false,
          metadata: {
            llmGeneratedCharacters: llmCharacters,
            imageStyle: (params.spec as any).imageStyle,
            mergedCharacters: params.characters,
            mapTile: (params.text as any).mapTile ?? null,
            ...(params.metadata.plotExampleId && { plotExampleId: params.metadata.plotExampleId }),
            ...(params.metadata.worldRuleId && { worldRuleId: params.metadata.worldRuleId }),
            ...(params.metadata.storyArtifactId && {
              storyArtifactId: params.metadata.storyArtifactId,
              storyArtifactCode: params.metadata.storyArtifactCode,
              storyArtifactTitle: params.metadata.storyArtifactTitle,
              storyArtifactImagePath: params.metadata.storyArtifactImagePath,
              storyArtifactSelection: params.metadata.storyArtifactSelection,
            }),
            ...((params.metadata as any).seoDescription && { seoDescription: (params.metadata as any).seoDescription }),
            ...((params.metadata as any).directorDebug && { directorDebug: (params.metadata as any).directorDebug }),
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
            ...((params.metadata as any).textValidation && {
              textValidation: (params.metadata as any).textValidation,
            }),
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

    // Monthly story quota is reserved when the request is accepted for queueing.
  } catch (error) {
    logger.error({ error, storyId, storyRequestId: params.storyRequestId }, 'Failed to enrich story');
    throw error;
  }
}

/**
 * Re-read story text from DB and update `closing_keepsake_label` from `{...}` markers.
 * Use after manual text edits or backfills when the marker convention was added later.
 */
export async function syncStoryClosingKeepsakeLabel(storyId: string): Promise<void> {
  const row = await getStoryRepository().findById(storyId);
  if (!row) {
    logger.warn({ storyId }, 'syncStoryClosingKeepsakeLabel: story not found');
    return;
  }
  const label = extractClosingKeepsakeFromEpisodeText({
    fullText: row.fullText,
    scenes: (row.scenes as Array<{ text?: string }>) || [],
  });
  await getStoryRepository().updateStory(storyId, {
    closingKeepsakeLabel: label,
    updatedAt: new Date(),
  });
  logger.info({ storyId, hasLabel: !!label }, 'Closing keepsake label synced from stored text');
}

/**
 * Create story record with scenes and character linking
 * Unified for both standard and continuation flows
 */
export async function createStoryRecord(params: CreateStoryParams): Promise<string> {
  try {
    const llmCharacters = (params.text as any).characters || [];
    const attribution = buildStoryCreationAttribution({
      createdByMode: params.createdByMode,
      createdByChildProfileId: params.createdByChildProfileId,
      fallbackChildProfileId: params.childProfileId,
      parentReviewRequired: params.parentReviewRequired,
    });
    const closingKeepsakeLabel = resolveClosingKeepsakeLabel(params);

    const storyId = await getStoryRepository().transaction(async (tx) => {
      // Create story record with metadata
      const story = await getStoryRepository().createStory({
        userId: params.userId,
        childProfileId: params.childProfileId,
        storyRequestId: params.storyRequestId,
        createdByMode: attribution.createdByMode,
        createdByChildProfileId: attribution.createdByChildProfileId,
        parentReviewStatus: attribution.parentReviewStatus,
        title: stripCharacterIds(params.text.title),
        language: params.text.language,
        ageGroup: params.spec.ageGroup,
        moralTheme: params.goal,
        outline: null,
        scenes: params.text.scenes,
        fullText: stripCharacterIds(params.text.fullText),
        wordCount: params.text.wordCount,
        closingKeepsakeLabel,
        closingArtifactId: params.spec.closingArtifact?.id ?? null,
        modelVersion: config.ai.modelVersion,
        generationTimeMs: params.generationTimeMs,
        metadata: {
          llmGeneratedCharacters: llmCharacters,
          imageStyle: (params.spec as any).imageStyle,
          mergedCharacters: params.characters,
          mapTile: (params.text as any).mapTile ?? null,
          ...(params.metadata.plotExampleId && { plotExampleId: params.metadata.plotExampleId }),
          ...(params.metadata.worldRuleId && { worldRuleId: params.metadata.worldRuleId }),
          ...(params.metadata.storyArtifactId && {
            storyArtifactId: params.metadata.storyArtifactId,
            storyArtifactCode: params.metadata.storyArtifactCode,
            storyArtifactTitle: params.metadata.storyArtifactTitle,
            storyArtifactImagePath: params.metadata.storyArtifactImagePath,
            storyArtifactSelection: params.metadata.storyArtifactSelection,
          }),
          ...((params.metadata as any).seoDescription && { seoDescription: (params.metadata as any).seoDescription }),
          ...((params.metadata as any).directorDebug && { directorDebug: (params.metadata as any).directorDebug }),
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
          ...((params.metadata as any).textValidation && {
            textValidation: (params.metadata as any).textValidation,
          }),
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

    // Monthly story quota is reserved when the request is accepted for queueing.

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
    const names = [c.name, (c as any).canonicalName, ...((c as any).nameAliases || [])];
    for (const name of names) {
      if (!name || typeof name !== 'string') continue;
      fingerprints.add(normalizeCharacterName(name));
      fingerprints.add(crossScriptIdentityKey(name));
    }
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
  sourceLocale?: Locale | string | null,
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
    const result = await findOrCreateLlmCharacter(userId, llmChar, existingHiddenChars, { sourceLocale });
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
