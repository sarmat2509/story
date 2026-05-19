import { Platform } from 'react-native';
import { API_BASE_URL } from '@/config/constants';

const ASSETS_PREFIX = '/api/v1/assets/';

/** Cache path -> URL to avoid image flicker when token changes (e.g. refetch returns new signed URL) */
const urlCacheByPath = new Map<string, string>();

/** Extract path without query (for cache key when URL has ?token=...) */
function getPathKey(url: string): string {
  return url.split('?')[0];
}

function getOwnAssetPath(pathOrUrl: string): string | null {
  const withoutQuery = getPathKey(pathOrUrl);

  if (withoutQuery.startsWith('http://') || withoutQuery.startsWith('https://')) {
    try {
      const parsed = new URL(withoutQuery);
      return parsed.pathname.startsWith(ASSETS_PREFIX) ? parsed.pathname : null;
    } catch {
      return null;
    }
  }

  if (withoutQuery.startsWith(ASSETS_PREFIX)) {
    return withoutQuery;
  }

  const stripped = withoutQuery.startsWith('/') ? withoutQuery.slice(1) : withoutQuery;
  return `${ASSETS_PREFIX}${stripped}`;
}

/** True if URL is a server asset (relative or absolute) - for cleanup/delete checks */
export function isServerAssetUrl(url: string | null | undefined): boolean {
  return !!url && !!getOwnAssetPath(url);
}

/** Normalize our own asset URLs to a canonical /api/v1/assets/... path without expiring query params. */
export function toCanonicalAssetUrl(pathOrUrl: string): string {
  const ownAssetPath = getOwnAssetPath(pathOrUrl);
  return ownAssetPath ?? pathOrUrl;
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

  const ownAssetPath = getOwnAssetPath(pathOrUrl);
  if (ownAssetPath) {
    const cached = urlCacheByPath.get(ownAssetPath);
    if (cached) return cached;

    const result =
      Platform.OS === 'web' ? ownAssetPath : `${API_BASE_URL.replace(/\/$/, '')}${ownAssetPath}`;

    urlCacheByPath.set(ownAssetPath, result);
    return result;
  }

  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  return pathOrUrl;
}
