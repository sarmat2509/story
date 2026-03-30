import { getAssetStorageService } from './assetStorageService';

const ASSET_ROUTE_PREFIX = '/api/v1/assets/';

function normalizeAssetStoragePath(raw: string): string | null {
  const withoutQuery = raw.split('?')[0].split('#')[0].trim();
  if (!withoutQuery) return null;

  let normalized = withoutQuery;

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const parsed = new URL(normalized);
      normalized = parsed.pathname;
    } catch {
      return null;
    }
  }

  if (normalized.startsWith(ASSET_ROUTE_PREFIX)) {
    normalized = normalized.slice(ASSET_ROUTE_PREFIX.length);
  } else if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  if (!normalized.includes('/')) {
    return null;
  }

  return normalized;
}

function shouldDeleteStoragePath(storagePath: string): boolean {
  if (!storagePath) return false;
  if (storagePath.startsWith('llm_turnaround_cache/')) return false;
  return true;
}

export function collectEntityAssetPaths(entity: {
  referencePhotos?: unknown;
  turnaroundSheet?: unknown;
}): string[] {
  const paths = new Set<string>();

  const referencePhotos = Array.isArray(entity.referencePhotos)
    ? entity.referencePhotos as Array<{ url?: unknown }>
    : [];

  for (const photo of referencePhotos) {
    if (typeof photo?.url !== 'string') continue;
    const storagePath = normalizeAssetStoragePath(photo.url);
    if (storagePath && shouldDeleteStoragePath(storagePath)) {
      paths.add(storagePath);
    }
  }

  const turnaroundSheet =
    entity.turnaroundSheet && typeof entity.turnaroundSheet === 'object'
      ? entity.turnaroundSheet as { url?: unknown; frontUrl?: unknown; sourcePhotoUrl?: unknown }
      : null;

  for (const raw of [turnaroundSheet?.url, turnaroundSheet?.frontUrl, turnaroundSheet?.sourcePhotoUrl]) {
    if (typeof raw !== 'string') continue;
    const storagePath = normalizeAssetStoragePath(raw);
    if (storagePath && shouldDeleteStoragePath(storagePath)) {
      paths.add(storagePath);
    }
  }

  return [...paths];
}

export async function deleteEntityAssets(storagePaths: string[]): Promise<void> {
  const assetStorage = getAssetStorageService();

  for (const storagePath of storagePaths) {
    await assetStorage.deleteAsset(storagePath);
  }
}
