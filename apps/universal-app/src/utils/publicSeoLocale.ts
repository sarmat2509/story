import {
  DEFAULT_PUBLIC_SEO_LOCALE,
  isPublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';

const DEFAULT_PUBLIC_SEO_PATHS = new Set(['/', '/pricing', '/stories', '/terms', '/privacy']);

const DEFAULT_PUBLIC_SEO_PREFIXES = [/^\/authors\/[^/]+$/, /^\/stories\/[^/]+$/];

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || '/';
  if (path === '/') return '/';
  return path.replace(/\/+$/, '') || '/';
}

export function getPublicSeoLocaleOverrideFromPath(pathname: string): PublicSeoLocale | null {
  const normalizedPath = normalizePath(pathname);
  const firstSegment = normalizedPath.split('/').filter(Boolean)[0]?.toLowerCase();

  if (isPublicSeoLocale(firstSegment)) {
    return firstSegment;
  }

  return DEFAULT_PUBLIC_SEO_PATHS.has(normalizedPath) ||
    DEFAULT_PUBLIC_SEO_PREFIXES.some((pattern) => pattern.test(normalizedPath))
    ? DEFAULT_PUBLIC_SEO_LOCALE
    : null;
}
