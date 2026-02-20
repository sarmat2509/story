/**
 * Utility to sign photo URLs in referencePhotos arrays.
 * Used by characters and children routes to convert unsigned photo URLs
 * to HMAC-signed URLs that <Image> can load without Bearer auth headers.
 */

import { getAssetStorageService } from '../services/assetStorageService';
import { logger } from './logger';

const ASSET_URL_PREFIX = '/api/v1/assets/';

/**
 * Sign photo URLs in an entity's referencePhotos array and turnaroundSheet.
 * Converts unsigned URLs like /api/v1/assets/{path} to signed URLs
 * with HMAC token and expiry so <Image> can load them without Bearer auth.
 * Already-signed URLs (with token= param) are returned as-is.
 */
export async function signReferencePhotoUrls<T extends { referencePhotos?: unknown }>(entity: T): Promise<T> {
  const storageService = getAssetStorageService();
  let result: T = { ...entity };

  // 1. Sign referencePhotos URLs
  const photos = entity.referencePhotos as Array<{ url?: string }> | undefined;
  if (photos && Array.isArray(photos) && photos.length > 0) {
    const signedPhotos = await Promise.all(
      photos.map(async (photo) => {
        if (!photo.url) return photo;

        // Skip if already a valid signed URL (has token= and expires= params)
        if (photo.url.includes('token=') && photo.url.includes('expires=')) {
          return photo;
        }

        // Extract storage path from URL (strip /api/v1/assets/ prefix)
        const prefixIdx = photo.url.indexOf(ASSET_URL_PREFIX);
        if (prefixIdx === -1) return photo; // Not an asset URL, leave as-is

        const storagePath = photo.url.substring(prefixIdx + ASSET_URL_PREFIX.length);
        try {
          const { signedUrl } = await storageService.generateSignedUrl(storagePath, 24);
          return { ...photo, url: signedUrl };
        } catch (error) {
          logger.warn({ error, url: photo.url }, 'Failed to sign photo URL');
          return photo;
        }
      })
    );
    result = { ...result, referencePhotos: signedPhotos };
  }

  // 2. Sign turnaroundSheet.url if present (imaginary characters)
  const ts = (entity as any).turnaroundSheet as { url?: string } | undefined;
  if (ts?.url && !ts.url.startsWith('http') && !ts.url.includes('token=')) {
    try {
      // turnaroundSheet.url is a raw storage path — sign it directly
      const { signedUrl } = await storageService.generateSignedUrl(ts.url, 24);
      result = { ...result, turnaroundSheet: { ...ts, url: signedUrl } } as T;
    } catch (error) {
      logger.warn({ error, url: ts.url }, 'Failed to sign turnaround sheet URL');
    }
  }

  return result;
}

/**
 * Sign photo URLs for an array of entities.
 * Convenience wrapper for batch processing.
 */
export async function signReferencePhotoUrlsBatch<T extends { referencePhotos?: unknown }>(entities: T[]): Promise<T[]> {
  return Promise.all(entities.map(e => signReferencePhotoUrls(e)));
}
