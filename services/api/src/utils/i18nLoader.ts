import fs from 'fs';
import path from 'path';
import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@wondertales/shared';
import { logger } from './logger';

const TRANSLATIONS_DIR = path.join(__dirname, '../../../..', 'packages/shared/src/i18n');
const translationCache = new Map<string, any>();

function normalizeTranslationLocale(language: string): Locale {
  const normalized = language?.slice(0, 2).toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

function loadTranslations(language: string): any {
  const locale = normalizeTranslationLocale(language);
  if (translationCache.has(locale)) {
    return translationCache.get(locale);
  }

  const filePath = path.join(TRANSLATIONS_DIR, `${locale}.json`);
  const translations = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  translationCache.set(locale, translations);
  return translations;
}

/**
 * Load voice sample text from i18n files
 * Used by backend scripts to get demo text for voice sample generation
 */
export function getVoiceSampleText(language: string): string {
  try {
    const translations = loadTranslations(language);
    
    if (!translations.voice_sample_text) {
      throw new Error(`voice_sample_text not found in ${language}.json`);
    }
    
    return translations.voice_sample_text;
  } catch (error) {
    logger.error({ error, language }, 'Failed to load voice sample text');
    throw error;
  }
}

export function getPlansI18n(language: string): any {
  try {
    const translations = loadTranslations(language);
    if (!translations.plans) {
      throw new Error(`plans not found in ${language}.json`);
    }
    return translations.plans;
  } catch (error) {
    logger.error({ error, language }, 'Failed to load plans translations');
    return loadTranslations(DEFAULT_LOCALE).plans;
  }
}
