import { isHumanType, type CharacterType } from '@wondertales/shared';
import type { Character, NewCharacter } from '../db/schema';
import { logger } from '../utils/logger';
import { generateEmbedding } from './embeddingService';
import {
  inferOutfitCatalogTags,
  normalizeOutfitTagList,
  type OutfitCatalogTagData,
  type OutfitTagListKey,
} from './outfitCatalogTags';

type CharacterOutfitSource = Partial<Character | NewCharacter>;
type CharacterDefaultOutfitPatch = Partial<Omit<NewCharacter, 'userId'>>;

const DEFAULT_OUTFIT_ARRAY_FIELD_BY_TAG_KEY: Record<OutfitTagListKey, keyof NewCharacter> = {
  presentationGroups: 'defaultOutfitPresentationGroups',
  purposeTags: 'defaultOutfitPurposeTags',
  seasonTags: 'defaultOutfitSeasonTags',
  climateTags: 'defaultOutfitClimateTags',
  eraTags: 'defaultOutfitEraTags',
  settingTags: 'defaultOutfitSettingTags',
  activityTags: 'defaultOutfitActivityTags',
  silhouetteTags: 'defaultOutfitSilhouetteTags',
  footwearTags: 'defaultOutfitFootwearTags',
  componentTags: 'defaultOutfitComponentTags',
  colorPalette: 'defaultOutfitColorPalette',
  materials: 'defaultOutfitMaterials',
  patterns: 'defaultOutfitPatterns',
  detailTags: 'defaultOutfitDetailTags',
  coverageTags: 'defaultOutfitCoverageTags',
};

const DEFAULT_OUTFIT_ARRAY_FIELDS = Object.values(DEFAULT_OUTFIT_ARRAY_FIELD_BY_TAG_KEY);

const CLOTHING_OBJECT_KEYS = [
  'style',
  'clothing',
  'clothingStyle',
  'outfit',
  'defaultOutfit',
  'top',
  'shirt',
  'blouse',
  'sweater',
  'hoodie',
  'jacket',
  'coat',
  'outerwear',
  'bottom',
  'pants',
  'trousers',
  'jeans',
  'shorts',
  'skirt',
  'dress',
  'shoes',
  'footwear',
  'hat',
  'headwear',
  'accessories',
  'distinctiveItems',
  'colors',
  'pattern',
  'patterns',
  'material',
  'materials',
] as const;

const CLOTHING_SENTENCE_HINTS = [
  'wear',
  'wearing',
  'worn',
  'dressed',
  'clothes',
  'clothing',
  'outfit',
  'shirt',
  't-shirt',
  'blouse',
  'sweater',
  'hoodie',
  'jacket',
  'coat',
  'dress',
  'skirt',
  'pants',
  'trousers',
  'jeans',
  'shorts',
  'shoes',
  'sneakers',
  'boots',
  'sandals',
  'hat',
  'cap',
  'scarf',
  'gloves',
  'одет',
  'одета',
  'одеж',
  'наряд',
  'рубаш',
  'футбол',
  'кофт',
  'толстов',
  'худи',
  'курт',
  'пальто',
  'плать',
  'юбк',
  'брюк',
  'джинс',
  'шорт',
  'обув',
  'кроссов',
  'ботин',
  'кеды',
  'сандал',
  'шапк',
  'шарф',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePhrase(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const phrase = value.trim().replace(/\s+/g, ' ');
  if (!phrase || phrase.toLowerCase() === 'null' || phrase.toLowerCase() === 'unknown') {
    return null;
  }
  return phrase;
}

function collectStringLeaves(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  const phrase = normalizePhrase(value);
  if (phrase) return [phrase];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringLeaves(item, depth + 1));
  }
  if (!isPlainObject(value)) return [];

  const out: string[] = [];
  for (const key of CLOTHING_OBJECT_KEYS) {
    if (key in value) {
      out.push(...collectStringLeaves(value[key], depth + 1));
    }
  }
  return out;
}

function clothingSentencesFromDescription(description: unknown): string[] {
  const text = normalizePhrase(description);
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return CLOTHING_SENTENCE_HINTS.some((hint) => lower.includes(hint));
    });
}

function dedupePhrases(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const phrase = normalizePhrase(value);
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}

function isHumanCharacterType(type: unknown): boolean {
  return typeof type === 'string' && isHumanType(type as CharacterType);
}

export function extractDefaultOutfitText(character: CharacterOutfitSource): string | null {
  if (!isHumanCharacterType(character.type)) return null;

  const traits = isPlainObject(character.appearanceTraits)
    ? (character.appearanceTraits as Record<string, unknown>)
    : {};

  const phrases = dedupePhrases([
    ...collectStringLeaves(character.clothing),
    ...collectStringLeaves(traits.clothing),
    ...collectStringLeaves(traits.clothingStyle),
    ...collectStringLeaves(traits.outfit),
    ...collectStringLeaves(traits.defaultOutfit),
    ...clothingSentencesFromDescription(character.aiGeneratedDescription),
    ...clothingSentencesFromDescription(character.description),
    ...clothingSentencesFromDescription(character.descriptionEn),
  ]);

  if (phrases.length === 0) return null;
  return phrases.join('; ');
}

export function defaultOutfitTagsFromCharacter(character: CharacterOutfitSource): OutfitCatalogTagData {
  const tags: OutfitCatalogTagData = {
    formality: (character as any).defaultOutfitFormality ?? null,
  };
  for (const [tagKey, fieldKey] of Object.entries(DEFAULT_OUTFIT_ARRAY_FIELD_BY_TAG_KEY) as Array<
    [OutfitTagListKey, keyof NewCharacter]
  >) {
    const values = normalizeOutfitTagList((character as any)[fieldKey]);
    if (values.length > 0) tags[tagKey] = values;
  }
  return tags;
}

function tagsToDefaultOutfitPatch(tags: OutfitCatalogTagData): CharacterDefaultOutfitPatch {
  const patch: CharacterDefaultOutfitPatch = {
    defaultOutfitFormality: tags.formality || null,
  } as CharacterDefaultOutfitPatch;

  for (const [tagKey, fieldKey] of Object.entries(DEFAULT_OUTFIT_ARRAY_FIELD_BY_TAG_KEY) as Array<
    [OutfitTagListKey, keyof NewCharacter]
  >) {
    (patch as any)[fieldKey] = normalizeOutfitTagList(tags[tagKey]);
  }

  return patch;
}

function clearDefaultOutfitPatch(): CharacterDefaultOutfitPatch {
  const patch: CharacterDefaultOutfitPatch = {
    defaultOutfitText: null,
    defaultOutfitEmbedding: null,
    defaultOutfitFormality: null,
    defaultOutfitUpdatedAt: null,
  } as CharacterDefaultOutfitPatch;
  for (const field of DEFAULT_OUTFIT_ARRAY_FIELDS) {
    (patch as any)[field] = null;
  }
  return patch;
}

function hasStoredDefaultOutfit(character: CharacterOutfitSource | null | undefined): boolean {
  if (!character) return false;
  return !!(
    normalizePhrase((character as any).defaultOutfitText) ||
    Array.isArray((character as any).defaultOutfitEmbedding)
  );
}

function hasCompleteStoredDefaultOutfit(
  existing: CharacterOutfitSource | null | undefined,
  defaultOutfitText: string,
): boolean {
  if (!existing) return false;
  if ((existing as any).defaultOutfitText !== defaultOutfitText) return false;
  if (!Array.isArray((existing as any).defaultOutfitEmbedding)) return false;
  return DEFAULT_OUTFIT_ARRAY_FIELDS.every((field) => Array.isArray((existing as any)[field]));
}

export async function buildCharacterDefaultOutfitPatch(
  character: CharacterOutfitSource,
  existing?: CharacterOutfitSource | null,
): Promise<CharacterDefaultOutfitPatch> {
  if (!isHumanCharacterType(character.type)) {
    return hasStoredDefaultOutfit(existing) ? clearDefaultOutfitPatch() : {};
  }

  const defaultOutfitText = extractDefaultOutfitText(character);
  if (!defaultOutfitText) {
    return hasStoredDefaultOutfit(existing) ? clearDefaultOutfitPatch() : {};
  }

  if (hasCompleteStoredDefaultOutfit(existing, defaultOutfitText)) {
    return {};
  }

  try {
    const [defaultOutfitEmbedding, tags] = await Promise.all([
      generateEmbedding(defaultOutfitText),
      Promise.resolve(inferOutfitCatalogTags(defaultOutfitText)),
    ]);

    return {
      defaultOutfitText,
      defaultOutfitEmbedding,
      ...tagsToDefaultOutfitPatch(tags),
      defaultOutfitUpdatedAt: new Date(),
    };
  } catch (err) {
    logger.warn(
      {
        err,
        characterId: (character as any).id,
        characterName: character.name,
        textLength: defaultOutfitText.length,
      },
      'Failed to build default outfit embedding for character',
    );
    return {
      defaultOutfitText,
      defaultOutfitEmbedding: null,
      ...tagsToDefaultOutfitPatch(inferOutfitCatalogTags(defaultOutfitText)),
      defaultOutfitUpdatedAt: new Date(),
    };
  }
}
