import { eq, and } from 'drizzle-orm';
import db from '../db';
import { characters, type Character, type NewCharacter } from '../db/schema';
import { logger } from '../utils/logger';

// Character type for filtering
export type CharacterType = 'pet' | 'family_member' | 'friend' | 'neighbor' | 'imaginary_friend';

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
