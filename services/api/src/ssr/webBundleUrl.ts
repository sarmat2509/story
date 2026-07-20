import { config } from '../config';

function appendQueryParam(url: string, key: string, value: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export interface VersionedWebBundleUrlParams {
  webBundleUrl?: string | null;
  webBuildId?: string | null;
  nodeEnv?: string | null;
}

export function resolveVersionedWebBundleUrl(params: VersionedWebBundleUrlParams): string {
  const configuredUrl = params.webBundleUrl?.trim() || '/static/js/bundle.js';
  const isDevelopmentMetroBundle =
    /\/index\.bundle(?:\?|$)/i.test(configuredUrl) && /(?:\?|&)dev=true(?:&|$)/i.test(configuredUrl);
  const webBundleUrl = params.nodeEnv === 'production' && isDevelopmentMetroBundle
    ? '/static/js/bundle.js'
    : configuredUrl;
  const webBuildId = params.webBuildId?.trim() || 'dev';

  if (!webBuildId || webBundleUrl.includes('?') || /\/[^/]+\.[a-f0-9]{8,}\.js$/i.test(webBundleUrl)) {
    return webBundleUrl;
  }

  return appendQueryParam(webBundleUrl, 'v', webBuildId);
}

export function getVersionedWebBundleUrl(): string {
  return resolveVersionedWebBundleUrl({
    webBundleUrl: config.web?.webBundleUrl,
    webBuildId: config.web?.webBuildId,
    nodeEnv: config.nodeEnv,
  });
}
