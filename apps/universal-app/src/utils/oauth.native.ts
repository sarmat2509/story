import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { API_BASE_URL, OAUTH_CONFIG } from '@/config/constants';

WebBrowser.maybeCompleteAuthSession();

export const oauth = {
  /**
   * Handle Google Sign In - NATIVE (iOS/Android)
   */
  async handleGoogleSignIn(): Promise<string | null> {
    try {
      // Native module: named export GoogleSignin (not default)
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      if (!GoogleSignin) {
        console.warn('⚠️  Google Sign In requires Custom Dev Client (expo-dev-client). Falling back to web flow.');
        throw new Error('Google Sign In native module not available. Please use web version or build with expo-dev-client.');
      }
      
      // Configure - GIDConfiguration requires non-empty clientID
      const iosClientId = OAUTH_CONFIG.google.iosClientId;
      const webClientId = OAUTH_CONFIG.google.webClientId;
      if (!iosClientId || !iosClientId.includes('.apps.googleusercontent.com')) {
        throw new Error(
          'Google Sign In: EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS is not set. Add it to .env in apps/universal-app/.env (see .env.example). Get the iOS OAuth Client ID from Google Cloud Console.'
        );
      }

      await GoogleSignin.configure({
        webClientId: webClientId || undefined, // Backend client ID for server auth code
        iosClientId, // Required for iOS - maps to GIDConfiguration clientID
        offlineAccess: false,
      });
      
      // Sign in with Google
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      // Return idToken for backend verification
      return userInfo.idToken;
    } catch (error) {
      console.error('Google Sign In error:', error);
      throw error;
    }
  },

  /**
   * Handle Apple Sign In - NATIVE (iOS/Android)
   */
  async handleAppleSignIn(): Promise<{ identityToken: string; user?: any } | null> {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Use native Apple Authentication
        const AppleAuthenticationModule = require('@invertase/react-native-apple-authentication');
        
        if (!AppleAuthenticationModule || !AppleAuthenticationModule.appleAuth) {
          console.warn('⚠️  Apple Sign In requires Custom Dev Client (expo-dev-client). Falling back to web flow.');
          throw new Error('Apple Sign In native module not available. Please use web version or build with expo-dev-client.');
        }
        
        const AppleAuthentication = AppleAuthenticationModule;
        
        const appleAuthRequestResponse = await AppleAuthentication.appleAuth.performRequest({
          requestedOperation: AppleAuthentication.appleAuth.Operation.LOGIN,
          requestedScopes: [
            AppleAuthentication.appleAuth.Scope.EMAIL,
            AppleAuthentication.appleAuth.Scope.FULL_NAME,
          ],
        });
        
        // Return identity token and user info (if first time)
        return {
          identityToken: appleAuthRequestResponse.identityToken,
          user: appleAuthRequestResponse.fullName ? {
            name: {
              firstName: appleAuthRequestResponse.fullName.givenName,
              lastName: appleAuthRequestResponse.fullName.familyName,
            },
            email: appleAuthRequestResponse.email,
          } : undefined,
        };
      } else {
        // Android: Use web flow (fallback)
        const redirectUri = makeRedirectUri({
          scheme: 'kazka',
          path: 'auth/apple/callback',
        });
        
        const authUrl = `${API_BASE_URL}/api/v1/auth/apple/start?redirect_uri=${encodeURIComponent(redirectUri)}`;
        
        const result = await WebBrowser.openAuthSessionAsync(
          authUrl,
          redirectUri
        );
        
        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const token = url.searchParams.get('token');
          return token ? { identityToken: token } : null;
        }
        
        return null;
      }
    } catch (error) {
      console.error('Apple Sign In error:', error);
      throw error;
    }
  },
};
