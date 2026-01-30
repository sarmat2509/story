import { eq, and } from 'drizzle-orm';
import db from '../db';
import { characters, type Character, type NewCharacter } from '../db/schema';
import { logger } from '../utils/logger';
import { CharacterAnalysisService } from './characterAnalysisService';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { config } from '../config';

// Character type for filtering
export type CharacterType = 'pet' | 'family_member' | 'friend' | 'neighbor' | 'imaginary_friend';

// Initialize character analysis service (lazy)
let characterAnalysisService: CharacterAnalysisService | null = null;

function getCharacterAnalysisService(): CharacterAnalysisService {
  if (!characterAnalysisService) {
    const textProvider = new GeminiTextProvider(config.google.apiKey);
    characterAnalysisService = new CharacterAnalysisService(textProvider);
  }
  return characterAnalysisService;
}

/**
 * Determine character type for analysis based on character type
 */
function getAnalysisCharacterType(characterType: CharacterType): 'person' | 'animal' | 'imaginary' {
  if (characterType === 'pet') {
    return 'animal';
  } else if (characterType === 'imaginary_friend') {
    return 'imaginary';
  }
  return 'person'; // family_member, friend, neighbor
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
    
    const analysis = await analysisService.analyzeCharacter({
      photos: photoUrls,
      characterType: analysisType,
      existingTraits: character.appearanceTraits as Record<string, any> | undefined
    });
    
    // Update character with AI-generated fields
    await db
      .update(characters)
      .set({
        aiGeneratedDescription: analysis.detailedDescription,
        clothing: analysis.clothing as any,
        distinctiveFeatures: analysis.distinctiveFeatures as any,
        // Optionally merge AI analysis into existing appearanceTraits
        appearanceTraits: analysis.appearanceTraits ? {
          ...(character.appearanceTraits as any || {}),
          ...analysis.appearanceTraits
        } as any : character.appearanceTraits
      })
      .where(eq(characters.id, character.id));
    
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

// Character CRUD
export async function createCharacter(
  userId: string,
  data: Omit<NewCharacter, 'userId'>
): Promise<Character> {
  const newCharacter: NewCharacter = {
    ...data,
    userId
  };
  
  const [character] = await db
    .insert(characters)
    .values(newCharacter)
    .returning();
  
  logger.info({ userId, characterId: character.id, name: character.name, type: character.type }, 'Created character');
  
  // Analysis is now handled by frontend before save, so skip automatic analysis
  // Trigger character analysis asynchronously (don't wait for it)
  // if (config.features?.enableCharacterAnalysis !== false) {
  //   analyzeCharacterPhotos(character).catch(err => {
  //     logger.error({ error: err, characterId: character.id }, 'Background character analysis failed');
  //   });
  // }
  
  return character;
}

export async function getCharacters(
  userId: string,
  type?: CharacterType
): Promise<Character[]> {
  let query = db
    .select()
    .from(characters)
    .where(and(
      eq(characters.userId, userId),
      eq(characters.isActive, true)
    ));
  
  if (type) {
    query = db
      .select()
      .from(characters)
      .where(and(
        eq(characters.userId, userId),
        eq(characters.type, type),
        eq(characters.isActive, true)
      ));
  }
  
  const results = await query;
  logger.debug({ userId, type, count: results.length }, 'Fetched characters');
  return results;
}

export async function getCharacterById(
  id: string,
  userId: string
): Promise<Character | null> {
  const [character] = await db
    .select()
    .from(characters)
    .where(and(
      eq(characters.id, id),
      eq(characters.userId, userId),
      eq(characters.isActive, true)
    ))
    .limit(1);
  
  return character || null;
}

export async function updateCharacter(
  id: string,
  userId: string,
  data: Partial<Omit<NewCharacter, 'userId'>>
): Promise<Character> {
  // Ownership check
  const existing = await getCharacterById(id, userId);
  if (!existing) {
    throw new Error('Character not found');
  }
  
  const [updated] = await db
    .update(characters)
    .set(data)
    .where(and(
      eq(characters.id, id),
      eq(characters.userId, userId)
    ))
    .returning();
  
  if (!updated) {
    throw new Error('Failed to update character');
  }
  
  logger.info({ userId, characterId: id, type: updated.type }, 'Updated character');
  
  // Analysis is now handled by frontend before save, so skip automatic analysis
  // Trigger character analysis if reference photos changed
  // if (config.features?.enableCharacterAnalysis !== false && data.referencePhotos) {
  //   analyzeCharacterPhotos(updated).catch(err => {
  //     logger.error({ error: err, characterId: id }, 'Background character analysis failed');
  //   });
  // }
  
  return updated;
}

export async function deleteCharacter(id: string, userId: string): Promise<void> {
  // Ownership check
  const existing = await getCharacterById(id, userId);
  if (!existing) {
    throw new Error('Character not found');
  }
  
  // Soft delete: set isActive = false
  await db
    .update(characters)
    .set({ isActive: false })
    .where(and(
      eq(characters.id, id),
      eq(characters.userId, userId)
    ));
  
  logger.info({ userId, characterId: id }, 'Deleted (soft) character');
}

// Type-specific validation helpers (these can be expanded as needed)
export function validatePetTraits(traits: unknown): boolean {
  // Basic validation - can be expanded with more specific checks
  if (!traits || typeof traits !== 'object') return true;
  
  // Check required fields exist
  const validFields = ['breed', 'furColor', 'furPattern', 'furLength', 'size', 'eyeColor', 'distinctiveFeatures'];
  const hasValidFields = Object.keys(traits).every(key => validFields.includes(key));
  
  return hasValidFields;
}

export function validateHumanTraits(traits: unknown): boolean {
  // Basic validation - can be expanded with more specific checks
  if (!traits || typeof traits !== 'object') return true;
  
  // Check required fields exist
  const validFields = ['ageRange', 'hairColor', 'hairStyle', 'eyeColor', 'skinTone', 'height', 'build', 'clothing', 'distinctiveFeatures'];
  const hasValidFields = Object.keys(traits).every(key => validFields.includes(key));
  
  return hasValidFields;
}

export function validateImaginaryTraits(traits: unknown): boolean {
  // For imaginary friends, all traits are free text - just check structure
  if (!traits || typeof traits !== 'object') return true;
  
  // Check that fields are strings or arrays of strings
  const validFields = ['species', 'primaryColor', 'secondaryColor', 'size', 'magicalFeatures', 'customDescription'];
  const hasValidFields = Object.keys(traits).every(key => validFields.includes(key));
  
  return hasValidFields;
}
