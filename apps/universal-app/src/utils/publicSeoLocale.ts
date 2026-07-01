import {
  DEFAULT_PUBLIC_SEO_LOCALE,
  isPublicSeoLocale,
  isAppUiLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';

const DEFAULT_PUBLIC_SEO_PATHS = new Set([
  '/',
  '/pricing',
  '/stories',
  '/blog',
  '/terms',
  '/privacy',
  '/support',
]);

const DEFAULT_PUBLIC_SEO_PREFIXES = [
  /^\/authors\/[^/]+$/,
  /^\/stories\/[^/]+$/,
  /^\/blog\/[^/]+$/,
];

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

export function getPublicSeoLocaleOverrideFromSearch(search?: string | null): string | null {
  if (!search) {
    return null;
  }

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const locale = params.get('locale')?.slice(0, 2).toLowerCase();
  return locale && isAppUiLocale(locale) ? locale : null;
}
