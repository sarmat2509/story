const path = require('path');

// Load .env from monorepo root first (so root .env vars like EXPO_PUBLIC_* are available)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
// Then app-level .env (overrides root)
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const base = require('./app.json');

/**
 * Derive iosUrlScheme from iOS Client ID for Google Sign In OAuth callback.
 * Client ID: 123456789-xxx.apps.googleusercontent.com
 * Scheme: com.googleusercontent.apps.123456789-xxx
 */
function getGoogleIosUrlScheme() {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || 
                      process.env.GOOGLE_CLIENT_ID_IOS || 
                      '151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com'; // Fallback
  
  if (!iosClientId || !iosClientId.includes('.apps.googleusercontent.com')) {
    return 'com.googleusercontent.apps.placeholder';
  }
  const prefix = iosClientId.replace('.apps.googleusercontent.com', '');
  return `com.googleusercontent.apps.${prefix}`;
}

module.exports = {
  expo: {
    ...base.expo,
    extra: {
      eas: {
        projectId: "f96175da-3327-4a98-ba09-90ed92e7e668"
      }
    },
    plugins: [
      ...base.expo.plugins,
      [
        '@react-native-google-signin/google-signin',
        { iosUrlScheme: getGoogleIosUrlScheme() },
      ],
      'expo-notifications',
    ],
  },
};
