/**
 * Centralized Language Configuration
 * Single source of truth for all supported languages
 */

export const SUPPORTED_LANGUAGES = {
  uk: {
    id: 'uk',
    displayName: 'Ukrainian',
    nativeName: 'Українська',
    flag: '🇺🇦'
  },
  ru: {
    id: 'ru',
    displayName: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺'
  },
  en: {
    id: 'en',
    displayName: 'English',
    nativeName: 'English',
    flag: '🇬🇧'
  },
  es: {
    id: 'es',
    displayName: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸'
  },
  de: {
    id: 'de',
    displayName: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪'
  },
  fr: {
    id: 'fr',
    displayName: 'French',
    nativeName: 'Français',
    flag: '🇫🇷'
  }
} as const;

/**
 * Locale type - derived from SUPPORTED_LANGUAGES keys
 */
export type Locale = keyof typeof SUPPORTED_LANGUAGES;

/**
 * Array of all locale IDs
 */
export const LOCALE_IDS = Object.keys(SUPPORTED_LANGUAGES) as Locale[];

/**
 * Language configuration type
 */
export type LanguageConfig = typeof SUPPORTED_LANGUAGES[Locale];

/**
 * Get language display name by locale ID
 */
export function getLanguageDisplayName(locale: Locale): string {
  return SUPPORTED_LANGUAGES[locale]?.displayName || locale;
}

/**
 * Get language native name by locale ID
 */
export function getLanguageNativeName(locale: Locale): string {
  return SUPPORTED_LANGUAGES[locale]?.nativeName || locale;
}

/**
 * Get full language display (e.g., "Ukrainian (Українська)")
 */
export function getLanguageFullDisplay(locale: Locale): string {
  const lang = SUPPORTED_LANGUAGES[locale];
  if (!lang) return locale;
  return lang.displayName === lang.nativeName 
    ? lang.displayName 
    : `${lang.displayName} (${lang.nativeName})`;
}

/**
 * Check if locale is supported
 */
export function isValidLocale(locale: string): locale is Locale {
  return locale in SUPPORTED_LANGUAGES;
}
