import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';

interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferredLocale: string;
}

interface AuthResponse {
  token: string;
  user: User;
  expiresAt: number;
  isNewUser?: boolean;
}

// OAuth mutations
export const useGoogleLogin = () => {
  const { login } = useAuthStore();
  
  return useMutation({
    mutationFn: async (idToken: string) => {
      const response = await apiClient.post<{ status: string; data: AuthResponse }>(
        '/api/v1/auth/google/token',
        { idToken }
      );
      return response.data.data;
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
    mutationFn: async (idToken: string) => {
      const response = await apiClient.post<{ status: string; data: AuthResponse }>(
        '/api/v1/auth/apple/token',
        { idToken }
      );
      return response.data.data;
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
