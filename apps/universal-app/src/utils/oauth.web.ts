import { API_BASE_URL } from '@/config/constants';

export const oauth = {
  /**
   * Handle Google Sign In - WEB ONLY
   * Backend determines redirect from request origin, no redirect_uri needed.
   */
  async handleGoogleSignIn(): Promise<string | null> {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('oauth_redirect', 'google');
        window.location.href = `${window.location.origin}/api/v1/auth/google/start`;
      }
      return null;
    } catch (error) {
      console.error('Google Sign In error:', error);
      throw error;
    }
  },

  /**
   * Handle Apple Sign In - WEB ONLY
   * Backend determines redirect from request origin, no redirect_uri needed.
   */
  async handleAppleSignIn(): Promise<{ identityToken: string; user?: any } | null> {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('oauth_redirect', 'apple');
        window.location.href = `${window.location.origin}/api/v1/auth/apple/start`;
      }
      return null;
    } catch (error) {
      console.error('Apple Sign In error:', error);
      throw error;
    }
  },
};
