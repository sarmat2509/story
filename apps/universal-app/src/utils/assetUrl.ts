import { Platform } from 'react-native';
import { API_BASE_URL } from '@/config/constants';

const ASSETS_PREFIX = '/api/v1/assets/';

/** True if URL is a server asset (relative or absolute) - for cleanup/delete checks */
export function isServerAssetUrl(url: string | null | undefined): boolean {
  return !!url && (url.startsWith(ASSETS_PREFIX) || url.startsWith('http'));
}

/**
 * Single place to format asset/image URLs for display.
 * Handles three input formats:
 *   1. Absolute URL (http/https) -- returned as-is
 *   2. API-relative path (/api/v1/assets/...) -- works on web, prefixed for native
 *   3. Raw storage path (development/userId/...) -- prefixed with /api/v1/assets/
 */
export function formatAssetUrl(pathOrUrl: string | null | undefined): string | null {
  if (pathOrUrl == null || pathOrUrl === '') return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;

  let assetPath = pathOrUrl;
  if (!assetPath.startsWith(ASSETS_PREFIX)) {
    const stripped = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    assetPath = `${ASSETS_PREFIX}${stripped}`;
  }

  if (Platform.OS === 'web') return assetPath;
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${assetPath}`;
}
