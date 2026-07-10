import { getCharacterRepository, getDictionaryRepository } from '../repositories';
import type { Character, NewCharacter } from '../db/schema';
import { logger } from '../utils/logger';
import { recordUsage } from './aiUsageService';
import { collectEntityAssetPaths, deleteEntityAssets } from './entityAssetCleanupService';
import { localizeCharacterNames, translateCharacterDescription } from './translationService';
import { stripCharacterIdFromName, type CharacterType } from '@wondertales/shared';
import { syncChildProfileCharactersForUser } from './childProfileService';
import { buildCharacterDefaultOutfitPatch } from './defaultOutfitService';

// Re-export CharacterType for use in routes
export type { CharacterType };
type CharacterNameTranslations = Partial<Record<string, string | null>>;

/**
 * Trigger async translation of character description to English.
 * Non-blocking: if it fails, image generation falls back to the original description.
 */
function triggerDescriptionTranslation(character: Character): void {
  const description = character.aiGeneratedDescription || character.description;
  if (!description) return;

  const usageContext = { userId: character.userId, characterId: character.id };
  translateCharacterDescription(character, { onUsage: (u) => recordUsage(u, usageContext) }).catch(
    (err) => {
      logger.error(
        { err, characterId: character.id, characterName: character.name },
        'Description translation failed — will use original description in prompts'
      );
    }
  );
}

/**
 * Trigger async localization of character names for every story language.
 * Non-blocking: story generation falls back to the canonical DB name if a locale is missing.
 */
function triggerNameLocalization(character: Character): void {
  if (!character.name?.trim()) return;

  const usageContext = { userId: character.userId, characterId: character.id };
  localizeCharacterNames(character, {
    onUsage: (u) => recordUsage(u, usageContext),
    sourceLocale: character.descriptionLanguage,
  }).catch((err) => {
    logger.error(
      { err, characterId: character.id, characterName: character.name },
      'Character name localization failed'
    );
  });
}

export type CharacterWithNameTranslations = Character & {
  nameTranslations?: CharacterNameTranslations;
};

async function attachNameTranslations(
  characters: Character[]
): Promise<CharacterWithNameTranslations[]> {
  const ids = characters.map((character) => character.id).filter(Boolean);
  if (ids.length === 0) return characters;

  const translations = await getDictionaryRepository().findTranslationsForEntities(
    'character',
    ids,
    'name'
  );
  if (translations.length === 0) return characters;

  const translationsByCharacterId = new Map<string, CharacterNameTranslations>();
  for (const translation of translations) {
    const value = stripCharacterIdFromName(translation.value).trim();
    if (!value) continue;

    const existing = translationsByCharacterId.get(translation.entityId) ?? {};
    existing[translation.locale] = value;
    translationsByCharacterId.set(translation.entityId, existing);
  }

  return characters.map((character) => {
    const nameTranslations = translationsByCharacterId.get(character.id);
    return nameTranslations ? { ...character, nameTranslations } : character;
  });
}

// Character CRUD
export async function createCharacter(
  userId: string,
  data: Omit<NewCharacter, 'userId'>
): Promise<Character> {
  const defaultOutfitPatch = await buildCharacterDefaultOutfitPatch(data);
  const newCharacter: NewCharacter = {
    ...data,
    ...defaultOutfitPatch,
    userId,
  };

  const character = await getCharacterRepository().create(newCharacter);

  logger.info(
    { userId, characterId: character.id, name: character.name, type: character.type },
    'Created character'
  );

  // Trigger async translation of description to English
  triggerDescriptionTranslation(character);
  triggerNameLocalization(character);

  return character;
}

export async function getCharacters(
  userId: string,
  type?: CharacterType,
  options: { childProfileId?: string; accessibleByChildProfileId?: string } = {}
): Promise<Character[]> {
  if (!type || type === 'person') {
    await syncChildProfileCharactersForUser(userId);
  }

  const results = await getCharacterRepository().findByUserId(userId, type, options);
  // Filter out hidden LLM-generated characters from the user-facing list
  const visible = results.filter((c) => !c.isHidden);
  logger.debug(
    {
      userId,
      type,
      childProfileId: options.childProfileId,
      accessibleByChildProfileId: options.accessibleByChildProfileId,
      total: results.length,
      visible: visible.length,
    },
    'Fetched characters'
  );
  return attachNameTranslations(visible);
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
  const character = await getCharacterRepository().findById(id, userId, options);
  if (!character) return null;

  const [withTranslations] = await attachNameTranslations([character]);
  return withTranslations;
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

  const finalCharacter = {
    ...existing,
    ...data,
  };
  const defaultOutfitPatch = await buildCharacterDefaultOutfitPatch(finalCharacter, existing);
  const updated = await characterRepo.update(id, userId, {
    ...data,
    ...defaultOutfitPatch,
  });

  if (!updated) {
    throw new Error('Failed to update character');
  }

  logger.info({ userId, characterId: id, type: updated.type }, 'Updated character');

  // Re-translate description if it changed
  if (data.description || data.aiGeneratedDescription) {
    triggerDescriptionTranslation(updated);
  }

  if (data.name && data.name !== existing.name) {
    triggerNameLocalization(updated);
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

  logger.info(
    { userId, characterId: id, deletedAssetCount: assetPaths.length },
    'Character hard deleted with related assets'
  );
}

// Type-specific validation helpers (these can be expanded as needed)
export function validatePetTraits(traits: unknown): boolean {
  if (!traits || typeof traits !== 'object') return true;
  const validFields = [
    'breed',
    'furColor',
    'furPattern',
    'furLength',
    'size',
    'eyeColor',
    'distinctiveFeatures',
  ];
  const hasValidFields = Object.keys(traits).every((key) => validFields.includes(key));
  return hasValidFields;
}

export function validateHumanTraits(traits: unknown): boolean {
  if (!traits || typeof traits !== 'object') return true;
  const validFields = [
    'ageRange',
    'hairColor',
    'hairStyle',
    'eyeColor',
    'skinTone',
    'height',
    'build',
    'clothing',
    'distinctiveFeatures',
  ];
  const hasValidFields = Object.keys(traits).every((key) => validFields.includes(key));
  return hasValidFields;
}

export function validateImaginaryTraits(traits: unknown): boolean {
  if (!traits || typeof traits !== 'object') return true;
  const validFields = [
    'species',
    'primaryColor',
    'secondaryColor',
    'size',
    'magicalFeatures',
    'customDescription',
  ];
  const hasValidFields = Object.keys(traits).every((key) => validFields.includes(key));
  return hasValidFields;
}
