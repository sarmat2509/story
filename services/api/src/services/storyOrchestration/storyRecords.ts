/**
 * Story record creation functions
 */

import { getStoryRepository, getCharacterRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import { normalizeCharacterName, toPhoneticKey } from '../../utils/characterNormalization';
import { stripCharacterIds } from '../../utils/audioTags';
import { generateEmbedding, cosineSimilarity } from '../embeddingService';
import { createSceneRecords } from './utilities';
import type { CreateStoryParams } from './types';
import type { CharacterData } from '../types';

const EMBEDDING_SIMILARITY_THRESHOLD = 0.85;

/**
 * Create story record with scenes and character linking
 * Unified for both standard and continuation flows
 */
export async function createStoryRecord(params: CreateStoryParams): Promise<string> {
  try {
    const estimatedReadMinutes = Math.ceil(params.text.wordCount / 200);
    const llmCharacters = (params.outline as any).characters || [];
    
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
        outline: params.outline,
        scenes: params.text.scenes,
        fullText: stripCharacterIds(params.text.fullText),
        wordCount: params.text.wordCount,
        estimatedReadMinutes,
        modelVersion: 'gemini-2.5-flash',
        generationTimeMs: params.generationTimeMs,
        metadata: {
          llmGeneratedCharacters: llmCharacters,
          imageStyle: (params.spec as any).imageStyle,
          mergedCharacters: params.characters,
          ...(params.metadata.plotExampleId && { plotExampleId: params.metadata.plotExampleId }),
          ...(params.metadata.worldRuleId && { worldRuleId: params.metadata.worldRuleId }),
          textGenerationTimeMs: params.metadata.textGenerationTimeMs,
          validationTimeMs: params.metadata.validationTimeMs,
          sceneCount: params.metadata.sceneCount,
          fullTextLength: params.metadata.fullTextLength,
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
    
    // Tier 2: Phonetic match (handles transliteration across scripts)
    const phoneticKey = toPhoneticKey(llmChar.name);
    existingChar = merged.find(c => 
      c.name && typeof c.name === 'string' && toPhoneticKey(c.name) === phoneticKey
    );
    
    if (existingChar) {
      logger.debug({ 
        llmName: llmChar.name, 
        userName: existingChar.name, 
        phoneticKey 
      }, 'Character matched by phonetic key (tier 2)');
      
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

/**
 * Persist LLM-generated characters to database with hybrid deduplication
 * Used by both standard and continuation flows
 */
export async function persistLlmCharacters(
  userId: string,
  llmCharacters: Array<{ name: string; type: string; description: string; role?: string; personality?: any; appearance?: string }>,
  initialCharacterNames: Set<string>
): Promise<Map<string, { characterId: string; isNew: boolean; hasTurnaround: boolean }>> {
  const results = new Map<string, { characterId: string; isNew: boolean; hasTurnaround: boolean }>();

  // Filter to only LLM-only characters (not user-provided ones)
  const purelyLlmChars = llmCharacters.filter(c => {
    const normalized = normalizeCharacterName(c.name);
    return !initialCharacterNames.has(normalized);
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

// ── Helper Functions ──

function mapLlmTypeToCharacterType(llmType: string): string {
  switch (llmType) {
    case 'human': return 'person';
    case 'animal': return 'animal';
    case 'creature': return 'imaginary';
    case 'object': return 'imaginary';
    default: return 'imaginary';
  }
}

async function findOrCreateLlmCharacter(
  userId: string,
  llmChar: { name: string; type: string; description: string },
  existingHiddenChars: any[]
): Promise<{ characterId: string; isNew: boolean; hasTurnaround: boolean }> {
  const mappedType = mapLlmTypeToCharacterType(llmChar.type);

  // TIER 1: Exact name + type match
  const phoneticKey = toPhoneticKey(llmChar.name);
  const nameMatch = existingHiddenChars.find(c =>
    toPhoneticKey(c.name) === phoneticKey && c.type === mappedType
  );
  if (nameMatch) {
    logger.info({ matched: nameMatch.name, by: 'name' }, 'LLM char matched by name');
    return { characterId: nameMatch.id, isNew: false, hasTurnaround: !!nameMatch.turnaroundSheet };
  }

  // TIER 2: Embedding similarity
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

  // No match - create new hidden character
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

  // Add to in-memory cache for subsequent batch dedup
  existingHiddenChars.push(created);

  return { characterId: created.id, isNew: true, hasTurnaround: false };
}
