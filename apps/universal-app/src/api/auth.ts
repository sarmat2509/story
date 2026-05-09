import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserApi, AuthResponseApi, type ThemePaletteId } from '@wondertales/shared';
import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';
import { applyUserPreferredLocale } from '@/utils/localePreference';
import { getActivePaletteId, setActivePaletteId } from '@/theme/activePalette';
import { getCaptchaToken } from '@/utils/captcha';

// Use shared types
type User = UserApi;
type AuthResponse = AuthResponseApi;
type ParentGateResponse = AuthResponse & {
  sessionMode: 'parent';
};
type ParentGateOAuthStartResponse = {
  status: string;
  url: string;
};

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

async function applyParentGateResponse(
  data: ParentGateResponse,
  queryClient: ReturnType<typeof useQueryClient>,
  returnToParentSession: (user: User, token: string) => void
): Promise<void> {
  await storage.setAuthToken(data.token);
  await storage.setUser(data.user);
  await applyUserPreferredLocale(data.user);
  syncPaletteFromUser(data.user);
  queryClient.clear();
  returnToParentSession(data.user, data.token);
}

// Email/password mutations
export const useEmailLogin = () => {
  const { login } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const captchaToken = await getCaptchaToken('login');
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/sessions',
        { ...data, captchaToken },
        { skipAuthLogoutOn401: true }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      await applyUserPreferredLocale(data.user);
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
      const captchaToken = await getCaptchaToken('register');
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/register',
        { ...data, captchaToken }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      await applyUserPreferredLocale(data.user);
      login(data.user, data.token);
      syncPaletteFromUser(data.user);
    },
  });
};

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: async (email: string) => {
      const captchaToken = await getCaptchaToken('password_reset');
      const response = await apiClient.post<{ status: string; message: string }>(
        '/api/v1/auth/forgot-password',
        { email, captchaToken }
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
    mutationFn: async (data: {
      idToken: string;
      termsAccepted: boolean;
      privacyAccepted: boolean;
      isAdultGuardian: boolean;
    }) => {
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/google/token',
        data,
        { skipAuthLogoutOn401: true }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      await applyUserPreferredLocale(data.user);
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
      termsAccepted: boolean;
      privacyAccepted: boolean;
      isAdultGuardian: boolean;
    }) => {
      const response = await apiClient.post<AuthResponse>(
        '/api/v1/auth/apple/token',
        data,
        { skipAuthLogoutOn401: true }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await storage.setAuthToken(data.token);
      await storage.setUser(data.user);
      await applyUserPreferredLocale(data.user);
      login(data.user, data.token);
      syncPaletteFromUser(data.user);
    },
  });
};

export const useParentGate = () => {
  const queryClient = useQueryClient();
  const { returnToParentSession } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { password: string }) => {
      const response = await apiClient.post<ParentGateResponse>(
        '/api/v1/auth/parent-gate',
        data,
        { skipAuthLogoutOn401: true }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await applyParentGateResponse(data, queryClient, returnToParentSession);
    },
  });
};

export const useParentGateGoogleStart = () => {
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ParentGateOAuthStartResponse>(
        '/api/v1/auth/parent-gate/google/start',
        {},
        { skipAuthLogoutOn401: true }
      );
      return response.data;
    },
  });
};

export const useParentGateGoogle = () => {
  const queryClient = useQueryClient();
  const { returnToParentSession } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { idToken: string; deviceName?: string; deviceType?: string }) => {
      const response = await apiClient.post<ParentGateResponse>(
        '/api/v1/auth/parent-gate/google-token',
        data,
        { skipAuthLogoutOn401: true }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await applyParentGateResponse(data, queryClient, returnToParentSession);
    },
  });
};

export const useParentGateApple = () => {
  const queryClient = useQueryClient();
  const { returnToParentSession } = useAuthStore();

  return useMutation({
    mutationFn: async (data: {
      identityToken: string;
      user?: any;
      deviceName?: string;
      deviceType?: string;
    }) => {
      const response = await apiClient.post<ParentGateResponse>(
        '/api/v1/auth/parent-gate/apple-token',
        data,
        { skipAuthLogoutOn401: true }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      await applyParentGateResponse(data, queryClient, returnToParentSession);
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

export const useUpdateChildModeExitPasscode = () => {
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { oldPasscode?: string; newPasscode: string }) => {
      const response = await apiClient.patch<{
        status: string;
        user: User;
        childModeExitPasscode: { configured: boolean; setAt: string | null };
      }>('/api/v1/me/child-mode-exit-passcode', data);
      return response.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
      storage.setUser(user);
      queryClient.setQueryData(['user'], user);
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
};

export const useDeleteAccount = () => {
  const queryClient = useQueryClient();
  const { logout } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete<{ status: string; message: string }>('/api/v1/me');
      return response.data;
    },
    onSuccess: async () => {
      await storage.removeAuthToken();
      await storage.removeItem('USER');
      logout();
      queryClient.clear();
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
