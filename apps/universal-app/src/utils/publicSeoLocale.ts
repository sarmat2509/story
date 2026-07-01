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

function isDefaultPublicSeoPath(pathname: string): boolean {
  return DEFAULT_PUBLIC_SEO_PATHS.has(pathname) ||
    DEFAULT_PUBLIC_SEO_PREFIXES.some((pattern) => pattern.test(pathname));
}

export function getPublicSeoLocaleOverrideFromPath(pathname: string): PublicSeoLocale | null {
  const normalizedPath = normalizePath(pathname);
  const firstSegment = normalizedPath.split('/').filter(Boolean)[0]?.toLowerCase();

  if (isPublicSeoLocale(firstSegment)) {
    const strippedPath = normalizedPath.replace(new RegExp(`^/${firstSegment}(?=/|$)`), '') || '/';
    return isDefaultPublicSeoPath(strippedPath) ? firstSegment : null;
  }

  return isDefaultPublicSeoPath(normalizedPath)
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
