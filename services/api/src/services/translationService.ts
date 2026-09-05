import { logger } from '../utils/logger';
import { getTextProvider } from './aiService';
import { getCharacterRepository, getChildProfileRepository, getDictionaryRepository } from '../repositories';
import type { Character, ChildProfile, StoryArtifact } from '../db/schema';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import {
  getLanguageFullDisplay,
  isValidLocale,
  LOCALE_IDS,
  stripCharacterIdFromName,
  type Locale,
} from '@wondertales/shared';

export interface TranslationOptions {
  onUsage?: (usage: UsageMetadata) => void;
  sourceLocale?: Locale | string | null;
}

export type CharacterNameLocalizations = Record<Locale, string>;
export type StoryArtifactTitleLocalizations = Record<Locale, string>;

export const STORY_ARTIFACT_TRANSLATION_ENTITY = 'story_artifact';
export const STORY_ARTIFACT_TITLE_FIELD = 'title';

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

function normalizeLocalizedName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || fallback;
}

function normalizeSourceLocale(locale?: Locale | string | null): Locale | null {
  const normalized = locale?.slice(0, 2).toLowerCase();
  return normalized && isValidLocale(normalized) ? normalized : null;
}

function inferCharacterNameSourceLocale(character: Character, options?: TranslationOptions): Locale | null {
  return (
    normalizeSourceLocale(options?.sourceLocale) ||
    normalizeSourceLocale((character as any).nameLanguage) ||
    normalizeSourceLocale((character as any).descriptionLanguage)
  );
}

function buildCharacterNameLocalizationPrompt(character: Character, sourceLocale: Locale | null): string {
  const displayName = stripCharacterIdFromName(character.name).trim() || character.name;
  const description = character.aiGeneratedDescription || character.description || '';
  const personality = character.personality ? JSON.stringify(character.personality) : '';
  const locales = LOCALE_IDS
    .map((locale) => `- ${locale}: ${getLanguageFullDisplay(locale)}`)
    .join('\n');
  const sourceLine = sourceLocale
    ? `${getLanguageFullDisplay(sourceLocale)} (${sourceLocale})`
    : 'unknown; infer from the original name, script, and character context';

  return `You localize character display names for children's stories.

Return ONLY a compact JSON object with exactly these locale keys:
${locales}

Source name language: ${sourceLine}.
The original name below is written in the source language. Use that source-language meaning when creating alternatives for every other locale.

Rules:
- Preserve the same character identity across all languages.
- For ordinary personal names, transliterate or adapt spelling naturally for the target language when useful; do not translate the meaning.
- For clearly descriptive names, titles, or creature names, translate them naturally for a children's story.
- Treat outputs as character display names. For translated multi-word proper/title names, capitalize meaningful words naturally for the target language (for example: ru "Снежный Дух", uk "Сніжний Дух").
- Example: if the German source name is "Schneegeist", the English name should be "Snow Spirit" and the Russian name should be "Снежный Дух" — do not preserve it as "Schneegeist" in every locale.
- Keep the name short and readable. No explanations, no brackets, no IDs, no metadata.
- If unsure, keep the original name.

Character:
- Original name: ${displayName}
- Type: ${character.type}${character.subtype ? ` / ${character.subtype}` : ''}
${description ? `- Description: ${description}` : ''}
${personality ? `- Personality/context: ${personality}` : ''}`;
}

function buildStoryArtifactTitleLocalizationPrompt(artifact: StoryArtifact): string {
  const locales = LOCALE_IDS
    .map((locale) => `- ${locale}: ${getLanguageFullDisplay(locale)}`)
    .join('\n');

  return `You localize short catalog artifact titles for children's stories.

Return ONLY a compact JSON object with exactly these locale keys:
${locales}

Source title language: Russian (ru).

Rules:
- Preserve the same physical artifact identity across all languages.
- Translate the meaning naturally for each target language; do not transliterate Russian words unless the item is a proper cultural name.
- Keep titles short, concrete, and suitable as collectible item labels.
- Use nominative/base form for catalog labels. Story prose may inflect these later.
- Capitalize naturally for the target language.
- No explanations, no brackets, no IDs, no metadata.
- If a title is ambiguous, use the visual description to choose the most concrete translation.

Artifact:
- Code: ${artifact.artifactCode}
- Source title: ${artifact.title}
- Visual identity: ${artifact.description}`;
}

async function getCompleteCharacterNameLocalizations(
  character: Character
): Promise<CharacterNameLocalizations | null> {
  const fallback = stripCharacterIdFromName(character.name || '').trim() || character.name?.trim();
  if (!fallback) return null;

  const rows = await getDictionaryRepository().findTranslationsForEntities(
    'character',
    [character.id],
    'name'
  );
  const values = new Map<string, string>();
  for (const row of rows) {
    const locale = normalizeSourceLocale(row.locale);
    const value = normalizeLocalizedName(row.value, '');
    if (locale && value) values.set(locale, value);
  }

  if (!LOCALE_IDS.every((locale) => values.has(locale))) return null;

  return LOCALE_IDS.reduce((acc, locale) => {
    acc[locale] = values.get(locale) || fallback;
    return acc;
  }, {} as CharacterNameLocalizations);
}

/**
 * Generate and persist localized display names for every supported story language.
 * Stored in translations as entityType='character', fieldName='name'.
 */
export async function localizeCharacterNames(
  character: Character,
  options?: TranslationOptions
): Promise<CharacterNameLocalizations> {
  const fallback = stripCharacterIdFromName(character.name || '').trim() || character.name?.trim();
  if (!fallback) {
    throw new Error(`Cannot localize empty character name for ${character.id}`);
  }

  const defaults = LOCALE_IDS.reduce((acc, locale) => {
    acc[locale] = fallback;
    return acc;
  }, {} as CharacterNameLocalizations);

  try {
    const sourceLocale = inferCharacterNameSourceLocale(character, options);
    logger.info(
      { characterId: character.id, characterName: character.name, sourceLocale, localeCount: LOCALE_IDS.length },
      'Localizing character names',
    );

    const textProvider = getTextProvider();
    const raw = await textProvider.generateText({
      prompt: buildCharacterNameLocalizationPrompt(character, sourceLocale),
      temperature: 0.1,
      // Gemini 3 can spend part of the output budget on internal reasoning;
      // keep this comfortably above the tiny JSON payload to avoid truncation.
      maxTokens: 8192,
      onUsage: options?.onUsage,
      operation: 'translation',
    });

    const parsed = extractJsonObject(raw);
    if (!parsed) {
      logger.warn(
        { characterId: character.id, raw: raw.slice(0, 300) },
        'Character name localization returned non-JSON; falling back to original name',
      );
    }

    const localizations = LOCALE_IDS.reduce((acc, locale) => {
      acc[locale] = normalizeLocalizedName(parsed?.[locale], fallback);
      return acc;
    }, {} as CharacterNameLocalizations);

    await Promise.all(
      LOCALE_IDS.map((locale) =>
        getDictionaryRepository().upsertTranslation({
          entityType: 'character',
          entityId: character.id,
          locale,
          fieldName: 'name',
          value: localizations[locale],
        })
      )
    );

    logger.info(
      { characterId: character.id, localizations },
      'Character names localized and saved',
    );

    return localizations;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        characterId: character.id,
      },
      'Failed to localize character names',
    );

    await Promise.all(
      LOCALE_IDS.map((locale) =>
        getDictionaryRepository().upsertTranslation({
          entityType: 'character',
          entityId: character.id,
          locale,
          fieldName: 'name',
          value: defaults[locale],
        })
      )
    );

    return defaults;
  }
}

/**
 * Return saved names when all story locales are covered; otherwise generate and
 * persist the complete set. This makes hidden LLM characters safe to reuse in
 * stories and character collections without re-translating them unnecessarily.
 */
export async function ensureLocalizedCharacterNames(
  character: Character,
  options?: TranslationOptions
): Promise<CharacterNameLocalizations> {
  try {
    const existing = await getCompleteCharacterNameLocalizations(character);
    if (existing) return existing;
  } catch (error) {
    logger.warn(
      { error, characterId: character.id },
      'Could not read existing character name localizations; regenerating them'
    );
  }

  return localizeCharacterNames(character, options);
}

/**
 * Generate and persist localized artifact catalog titles for every supported story language.
 * Stored in translations as entityType='story_artifact', entityId=artifactCode, fieldName='title'.
 */
export async function localizeStoryArtifactTitle(
  artifact: StoryArtifact,
  options?: TranslationOptions
): Promise<StoryArtifactTitleLocalizations> {
  const fallback = artifact.title?.trim();
  if (!fallback) {
    throw new Error(`Cannot localize empty story artifact title for ${artifact.id}`);
  }

  const defaults = LOCALE_IDS.reduce((acc, locale) => {
    acc[locale] = fallback;
    return acc;
  }, {} as StoryArtifactTitleLocalizations);

  try {
    logger.info(
      { artifactId: artifact.id, artifactCode: artifact.artifactCode, title: artifact.title },
      'Localizing story artifact title',
    );

    const textProvider = getTextProvider();
    const raw = await textProvider.generateText({
      prompt: buildStoryArtifactTitleLocalizationPrompt(artifact),
      temperature: 0.1,
      maxTokens: 8192,
      onUsage: options?.onUsage,
      operation: 'translation',
    });

    const parsed = extractJsonObject(raw);
    if (!parsed) {
      logger.warn(
        { artifactId: artifact.id, artifactCode: artifact.artifactCode, raw: raw.slice(0, 300) },
        'Story artifact title localization returned non-JSON; falling back to canonical title',
      );
    }

    const localizations = LOCALE_IDS.reduce((acc, locale) => {
      acc[locale] = normalizeLocalizedName(parsed?.[locale], fallback);
      return acc;
    }, {} as StoryArtifactTitleLocalizations);

    await Promise.all(
      LOCALE_IDS.map((locale) =>
        getDictionaryRepository().upsertTranslation({
          entityType: STORY_ARTIFACT_TRANSLATION_ENTITY,
          entityId: artifact.artifactCode,
          locale,
          fieldName: STORY_ARTIFACT_TITLE_FIELD,
          value: localizations[locale],
        })
      )
    );

    logger.info(
      { artifactId: artifact.id, artifactCode: artifact.artifactCode, localizations },
      'Story artifact title localized and saved',
    );

    return localizations;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        artifactId: artifact.id,
        artifactCode: artifact.artifactCode,
      },
      'Failed to localize story artifact title',
    );

    await Promise.all(
      LOCALE_IDS.map((locale) =>
        getDictionaryRepository().upsertTranslation({
          entityType: STORY_ARTIFACT_TRANSLATION_ENTITY,
          entityId: artifact.artifactCode,
          locale,
          fieldName: STORY_ARTIFACT_TITLE_FIELD,
          value: defaults[locale],
        })
      )
    );

    return defaults;
  }
}

/**
 * Translate character description to English and persist.
 * Called asynchronously (fire-and-forget) after character create/update.
 *
 * Logic:
 * - If descriptionLanguage is 'en', skip translation (already English)
 * - Otherwise, send the description text to the LLM for translation
 * - Store the English version in description_en column
 */
export async function translateCharacterDescription(character: Character, options?: TranslationOptions): Promise<void> {
  const descriptionLanguage = (character as any).descriptionLanguage as string | null | undefined;
  const description = character.aiGeneratedDescription || character.description;

  if (!description) {
    logger.debug({ characterId: character.id }, 'No description to translate');
    return;
  }

  // Skip if description is already in English
  if (descriptionLanguage === 'en') {
    logger.info(
      { characterId: character.id, descriptionLanguage },
      'Description already in English — saving as descriptionEn directly',
    );
    await getCharacterRepository().updateDescriptionEn(character.id, description);
    return;
  }

  try {
    logger.info(
      { characterId: character.id, descriptionLanguage, descriptionLength: description.length },
      'Translating character description to English',
    );

    const textProvider = getTextProvider();

    const prompt = `Translate the following character description to English. Return ONLY the translated text, nothing else. No explanations, no notes, no formatting — just the translation.\n\n${description}`;

    const translatedText = await textProvider.generateText({
      prompt,
      temperature: 0.1, // Low temperature for accurate translation
      maxTokens: 4096,
      onUsage: options?.onUsage,
      operation: 'translation',
    });

    const trimmed = translatedText.trim();

    if (!trimmed) {
      logger.warn({ characterId: character.id }, 'Translation returned empty result');
      return;
    }

    await getCharacterRepository().updateDescriptionEn(character.id, trimmed);

    logger.info(
      { characterId: character.id, translatedLength: trimmed.length },
      'Character description translated and saved',
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        characterId: character.id,
      },
      'Failed to translate character description — image prompts will use original description',
    );
  }
}

/**
 * Translate child profile description to English and persist.
 * Called asynchronously (fire-and-forget) after child profile create/update.
 *
 * Logic mirrors translateCharacterDescription:
 * - If descriptionLanguage is 'en', skip translation (already English)
 * - Otherwise, send the description text to the LLM for translation
 * - Store the English version in description_en column
 */
export async function translateChildDescription(childProfile: ChildProfile, options?: TranslationOptions): Promise<void> {
  const descriptionLanguage = (childProfile as any).descriptionLanguage as string | null | undefined;
  const description = childProfile.aiGeneratedDescription;

  if (!description) {
    logger.debug({ childId: childProfile.id }, 'No child description to translate');
    return;
  }

  // Skip if description is already in English
  if (descriptionLanguage === 'en') {
    logger.info(
      { childId: childProfile.id, descriptionLanguage },
      'Child description already in English — saving as descriptionEn directly',
    );
    await Promise.all([
      getChildProfileRepository().updateDescriptionEn(childProfile.id, description),
      getCharacterRepository().updateDescriptionEnByChildProfileId(childProfile.id, description),
    ]);
    return;
  }

  try {
    logger.info(
      { childId: childProfile.id, descriptionLanguage, descriptionLength: description.length },
      'Translating child description to English',
    );

    const textProvider = getTextProvider();

    const prompt = `Translate the following child appearance description to English. Return ONLY the translated text, nothing else. No explanations, no notes, no formatting — just the translation.\n\n${description}`;

    const translatedText = await textProvider.generateText({
      prompt,
      temperature: 0.1,
      maxTokens: 4096,
      onUsage: options?.onUsage,
      operation: 'translation',
    });

    const trimmed = translatedText.trim();

    if (!trimmed) {
      logger.warn({ childId: childProfile.id }, 'Child description translation returned empty result');
      return;
    }

    await Promise.all([
      getChildProfileRepository().updateDescriptionEn(childProfile.id, trimmed),
      getCharacterRepository().updateDescriptionEnByChildProfileId(childProfile.id, trimmed),
    ]);

    logger.info(
      { childId: childProfile.id, translatedLength: trimmed.length },
      'Child description translated and saved',
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        childId: childProfile.id,
      },
      'Failed to translate child description — image prompts will use original description',
    );
  }
}
