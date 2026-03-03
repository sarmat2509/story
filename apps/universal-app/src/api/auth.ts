import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserApi, AuthResponseApi } from '@wondertales/shared';
import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';

// Use shared types
type User = UserApi;
type AuthResponse = AuthResponseApi;

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
    mutationFn: async (data: { displayName?: string; preferredLocale?: string; mode?: string; pseudonym?: string | null }) => {
      const response = await apiClient.patch<{ status: string; user: User }>('/api/v1/me', data);
      return response.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
      storage.setUser(user);
      queryClient.setQueryData(['user'], user);
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
