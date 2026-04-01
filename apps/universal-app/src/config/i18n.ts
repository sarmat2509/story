// Polyfill for Intl.PluralRules (required for React Native)
import 'intl-pluralrules';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { isValidLocale } from '@wondertales/shared';
import { storage } from '@/utils/storage';
import { APP_CONFIG } from '@/config/constants';

// Import translations from shared package
import ukTranslations from '@wondertales/shared/i18n/uk.json';
import ruTranslations from '@wondertales/shared/i18n/ru.json';
import enTranslations from '@wondertales/shared/i18n/en.json';
import esTranslations from '@wondertales/shared/i18n/es.json';
import frTranslations from '@wondertales/shared/i18n/fr.json';
import deTranslations from '@wondertales/shared/i18n/de.json';
import plTranslations from '@wondertales/shared/i18n/pl.json';

const resources = {
  uk: { translation: ukTranslations },
  ru: { translation: ruTranslations },
  en: { translation: enTranslations },
  es: { translation: esTranslations },
  fr: { translation: frTranslations },
  de: { translation: deTranslations },
  pl: { translation: plTranslations },
};

function getLocaleFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const firstSegment = window.location.pathname
    .split('/')
    .filter(Boolean)[0]
    ?.toLowerCase();

  return firstSegment && isValidLocale(firstSegment) ? firstSegment : null;
}

export async function initI18n() {
  // On web, locale in the URL should win over saved preference so public routes
  // like /en/welcome can be rendered in the requested language before login.
  const savedLanguage = await storage.getLanguage();
  const urlLanguage = getLocaleFromUrl();
  const initialLanguage = urlLanguage || savedLanguage || APP_CONFIG.defaultLanguage;

  if (urlLanguage && urlLanguage !== savedLanguage) {
    await storage.setLanguage(urlLanguage);
  }

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
