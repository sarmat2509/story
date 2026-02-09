import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { API_BASE_URL } from '@/config/constants';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';

// For web: use relative URLs (proxied through frontend server)
// For native: use full API URL
const baseURL = Platform.OS === 'web' ? '' : API_BASE_URL;

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await storage.getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - logout user
      const { logout } = useAuthStore.getState();
      await storage.removeAuthToken();
      await storage.removeItem('USER');
      logout();
    }
    return Promise.reject(error);
  }
);

export { apiClient };
export default apiClient;
