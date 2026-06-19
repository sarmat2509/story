import { DEFAULT_LOCALE } from '../config/languages';

export const DEFAULT_PUBLIC_SEO_LOCALE = 'uk' as const;

export const PUBLIC_SEO_LOCALES = ['uk', 'en', 'ru', 'es', 'de', 'fr', 'pl'] as const;
export type PublicSeoLocale = typeof PUBLIC_SEO_LOCALES[number];

export const APP_SUPPORTED_LOCALES = ['uk', 'ru', 'en', 'es', 'de', 'fr', 'pl'] as const;
export type AppSupportedLocale = typeof APP_SUPPORTED_LOCALES[number];

export type RouteOwner = 'api-ssr' | 'spa' | 'api';
export type RobotsPolicy = 'index,follow' | 'noindex,nofollow' | 'noindex,follow';

export interface RouteContract {
  id: string;
  path: string;
  owner: RouteOwner;
  robots: RobotsPolicy;
  sitemap: boolean;
}

export interface DynamicRouteContract extends Omit<RouteContract, 'path' | 'sitemap'> {
  pattern: string;
  sitemap: false | 'eligible-public-stories' | 'eligible-public-authors' | 'static-blog-articles';
}

export const PUBLIC_STATIC_ROUTE_CONTRACTS = [
  {
    id: 'landing',
    path: '/',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: true,
  },
  {
    id: 'pricing',
    path: '/pricing',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: true,
  },
  {
    id: 'stories-catalog',
    path: '/stories',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: true,
  },
  {
    id: 'blog-index',
    path: '/blog',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: true,
  },
  {
    id: 'terms',
    path: '/terms',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: false,
  },
  {
    id: 'privacy',
    path: '/privacy',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: false,
  },
] as const satisfies readonly RouteContract[];

export const PUBLIC_DYNAMIC_ROUTE_CONTRACTS = [
  {
    id: 'story-detail',
    pattern: '/stories/:slug',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: 'eligible-public-stories',
  },
  {
    id: 'author-detail',
    pattern: '/authors/:authorId',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: 'eligible-public-authors',
  },
  {
    id: 'blog-article',
    pattern: '/blog/:slug',
    owner: 'api-ssr',
    robots: 'index,follow',
    sitemap: 'static-blog-articles',
  },
  {
    id: 'unlisted-story',
    pattern: '/u/:token',
    owner: 'api-ssr',
    robots: 'noindex,nofollow',
    sitemap: false,
  },
] as const satisfies readonly DynamicRouteContract[];

export const PUBLIC_ACCESSIBLE_NOINDEX_ROUTES = [
  {
    id: 'welcome',
    path: '/welcome',
    owner: 'spa',
    robots: 'noindex,nofollow',
    sitemap: false,
  },
  {
    id: 'register',
    path: '/register',
    owner: 'spa',
    robots: 'noindex,nofollow',
    sitemap: false,
  },
  {
    id: 'billing-success',
    path: '/billing/success',
    owner: 'spa',
    robots: 'noindex,nofollow',
    sitemap: false,
  },
] as const satisfies readonly RouteContract[];

export const APP_ROUTE_PATHS = {
  modeSelection: 'mode-selection',
  childMode: 'child-mode',
  welcome: 'welcome',
  register: 'register',
  dashboard: 'dashboard',
  wizard: 'wizard',
  library: 'me/stories',
  series: 'me/series',
  story: 'me/stories/:storyId',
  storyRedirect: 'story/:storyId',
  storiesCatalog: 'stories',
  publishedStory: 'stories/:slug',
  authorProfile: 'authors/:authorId',
  unlistedStory: 'u/:token',
  children: 'children',
  childDetail: 'children/:childId',
  characters: 'characters',
  billingPlans: 'billing/plans',
  profile: 'profile',
  languageSettings: 'settings/language',
  themeSettings: 'settings/theme',
  billingSuccess: 'billing/success',
} as const;

export const APP_ONLY_NOINDEX_ROUTE_PREFIXES = [
  '/auth/',
  '/billing/',
  '/dashboard',
  '/wizard',
  '/me/',
  '/children',
  '/characters',
  '/profile',
  '/settings/',
  '/admin/',
  '/mode-selection',
  '/child-mode',
  '/welcome',
  '/register',
] as const;

export function normalizePublicSeoLocale(locale?: string | null): PublicSeoLocale {
  const normalized = locale?.slice(0, 2).toLowerCase();
  return PUBLIC_SEO_LOCALES.includes(normalized as PublicSeoLocale)
    ? (normalized as PublicSeoLocale)
    : DEFAULT_PUBLIC_SEO_LOCALE;
}

export function isPublicSeoLocale(locale?: string | null): locale is PublicSeoLocale {
  return PUBLIC_SEO_LOCALES.includes(locale as PublicSeoLocale);
}

export function normalizeAppSupportedLocale(locale?: string | null): AppSupportedLocale {
  const normalized = locale?.slice(0, 2).toLowerCase();
  return APP_SUPPORTED_LOCALES.includes(normalized as AppSupportedLocale)
    ? (normalized as AppSupportedLocale)
    : (DEFAULT_LOCALE as AppSupportedLocale);
}

function stripAppLocalePrefix(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const [pathname, suffix = ''] = normalizedPath.split(/([?#].*)/, 2);
  const firstSegment = pathname
    .split('/')
    .filter(Boolean)[0]
    ?.toLowerCase();

  if (!firstSegment || !APP_SUPPORTED_LOCALES.includes(firstSegment as AppSupportedLocale)) {
    return normalizedPath;
  }

  const stripped = pathname.replace(new RegExp(`^/${firstSegment}(?=/|$)`), '') || '/';
  const cleanPath = stripped.startsWith('/') ? stripped : `/${stripped}`;
  return `${cleanPath}${suffix}`;
}

export function buildLocalizedAppPath(path: string, locale?: string | null): string {
  const normalizedLocale = normalizeAppSupportedLocale(locale);
  const stripped = stripAppLocalePrefix(path);
  if (normalizedLocale === DEFAULT_LOCALE) {
    return stripped;
  }

  if (stripped === '/') {
    return `/${normalizedLocale}`;
  }

  return `/${normalizedLocale}${stripped}`;
}

export function buildPublicLandingPath(locale?: string | null): string {
  const normalized = normalizePublicSeoLocale(locale);
  return normalized === DEFAULT_PUBLIC_SEO_LOCALE ? '/' : `/${normalized}/`;
}

export function buildPublicPricingPath(locale?: string | null): string {
  const normalized = normalizePublicSeoLocale(locale);
  return normalized === DEFAULT_PUBLIC_SEO_LOCALE ? '/pricing' : `/${normalized}/pricing`;
}

export function buildPublicStoriesPath(locale?: string | null): string {
  const normalized = normalizePublicSeoLocale(locale);
  return normalized === DEFAULT_PUBLIC_SEO_LOCALE ? '/stories' : `/${normalized}/stories`;
}

export function buildPublicBlogIndexPath(locale?: string | null): string {
  const normalized = normalizePublicSeoLocale(locale);
  return normalized === DEFAULT_PUBLIC_SEO_LOCALE ? '/blog' : `/${normalized}/blog`;
}

export function buildPublicBlogArticlePath(slug: string, locale?: string | null): string {
  const cleanSlug = encodeURIComponent(slug);
  return `${buildPublicBlogIndexPath(locale)}/${cleanSlug}`;
}

export function buildPublicSupportPath(locale?: string | null): string {
  const normalized = normalizePublicSeoLocale(locale);
  return normalized === DEFAULT_PUBLIC_SEO_LOCALE ? '/support' : `/${normalized}/support`;
}

export type PublicLegalDoc = 'terms' | 'privacy';

export function buildPublicLegalPath(doc: PublicLegalDoc, locale?: string | null): string {
  const normalized = normalizePublicSeoLocale(locale);
  return normalized === DEFAULT_PUBLIC_SEO_LOCALE ? `/${doc}` : `/${normalized}/${doc}`;
}

export function buildAbsoluteRouteUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  if (!base) return path;
  if (path === '/') return base;
  return `${base}${path}`;
}

export function buildPublicSeoSitemapStaticRoutes(): Array<{
  id: 'landing' | 'pricing' | 'stories-catalog' | 'blog-index';
  path: string;
  locale: PublicSeoLocale;
  changefreq: 'weekly';
  priority: string;
}> {
  return PUBLIC_SEO_LOCALES.flatMap((locale) => ([
    {
      id: 'landing' as const,
      path: buildPublicLandingPath(locale),
      locale,
      changefreq: 'weekly' as const,
      priority: locale === DEFAULT_PUBLIC_SEO_LOCALE ? '1.0' : '0.9',
    },
    {
      id: 'pricing' as const,
      path: buildPublicPricingPath(locale),
      locale,
      changefreq: 'weekly' as const,
      priority: locale === DEFAULT_PUBLIC_SEO_LOCALE ? '0.95' : '0.85',
    },
    {
      id: 'stories-catalog' as const,
      path: buildPublicStoriesPath(locale),
      locale,
      changefreq: 'weekly' as const,
      priority: locale === DEFAULT_PUBLIC_SEO_LOCALE ? '0.85' : '0.75',
    },
    {
      id: 'blog-index' as const,
      path: buildPublicBlogIndexPath(locale),
      locale,
      changefreq: 'weekly' as const,
      priority: locale === DEFAULT_PUBLIC_SEO_LOCALE ? '0.82' : '0.72',
    },
  ]));
}
