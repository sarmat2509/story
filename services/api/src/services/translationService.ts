import { logger } from '../utils/logger';
import { getTextProvider } from './aiService';
import { getCharacterRepository, getChildProfileRepository } from '../repositories';
import type { Character, ChildProfile } from '../db/schema';

/**
 * Translate character description to English and persist.
 * Called asynchronously (fire-and-forget) after character create/update.
 *
 * Logic:
 * - If descriptionLanguage is 'en', skip translation (already English)
 * - Otherwise, send the description text to the LLM for translation
 * - Store the English version in description_en column
 */
export async function translateCharacterDescription(character: Character): Promise<void> {
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
export async function translateChildDescription(childProfile: ChildProfile): Promise<void> {
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
    await getChildProfileRepository().updateDescriptionEn(childProfile.id, description);
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
    });

    const trimmed = translatedText.trim();

    if (!trimmed) {
      logger.warn({ childId: childProfile.id }, 'Child description translation returned empty result');
      return;
    }

    await getChildProfileRepository().updateDescriptionEn(childProfile.id, trimmed);

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
