// API_BASE_URL not used - backend determines redirect from request origin

export const oauth = {
  /**
   * Handle Google Sign In - WEB ONLY
   * Backend determines redirect from request origin, no redirect_uri needed.
   */
  async handleGoogleSignIn(consent?: {
    termsAccepted: boolean;
    privacyAccepted: boolean;
    isAdultGuardian: boolean;
  }): Promise<string | null> {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('oauth_redirect', 'google');
        const url = new URL(`${window.location.origin}/api/v1/auth/google/start`);
        if (consent) {
          url.searchParams.set('termsAccepted', String(consent.termsAccepted));
          url.searchParams.set('privacyAccepted', String(consent.privacyAccepted));
          url.searchParams.set('isAdultGuardian', String(consent.isAdultGuardian));
        }
        window.location.href = url.toString();
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
  async handleAppleSignIn(consent?: {
    termsAccepted: boolean;
    privacyAccepted: boolean;
    isAdultGuardian: boolean;
  }): Promise<{ identityToken: string; user?: any } | null> {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('oauth_redirect', 'apple');
        const url = new URL(`${window.location.origin}/api/v1/auth/apple/start`);
        if (consent) {
          url.searchParams.set('termsAccepted', String(consent.termsAccepted));
          url.searchParams.set('privacyAccepted', String(consent.privacyAccepted));
          url.searchParams.set('isAdultGuardian', String(consent.isAdultGuardian));
        }
        window.location.href = url.toString();
      }
      return null;
    } catch (error) {
      console.error('Apple Sign In error:', error);
      throw error;
    }
  },
};
