import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_ROUTE_PATHS,
  PUBLIC_SEO_LOCALES,
  PUBLIC_TRANSLATION_LOCALES,
  buildPublicBlogArticlePath,
  buildPublicBlogIndexPath,
  buildPublicAppEntryPath,
  buildPublicLandingPath,
  buildPublicLegalPath,
  buildPublicPricingPath,
  buildPublicSeoSitemapStaticRoutes,
  buildPublicStoriesPath,
  buildPublicSupportPath,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSitemapLoc(xml: string, pathValue: string): void {
  const url = pathValue === '/'
    ? 'https://wondertales.art'
    : `https://wondertales.art${pathValue}`;
  assert.match(xml, new RegExp(`<loc>${escapeRegExp(url)}</loc>`));
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
  [...PUBLIC_TRANSLATION_LOCALES],
  'public SEO locales should follow every translated public locale'
);

assert.equal(APP_ROUTE_PATHS.billingPlans, 'billing/plans');
assert.notEqual(APP_ROUTE_PATHS.billingPlans, 'pricing');

assert.deepEqual(
  buildPublicSeoSitemapStaticRoutes().map((route) => route.path),
  PUBLIC_SEO_LOCALES.flatMap((locale) => [
    buildPublicLandingPath(locale),
    buildPublicPricingPath(locale),
    buildPublicStoriesPath(locale),
    buildPublicBlogIndexPath(locale),
    buildPublicSupportPath(locale),
  ]),
  'sitemap static SEO routes should come from the shared route manifest'
);

const emptySitemap = buildSitemapXmlForStories([], 'https://wondertales.art/');
for (const locale of PUBLIC_SEO_LOCALES) {
  assertSitemapLoc(emptySitemap, buildPublicLandingPath(locale));
  assertSitemapLoc(emptySitemap, buildPublicPricingPath(locale));
  assertSitemapLoc(emptySitemap, buildPublicStoriesPath(locale));
  assertSitemapLoc(emptySitemap, buildPublicBlogIndexPath(locale));
  assertSitemapLoc(emptySitemap, buildPublicSupportPath(locale));
  assertSitemapLoc(emptySitemap, buildPublicBlogArticlePath('adhd-story-attention', locale));
}
assert.doesNotMatch(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\//);
assert.doesNotMatch(emptySitemap, /<loc>https:\/\/wondertales\.art\/u\//);
assert.doesNotMatch(emptySitemap, /<loc>https:\/\/wondertales\.art\/billing\//);

assert.equal(buildPublicStoriesPath('en'), '/stories');
assert.equal(buildPublicStoriesPath('uk'), '/uk/stories');
assert.equal(buildPublicBlogIndexPath('en'), '/blog');
assert.equal(buildPublicBlogIndexPath('uk'), '/uk/blog');
assert.equal(buildPublicBlogArticlePath('adhd-story-attention', 'en'), '/blog/adhd-story-attention');
assert.equal(buildPublicBlogArticlePath('adhd-story-attention', 'uk'), '/uk/blog/adhd-story-attention');
assert.equal(buildPublicBlogArticlePath('adhd-story-attention', 'ru'), '/ru/blog/adhd-story-attention');
assert.equal(buildPublicAppEntryPath('/wizard', 'en'), '/wizard?locale=en');
assert.equal(buildPublicAppEntryPath('/wizard?theme=scary_stories', 'en'), '/wizard?theme=scary_stories&locale=en');
assert.equal(buildPublicAppEntryPath('/wizard', 'uk'), '/uk/wizard');
assert.equal(buildPublicLegalPath('terms', 'en'), '/terms');
assert.equal(buildPublicLegalPath('terms', 'uk'), '/uk/terms');
assert.equal(buildPublicLegalPath('terms', 'ru'), '/ru/terms');
assert.equal(buildPublicLegalPath('terms', 'es'), '/es/terms');
assert.equal(buildPublicLegalPath('privacy', 'en'), '/privacy');
assert.equal(buildPublicLegalPath('privacy', 'uk'), '/uk/privacy');
assert.equal(buildPublicLegalPath('privacy', 'de'), '/de/privacy');
assert.equal(buildPublicLegalPath('privacy', 'pl'), '/pl/privacy');
assert.equal(getBlogSlugs().length, 14, 'public blog set should contain the expected editorial articles');

for (const { name, value } of nginxConfigs) {
  assert.match(value, /location = \/pricing\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/pricing/, `${name} should route public pricing to API SSR`);
  assert.match(value, /location = \/en\s*\{[\s\S]*?return 301 \//, `${name} should redirect legacy /en to the unprefixed English landing page`);
  assert.match(value, /location ~ \^\/en\/\(pricing\|stories\|blog\|terms\|privacy\|support\)\/\?\$\s*\{[\s\S]*?return 301 \/\$1/, `${name} should redirect legacy English public pages`);
  assert.match(value, /location ~ \^\/en\/blog\/\(\[\^\/\?\]\+\)\/\?\$\s*\{[\s\S]*?return 301 \/blog\/\$1/, `${name} should redirect legacy English blog articles`);
  assert.match(value, /location ~ \^\/en\/\(wizard\|welcome\|register\)\/\?\$\s*\{[\s\S]*?return 301 \/\$1\?locale=en/, `${name} should preserve English on legacy app entry redirects`);
  assert.match(value, /location = \/terms\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/terms/, `${name} should route default terms to API SSR`);
  assert.match(value, /location = \/privacy\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/privacy/, `${name} should route default privacy to API SSR`);
  assert.match(value, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/terms\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/terms\/\$1/, `${name} should route localized terms to API SSR`);
  assert.match(value, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/privacy\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/privacy\/\$1/, `${name} should route localized privacy to API SSR`);
  assert.match(value, /location = \/stories\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories/, `${name} should route exact /stories to API SSR`);
  assert.match(value, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/stories\/\?\$\s*\{[\s\S]*?\/ssr\/stories\/catalog\/\$1/, `${name} should route localized stories route to API SSR`);
  assert.match(value, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/support\/\?\$\s*\{[\s\S]*?\/ssr\/support\/\$1/, `${name} should route localized support route to API SSR`);
  assert.match(value, /location = \/blog\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog/, `${name} should route blog index to API SSR`);
  assert.match(value, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/blog\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/index\/\$1/, `${name} should route localized blog index to API SSR`);
  assert.match(value, /location \^~ \/blog\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog\//, `${name} should route blog articles to API SSR`);
  assert.match(value, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/blog\/\(\[\^\/\?\]\+\)\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/\$1\/\$2/, `${name} should route localized blog articles to API SSR`);
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
assert.match(commonSsrRoutes, /location = \/en\s*\{[\s\S]*?return 301 \//);
assert.match(commonSsrRoutes, /location ~ \^\/en\/\(pricing\|stories\|blog\|terms\|privacy\|support\)\/\?\$\s*\{[\s\S]*?return 301 \/\$1/);
assert.match(commonSsrRoutes, /location = \/terms\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/terms/);
assert.match(commonSsrRoutes, /location = \/privacy\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/privacy/);
assert.match(commonSsrRoutes, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/terms\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/terms\/\$1/);
assert.match(commonSsrRoutes, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/privacy\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/privacy\/\$1/);
assert.match(commonSsrRoutes, /location = \/stories\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories/);
assert.match(commonSsrRoutes, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/stories\/\?\$\s*\{[\s\S]*?\/ssr\/stories\/catalog\/\$1/);
assert.match(commonSsrRoutes, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/support\/\?\$\s*\{[\s\S]*?\/ssr\/support\/\$1/);
assert.match(commonSsrRoutes, /location = \/blog\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog/);
assert.match(commonSsrRoutes, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/blog\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/index\/\$1/);
assert.match(commonSsrRoutes, /location \^~ \/blog\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/blog\//);
assert.match(commonSsrRoutes, /location ~ \^\/\(uk\|ru\|es\|de\|fr\|pl\)\/blog\/\(\[\^\/\?\]\+\)\/\?\$\s*\{[\s\S]*?\/ssr\/blog\/\$1\/\$2/);
assert.match(commonSsrRoutes, /location \^~ \/stories\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories\//);
assert.match(commonSsrRoutes, /location \^~ \/authors\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/authors\//);
assert.match(commonSsrRoutes, /location \^~ \/u\/\s*\{[\s\S]*?X-Robots-Tag "noindex,nofollow"/);

console.log('routeOwnership tests passed');
