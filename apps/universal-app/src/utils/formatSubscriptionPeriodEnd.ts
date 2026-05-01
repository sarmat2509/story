import { APP_CONFIG } from '@/config/constants';

const LOCALE_MAP: Record<string, string> = {
  uk: 'uk-UA',
  ru: 'ru-RU',
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  pl: 'pl-PL',
};

/**
 * Formats subscription billing period end for UI (locale-aware).
 */
export function formatSubscriptionPeriodEnd(
  iso: string | undefined | null,
  locale?: string | null
): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const base = (locale || APP_CONFIG.defaultLanguage || 'en').split('-')[0] ?? 'en';
  const tag = LOCALE_MAP[base] ?? locale ?? 'en-US';
  return d.toLocaleDateString(tag, { day: 'numeric', month: 'long', year: 'numeric' });
}
