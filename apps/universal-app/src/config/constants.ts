import {
  APP_UI_LOCALES,
  DEFAULT_LOCALE,
  DEFAULT_PUBLIC_SEO_LOCALE,
  LOCALE_IDS,
  buildAbsoluteRouteUrl,
  buildPublicLegalPath,
  normalizePublicSeoLocale,
  type PublicLegalDoc,
} from '@wondertales/shared';
import { getWebOrigin } from '@/utils/webRuntime';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://app.wondertales.com';

/** Base URL for legal pages: uses current host on web (localhost in dev), WEB_APP_URL on native. */
function getLegalBaseUrl(): string {
  return getWebOrigin(WEB_APP_URL) ?? WEB_APP_URL;
}

function isLocalWebOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

function buildSsrLegalPath(doc: PublicLegalDoc, locale?: string | null): string {
  const normalizedLocale = normalizePublicSeoLocale(locale);
  return normalizedLocale === DEFAULT_PUBLIC_SEO_LOCALE
    ? `/ssr/legal/${doc}`
    : `/ssr/legal/${doc}/${normalizedLocale}`;
}

function getLocalSsrLegalBaseUrl(): string {
  try {
    const apiUrl = new URL(API_BASE_URL);
    if (isLocalWebOrigin(apiUrl.origin)) {
      apiUrl.port = apiUrl.port || '3000';
      if (apiUrl.port !== '3000') {
        apiUrl.port = '3000';
      }
      apiUrl.pathname = '';
      apiUrl.search = '';
      apiUrl.hash = '';
      return apiUrl.toString().replace(/\/$/, '');
    }
  } catch {
    // Fall through to the default local API origin.
  }

  return 'http://localhost:3000';
}

export function getLegalUrl(doc: PublicLegalDoc, locale?: string | null): string {
  const webOrigin = getWebOrigin();

  if (webOrigin && isLocalWebOrigin(webOrigin)) {
    return buildAbsoluteRouteUrl(getLocalSsrLegalBaseUrl(), buildSsrLegalPath(doc, locale));
  }

  return buildAbsoluteRouteUrl(getLegalBaseUrl(), buildPublicLegalPath(doc, locale));
}

export const LEGAL_URLS = {
  get terms() {
    return getLegalUrl('terms');
  },
  get privacy() {
    return getLegalUrl('privacy');
  },
};

// Use EXPO_PUBLIC_ prefix - Expo inlines only these into the client bundle
export const OAUTH_CONFIG = {
  google: {
    webClientId:
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || process.env.GOOGLE_CLIENT_ID_WEB || '',
    iosClientId:
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || process.env.GOOGLE_CLIENT_ID_IOS || '',
    androidClientId:
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ||
      process.env.GOOGLE_CLIENT_ID_ANDROID ||
      '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || '',
  },
};

export const APP_CONFIG = {
  name: 'WonderTales',
  scheme: 'wondertales',
  supportedLanguages: LOCALE_IDS,
  uiLanguages: APP_UI_LOCALES,
  defaultLanguage: DEFAULT_LOCALE,
};

export const REVENUECAT_CONFIG = {
  iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '',
  androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '',
  entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'premium',
  offeringId: process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID || 'default',
};

export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;
