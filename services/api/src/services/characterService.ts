import { getCharacterRepository } from '../repositories';
import type { Character, NewCharacter } from '../db/schema';
import { logger } from '../utils/logger';
import { recordUsage } from './aiUsageService';
import { CharacterAnalysisService } from './characterAnalysisService';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { config } from '../config';
import { collectEntityAssetPaths, deleteEntityAssets } from './entityAssetCleanupService';
import { translateCharacterDescription } from './translationService';
import type { CharacterType } from '@wondertales/shared';

// Re-export CharacterType for use in routes
export type { CharacterType };

// Initialize character analysis service (lazy)
let characterAnalysisService: CharacterAnalysisService | null = null;

function getCharacterAnalysisService(): CharacterAnalysisService {
  if (!characterAnalysisService) {
    const textProvider = new GeminiTextProvider(config.google.apiKey, config.ai.modelVersion);
    characterAnalysisService = new CharacterAnalysisService(textProvider);
  }
  return characterAnalysisService;
}

/**
 * Determine character type for analysis based on character type
 */
function getAnalysisCharacterType(characterType: CharacterType): 'person' | 'animal' | 'imaginary' {
  // Types now match directly, no mapping needed
  return characterType as 'person' | 'animal' | 'imaginary';
}

/**
 * Analyze character photos and update with AI-generated description
 * Called after create/update if reference photos exist
 */
async function analyzeCharacterPhotos(character: Character): Promise<void> {
  // Skip if no reference photos
  const referencePhotos = character.referencePhotos as any;
  if (!referencePhotos || !Array.isArray(referencePhotos) || referencePhotos.length === 0) {
    logger.debug({ characterId: character.id }, 'No reference photos to analyze');
    return;
  }
  
  // Extract photo URLs
  const photoUrls = referencePhotos
    .filter((photo: any) => photo && photo.url)
    .map((photo: any) => photo.url);
  
  if (photoUrls.length === 0) {
    logger.debug({ characterId: character.id }, 'No valid photo URLs');
    return;
  }
  
  try {
    logger.info({ 
      characterId: character.id,
      characterType: character.type,
      photoCount: photoUrls.length 
    }, 'Starting character analysis');
    
    const analysisService = getCharacterAnalysisService();
    const analysisType = getAnalysisCharacterType(character.type as CharacterType);
    
    const usageContext = { userId: character.userId, characterId: character.id };
    const analysis = await analysisService.analyzeCharacter(
      {
        photos: photoUrls,
        characterType: analysisType,
        existingTraits: character.appearanceTraits as Record<string, any> | undefined
      },
      { onUsage: (u) => recordUsage(u, usageContext) }
    );
    
    // Update character with AI-generated fields via repository
    await getCharacterRepository().updateAnalysis(character.id, {
      aiGeneratedDescription: analysis.detailedDescription,
      clothing: analysis.clothing as any,
      distinctiveFeatures: analysis.distinctiveFeatures as any,
      // Optionally merge AI analysis into existing appearanceTraits
      appearanceTraits: analysis.appearanceTraits ? {
        ...(character.appearanceTraits as any || {}),
        ...analysis.appearanceTraits
      } as any : character.appearanceTraits
    });
    
    logger.info({ 
      characterId: character.id,
      hasDescription: !!analysis.detailedDescription,
      hasClothing: !!analysis.clothing,
      featuresCount: analysis.distinctiveFeatures?.length || 0
    }, 'Character analysis completed');
  } catch (error) {
    // Log error but don't fail the character creation/update
    logger.error({ 
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error),
      characterId: character.id 
    }, 'Failed to analyze character photos - continuing without analysis');
  }
}

/**
 * Trigger async translation of character description to English.
 * Non-blocking: if it fails, image generation falls back to the original description.
 */
function triggerDescriptionTranslation(character: Character): void {
  const description = character.aiGeneratedDescription || character.description;
  if (!description) return;

  const usageContext = { userId: character.userId, characterId: character.id };
  translateCharacterDescription(character, { onUsage: (u) => recordUsage(u, usageContext) }).catch(err => {
    logger.error(
      { err, characterId: character.id, characterName: character.name },
      'Description translation failed — will use original description in prompts',
    );
  });
}

// Character CRUD
export async function createCharacter(
  userId: string,
  data: Omit<NewCharacter, 'userId'>
): Promise<Character> {
  const newCharacter: NewCharacter = {
    ...data,
    userId
  };
  
  const character = await getCharacterRepository().create(newCharacter);
  
  logger.info({ userId, characterId: character.id, name: character.name, type: character.type }, 'Created character');
  
  // Trigger async translation of description to English
  triggerDescriptionTranslation(character);
  
  return character;
}

export async function getCharacters(
  userId: string,
  type?: CharacterType,
  options: { childProfileId?: string; accessibleByChildProfileId?: string } = {}
): Promise<Character[]> {
  const results = await getCharacterRepository().findByUserId(userId, type, options);
  // Filter out hidden LLM-generated characters from the user-facing list
  const visible = results.filter(c => !c.isHidden);
  logger.debug({
    userId,
    type,
    childProfileId: options.childProfileId,
    accessibleByChildProfileId: options.accessibleByChildProfileId,
    total: results.length,
    visible: visible.length
  }, 'Fetched characters');
  return visible;
}

/**
 * Count how many stories use this character
 */
export async function countStoriesByCharacter(
  characterId: string,
  userId: string
): Promise<number> {
  // Verify ownership first
  const character = await getCharacterRepository().findById(characterId, userId);
  if (!character) {
    throw new Error('Character not found');
  }
  
  const characterRepo = getCharacterRepository();
  const [storyCount, requestCount] = await Promise.all([
    characterRepo.countStoriesUsingCharacter(characterId),
    characterRepo.countStoryRequestsUsingCharacter(characterId, userId),
  ]);

  return storyCount + requestCount;
}

export async function getCharacterById(
  id: string,
  userId: string,
  options: { childProfileId?: string; accessibleByChildProfileId?: string } = {}
): Promise<Character | null> {
  return getCharacterRepository().findById(id, userId, options);
}

export async function updateCharacter(
  id: string,
  userId: string,
  data: Partial<Omit<NewCharacter, 'userId'>>
): Promise<Character> {
  const characterRepo = getCharacterRepository();

  // Ownership check
  const existing = await characterRepo.findById(id, userId);
  if (!existing) {
    throw new Error('Character not found');
  }
  
  const updated = await characterRepo.update(id, userId, data);
  
  if (!updated) {
    throw new Error('Failed to update character');
  }
  
  logger.info({ userId, characterId: id, type: updated.type }, 'Updated character');
  
  // Re-translate description if it changed
  if (data.description || data.aiGeneratedDescription) {
    triggerDescriptionTranslation(updated);
  }
  
  return updated;
}

export async function deleteCharacter(id: string, userId: string): Promise<void> {
  const characterRepo = getCharacterRepository();

  // Ownership check
  const existing = await characterRepo.findById(id, userId);
  if (!existing) {
    throw new Error('Character not found');
  }

  const assetPaths = collectEntityAssetPaths({
    referencePhotos: existing.referencePhotos,
    turnaroundSheet: existing.turnaroundSheet,
  });

  await deleteEntityAssets(assetPaths);
  await characterRepo.hardDelete(id, userId);

  logger.info({ userId, characterId: id, deletedAssetCount: assetPaths.length }, 'Character hard deleted with related assets');
}

// Type-specific validation helpers (these can be expanded as needed)
export function validatePetTraits(traits: unknown): boolean {
  if (!traits || typeof traits !== 'object') return true;
  const validFields = ['breed', 'furColor', 'furPattern', 'furLength', 'size', 'eyeColor', 'distinctiveFeatures'];
  const hasValidFields = Object.keys(traits).every(key => validFields.includes(key));
  return hasValidFields;
}

export function validateHumanTraits(traits: unknown): boolean {
  if (!traits || typeof traits !== 'object') return true;
  const validFields = ['ageRange', 'hairColor', 'hairStyle', 'eyeColor', 'skinTone', 'height', 'build', 'clothing', 'distinctiveFeatures'];
  const hasValidFields = Object.keys(traits).every(key => validFields.includes(key));
  return hasValidFields;
}

export function validateImaginaryTraits(traits: unknown): boolean {
  if (!traits || typeof traits !== 'object') return true;
  const validFields = ['species', 'primaryColor', 'secondaryColor', 'size', 'magicalFeatures', 'customDescription'];
  const hasValidFields = Object.keys(traits).every(key => validFields.includes(key));
  return hasValidFields;
}
