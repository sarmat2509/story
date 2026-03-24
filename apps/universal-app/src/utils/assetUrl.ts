import { Platform } from 'react-native';
import { API_BASE_URL } from '@/config/constants';

const ASSETS_PREFIX = '/api/v1/assets/';

/** Cache path -> URL to avoid image flicker when token changes (e.g. refetch returns new signed URL) */
const urlCacheByPath = new Map<string, string>();

/** Extract path without query (for cache key when URL has ?token=...) */
function getPathKey(url: string): string {
  return url.split('?')[0];
}

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
 *
 * Caches URLs by path (without token) to prevent image flicker when refetch returns
 * new signed URL for the same asset (e.g. story d837a4c5 with characters).
 */
export function formatAssetUrl(pathOrUrl: string | null | undefined): string | null {
  if (pathOrUrl == null || pathOrUrl === '') return null;

  // Blob/file URLs (local picker, during upload) — use as-is, never send to assets API
  if (pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('file:')) {
    return pathOrUrl;
  }

  // Cache by path (without token) — refetch returns new signed URL, reuse cached to avoid image flicker
  const pathKey = getPathKey(pathOrUrl);

  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const cached = urlCacheByPath.get(pathKey);
    if (cached) return cached;
    urlCacheByPath.set(pathKey, pathOrUrl);
    return pathOrUrl;
  }

  // Relative path (may include ?token=... for signed URLs)
  const queryPart = pathOrUrl.includes('?') ? pathOrUrl.substring(pathOrUrl.indexOf('?')) : '';
  let assetPath = pathKey;
  if (!assetPath.startsWith(ASSETS_PREFIX)) {
    const stripped = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    assetPath = `${ASSETS_PREFIX}${stripped}`;
  }

  // If URL has token, check cache first — reuse to avoid flicker when refetch returns new token
  if (queryPart) {
    const cached = urlCacheByPath.get(pathKey);
    if (cached) return cached;
  }

  let result: string;
  if (Platform.OS === 'web') {
    result = assetPath + queryPart;
  } else {
    const base = API_BASE_URL.replace(/\/$/, '');
    result = `${base}${assetPath}${queryPart}`;
  }

  if (queryPart) urlCacheByPath.set(pathKey, result);
  return result;
}
