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
      const GoogleSignin = require('@react-native-google-signin/google-signin').default;
      
      // Configure
      await GoogleSignin.configure({
        webClientId: OAUTH_CONFIG.google.webClientId, // Backend client ID
        iosClientId: OAUTH_CONFIG.google.iosClientId, // iOS-specific
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
        const AppleAuthentication = require('@invertase/react-native-apple-authentication');
        
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
