import fs from 'node:fs';
import path from 'node:path';

const ASSET_ROUTE_PREFIX = '/api/v1/assets/';
const STORY_ARTIFACT_DEPLOY_CHECKSUM_PATH = path.resolve(
  process.cwd(),
  'uploads/story-artifacts/.deploy.sha256'
);

let cachedChecksumMtimeMs: number | null = null;
let cachedAssetVersion: string | null = null;

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function getStoryArtifactAssetVersion(): string | null {
  try {
    const stats = fs.statSync(STORY_ARTIFACT_DEPLOY_CHECKSUM_PATH);
    if (cachedChecksumMtimeMs !== stats.mtimeMs) {
      const checksum = fs.readFileSync(STORY_ARTIFACT_DEPLOY_CHECKSUM_PATH, 'utf8').trim();
      cachedChecksumMtimeMs = stats.mtimeMs;
      cachedAssetVersion = /^[a-f0-9]{12,}$/i.test(checksum) ? checksum.slice(0, 16) : null;
    }
  } catch {
    cachedChecksumMtimeMs = null;
    cachedAssetVersion = null;
  }

  return cachedAssetVersion || process.env.WEB_BUILD_ID?.trim() || null;
}

function versionStoryArtifactAssetUrl(url: string, version: string | null): string {
  if (!version || isRemoteUrl(url)) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version)}`;
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
  const assetVersion = getStoryArtifactAssetVersion();
  const fullImageUrl = versionStoryArtifactAssetUrl(
    storyArtifactAssetUrl(fullImagePath),
    assetVersion
  );
  const thumbnailUrl = versionStoryArtifactAssetUrl(
    storyArtifactAssetUrl(thumbnailPath),
    assetVersion
  );

  return {
    fullImagePath,
    fullImageUrl,
    thumbnailPath,
    thumbnailUrl,
    imageUrl: thumbnailUrl,
  };
}
