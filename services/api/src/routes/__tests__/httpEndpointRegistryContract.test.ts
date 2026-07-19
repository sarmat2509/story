import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HTTP_ENDPOINT_MANIFEST,
  HTTP_ENDPOINT_MANIFEST_BY_KEY,
  httpEndpointKey,
} from '../../testing/httpEndpointManifest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.resolve(__dirname, '..');
const indexPath = path.resolve(__dirname, '../../index.ts');

const METHOD_RE = /router\.(get|post|put|patch|delete)\(\s*['`]([^'`]+)['`]/g;
const MOUNT_RE =
  /app\.use\(\s*['`]([^'`]+)['`]\s*,[\s\S]*?([A-Za-z0-9_]+Routes|[A-Za-z0-9_]+Route)\s*\)/g;

/** Map export/import local names in index.ts to route filenames under routes/. */
const ROUTE_FILE_BY_IMPORT: Record<string, string> = {
  healthRoutes: 'health.ts',
  sitemapRoute: 'sitemap.ts',
  billingWebhookRoutes: 'billingWebhook.ts',
  authRoutes: 'auth.ts',
  userRoutes: 'user.ts',
  meStoriesRoutes: 'meStories.ts',
  meArtifactsRoutes: 'meArtifacts.ts',
  meMapTilesRoutes: 'meMapTiles.ts',
  plansRoutes: 'plans.ts',
  opsRoutes: 'ops.ts',
  entitlementsRoutes: 'entitlements.ts',
  dictionariesRoutes: 'dictionaries.ts',
  childrenRoutes: 'children.ts',
  charactersRoutes: 'characters.ts',
  storiesRoutes: 'stories.ts',
  graphicNovelsRoutes: 'graphicNovels.ts',
  mixedStoriesRoutes: 'mixedStories.ts',
  imageValidationsRoutes: 'imageValidations.ts',
  adminAppReleasesRoutes: 'adminAppReleases.ts',
  adminRoutes: 'admin.ts',
  publicStoriesRoutes: 'publicStories.ts',
  publicAuthorsRoutes: 'publicAuthors.ts',
  publicUnlistedRoutes: 'publicUnlisted.ts',
  ssrStoriesRoutes: 'ssrStories.ts',
  ssrUnlistedRoutes: 'ssrUnlisted.ts',
  ssrAuthorsRoutes: 'ssrAuthors.ts',
  ssrLandingRoutes: 'ssrLanding.ts',
  ssrPricingRoutes: 'ssrPricing.ts',
  ssrLegalRoutes: 'ssrLegal.ts',
  ssrSupportRoutes: 'ssrSupport.ts',
  ssrBlogRoutes: 'ssrBlog.ts',
  ssrUpdatesRoutes: 'ssrUpdates.ts',
  shareCardRoutes: 'shareCard.ts',
  assetsRoutes: 'assets.ts',
  voicesRoutes: 'voices.ts',
  uploadRoutes: 'upload.ts',
  feedbackRoutes: 'feedback.ts',
  billingRoutes: 'billing.ts',
  bundlesRoutes: 'bundles.ts',
  indexRoutes: 'index.ts',
};

function joinMount(mount: string, routePath: string): string {
  if (routePath === '/') return mount.replace(/\/$/, '') || '/';
  const base = mount.endsWith('/') ? mount.slice(0, -1) : mount;
  const suffix = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${base}${suffix}`.replace(/\/+/g, '/');
}

function collectRoutesFromFile(filePath: string): Array<{ method: string; path: string }> {
  const source = fs.readFileSync(filePath, 'utf8');
  const routes: Array<{ method: string; path: string }> = [];
  for (const match of source.matchAll(METHOD_RE)) {
    routes.push({
      method: match[1]!.toUpperCase(),
      path: match[2]!,
    });
  }
  return routes;
}

function discoverRegisteredEndpoints(): Array<{ method: string; path: string; routerFile: string }> {
  const indexSource = fs.readFileSync(indexPath, 'utf8');
  const mounts: Array<{ mount: string; importName: string }> = [];
  for (const match of indexSource.matchAll(MOUNT_RE)) {
    mounts.push({ mount: match[1]!, importName: match[2]! });
  }

  const discovered: Array<{ method: string; path: string; routerFile: string }> = [];

  for (const { mount, importName } of mounts) {
    const relative = ROUTE_FILE_BY_IMPORT[importName];
    if (!relative) {
      throw new Error(`Unknown route import mounted at ${mount}: ${importName}`);
    }
    const absolute = path.join(routesDir, relative);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Route file missing for ${importName}: ${absolute}`);
    }
    for (const route of collectRoutesFromFile(absolute)) {
      discovered.push({
        method: route.method,
        path: joinMount(mount, route.path),
        routerFile: relative,
      });
    }
  }

  return discovered;
}

async function main(): Promise<void> {
  const discovered = discoverRegisteredEndpoints();
  assert.equal(discovered.length, 201, `expected inventory total 201, found ${discovered.length}`);

  const keys = discovered.map((row) => `${row.method} ${row.path}`);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, 'duplicate method+path registrations detected');

  assert.equal(
    HTTP_ENDPOINT_MANIFEST.length,
    discovered.length,
    'explicit manifest must contain every registered endpoint'
  );

  const manifestKeys = HTTP_ENDPOINT_MANIFEST.map(httpEndpointKey);
  assert.equal(
    new Set(manifestKeys).size,
    manifestKeys.length,
    'duplicate method+path entries detected in explicit manifest'
  );

  assert.deepEqual(
    [...manifestKeys].sort(),
    [...keys].sort(),
    'explicit manifest and registered Express routes must match exactly'
  );

  for (const endpoint of HTTP_ENDPOINT_MANIFEST) {
    assert.ok(endpoint.accessClass, `${httpEndpointKey(endpoint)} has no access class`);
    assert.ok(endpoint.testOwner.trim(), `${httpEndpointKey(endpoint)} has no test owner`);
    assert.ok(
      endpoint.expectedStatuses.length > 0,
      `${httpEndpointKey(endpoint)} has no expected status cases`
    );
    assert.ok(
      endpoint.expectedStatuses.every(
        (status) => Number.isInteger(status) && status >= 100 && status <= 599
      ),
      `${httpEndpointKey(endpoint)} has an invalid expected status`
    );

    const ownerPath = path.resolve(routesDir, '../../../..', endpoint.testOwner);
    assert.ok(
      fs.existsSync(ownerPath),
      `${httpEndpointKey(endpoint)} owner does not exist: ${endpoint.testOwner}`
    );
  }

  const protectedAuthLike = HTTP_ENDPOINT_MANIFEST.filter((row) =>
    ['auth', 'admin', 'child', 'parent'].includes(row.accessClass)
  );
  assert.equal(
    protectedAuthLike.length,
    144,
    `protected access classes must match clientApiAuthorizationContract size, found ${protectedAuthLike.length}`
  );

  const byKey = HTTP_ENDPOINT_MANIFEST_BY_KEY;
  assert.equal(byKey.get('GET /api/v1')?.accessClass, 'public');
  assert.equal(byKey.get('GET /api/v1/me')?.accessClass, 'parent');
  assert.equal(byKey.get('GET /api/v1/admin/dashboard')?.accessClass, 'admin');
  assert.equal(byKey.get('GET /health/detailed')?.accessClass, 'admin');
  assert.equal(byKey.get('POST /api/v1/auth/parent-gate')?.accessClass, 'child');
  assert.equal(byKey.get('POST /api/v1/auth/refresh')?.accessClass, 'auth');
  assert.equal(byKey.get('DELETE /api/v1/auth/sessions')?.accessClass, 'parent');
  assert.equal(byKey.get('GET /ssr/landing')?.accessClass, 'ssr');
  assert.equal(byKey.get('POST /api/v1/billing/webhook/stripe')?.accessClass, 'webhook');
  assert.equal(byKey.get('GET /api/v1/stories/published')?.accessClass, 'public');
  assert.equal(byKey.get('GET /api/v1/stories/published/:slug')?.accessClass, 'optional');

  console.log(
    `http endpoint registry contract passed (${discovered.length} routes, ${protectedAuthLike.length} protected-class)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
