export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// Use EXPO_PUBLIC_ prefix - Expo inlines only these into the client bundle
export const OAUTH_CONFIG = {
  google: {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || process.env.GOOGLE_CLIENT_ID_WEB || '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || process.env.GOOGLE_CLIENT_ID_IOS || '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || process.env.GOOGLE_CLIENT_ID_ANDROID || '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || '',
  },
};

export const APP_CONFIG = {
  name: 'Kazka+',
  scheme: 'kazka',
  supportedLanguages: ['uk', 'ru', 'en', 'es', 'fr', 'de'] as const,
  defaultLanguage: 'uk' as const,
};

export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;
