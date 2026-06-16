import { config } from '../config';

function appendQueryParam(url: string, key: string, value: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function getVersionedWebBundleUrl(): string {
  const webBundleUrl = config.web?.webBundleUrl || '/static/js/bundle.js';
  const webBuildId = config.web?.webBuildId || 'dev';

  if (!webBuildId || webBundleUrl.includes('?') || /\/[^/]+\.[a-f0-9]{8,}\.js$/i.test(webBundleUrl)) {
    return webBundleUrl;
  }

  return appendQueryParam(webBundleUrl, 'v', webBuildId);
}
