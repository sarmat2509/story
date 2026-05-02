import {
  DEFAULT_LOCALE,
  isAppUiLocale,
  isValidLocale,
  type AppUiLocale,
} from '@wondertales/shared';
import i18n from '@/config/i18n';
import { storage } from '@/utils/storage';

type LocaleUser = {
  preferredLocale?: string | null;
};

function normalizeLocale(value?: string | null): AppUiLocale | null {
  const normalized = value?.split('-')[0]?.toLowerCase();
  return normalized && isAppUiLocale(normalized) ? normalized : null;
}

function stripLocalePrefix(pathname: string): string {
  const firstSegment = pathname
    .split('/')
    .filter(Boolean)[0]
    ?.toLowerCase();

  if (!firstSegment || !isValidLocale(firstSegment)) {
    return pathname || '/';
  }

  const stripped = pathname.replace(new RegExp(`^/${firstSegment}(?=/|$)`), '') || '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

export function buildLocalizedWebPath(pathname: string, locale: AppUiLocale): string {
  const stripped = stripLocalePrefix(pathname);
  if (locale === DEFAULT_LOCALE) {
    return stripped;
  }

  if (stripped === '/') {
    return `/${locale}`;
  }

  return `/${locale}${stripped}`;
}

export function replaceWebLocalePrefix(locale: AppUiLocale): void {
  if (typeof window === 'undefined') {
    return;
  }

  const targetPath = buildLocalizedWebPath(window.location.pathname, locale);
  const targetUrl = `${targetPath}${window.location.search}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (targetUrl !== currentUrl) {
    window.history.replaceState(window.history.state, '', targetUrl);
  }
}

export async function applyPreferredLocale(
  locale: AppUiLocale,
  options?: { updateWebPath?: boolean }
): Promise<void> {
  const currentLocale = normalizeLocale(i18n.language);
  if (currentLocale !== locale) {
    await i18n.changeLanguage(locale);
  }

  await storage.setLanguage(locale);

  if (options?.updateWebPath !== false) {
    replaceWebLocalePrefix(locale);
  }
}

export async function applyUserPreferredLocale(
  user: LocaleUser,
  options?: { updateWebPath?: boolean }
): Promise<void> {
  const locale = normalizeLocale(user.preferredLocale);
  if (!locale) {
    return;
  }

  await applyPreferredLocale(locale, options);
}
