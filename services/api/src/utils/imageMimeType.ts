export function normalizeImageMimeType(mimeType?: string | null): string | null {
  const normalized = (mimeType || '').split(';')[0]?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp' ||
    normalized === 'image/gif'
  ) {
    return normalized;
  }
  if (normalized.startsWith('image/')) return normalized;
  return null;
}

export function inferImageMimeTypeFromPath(path?: string | null): string | null {
  if (!path) return null;

  const normalized = path.split(/[?#]/)[0]?.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';

  return null;
}

export function imageMimeTypeFromPath(path?: string | null, fallback = 'image/png'): string {
  return inferImageMimeTypeFromPath(path) || normalizeImageMimeType(fallback) || 'image/png';
}

export function resolveImageMimeType(params: {
  mimeType?: string | null;
  storagePath?: string | null;
  url?: string | null;
  fallback?: string;
  preferPath?: boolean;
}): string {
  const explicit = normalizeImageMimeType(params.mimeType);
  const inferred =
    inferImageMimeTypeFromPath(params.storagePath) || inferImageMimeTypeFromPath(params.url);

  if (params.preferPath !== false && inferred) return inferred;
  return explicit || inferred || normalizeImageMimeType(params.fallback) || 'image/png';
}
