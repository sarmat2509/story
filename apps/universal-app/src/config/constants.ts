import { APP_UI_LOCALES, DEFAULT_LOCALE, LOCALE_IDS } from '@wondertales/shared';
import { getWebOrigin } from '@/utils/webRuntime';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://app.wondertales.com';

/** Base URL for legal pages: uses current host on web (localhost in dev), WEB_APP_URL on native. */
function getLegalBaseUrl(): string {
  return getWebOrigin(WEB_APP_URL) ?? WEB_APP_URL;
}

export const LEGAL_URLS = {
  get terms() {
    return `${getLegalBaseUrl()}/terms`;
  },
  get privacy() {
    return `${getLegalBaseUrl()}/privacy`;
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
