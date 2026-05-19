import { APP_CONFIG } from '@/config/constants';
import { isAppUiLocale, type AppUiLocale } from '@wondertales/shared';

function normalizeDocumentLocale(language?: string | null): AppUiLocale {
  const normalized = language?.split('-')[0]?.toLowerCase();
  return normalized && isAppUiLocale(normalized) ? normalized : APP_CONFIG.defaultLanguage;
}

export function syncWebDocumentLocale(language?: string | null): void {
  if (typeof document === 'undefined') {
    return;
  }

  const locale = normalizeDocumentLocale(language);
  document.documentElement.lang = locale;
  document.documentElement.dir = 'ltr';
}
