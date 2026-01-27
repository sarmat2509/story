import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { API_BASE_URL, OAUTH_CONFIG } from '@/config/constants';

WebBrowser.maybeCompleteAuthSession();

export const oauth = {
  /**
   * Handle Google Sign In - WEB ONLY
   */
  async handleGoogleSignIn(): Promise<string | null> {
    try {
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
      
      return null;
    } catch (error) {
      console.error('Google Sign In error:', error);
      throw error;
    }
  },

  /**
   * Handle Apple Sign In - WEB ONLY
   */
  async handleAppleSignIn(): Promise<{ identityToken: string; user?: any } | null> {
    try {
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
      
      return null;
    } catch (error) {
      console.error('Apple Sign In error:', error);
      throw error;
    }
  },
};
