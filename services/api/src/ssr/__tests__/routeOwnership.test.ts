import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_ROUTE_PATHS,
  PUBLIC_SEO_LOCALES,
  buildPublicBlogArticlePath,
  buildPublicBlogIndexPath,
  buildPublicLegalPath,
  buildPublicSeoSitemapStaticRoutes,
  buildPublicStoriesPath,
} from '@wondertales/shared';
import { buildSitemapXmlForStories } from '../../services/sitemapService';
import { getBlogSlugs } from '../blogContent';

const rootDir = path.resolve(process.cwd(), '../..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function assertConfigHasNoindexLocation(config: string, locationPattern: string, label: string): void {
  const pattern = new RegExp(`${locationPattern}\\s*\\{[\\s\\S]*?spa-noindex\\.conf`, 'm');
  assert.match(config, pattern, `${label} should include spa noindex guard`);
}

const devNginx = readRepoFile('nginx/conf.d.dev/wondertales.conf');
const prodNginx = readRepoFile('nginx/conf.d/kazka.conf');
const commonSsrRoutes = readRepoFile('nginx/includes/common-ssr-routes.conf');
const nginxConfigs = [
  { name: 'dev nginx', value: devNginx },
  { name: 'prod nginx', value: prodNginx },
];

assert.deepEqual(
  [...PUBLIC_SEO_LOCALES],
  ['uk', 'en', 'ru', 'es', 'de', 'fr', 'pl'],
  'public SEO locales should cover all public marketing locales'
);

assert.equal(APP_ROUTE_PATHS.billingPlans, 'billing/plans');
assert.notEqual(APP_ROUTE_PATHS.billingPlans, 'pricing');

assert.deepEqual(
  buildPublicSeoSitemapStaticRoutes().map((route) => route.path),
  [
    '/',
    '/pricing',
    '/stories',
    '/blog',
    '/en/',
    '/en/pricing',
    '/en/stories',
    '/en/blog',
    '/ru/',
    '/ru/pricing',
    '/ru/stories',
    '/ru/blog',
    '/es/',
    '/es/pricing',
    '/es/stories',
    '/es/blog',
    '/de/',
    '/de/pricing',
    '/de/stories',
    '/de/blog',
    '/fr/',
    '/fr/pricing',
    '/fr/stories',
    '/fr/blog',
    '/pl/',
    '/pl/pricing',
    '/pl/stories',
    '/pl/blog',
  ],
  'sitemap static SEO routes should come from the shared route manifest'
);

const emptySitemap = buildSitemapXmlForStories([], 'https://wondertales.art/');
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/blog<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/blog\/adhd-story-attention<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/blog<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/blog\/adhd-story-attention<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/de\/<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/de\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/de\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/de\/blog<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/es\/<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/es\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/es\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/es\/blog<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/fr\/<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/fr\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/fr\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/fr\/blog<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/pl\/<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/pl\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/pl\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/pl\/blog<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/ru\/<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/ru\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/ru\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/ru\/blog<\/loc>/);
assert.doesNotMatch(emptySitemap, /<loc>https:\/\/wondertales\.art\/u\//);
assert.doesNotMatch(emptySitemap, /<loc>https:\/\/wondertales\.art\/billing\//);

assert.equal(buildPublicStoriesPath('uk'), '/stories');
assert.equal(buildPublicStoriesPath('en'), '/en/stories');
assert.equal(buildPublicBlogIndexPath('uk'), '/blog');
assert.equal(buildPublicBlogIndexPath('en'), '/en/blog');
assert.equal(buildPublicBlogArticlePath('adhd-story-attention', 'uk'), '/blog/adhd-story-attention');
assert.equal(buildPublicBlogArticlePath('adhd-story-attention', 'en'), '/en/blog/adhd-story-attention');
assert.equal(buildPublicLegalPath('terms', 'uk'), '/terms');
assert.equal(buildPublicLegalPath('terms', 'en'), '/en/terms');
assert.equal(buildPublicLegalPath('terms', 'ru'), '/ru/terms');
assert.equal(buildPublicLegalPath('terms', 'es'), '/es/terms');
assert.equal(buildPublicLegalPath('privacy', 'uk'), '/privacy');
assert.equal(buildPublicLegalPath('privacy', 'en'), '/en/privacy');
assert.equal(buildPublicLegalPath('privacy', 'de'), '/de/privacy');
assert.equal(buildPublicLegalPath('privacy', 'pl'), '/pl/privacy');
assert.equal(getBlogSlugs().length, 10, 'initial blog set should contain ten editorial articles');

for (const { name, value } of nginxConfigs) {
  assert.match(value, /location = \/pricing\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/pricing/, `${name} should route public pricing to API SSR`);
  assert.match(value, /location = \/terms\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/terms/, `${name} should route default terms to API SSR`);
  assert.match(value, /location = \/privacy\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/privacy/, `${name} should route default privacy to API SSR`);
  assert.match(value, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/terms\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/terms\/\$1/, `${name} should route localized terms to API SSR`);
  assert.match(value, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/privacy\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/privacy\/\$1/, `${name} should route localized privacy to API SSR`);
assert.match(value, /location = \/stories\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories/, `${name} should route exact /stories to API SSR`);
  assert.match(value, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/stories\/\?\$\s*\{[\s\S]*?\/ssr\/stories\/catalog\/\$1/, `${name} should route localized stories routes to API SSR`);
  assert.match(value, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/support\/\?\$\s*\{[\s\S]*?\/ssr\/support\/\$1/, `${name} should route localized support routes to API SSR`);
  assert.match(value, /location = \/blog\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog/, `${name} should route blog index to API SSR`);
  assert.match(value, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/blog\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/index\/\$1/, `${name} should route localized blog index to API SSR`);
  assert.match(value, /location \^~ \/blog\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog\//, `${name} should route blog articles to API SSR`);
  assert.match(value, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/blog\/\(\[\^\/\?\]\+\)\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/\$1\/\$2/, `${name} should route localized blog articles to API SSR`);
  assert.match(value, /location \^~ \/stories\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories\//, `${name} should route story detail pages to API SSR`);
  assert.match(value, /location \^~ \/authors\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/authors\//, `${name} should route author pages to API SSR`);
  assert.match(value, /location \^~ \/u\/\s*\{[\s\S]*?X-Robots-Tag "noindex,nofollow"[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/u\//, `${name} should route unlisted stories to noindex SSR`);
  assert.doesNotMatch(value, /location ~ \^\/\(\?:uk\|ru\|en\|es\|de\|fr\|pl\)\/stories/, `${name} should not catch /en/stories in localized noindex fallback`);
  assertConfigHasNoindexLocation(value, 'location \\^~ /billing/', `${name} /billing`);
  assert.match(value, /location \/\s*\{[\s\S]*?X-Robots-Tag "noindex,nofollow"[\s\S]*?return 404;/, `${name} unknown public routes should be noindex 404`);
}

assert.match(
  devNginx,
  /location \^~ \/landing\/\s*\{[\s\S]*?root \/usr\/share\/nginx\/html;[\s\S]*?try_files \$uri =404;/,
  'dev nginx should serve nested landing assets without falling through to unknown-route 404'
);
assert.match(
  prodNginx,
  /location \^~ \/landing\/\s*\{[\s\S]*?spa-proxy-prod\.conf;/,
  'prod nginx should route nested landing assets to the web app static backend'
);

assert.match(commonSsrRoutes, /location = \/pricing\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/pricing/);
assert.match(commonSsrRoutes, /location = \/terms\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/terms/);
assert.match(commonSsrRoutes, /location = \/privacy\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/privacy/);
assert.match(commonSsrRoutes, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/terms\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/terms\/\$1/);
assert.match(commonSsrRoutes, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/privacy\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/privacy\/\$1/);
assert.match(commonSsrRoutes, /location = \/stories\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories/);
assert.match(commonSsrRoutes, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/stories\/\?\$\s*\{[\s\S]*?\/ssr\/stories\/catalog\/\$1/);
assert.match(commonSsrRoutes, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/support\/\?\$\s*\{[\s\S]*?\/ssr\/support\/\$1/);
assert.match(commonSsrRoutes, /location = \/blog\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog/);
assert.match(commonSsrRoutes, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/blog\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/index\/\$1/);
assert.match(commonSsrRoutes, /location \^~ \/blog\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog\//);
assert.match(commonSsrRoutes, /location ~ \^\/\(en\|ru\|es\|de\|fr\|pl\)\/blog\/\(\[\^\/\?\]\+\)\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/\$1\/\$2/);
assert.match(commonSsrRoutes, /location \^~ \/stories\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories\//);
assert.match(commonSsrRoutes, /location \^~ \/authors\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/authors\//);
assert.match(commonSsrRoutes, /location \^~ \/u\/\s*\{[\s\S]*?X-Robots-Tag "noindex,nofollow"/);

console.log('routeOwnership tests passed');
