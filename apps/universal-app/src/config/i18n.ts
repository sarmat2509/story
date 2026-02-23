// Polyfill for Intl.PluralRules (required for React Native)
import 'intl-pluralrules';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { storage } from '@/utils/storage';
import { APP_CONFIG } from '@/config/constants';

// Import translations from shared package
import ukTranslations from '@kazka/shared/i18n/uk.json';
import ruTranslations from '@kazka/shared/i18n/ru.json';
import enTranslations from '@kazka/shared/i18n/en.json';
import esTranslations from '@kazka/shared/i18n/es.json';
import frTranslations from '@kazka/shared/i18n/fr.json';
import deTranslations from '@kazka/shared/i18n/de.json';

const resources = {
  uk: { translation: ukTranslations },
  ru: { translation: ruTranslations },
  en: { translation: enTranslations },
  es: { translation: esTranslations },
  fr: { translation: frTranslations },
  de: { translation: deTranslations },
};

export async function initI18n() {
  // Get saved language or use default
  const savedLanguage = await storage.getLanguage();
  const initialLanguage = savedLanguage || APP_CONFIG.defaultLanguage;

  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: APP_CONFIG.defaultLanguage,
      supportedLngs: APP_CONFIG.supportedLanguages,
      interpolation: {
        escapeValue: false, // React already escapes
      },
      react: {
        useSuspense: false,
      },
    });

  return i18n;
}

export default i18n;
