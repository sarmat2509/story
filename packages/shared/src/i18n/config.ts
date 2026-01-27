import i18next from 'i18next';
import * as ukTranslations from './uk.json';
import * as ruTranslations from './ru.json';
import * as enTranslations from './en.json';
import * as esTranslations from './es.json';
import * as deTranslations from './de.json';
import * as frTranslations from './fr.json';

// Initialize i18next with all supported languages
export const initI18n = (locale: string = 'uk') => {
  return i18next.init({
    lng: locale,
    fallbackLng: 'en',
    debug: false,
    resources: {
      uk: {
        translation: ukTranslations,
      },
      ru: {
        translation: ruTranslations,
      },
      en: {
        translation: enTranslations,
      },
      es: {
        translation: esTranslations,
      },
      de: {
        translation: deTranslations,
      },
      fr: {
        translation: frTranslations,
      },
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });
};

// Export configured instance
export const i18n = i18next;

export default i18n;
