#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const API_BASE_URL = 'https://api.revenuecat.com/v2';

const DEFAULT_PLANS = [
  {
    slug: 'silver',
    displayName: 'Silver Dreams',
    packageLookupKey: 'silver_monthly',
    productTitle: 'WonderTales Silver Dreams Monthly',
    position: 1,
  },
  {
    slug: 'golden',
    displayName: 'Golden Stars',
    packageLookupKey: 'golden_monthly',
    productTitle: 'WonderTales Golden Stars Monthly',
    position: 2,
  },
  {
    slug: 'fairyworld',
    displayName: 'Fairy World',
    packageLookupKey: 'fairyworld_monthly',
    productTitle: 'WonderTales Fairy World Monthly',
    position: 3,
  },
];

function parseArgs(argv) {
  const args = {
    apply: false,
    check: false,
    envFile: null,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--') continue;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\n/g, '\n');
}

function loadEnvFile(envFile, target = process.env) {
  if (!envFile || !fs.existsSync(envFile)) return [];

  const loaded = [];
  const content = fs.readFileSync(envFile, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = normalized.indexOf('=');
    if (eq < 1) continue;

    const key = normalized.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (target[key] !== undefined) continue;

    target[key] = parseEnvValue(normalized.slice(eq + 1));
    loaded.push(key);
  }
  return loaded;
}

function defaultEnvFile(rootDir = process.cwd()) {
  const candidates = ['.env.local', '.env.production', '.env'];
  return candidates.map((name) => path.join(rootDir, name)).find((file) => fs.existsSync(file)) ?? null;
}

function required(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }
  return String(value).trim();
}

function resolveConfig(env = process.env) {
  return {
    apiKey: env.REVENUECAT_API_V2_SECRET_KEY || '',
    projectId: env.REVENUECAT_PROJECT_ID || '',
    entitlementLookupKey: env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'premium',
    offeringLookupKey: env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID || 'default',
    iosSdkApiKey: env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '',
    androidSdkApiKey: env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '',
    webhookAuthorization: env.REVENUECAT_WEBHOOK_AUTHORIZATION || '',
    existingProductPlanMap: env.REVENUECAT_PRODUCT_PLAN_MAP || '',
    explicitAppIds: splitCsv(env.REVENUECAT_APP_IDS || ''),
    explicitIosAppId: env.REVENUECAT_IOS_APP_ID || '',
    explicitAndroidAppId: env.REVENUECAT_ANDROID_APP_ID || '',
  };
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '<missing>';
  if (text.length <= 12) return `${text.slice(0, 3)}...`;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function createRevenueCatClient({ apiKey, projectId, fetchImpl = globalThis.fetch }) {
  required(apiKey, 'REVENUECAT_API_V2_SECRET_KEY');
  required(projectId, 'REVENUECAT_PROJECT_ID');
  if (!fetchImpl) throw new Error('global fetch is unavailable; use Node.js 20+');

  async function request(method, endpoint, body) {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const detail =
        data?.message ||
        data?.error ||
        data?.raw ||
        `${response.status} ${response.statusText}`;
      const error = new Error(`RevenueCat API ${method} ${endpoint} failed: ${detail}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async function listAll(endpoint) {
    const items = [];
    let next = endpoint;
    while (next) {
      const data = await request('GET', next);
      items.push(...(Array.isArray(data?.items) ? data.items : []));
      next = data?.next_page || null;
    }
    return items;
  }

  return {
    projectId,
    request,
    listAll,
    getApps: () => listAll(`/projects/${encodeURIComponent(projectId)}/apps?limit=100`),
    getProducts: (appId) => {
      const query = appId ? `?limit=100&app_id=${encodeURIComponent(appId)}` : '?limit=100';
      return listAll(`/projects/${encodeURIComponent(projectId)}/products${query}`);
    },
    getEntitlements: () => listAll(`/projects/${encodeURIComponent(projectId)}/entitlements?limit=100`),
    getOfferings: () => listAll(`/projects/${encodeURIComponent(projectId)}/offerings?limit=100`),
    getPackages: (offeringId) =>
      listAll(
        `/projects/${encodeURIComponent(projectId)}/offerings/${encodeURIComponent(offeringId)}/packages?limit=100`,
      ),
    getEntitlementProducts: (entitlementId) =>
      listAll(
        `/projects/${encodeURIComponent(projectId)}/entitlements/${encodeURIComponent(entitlementId)}/products?limit=100`,
      ),
    getPackageProducts: (packageId) =>
      listAll(`/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(packageId)}/products?limit=100`),
    createProduct: (body) => request('POST', `/projects/${encodeURIComponent(projectId)}/products`, body),
    createEntitlement: (body) => request('POST', `/projects/${encodeURIComponent(projectId)}/entitlements`, body),
    attachProductsToEntitlement: (entitlementId, productIds) =>
      request(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/entitlements/${encodeURIComponent(entitlementId)}/actions/attach_products`,
        { product_ids: productIds },
      ),
    createOffering: (body) => request('POST', `/projects/${encodeURIComponent(projectId)}/offerings`, body),
    updateOffering: (offeringId, body) =>
      request('POST', `/projects/${encodeURIComponent(projectId)}/offerings/${encodeURIComponent(offeringId)}`, body),
    createPackage: (offeringId, body) =>
      request(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/offerings/${encodeURIComponent(offeringId)}/packages`,
        body,
      ),
    attachProductsToPackage: (packageId, productIds) =>
      request(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(packageId)}/actions/attach_products`,
        {
          products: productIds.map((productId) => ({
            product_id: productId,
            eligibility_criteria: 'all',
          })),
        },
      ),
  };
}

function isTestStoreApp(app) {
  const type = String(app?.type || '').toLowerCase();
  const name = String(app?.name || '').toLowerCase();
  return type === 'test_store' || type === 'simulated_store' || name.includes('test store');
}

function isSupportedCatalogApp(app) {
  const type = String(app?.type || '').toLowerCase();
  if (isTestStoreApp(app)) return true;
  return ['app_store', 'mac_app_store', 'play_store', 'amazon'].includes(type);
}

function selectTargetApps(apps, config) {
  const explicit = new Set([
    ...config.explicitAppIds,
    config.explicitIosAppId,
    config.explicitAndroidAppId,
  ].filter(Boolean));

  if (explicit.size > 0) {
    return apps.filter((app) => explicit.has(app.id));
  }

  return apps.filter(isSupportedCatalogApp);
}

function productIdentifierForApp(planSlug, app) {
  const type = String(app?.type || '').toLowerCase();
  if (type === 'play_store') return `com.wondertales.${planSlug}:monthly`;
  if (isTestStoreApp(app)) return `wondertales_${planSlug}_monthly`;
  return `com.wondertales.${planSlug}.monthly`;
}

function buildProductPayload(app, plan) {
  const body = {
    store_identifier: productIdentifierForApp(plan.slug, app),
    app_id: app.id,
    type: 'subscription',
    display_name: plan.productTitle,
  };

  if (isTestStoreApp(app)) {
    body.title = plan.productTitle;
    body.subscription = { duration: 'P1M' };
  }

  return body;
}

function buildDesiredProducts(apps, plans = DEFAULT_PLANS) {
  return apps.flatMap((app) =>
    plans.map((plan) => ({
      app,
      plan,
      payload: buildProductPayload(app, plan),
    })),
  );
}

function parseProductPlanMapPair(pair) {
  const trimmed = String(pair || '').trim();
  const separator = trimmed.lastIndexOf(':');
  if (separator < 1) return null;

  const productId = trimmed.slice(0, separator).trim();
  const planSlug = trimmed.slice(separator + 1).trim();
  if (!productId || !planSlug) return null;
  return { productId, planSlug };
}

function parseProductPlanMap(value) {
  const map = new Map();
  for (const pair of splitCsv(value)) {
    const parsed = parseProductPlanMapPair(pair);
    if (parsed) map.set(parsed.productId, parsed.planSlug);
  }
  return map;
}

function buildProductPlanMap(desiredProducts) {
  const entries = [];
  const seen = new Set();
  for (const desired of desiredProducts) {
    const productId = desired.payload.store_identifier;
    const entry = `${productId}:${desired.plan.slug}`;
    if (seen.has(entry)) continue;
    seen.add(entry);
    entries.push(entry);
  }
  return entries.join(',');
}

function itemProductId(item) {
  return item?.product?.id || item?.id || item?.product_id || null;
}

function findByLookupKey(items, lookupKey) {
  return items.find((item) => item.lookup_key === lookupKey || item.id === lookupKey) || null;
}

function findProductByStoreIdentifier(products, storeIdentifier, appId) {
  return products.find((product) => {
    if (product.store_identifier !== storeIdentifier) return false;
    return !appId || product.app_id === appId;
  }) || null;
}

async function ensureRevenueCatCatalog({ client, config, apply = false, logger = console }) {
  const apps = await client.getApps();
  const targetApps = selectTargetApps(apps, config);
  if (targetApps.length === 0) {
    throw new Error('No supported RevenueCat apps found. Set REVENUECAT_APP_IDS or REVENUECAT_IOS_APP_ID/REVENUECAT_ANDROID_APP_ID if auto-discovery is not enough.');
  }

  logger.log(`RevenueCat project: ${config.projectId}`);
  logger.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
  logger.log(`Target apps: ${targetApps.map((app) => `${app.name || app.id} (${app.type || 'unknown'}, ${app.id})`).join(', ')}`);

  const desiredProducts = buildDesiredProducts(targetApps);
  const generatedProductPlanMap = buildProductPlanMap(desiredProducts);
  logger.log('');
  logger.log('Generated REVENUECAT_PRODUCT_PLAN_MAP:');
  logger.log(generatedProductPlanMap);
  logger.log('');

  const offeringsForPreflight = await client.getOfferings();
  const offeringForPreflight = findByLookupKey(offeringsForPreflight, config.offeringLookupKey);
  if (apply && offeringForPreflight) {
    await client.getPackages(offeringForPreflight.id);
  }

  const productsByApp = new Map();
  const resolvedProducts = [];
  for (const app of targetApps) {
    productsByApp.set(app.id, await client.getProducts(app.id));
  }

  for (const desired of desiredProducts) {
    const existing = findProductByStoreIdentifier(
      productsByApp.get(desired.app.id) || [],
      desired.payload.store_identifier,
      desired.app.id,
    );
    if (existing) {
      logger.log(`PASS product exists: ${desired.payload.store_identifier} -> ${desired.plan.slug}`);
      resolvedProducts.push({ ...desired, product: existing });
      continue;
    }

    if (!apply) {
      logger.log(`PLAN create product: ${desired.payload.store_identifier} -> ${desired.plan.slug}`);
      resolvedProducts.push({ ...desired, product: null });
      continue;
    }

    logger.log(`CREATE product: ${desired.payload.store_identifier} -> ${desired.plan.slug}`);
    const created = await client.createProduct(desired.payload);
    resolvedProducts.push({ ...desired, product: created });
  }

  if (!apply) {
    logger.log('');
    logger.log('Dry-run only. Re-run with --apply to create/attach catalog entries.');
    return { apps: targetApps, desiredProducts, productPlanMap: generatedProductPlanMap };
  }

  const allProducts = resolvedProducts.map((item) => item.product).filter(Boolean);
  const entitlements = await client.getEntitlements();
  let entitlement = findByLookupKey(entitlements, config.entitlementLookupKey);
  if (!entitlement) {
    logger.log(`CREATE entitlement: ${config.entitlementLookupKey}`);
    entitlement = await client.createEntitlement({
      lookup_key: config.entitlementLookupKey,
      display_name: 'WonderTales premium access',
    });
  } else {
    logger.log(`PASS entitlement exists: ${config.entitlementLookupKey} (${entitlement.id})`);
  }

  const entitlementProductIds = new Set((await client.getEntitlementProducts(entitlement.id)).map((product) => product.id));
  const missingEntitlementProductIds = allProducts
    .map((product) => product.id)
    .filter((id) => id && !entitlementProductIds.has(id));
  if (missingEntitlementProductIds.length > 0) {
    logger.log(`ATTACH ${missingEntitlementProductIds.length} product(s) to entitlement ${config.entitlementLookupKey}`);
    await client.attachProductsToEntitlement(entitlement.id, missingEntitlementProductIds);
  } else {
    logger.log(`PASS entitlement products attached: ${config.entitlementLookupKey}`);
  }

  const offerings = await client.getOfferings();
  let offering = findByLookupKey(offerings, config.offeringLookupKey);
  if (!offering) {
    logger.log(`CREATE offering: ${config.offeringLookupKey}`);
    offering = await client.createOffering({
      lookup_key: config.offeringLookupKey,
      display_name: 'WonderTales monthly plans',
      metadata: {
        source: 'scripts/sync-revenuecat-catalog.js',
      },
    });
  } else {
    logger.log(`PASS offering exists: ${config.offeringLookupKey} (${offering.id})`);
  }

  if (!offering.is_current) {
    logger.log(`UPDATE offering current: ${config.offeringLookupKey}`);
    offering = await client.updateOffering(offering.id, { is_current: true });
  }

  const packages = await client.getPackages(offering.id);
  for (const plan of DEFAULT_PLANS) {
    const planProducts = resolvedProducts
      .filter((item) => item.plan.slug === plan.slug && item.product)
      .map((item) => item.product);
    let pkg = findByLookupKey(packages, plan.packageLookupKey);
    if (!pkg) {
      logger.log(`CREATE package: ${plan.packageLookupKey}`);
      pkg = await client.createPackage(offering.id, {
        lookup_key: plan.packageLookupKey,
        display_name: `${plan.displayName} monthly`,
        position: plan.position,
      });
    } else {
      logger.log(`PASS package exists: ${plan.packageLookupKey} (${pkg.id})`);
    }

    const packageProductIds = new Set(
      (await client.getPackageProducts(pkg.id)).map(itemProductId).filter(Boolean),
    );
    const missingPackageProductIds = planProducts
      .map((product) => product.id)
      .filter((id) => id && !packageProductIds.has(id));
    if (missingPackageProductIds.length > 0) {
      logger.log(`ATTACH ${missingPackageProductIds.length} product(s) to package ${plan.packageLookupKey}`);
      await client.attachProductsToPackage(pkg.id, missingPackageProductIds);
    } else {
      logger.log(`PASS package products attached: ${plan.packageLookupKey}`);
    }
  }

  return {
    apps: targetApps,
    products: allProducts,
    entitlement,
    offering,
    productPlanMap: generatedProductPlanMap,
  };
}

async function getRevenueCatCatalogState({ client, config }) {
  const apps = await client.getApps();
  const targetApps = selectTargetApps(apps, config);
  const products = [];
  for (const app of targetApps) {
    products.push(...(await client.getProducts(app.id)));
  }
  const entitlements = await client.getEntitlements();
  const offerings = await client.getOfferings();
  return {
    apps,
    targetApps,
    products,
    entitlements,
    offerings,
    entitlement: findByLookupKey(entitlements, config.entitlementLookupKey),
    offering: findByLookupKey(offerings, config.offeringLookupKey),
    desiredProducts: buildDesiredProducts(targetApps),
  };
}

module.exports = {
  API_BASE_URL,
  DEFAULT_PLANS,
  buildDesiredProducts,
  buildProductPayload,
  buildProductPlanMap,
  createRevenueCatClient,
  defaultEnvFile,
  ensureRevenueCatCatalog,
  getRevenueCatCatalogState,
  isSupportedCatalogApp,
  isTestStoreApp,
  loadEnvFile,
  maskSecret,
  parseArgs,
  parseProductPlanMap,
  parseProductPlanMapPair,
  productIdentifierForApp,
  resolveConfig,
  selectTargetApps,
};
