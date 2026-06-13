// Polyfill for Intl.PluralRules (required for React Native)
import 'intl-pluralrules';

import { Platform } from 'react-native';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { isAppUiLocale } from '@wondertales/shared';
import { storage } from '@/utils/storage';
import { APP_CONFIG } from '@/config/constants';
import { getPublicSeoLocaleOverrideFromPath } from '@/utils/publicSeoLocale';
import { syncWebDocumentLocale } from '@/utils/documentLocale';
import { getWebPathname } from '@/utils/webRuntime';

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

let documentLocaleSyncBound = false;

function getLocaleFromUrl(): string | null {
  if (Platform.OS !== 'web') {
    return null;
  }

  const pathname = getWebPathname();
  if (!pathname) {
    return null;
  }

  const publicSeoLocale = getPublicSeoLocaleOverrideFromPath(pathname);
  if (publicSeoLocale) {
    return publicSeoLocale;
  }

  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase();

  return firstSegment && isAppUiLocale(firstSegment) ? firstSegment : null;
}

function normalizeUiLanguage(language?: string | null): string | null {
  const normalized = language?.split('-')[0]?.toLowerCase();
  return normalized && isAppUiLocale(normalized) ? normalized : null;
}

export async function initI18n() {
  // On web, locale in the URL should win over saved preference so public routes
  // like /en/welcome can be rendered in the requested language before login.
  const savedLanguage = normalizeUiLanguage(await storage.getLanguage());
  const urlLanguage = getLocaleFromUrl();
  const initialLanguage = urlLanguage || savedLanguage || APP_CONFIG.defaultLanguage;

  if (urlLanguage && urlLanguage !== savedLanguage) {
    await storage.setLanguage(urlLanguage);
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: APP_CONFIG.defaultLanguage,
    supportedLngs: APP_CONFIG.uiLanguages,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
  });

  syncWebDocumentLocale(i18n.language);
  if (!documentLocaleSyncBound) {
    i18n.on('languageChanged', syncWebDocumentLocale);
    documentLocaleSyncBound = true;
  }

  return i18n;
}

export default i18n;
