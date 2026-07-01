import { config } from '../config';

export const PUBLIC_ICON_ASSET_VERSION = '20260701-logo-v2';

function appendVersion(path: string, version: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${encodeURIComponent(version)}`;
}

export function getPublicIconAssetVersion(): string {
  return config.web?.webBuildId || PUBLIC_ICON_ASSET_VERSION;
}

export function versionPublicIconAsset(path: string): string {
  return appendVersion(path, getPublicIconAssetVersion());
}

export function versionStaticPublicIconAsset(path: string): string {
  return appendVersion(path, PUBLIC_ICON_ASSET_VERSION);
}
