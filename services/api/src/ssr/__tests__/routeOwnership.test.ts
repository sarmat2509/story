import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_ROUTE_PATHS,
  PUBLIC_SEO_LOCALES,
  buildPublicLegalPath,
  buildPublicSeoSitemapStaticRoutes,
  buildPublicStoriesPath,
} from '@wondertales/shared';
import { buildSitemapXmlForStories } from '../../services/sitemapService';

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
  ['uk', 'en'],
  'public SEO locales must stay limited to launch-ready public/legal locales'
);

assert.equal(APP_ROUTE_PATHS.billingPlans, 'billing/plans');
assert.notEqual(APP_ROUTE_PATHS.billingPlans, 'pricing');

assert.deepEqual(
  buildPublicSeoSitemapStaticRoutes().map((route) => route.path),
  ['/', '/pricing', '/stories', '/en/', '/en/pricing', '/en/stories'],
  'sitemap static SEO routes should come from the shared route manifest'
);

const emptySitemap = buildSitemapXmlForStories([], 'https://wondertales.art/');
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/stories<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/pricing<\/loc>/);
assert.match(emptySitemap, /<loc>https:\/\/wondertales\.art\/en\/stories<\/loc>/);
assert.doesNotMatch(emptySitemap, /<loc>https:\/\/wondertales\.art\/u\//);
assert.doesNotMatch(emptySitemap, /<loc>https:\/\/wondertales\.art\/billing\//);

assert.equal(buildPublicStoriesPath('uk'), '/stories');
assert.equal(buildPublicStoriesPath('en'), '/en/stories');
assert.equal(buildPublicLegalPath('terms', 'uk'), '/terms');
assert.equal(buildPublicLegalPath('terms', 'en'), '/en/terms');
assert.equal(buildPublicLegalPath('privacy', 'uk'), '/privacy');
assert.equal(buildPublicLegalPath('privacy', 'en'), '/en/privacy');

for (const { name, value } of nginxConfigs) {
  assert.match(value, /location = \/pricing\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/pricing/, `${name} should route public pricing to API SSR`);
  assert.match(value, /location = \/terms\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/terms/, `${name} should route default terms to API SSR`);
  assert.match(value, /location = \/privacy\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/privacy/, `${name} should route default privacy to API SSR`);
  assert.match(value, /location ~ \^\/en\/terms\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/terms\/en/, `${name} should route localized terms to API SSR`);
  assert.match(value, /location ~ \^\/en\/privacy\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/privacy\/en/, `${name} should route localized privacy to API SSR`);
  assert.match(value, /location = \/stories\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories/, `${name} should route exact /stories to API SSR`);
  assert.match(value, /location ~ \^\/en\/stories\/\?\$\s*\{[\s\S]*?\/ssr\/stories\/catalog\/en/, `${name} should route localized /en/stories to API SSR`);
  assert.match(value, /location \^~ \/stories\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories\//, `${name} should route story detail pages to API SSR`);
  assert.match(value, /location \^~ \/authors\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/authors\//, `${name} should route author pages to API SSR`);
  assert.match(value, /location \^~ \/u\/\s*\{[\s\S]*?X-Robots-Tag "noindex,nofollow"[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/u\//, `${name} should route unlisted stories to noindex SSR`);
  assert.doesNotMatch(value, /location ~ \^\/\(\?:uk\|ru\|en\|es\|de\|fr\|pl\)\/stories/, `${name} should not catch /en/stories in localized noindex fallback`);
  assertConfigHasNoindexLocation(value, 'location \\^~ /billing/', `${name} /billing`);
  assert.match(value, /location \/\s*\{[\s\S]*?X-Robots-Tag "noindex,nofollow"[\s\S]*?return 404;/, `${name} unknown public routes should be noindex 404`);
}

assert.match(commonSsrRoutes, /location = \/pricing\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/pricing/);
assert.match(commonSsrRoutes, /location = \/terms\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/terms/);
assert.match(commonSsrRoutes, /location = \/privacy\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/legal\/privacy/);
assert.match(commonSsrRoutes, /location ~ \^\/en\/terms\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/terms\/en/);
assert.match(commonSsrRoutes, /location ~ \^\/en\/privacy\/\?\$\s*\{[\s\S]*?\/ssr\/legal\/privacy\/en/);
assert.match(commonSsrRoutes, /location = \/stories\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories/);
assert.match(commonSsrRoutes, /location ~ \^\/en\/stories\/\?\$\s*\{[\s\S]*?\/ssr\/stories\/catalog\/en/);
assert.match(commonSsrRoutes, /location \^~ \/stories\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/stories\//);
assert.match(commonSsrRoutes, /location \^~ \/authors\/\s*\{[\s\S]*?proxy_pass http:\/\/api_backend\/ssr\/authors\//);
assert.match(commonSsrRoutes, /location \^~ \/u\/\s*\{[\s\S]*?X-Robots-Tag "noindex,nofollow"/);

console.log('routeOwnership tests passed');
