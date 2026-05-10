#!/usr/bin/env node

const {
  buildProductPlanMap,
  createRevenueCatClient,
  defaultEnvFile,
  getRevenueCatCatalogState,
  loadEnvFile,
  maskSecret,
  parseArgs,
  parseProductPlanMap,
  resolveConfig,
} = require('./lib/revenuecat-catalog');

function printHelp() {
  console.log(`RevenueCat catalog readiness check

Usage:
  node scripts/check-revenuecat-catalog.js [--env-file=.env.production]

This command does not mutate RevenueCat. It validates env, API access,
target app discovery, offering/entitlement presence, and PRODUCT_PLAN_MAP.
`);
}

function makeReporter() {
  let failures = 0;
  let warnings = 0;
  return {
    pass(message) {
      console.log(`PASS ${message}`);
    },
    warn(message) {
      warnings += 1;
      console.log(`WARN ${message}`);
    },
    fail(message) {
      failures += 1;
      console.log(`FAIL ${message}`);
    },
    summary() {
      console.log('');
      console.log(`Summary: ${failures} failure(s), ${warnings} warning(s)`);
      return { failures, warnings };
    },
  };
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const envFile = args.envFile || defaultEnvFile();
  if (envFile) {
    const loaded = loadEnvFile(envFile);
    console.log(`Loaded env file: ${envFile} (${loaded.length} new key(s))`);
  } else {
    console.log('Loaded env file: <none>');
  }
  console.log('');

  const config = resolveConfig();
  const report = makeReporter();

  console.log('== Environment ==');
  if (config.apiKey.startsWith('sk_')) report.pass(`REVENUECAT_API_V2_SECRET_KEY is set (${maskSecret(config.apiKey)})`);
  else if (hasValue(config.apiKey)) report.warn(`REVENUECAT_API_V2_SECRET_KEY is set but does not start with sk_ (${maskSecret(config.apiKey)})`);
  else report.fail('REVENUECAT_API_V2_SECRET_KEY is missing');

  if (config.projectId.startsWith('proj')) report.pass(`REVENUECAT_PROJECT_ID is set (${config.projectId})`);
  else if (hasValue(config.projectId)) report.warn(`REVENUECAT_PROJECT_ID is set but does not look like a RevenueCat project id (${config.projectId})`);
  else report.fail('REVENUECAT_PROJECT_ID is missing');

  if (hasValue(config.iosSdkApiKey)) report.pass(`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is set (${maskSecret(config.iosSdkApiKey)})`);
  else report.warn('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is missing');

  if (hasValue(config.androidSdkApiKey)) report.pass(`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is set (${maskSecret(config.androidSdkApiKey)})`);
  else report.warn('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is missing');

  if (hasValue(config.entitlementLookupKey)) report.pass(`EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID is set (${config.entitlementLookupKey})`);
  else report.fail('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID is missing');

  if (hasValue(config.offeringLookupKey)) report.pass(`EXPO_PUBLIC_REVENUECAT_OFFERING_ID is set (${config.offeringLookupKey})`);
  else report.fail('EXPO_PUBLIC_REVENUECAT_OFFERING_ID is missing');

  if (config.webhookAuthorization.startsWith('Bearer ')) report.pass('REVENUECAT_WEBHOOK_AUTHORIZATION is set with Bearer prefix');
  else if (hasValue(config.webhookAuthorization)) report.warn('REVENUECAT_WEBHOOK_AUTHORIZATION is set but does not start with Bearer');
  else report.fail('REVENUECAT_WEBHOOK_AUTHORIZATION is missing');

  if (!hasValue(config.apiKey) || !hasValue(config.projectId)) {
    const { failures } = report.summary();
    process.exit(failures > 0 ? 1 : 0);
  }

  const client = createRevenueCatClient({
    apiKey: config.apiKey,
    projectId: config.projectId,
  });

  console.log('');
  console.log('== RevenueCat API ==');
  const state = await getRevenueCatCatalogState({ client, config });
  report.pass(`RevenueCat API responded; ${state.apps.length} app(s) found`);

  if (state.targetApps.length > 0) {
    report.pass(`target catalog app(s): ${state.targetApps.map((app) => `${app.name || app.id} (${app.type || 'unknown'})`).join(', ')}`);
  } else {
    report.fail('no supported target apps found; set REVENUECAT_APP_IDS or REVENUECAT_IOS_APP_ID/REVENUECAT_ANDROID_APP_ID');
  }

  const generatedMap = buildProductPlanMap(state.desiredProducts);
  console.log('');
  console.log('Generated REVENUECAT_PRODUCT_PLAN_MAP:');
  console.log(generatedMap || '<empty>');

  console.log('');
  console.log('== Catalog ==');
  if (state.entitlement) report.pass(`entitlement exists: ${config.entitlementLookupKey} (${state.entitlement.id})`);
  else report.warn(`entitlement is missing: ${config.entitlementLookupKey}; run sync with --apply`);

  if (state.offering) {
    report.pass(`offering exists: ${config.offeringLookupKey} (${state.offering.id})`);
    if (state.offering.is_current) report.pass(`offering is current: ${config.offeringLookupKey}`);
    else report.warn(`offering is not current: ${config.offeringLookupKey}; sync --apply will set it current`);
    try {
      const packages = await client.getPackages(state.offering.id);
      report.pass(`package API access works; ${packages.length} package(s) found`);
    } catch (error) {
      report.fail(`package API access failed: ${error.message}`);
    }
  } else {
    report.warn(`offering is missing: ${config.offeringLookupKey}; run sync with --apply`);
  }

  const productsByStoreIdentifier = new Set(state.products.map((product) => product.store_identifier));
  for (const desired of state.desiredProducts) {
    if (productsByStoreIdentifier.has(desired.payload.store_identifier)) {
      report.pass(`product exists: ${desired.payload.store_identifier}`);
    } else {
      report.warn(`product is missing: ${desired.payload.store_identifier}; run sync with --apply`);
    }
  }

  console.log('');
  console.log('== Product map ==');
  const configuredMap = parseProductPlanMap(config.existingProductPlanMap);
  if (configuredMap.size === 0) {
    report.warn('REVENUECAT_PRODUCT_PLAN_MAP is empty; use the generated value above');
  } else {
    report.pass(`REVENUECAT_PRODUCT_PLAN_MAP has ${configuredMap.size} entr${configuredMap.size === 1 ? 'y' : 'ies'}`);
    for (const desired of state.desiredProducts) {
      const planSlug = configuredMap.get(desired.payload.store_identifier);
      if (planSlug === desired.plan.slug) {
        report.pass(`map contains ${desired.payload.store_identifier}:${desired.plan.slug}`);
      } else if (planSlug) {
        report.fail(`map points ${desired.payload.store_identifier} to ${planSlug}, expected ${desired.plan.slug}`);
      } else {
        report.warn(`map is missing ${desired.payload.store_identifier}:${desired.plan.slug}`);
      }
    }
  }

  const { failures } = report.summary();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  if (error.data) {
    console.error(JSON.stringify(error.data, null, 2));
  }
  process.exit(1);
});
