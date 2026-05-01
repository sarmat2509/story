export const LEGACY_PUBLIC_STORIES_SUCCESSOR = '/api/v1/public/stories';
export const LEGACY_PUBLIC_STORIES_SUNSET = 'Wed, 01 Jul 2026 00:00:00 GMT';

interface HeaderWriter {
  setHeader(name: string, value: number | string | readonly string[]): unknown;
}

export function setLegacyPublicStoriesDeprecationHeaders(
  res: HeaderWriter,
  successorPath: string = LEGACY_PUBLIC_STORIES_SUCCESSOR
): void {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', LEGACY_PUBLIC_STORIES_SUNSET);
  res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
  res.setHeader('X-Deprecated-Endpoint', `Use ${successorPath}`);
}
