export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export const OAUTH_CONFIG = {
  google: {
    webClientId: process.env.GOOGLE_CLIENT_ID_WEB || '',
    iosClientId: process.env.GOOGLE_CLIENT_ID_IOS || '',
    androidClientId: process.env.GOOGLE_CLIENT_ID_ANDROID || '',
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
