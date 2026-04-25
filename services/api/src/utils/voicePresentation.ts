import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@wondertales/shared';

const VOICE_DISPLAY_NAMES: Record<string, Record<Locale, string>> = {
  andromeda: {
    uk: 'Андромеда',
    ru: 'Андромеда',
    en: 'Andromeda',
    es: 'Andromeda',
    de: 'Andromeda',
    fr: 'Andromeda',
    pl: 'Andromeda',
  },
  alloy: {
    uk: 'Алой',
    ru: 'Аллой',
    en: 'Alloy',
    es: 'Alloy',
    de: 'Alloy',
    fr: 'Alloy',
    pl: 'Alloy',
  },
  ballad: {
    uk: 'Балада',
    ru: 'Баллада',
    en: 'Ballad',
    es: 'Balada',
    de: 'Ballade',
    fr: 'Ballade',
    pl: 'Ballada',
  },
  cassiopeia: {
    uk: 'Кассіопея',
    ru: 'Кассиопея',
    en: 'Cassiopeia',
    es: 'Casiopea',
    de: 'Kassiopeia',
    fr: 'Cassiopee',
    pl: 'Kasjopeja',
  },
  cedar: {
    uk: 'Седар',
    ru: 'Седар',
    en: 'Cedar',
    es: 'Cedro',
    de: 'Zeder',
    fr: 'Cedre',
    pl: 'Cedr',
  },
  centaurus: {
    uk: 'Кентавр',
    ru: 'Кентавр',
    en: 'Centaurus',
    es: 'Centauro',
    de: 'Zentaur',
    fr: 'Centaure',
    pl: 'Centaur',
  },
  coral: {
    uk: 'Корал',
    ru: 'Коралл',
    en: 'Coral',
    es: 'Coral',
    de: 'Koralle',
    fr: 'Corail',
    pl: 'Koral',
  },
  hydra: {
    uk: 'Гідра',
    ru: 'Гидра',
    en: 'Hydra',
    es: 'Hidra',
    de: 'Hydra',
    fr: 'Hydre',
    pl: 'Hydra',
  },
  lyra: {
    uk: 'Ліра',
    ru: 'Лира',
    en: 'Lyra',
    es: 'Lira',
    de: 'Leier',
    fr: 'Lyre',
    pl: 'Lira',
  },
  marin: {
    uk: 'Марін',
    ru: 'Марин',
    en: 'Marin',
    es: 'Marin',
    de: 'Marin',
    fr: 'Marin',
    pl: 'Marin',
  },
  orion: {
    uk: 'Оріон',
    ru: 'Орион',
    en: 'Orion',
    es: 'Orion',
    de: 'Orion',
    fr: 'Orion',
    pl: 'Orion',
  },
  perseus: {
    uk: 'Персей',
    ru: 'Персей',
    en: 'Perseus',
    es: 'Perseo',
    de: 'Perseus',
    fr: 'Persee',
    pl: 'Perseusz',
  },
  phoenix: {
    uk: 'Феникс',
    ru: 'Феникс',
    en: 'Phoenix',
    es: 'Fenix',
    de: 'Phonix',
    fr: 'Phenix',
    pl: 'Feniks',
  },
  sirius: {
    uk: 'Сіріус',
    ru: 'Сириус',
    en: 'Sirius',
    es: 'Sirio',
    de: 'Sirius',
    fr: 'Sirius',
    pl: 'Syriusz',
  },
  capella: {
    uk: 'Капелла',
    ru: 'Капелла',
    en: 'Capella',
    es: 'Capella',
    de: 'Capella',
    fr: 'Capella',
    pl: 'Kapella',
  },
  rigel: {
    uk: 'Рігель',
    ru: 'Ригель',
    en: 'Rigel',
    es: 'Rigel',
    de: 'Rigel',
    fr: 'Rigel',
    pl: 'Rigel',
  },
  atlas: {
    uk: 'Атлас',
    ru: 'Атлас',
    en: 'Atlas',
    es: 'Atlas',
    de: 'Atlas',
    fr: 'Atlas',
    pl: 'Atlas',
  },
  antares: {
    uk: 'Антарес',
    ru: 'Антарес',
    en: 'Antares',
    es: 'Antares',
    de: 'Antares',
    fr: 'Antares',
    pl: 'Antares',
  },
};

function normalizeVoiceLocale(input?: string | null): Locale {
  const normalized = input?.slice(0, 2).toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

function toTitleCaseName(value: string): string {
  return value
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

export function getLocalizedVoiceDisplayName(
  voiceName: string,
  locale?: string | null,
  fallbackDisplayName?: string | null
): string {
  const normalizedLocale = normalizeVoiceLocale(locale);
  const normalizedVoiceName = voiceName.trim().toLowerCase();
  const localized = VOICE_DISPLAY_NAMES[normalizedVoiceName]?.[normalizedLocale];

  if (localized) {
    return localized;
  }

  const safeFallback = fallbackDisplayName?.trim();
  if (safeFallback) {
    return safeFallback;
  }

  return toTitleCaseName(normalizedVoiceName);
}

export function getVoiceSamplePath(providerVoiceId: string, locale?: string | null): string {
  const normalizedLocale = normalizeVoiceLocale(locale);
  return `voice-samples/${normalizedLocale}/${providerVoiceId}.mp3`;
}

