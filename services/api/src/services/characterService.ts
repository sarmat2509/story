import {
  getCharacterRepository,
  getChildProfileRepository,
  getDictionaryRepository,
} from '../repositories';
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
  isOwned?: boolean;
  isSaved?: boolean;
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
  const savedIds = await getCharacterRepository().findSavedCharacterIds(
    userId,
    results.map((character) => character.id)
  );
  // Hidden LLM-generated characters remain hidden for their author until explicitly saved,
  // but a canonical character saved from somebody else's story belongs in this library view.
  const visible = results.filter((character) => !character.isHidden || savedIds.has(character.id));
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
  const localized = await attachNameTranslations(visible);
  return localized.map((character) => {
    const isOwned = character.userId === userId;
    if (isOwned) {
      return { ...character, isOwned: true, isSaved: false };
    }
    const previewUrl = `/api/v1/characters/${character.id}/shared-preview`;
    const turnaround = character.turnaroundSheet && typeof character.turnaroundSheet === 'object'
      ? character.turnaroundSheet as Record<string, unknown>
      : {};
    return {
      ...character,
      // Never expose another user's raw photo paths through the library payload.
      childProfileId: null,
      createdByChildProfileId: null,
      referencePhotos: [],
      turnaroundSheet: {
        ...turnaround,
        url: previewUrl,
        frontUrl: previewUrl,
        frontThumbnailUrl: previewUrl,
      },
      isOwned: false,
      isSaved: true,
    };
  });
}

export async function removeSavedCharacter(userId: string, characterId: string): Promise<boolean> {
  return getCharacterRepository().removeSavedForUser(userId, characterId);
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

/**
 * Rename only the character identity label and wait until every locale is persisted.
 * Child-profile mirror characters keep the child profile as their source of truth.
 */
export async function renameCharacter(
  id: string,
  userId: string,
  name: string
): Promise<CharacterWithNameTranslations> {
  const characterRepo = getCharacterRepository();
  const existing = await characterRepo.findById(id, userId);
  if (!existing) {
    throw new Error('Character not found');
  }

  const normalizedName = name.trim();
  if (existing.childProfileId && existing.type === 'person' && existing.subtype === 'child') {
    const childProfileRepo = getChildProfileRepository();
    const profile = await childProfileRepo.findById(existing.childProfileId, userId);
    if (profile) {
      await childProfileRepo.update(profile.id, userId, { name: normalizedName });
    }
  }

  const updated = await characterRepo.update(id, userId, { name: normalizedName });
  if (!updated) {
    throw new Error('Failed to rename character');
  }

  const nameTranslations = await localizeCharacterNames(updated, {
    onUsage: (usage) => recordUsage(usage, { userId, characterId: id }),
  });

  logger.info({ userId, characterId: id }, 'Renamed character and localized name');
  return { ...updated, nameTranslations };
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
