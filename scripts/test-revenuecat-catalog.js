#!/usr/bin/env node

const assert = require('node:assert/strict');

const {
  buildDesiredProducts,
  buildProductPayload,
  buildProductPlanMap,
  findCatalogProductRisks,
  isSupportedCatalogApp,
  looksLikeStripeIdentifier,
  parseProductPlanMap,
  parseProductPlanMapEntries,
  parseProductPlanMapPair,
  productIdentifierForApp,
  selectTargetApps,
  validateProductPlanMap,
} = require('./lib/revenuecat-catalog');

const iosApp = { id: 'app_ios', name: 'WonderTales iOS', type: 'app_store' };
const androidApp = { id: 'app_android', name: 'WonderTales Android', type: 'play_store' };
const testStoreApp = { id: 'app_test', name: 'Test Store', type: 'test_store' };

assert.equal(productIdentifierForApp('silver', iosApp), 'com.wondertales.silver.monthly');
assert.equal(productIdentifierForApp('silver', androidApp), 'com.wondertales.silver:monthly');
assert.equal(productIdentifierForApp('silver', testStoreApp), 'wondertales_silver_monthly');

assert.deepEqual(parseProductPlanMapPair('com.wondertales.silver:monthly:silver'), {
  productId: 'com.wondertales.silver:monthly',
  planSlug: 'silver',
});
assert.deepEqual(parseProductPlanMapPair('com.wondertales.golden.monthly:golden'), {
  productId: 'com.wondertales.golden.monthly',
  planSlug: 'golden',
});
assert.equal(parseProductPlanMapPair('not-a-valid-pair'), null);
assert.deepEqual(parseProductPlanMapEntries('invalid,com.wondertales.silver.monthly:silver'), {
  entries: [{ productId: 'com.wondertales.silver.monthly', planSlug: 'silver' }],
  invalidPairs: ['invalid'],
});

const parsedMap = parseProductPlanMap(
  'com.wondertales.silver.monthly:silver,com.wondertales.silver:monthly:silver'
);
assert.equal(parsedMap.get('com.wondertales.silver.monthly'), 'silver');
assert.equal(parsedMap.get('com.wondertales.silver:monthly'), 'silver');

const testStorePayload = buildProductPayload(testStoreApp, {
  slug: 'silver',
  productTitle: 'WonderTales Silver Dreams Monthly',
});
assert.deepEqual(testStorePayload.subscription, { duration: 'P1M' });
assert.equal(testStorePayload.title, 'WonderTales Silver Dreams Monthly');

const nativePayload = buildProductPayload(iosApp, {
  slug: 'silver',
  productTitle: 'WonderTales Silver Dreams Monthly',
});
assert.equal(nativePayload.subscription, undefined);
assert.equal(nativePayload.title, undefined);

const desired = buildDesiredProducts([iosApp, androidApp]).filter(
  (item) => item.plan.slug === 'silver'
);
assert.equal(
  buildProductPlanMap(desired),
  'com.wondertales.silver.monthly:silver,com.wondertales.silver:monthly:silver'
);

assert.equal(isSupportedCatalogApp({ type: 'stripe' }), false);
assert.equal(isSupportedCatalogApp(iosApp), true);
assert.equal(isSupportedCatalogApp(androidApp), true);
assert.equal(isSupportedCatalogApp(testStoreApp), true);
assert.equal(looksLikeStripeIdentifier('price_123'), true);
assert.equal(looksLikeStripeIdentifier('prod_123'), true);
assert.equal(looksLikeStripeIdentifier('com.wondertales.silver.monthly'), false);

assert.deepEqual(
  selectTargetApps([iosApp, androidApp, testStoreApp], {
    explicitAppIds: [],
    explicitIosAppId: 'app_ios',
    explicitAndroidAppId: '',
  }).map((app) => app.id),
  ['app_ios']
);

const nativeDesired = buildDesiredProducts([iosApp, androidApp]);
const validNativeMap = buildProductPlanMap(nativeDesired);
assert.deepEqual(validateProductPlanMap(validNativeMap, nativeDesired), {
  entries: [
    { productId: 'com.wondertales.silver.monthly', planSlug: 'silver' },
    { productId: 'com.wondertales.golden.monthly', planSlug: 'golden' },
    { productId: 'com.wondertales.fairyworld.monthly', planSlug: 'fairyworld' },
    { productId: 'com.wondertales.silver:monthly', planSlug: 'silver' },
    { productId: 'com.wondertales.golden:monthly', planSlug: 'golden' },
    { productId: 'com.wondertales.fairyworld:monthly', planSlug: 'fairyworld' },
  ],
  invalidPairs: [],
  duplicateProductIds: [],
  stripeProductIds: [],
  unknownPlanSlugs: [],
  unexpectedProductIds: [],
  mismatchedProductIds: [],
  missingProductIds: [],
});

const invalidMap = validateProductPlanMap(
  'price_123:silver,com.wondertales.silver.monthly:golden,wondertales_silver_monthly:silver',
  nativeDesired
);
assert.deepEqual(invalidMap.stripeProductIds, ['price_123']);
assert.deepEqual(invalidMap.unexpectedProductIds, ['price_123', 'wondertales_silver_monthly']);
assert.deepEqual(invalidMap.mismatchedProductIds, [
  {
    productId: 'com.wondertales.silver.monthly',
    actualPlanSlug: 'golden',
    expectedPlanSlug: 'silver',
  },
]);
assert.equal(invalidMap.missingProductIds.includes('com.wondertales.silver:monthly'), true);

const catalogRisks = findCatalogProductRisks(
  [
    { id: 'rc_prod_1', store_identifier: 'com.wondertales.silver.monthly' },
    { id: 'rc_prod_2', store_identifier: 'price_123' },
    { id: 'rc_prod_3', store_identifier: 'legacy_monthly' },
    { id: 'rc_prod_4' },
  ],
  nativeDesired
);
assert.deepEqual(
  catalogRisks.stripeProducts.map((product) => product.id),
  ['rc_prod_2']
);
assert.deepEqual(
  catalogRisks.unexpectedProducts.map((product) => product.id),
  ['rc_prod_3']
);
assert.deepEqual(
  catalogRisks.missingStoreIdentifierProducts.map((product) => product.id),
  ['rc_prod_4']
);

console.log('PASS RevenueCat catalog helpers');
