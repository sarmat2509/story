import { Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useGoogleLogin, useAppleLogin, useLogout, useUser } from '@/api/auth';
import { oauth } from '@/utils/oauth';

export function useAuth() {
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const googleLoginMutation = useGoogleLogin();
  const appleLoginMutation = useAppleLogin();
  const logoutMutation = useLogout();
  const userQuery = useUser();

  const signInWithGoogle = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web: Redirect flow, token comes from URL callback (handled by OAuthCallbackScreen)
        await oauth.handleGoogleSignIn();
        // For web, this triggers window.location.href redirect, execution stops here
      } else {
        // Mobile: Get idToken from native SDK, exchange with backend
        const idToken = await oauth.handleGoogleSignIn();
        if (idToken) {
          // Use TanStack Query mutation to exchange token
          await googleLoginMutation.mutateAsync(idToken);
          // Mutation onSuccess already saves token & user to store
        }
      }
    } catch (error) {
      console.error('Google sign in failed:', error);
      throw error;
    }
  };

  const signInWithApple = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web: Redirect flow, token comes from URL callback (handled by OAuthCallbackScreen)
        await oauth.handleAppleSignIn();
        // For web, this triggers window.location.href redirect, execution stops here
      } else {
        // Mobile (primarily iOS): Get identityToken from native SDK, exchange with backend
        const result = await oauth.handleAppleSignIn();
        if (result?.identityToken) {
          // Use TanStack Query mutation to exchange token
          await appleLoginMutation.mutateAsync({
            identityToken: result.identityToken,
            user: result.user, // Only present on first sign in
          });
          // Mutation onSuccess already saves token & user to store
        }
      }
    } catch (error) {
      console.error('Apple sign in failed:', error);
      throw error;
    }
  };

  const signOut = async () => {
    await logoutMutation.mutateAsync();
  };

  const refreshUser = async () => {
    await userQuery.refetch();
  };

  return {
    isAuthenticated,
    user,
    isLoading: isLoading || googleLoginMutation.isPending || appleLoginMutation.isPending,
    signInWithGoogle,
    signInWithApple,
    signOut,
    refreshUser,
  };
}
