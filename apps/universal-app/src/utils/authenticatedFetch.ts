import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';

/**
 * Loads an asset with the same current session token used by apiClient.
 *
 * Some protected image endpoints return binary data, so they cannot use the
 * JSON-oriented API client directly. Keeping the token lookup here prevents
 * those requests from falling behind the active Zustand session.
 */
export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = useAuthStore.getState().token ?? (await storage.getAuthToken());
  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
