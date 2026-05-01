import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@wondertales/shared';
import ukTranslations from '@wondertales/shared/i18n/uk.json';
import ruTranslations from '@wondertales/shared/i18n/ru.json';
import enTranslations from '@wondertales/shared/i18n/en.json';
import esTranslations from '@wondertales/shared/i18n/es.json';
import frTranslations from '@wondertales/shared/i18n/fr.json';
import deTranslations from '@wondertales/shared/i18n/de.json';
import plTranslations from '@wondertales/shared/i18n/pl.json';
import { logger } from './logger';

const translationCache = new Map<string, any>();
const TRANSLATIONS_BY_LOCALE: Record<Locale, any> = {
  uk: ukTranslations,
  ru: ruTranslations,
  en: enTranslations,
  es: esTranslations,
  fr: frTranslations,
  de: deTranslations,
  pl: plTranslations,
};

function normalizeTranslationLocale(language: string): Locale {
  const normalized = language?.slice(0, 2).toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

function loadTranslations(language: string): any {
  const locale = normalizeTranslationLocale(language);
  if (translationCache.has(locale)) {
    return translationCache.get(locale);
  }

  const translations = TRANSLATIONS_BY_LOCALE[locale] ?? TRANSLATIONS_BY_LOCALE[DEFAULT_LOCALE];
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
