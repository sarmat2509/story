import { DEFAULT_LOCALE, isValidLocale, type Locale } from '../config/languages';

export const PRICING_FEATURE_ORDER = [
  'stories_per_day',
  'images_per_story',
  'premium_voices',
  'follow_narrator',
  'child_profiles_limit',
  'series_enabled',
  'share_enabled',
] as const;

const HIDDEN_PRICING_FEATURE_SLUGS = new Set([
  'stories_per_month',
  'audio_stories_per_month',
  'story_from_drawing',
  'image_quality',
]);

const MONTHLY_SUFFIXES: Record<Locale, string> = {
  uk: 'на місяць',
  ru: 'в месяц',
  en: 'per month',
  es: 'al mes',
  de: 'pro Monat',
  fr: 'par mois',
  pl: 'miesiecznie',
};

const MONTHLY_CONJUNCTIONS: Record<Locale, string> = {
  uk: 'і',
  ru: 'и',
  en: 'and',
  es: 'y',
  de: 'und',
  fr: 'et',
  pl: 'i',
};

const PRICING_LOCALE_TAGS: Record<Locale, string> = {
  uk: 'uk-UA',
  ru: 'ru-RU',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  pl: 'pl-PL',
};

const MINOR_UNIT_CURRENCIES = new Set(['EUR', 'UAH', 'USD']);

export interface PricingFeatureLike {
  name?: string;
  value?: unknown;
  category?: string;
}

export type PricingTranslate = (
  key: string,
  params?: Record<string, string | number>,
  defaultValue?: string
) => string;

export function normalizePricingLocale(input?: string | null): Locale {
  const normalized = input?.slice(0, 2).toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

export function interpolatePricingTemplate(
  template: string,
  params: Record<string, string | number> = {}
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    String(params[key] ?? '')
  );
}

function getFeatureValueObject(feature: PricingFeatureLike): Record<string, any> | null {
  const value = feature.value;
  return value && typeof value === 'object' ? (value as Record<string, any>) : null;
}

export function renderPricingFeatureValue(feature: PricingFeatureLike): string {
  const value = getFeatureValueObject(feature);
  if (value) {
    if ('limit' in value) {
      if (value.limit == null) return '∞';
      return `${value.limit} ${value.unit || ''}`.trim();
    }
    if ('enabled' in value) {
      return value.enabled ? '✓' : '✗';
    }
    if ('selected' in value) {
      return String(value.selected);
    }
  }
  return String(feature.value ?? '');
}

export function isPricingFeatureAvailable(feature: PricingFeatureLike): boolean {
  const value = getFeatureValueObject(feature);
  if (value) {
    if ('enabled' in value) return Boolean(value.enabled);
    if ('limit' in value) return value.limit == null || value.limit > 0;
  }
  return true;
}

export function sortPricingFeatureEntries<T extends PricingFeatureLike>(
  features: Record<string, T> | Array<T>
): Array<[string, T]> {
  const asRecord = Array.isArray(features)
    ? Object.fromEntries(features.map((feature) => [feature.name ?? '', feature])) as Record<string, T>
    : features;
  const available: Array<[string, T]> = [];
  const unavailable: Array<[string, T]> = [];

  Object.entries(asRecord).forEach(([slug, feature]) => {
    if (!slug || HIDDEN_PRICING_FEATURE_SLUGS.has(slug)) return;
    (isPricingFeatureAvailable(feature) ? available : unavailable).push([slug, feature]);
  });

  const order = (slug: string) => {
    const idx = PRICING_FEATURE_ORDER.indexOf(slug as typeof PRICING_FEATURE_ORDER[number]);
    return idx === -1 ? PRICING_FEATURE_ORDER.length : idx;
  };

  available.sort((a, b) => order(a[0]) - order(b[0]));
  unavailable.sort((a, b) => order(a[0]) - order(b[0]));

  return [...available, ...unavailable];
}

function pluralCategory(locale: Locale, count: number): 'one' | 'few' | 'many' | 'other' {
  if (locale === 'uk' || locale === 'ru') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'few';
    return 'many';
  }

  if (locale === 'pl') {
    if (count === 1) return 'one';
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'other';
    return 'many';
  }

  return count === 1 ? 'one' : 'other';
}

export function getPricingFeatureLabel(
  localeInput: string | null | undefined,
  translate: PricingTranslate,
  slug: string,
  feature: PricingFeatureLike
): string {
  const locale = normalizePricingLocale(localeInput);
  const value = getFeatureValueObject(feature);

  if (slug === 'child_profiles_limit' && value?.limit == null) {
    return translate('features.child_profiles_limit_unlimited', undefined, feature.name ?? slug);
  }

  if (slug === 'child_profiles_limit' && value?.limit === 1) {
    return translate('features.child_profiles_limit_one', undefined, feature.name ?? slug);
  }

  if (slug === 'images_per_story' && typeof value?.limit === 'number') {
    const category = pluralCategory(locale, value.limit);
    const pluralKey = category === 'one'
      ? 'images_per_story_one'
      : category === 'few'
        ? 'images_per_story_few'
        : category === 'many'
          ? 'images_per_story_many'
          : 'images_per_story_other';
    const fallback = translate('features.images_per_story', {
      value: value.limit,
      count: value.limit,
    }, feature.name ?? slug);
    return translate(`features.${pluralKey}`, {
      value: value.limit,
      count: value.limit,
    }, fallback);
  }

  return translate(`features.${slug}`, {
    value: renderPricingFeatureValue(feature),
  }, feature.name ?? slug);
}

export function formatPricingPrice(
  localeInput: string | null | undefined,
  priceMonthly: number,
  currency: string,
  freeLabel: string
): string {
  const locale = normalizePricingLocale(localeInput);
  if (priceMonthly === 0) return freeLabel;

  const normalizedCurrency = currency.toUpperCase();
  const amount = MINOR_UNIT_CURRENCIES.has(normalizedCurrency)
    ? priceMonthly / 100
    : priceMonthly;
  const fractionDigits = normalizedCurrency === 'UAH' ? 0 : 2;

  try {
    return new Intl.NumberFormat(PRICING_LOCALE_TAGS[locale], {
      style: 'currency',
      currency: normalizedCurrency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    const fixed = amount.toFixed(fractionDigits);
    return locale === 'en' ? `${normalizedCurrency} ${fixed}` : `${fixed} ${normalizedCurrency}`;
  }
}

function getMetricHighlight(
  locale: Locale,
  translate: PricingTranslate,
  key: string,
  feature?: PricingFeatureLike
): string | null {
  const limit = getFeatureValueObject(feature ?? {})?.limit;
  if (typeof limit !== 'number') return null;
  const fallback = translate(key, { count: limit, value: limit }, '');
  const category = pluralCategory(locale, limit);
  const pluralKey = category === 'one'
    ? `${key}_one`
    : category === 'few'
      ? `${key}_few`
      : category === 'many'
        ? `${key}_many`
        : `${key}_other`;
  const value = translate(pluralKey, { count: limit, value: limit }, fallback);
  return value || null;
}

function stripMonthlySuffix(locale: Locale, value: string): string {
  const suffix = MONTHLY_SUFFIXES[locale];
  if (!suffix) return value.trim();
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`\\s+${escapedSuffix}$`), '').trim();
}

export function getCombinedPricingUsageHighlight(
  localeInput: string | null | undefined,
  translate: PricingTranslate,
  features: Record<string, PricingFeatureLike>
): string | null {
  const locale = normalizePricingLocale(localeInput);
  const stories = getMetricHighlight(locale, translate, 'features.stories_per_month', features.stories_per_month);
  const audio = getMetricHighlight(locale, translate, 'audio_stories', features.audio_stories_per_month);

  if (!stories && !audio) return null;
  if (!stories) return audio;
  if (!audio) return stories;

  const storiesBase = stripMonthlySuffix(locale, stories);
  const audioBase = stripMonthlySuffix(locale, audio);
  return `${storiesBase} ${MONTHLY_CONJUNCTIONS[locale]} ${audioBase} ${MONTHLY_SUFFIXES[locale]}`;
}
