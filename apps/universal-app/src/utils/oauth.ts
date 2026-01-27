import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { API_BASE_URL, OAUTH_CONFIG } from '@/config/constants';

WebBrowser.maybeCompleteAuthSession();

export const oauth = {
  /**
   * Handle Google Sign In
   * Platform-specific implementation
   */
  async handleGoogleSignIn(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        // Web: Full page redirect
        const redirectUri = makeRedirectUri({
          scheme: 'kazka',
          path: 'auth/google/callback',
        });
        
        // Save state before redirect
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('oauth_redirect', 'google');
        }
        
        // Full page redirect
        const authUrl = `${API_BASE_URL}/api/v1/auth/google/start?redirect_uri=${encodeURIComponent(redirectUri)}`;
        
        if (typeof window !== 'undefined') {
          window.location.href = authUrl;
        }
        
        // Execution stops here - page will redirect
        return null;
      } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
        // Native: Use Google Sign In SDK
        const GoogleSignin = require('@react-native-google-signin/google-signin').default;
        
        // Configure (do this once, ideally at app startup)
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
      }
      
      return null;
    } catch (error) {
      console.error('Google Sign In error:', error);
      throw error;
    }
  },

  /**
   * Handle Apple Sign In
   * Platform-specific implementation
   */
  async handleAppleSignIn(): Promise<{ identityToken: string; user?: any } | null> {
    try {
      if (Platform.OS === 'web') {
        // Web: Full page redirect to backend Apple OAuth
        const redirectUri = makeRedirectUri({
          scheme: 'kazka',
          path: 'auth/apple/callback',
        });
        
        // Save state before redirect
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('oauth_redirect', 'apple');
        }
        
        // Full page redirect
        const authUrl = `${API_BASE_URL}/api/v1/auth/apple/start?redirect_uri=${encodeURIComponent(redirectUri)}`;
        
        if (typeof window !== 'undefined') {
          window.location.href = authUrl;
        }
        
        // Execution stops here - page will redirect
        return null;
      } else if (Platform.OS === 'ios') {
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
        // Android: Use web flow (Apple Sign In for Android uses web)
        // Recursively call with Platform.OS = 'web'
        const originalPlatform = Platform.OS;
        (Platform as any).OS = 'web';
        const result = await this.handleAppleSignIn();
        (Platform as any).OS = originalPlatform;
        return result;
      }
    } catch (error) {
      console.error('Apple Sign In error:', error);
      throw error;
    }
  },
};
