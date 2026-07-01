import { versionPublicIconAsset } from './publicAssetUrls';

export const PUBLIC_HEAD_ASSET_LINKS = `
  <link rel="icon" type="image/png" href="${versionPublicIconAsset('/favicon.png')}">
  <link rel="apple-touch-icon" sizes="180x180" href="${versionPublicIconAsset('/apple-touch-icon.png')}">
  <link rel="manifest" href="${versionPublicIconAsset('/manifest.json')}">`.trim();
