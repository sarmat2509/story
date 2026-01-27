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
      const idToken = await oauth.handleGoogleSignIn();
      if (idToken) {
        await googleLoginMutation.mutateAsync(idToken);
      }
    } catch (error) {
      console.error('Google sign in failed:', error);
      throw error;
    }
  };

  const signInWithApple = async () => {
    try {
      const idToken = await oauth.handleAppleSignIn();
      if (idToken) {
        await appleLoginMutation.mutateAsync(idToken);
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
