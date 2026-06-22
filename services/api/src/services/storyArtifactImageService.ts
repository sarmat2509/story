const ASSET_ROUTE_PREFIX = '/api/v1/assets/';

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function normalizeStoryArtifactImagePath(imagePath: string): string | null {
  const trimmed = imagePath.trim();
  if (!trimmed || isRemoteUrl(trimmed)) {
    return null;
  }

  return trimmed
    .replace(/^\/+/, '')
    .replace(/^api\/v1\/assets\//, '');
}

export function storyArtifactAssetUrl(imagePath: string): string {
  if (isRemoteUrl(imagePath) || imagePath.startsWith(ASSET_ROUTE_PREFIX)) {
    return imagePath;
  }

  const normalizedPath = normalizeStoryArtifactImagePath(imagePath) ?? imagePath;
  return `${ASSET_ROUTE_PREFIX}${normalizedPath.replace(/^\/+/, '')}`;
}

export function storyArtifactThumbnailPath(imagePath: string): string {
  const normalizedPath = normalizeStoryArtifactImagePath(imagePath);
  if (!normalizedPath) {
    return imagePath;
  }

  return /\.[^/.]+$/.test(normalizedPath)
    ? normalizedPath.replace(/\.[^/.]+$/, '_thumb.jpg')
    : `${normalizedPath}_thumb.jpg`;
}

export function storyArtifactImageUrls(imagePath: string): {
  fullImagePath: string;
  fullImageUrl: string;
  thumbnailPath: string;
  thumbnailUrl: string;
  imageUrl: string;
} {
  const fullImagePath = normalizeStoryArtifactImagePath(imagePath) ?? imagePath;
  const thumbnailPath = storyArtifactThumbnailPath(imagePath);
  const thumbnailUrl = storyArtifactAssetUrl(thumbnailPath);

  return {
    fullImagePath,
    fullImageUrl: storyArtifactAssetUrl(fullImagePath),
    thumbnailPath,
    thumbnailUrl,
    imageUrl: thumbnailUrl,
  };
}
