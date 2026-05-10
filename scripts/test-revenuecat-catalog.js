#!/usr/bin/env node

const assert = require('node:assert/strict');

const {
  buildDesiredProducts,
  buildProductPayload,
  buildProductPlanMap,
  isSupportedCatalogApp,
  parseProductPlanMap,
  parseProductPlanMapPair,
  productIdentifierForApp,
  selectTargetApps,
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

const parsedMap = parseProductPlanMap(
  'com.wondertales.silver.monthly:silver,com.wondertales.silver:monthly:silver',
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

const desired = buildDesiredProducts([iosApp, androidApp]).filter((item) => item.plan.slug === 'silver');
assert.equal(
  buildProductPlanMap(desired),
  'com.wondertales.silver.monthly:silver,com.wondertales.silver:monthly:silver',
);

assert.equal(isSupportedCatalogApp({ type: 'stripe' }), false);
assert.equal(isSupportedCatalogApp(iosApp), true);
assert.equal(isSupportedCatalogApp(androidApp), true);
assert.equal(isSupportedCatalogApp(testStoreApp), true);

assert.deepEqual(
  selectTargetApps([iosApp, androidApp, testStoreApp], {
    explicitAppIds: [],
    explicitIosAppId: 'app_ios',
    explicitAndroidAppId: '',
  }).map((app) => app.id),
  ['app_ios'],
);

console.log('PASS RevenueCat catalog helpers');
