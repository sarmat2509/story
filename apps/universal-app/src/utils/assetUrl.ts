import { Platform } from 'react-native';
import { API_BASE_URL } from '@/config/constants';

/**
 * Single place to format asset/image URLs for display.
 * - Web: relative paths work (proxy); return as-is unless already absolute.
 * - iOS/Android: relative paths need full URL; prepend API_BASE_URL.
 */
export function formatAssetUrl(pathOrUrl: string | null | undefined): string | null {
  if (pathOrUrl == null || pathOrUrl === '') return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  if (Platform.OS === 'web') return pathOrUrl;
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}
