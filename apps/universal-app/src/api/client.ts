import { FetchClient } from './fetchClient';
import { Platform } from 'react-native';
import { API_BASE_URL } from '@/config/constants';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';
import { camelizeKeys, decamelizeKeys } from 'humps';

// For web: use relative URLs (proxied through frontend server)
// For native: use full API URL
const baseURL = Platform.OS === 'web' ? '' : API_BASE_URL;

// Create fetch-based client instance
const apiClient = FetchClient.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token + transform camelCase → snake_case
apiClient.interceptors.request.use(
  async (config) => {
    const token = await storage.getAuthToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Transform request data: camelCase → snake_case
    if (config.data) {
      config.data = decamelizeKeys(config.data, { separator: '_' });
    }

    // Transform query params: camelCase → snake_case
    if (config.params) {
      config.params = decamelizeKeys(config.params, { separator: '_' });
    }

    return config;
  }
);

// Response interceptor - transform snake_case → camelCase + handle errors
apiClient.interceptors.response.use(
  (response) => {
    // Transform response data: snake_case → camelCase
    if (response.data) {
      response.data = camelizeKeys(response.data, { separator: '_' });
    }
    return response;
  },
  async (error: any) => {
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
