import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserApi, AuthResponseApi, type ThemePaletteId } from '@wondertales/shared';
import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';
import { getActivePaletteId, setActivePaletteId } from '@/theme/activePalette';

// Use shared types
type User = UserApi;
type AuthResponse = AuthResponseApi;

/**
 * Mirror the user's server-side theme palette preference into the local
 * synchronous store so the next cold boot reads the chosen palette.
 * We intentionally do NOT reload the app here — the UI already rendered
 * with the old palette; the new one applies on next boot. An explicit reload
 * is only triggered from `ThemeSettingsScreen` when the user picks a palette.
 */
function syncPaletteFromUser(user: User): void {
  const serverPalette = user.themePalette as ThemePaletteId | undefined;
  if (!serverPalette) return;
  if (serverPalette !== getActivePaletteId()) {
    setActivePaletteId(serverPalette);
  }
}

// Email/password mutations
export const useEmailLogin = () => {
  const { login } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/sessions',
        data
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      login(data.user, data.token);
      syncPaletteFromUser(data.user);
    },
  });
};

export const useRegister = () => {
  const { login } = useAuthStore();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      termsAccepted: boolean;
      privacyAccepted: boolean;
      isAdultGuardian: boolean;
    }) => {
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/register',
        data
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      login(data.user, data.token);
      syncPaletteFromUser(data.user);
    },
  });
};

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: async (email: string) => {
      const response = await apiClient.post<{ status: string; message: string }>(
        '/api/v1/auth/forgot-password',
        { email }
      );
      return response.data;
    },
  });
};

export const useResetPassword = () => {
  return useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const response = await apiClient.post<{ status: string; message: string }>(
        '/api/v1/auth/reset-password',
        data
      );
      return response.data;
    },
  });
};

// OAuth mutations
export const useGoogleLogin = () => {
  const { login } = useAuthStore();
  
  return useMutation({
    mutationFn: async (idToken: string) => {
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/google/token',
        { idToken }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      login(data.user, data.token);
      syncPaletteFromUser(data.user);
    },
  });
};

export const useAppleLogin = () => {
  const { login } = useAuthStore();
  
  return useMutation({
    mutationFn: async (data: { 
      identityToken: string; 
      user?: any;
      deviceName?: string;
      deviceType?: string;
    }) => {
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/apple/token',
        data
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      login(data.user, data.token);
      syncPaletteFromUser(data.user);
    },
  });
};

// Get current user
export const useUser = () => {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; user: User }>('/api/v1/me');
      return response.data.user;
    },
    enabled: false, // Only fetch when explicitly called
  });
};

// Update current user (profile)
export const useUpdateMe = () => {
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (data: {
      displayName?: string;
      avatarUrl?: string | null;
      preferredLocale?: string;
      mode?: string;
      pseudonym?: string | null;
      aboutMe?: string | null;
      themePalette?: ThemePaletteId;
    }) => {
      const response = await apiClient.patch<{ status: string; user: User }>('/api/v1/me', data);
      return response.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
      storage.setUser(user);
      queryClient.setQueryData(['user'], user);
      syncPaletteFromUser(user);
    },
  });
};

// Logout
export const useLogout = () => {
  const queryClient = useQueryClient();
  const { logout } = useAuthStore();
  
  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/api/v1/auth/logout');
    },
    onSettled: async () => {
      await storage.removeAuthToken();
      await storage.removeItem('USER');
      logout();
      queryClient.clear();
    },
  });
};
