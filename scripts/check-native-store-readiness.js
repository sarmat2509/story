#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  buildDesiredProducts,
  defaultEnvFile,
  loadEnvFile,
  maskSecret,
  validateProductPlanMap,
} = require('./lib/revenuecat-catalog');

const ROOT_DIR = path.join(__dirname, '..');
const PRODUCTION_NATIVE_APPS = [
  { id: 'expected_ios_store_shape', name: 'Expected iOS App Store shape', type: 'app_store' },
  { id: 'expected_android_store_shape', name: 'Expected Google Play shape', type: 'play_store' },
];
const EXPECTED_PLAN_SLUGS = ['silver', 'golden', 'fairyworld'];

function printHelp() {
  console.log(`Native store readiness check

Usage:
  node scripts/check-native-store-readiness.js [--env-file=.env.production] [--allow-test-store-keys]

This command is read-only. It checks the native billing split, EAS production
env surface, RevenueCat production product map shape, and backend webhook env.
`);
}

function parseArgs(argv) {
  const args = {
    envFile: null,
    allowTestStoreKeys: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--') continue;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--allow-test-store-keys') args.allowTestStoreKeys = true;
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
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

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

function readJson(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function productionEnvFromEas(easConfig) {
  return easConfig?.build?.production?.env && typeof easConfig.build.production.env === 'object'
    ? easConfig.build.production.env
    : {};
}

function isPlaceholder(value) {
  return !hasValue(value) || /^YOUR_|^TODO$|^TBD$|PLACEHOLDER/i.test(String(value).trim());
}

function checkContains(report, relativePath, pattern, message) {
  const text = readText(relativePath);
  if (typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)) {
    report.pass(message);
  } else {
    report.fail(`${message} (${relativePath})`);
  }
}

function checkRevenueCatSdkKey(report, key, label, expectedPrefix, allowTestStoreKeys) {
  const value = process.env[key] || '';
  if (!hasValue(value)) {
    report.fail(`${label} is missing (${key})`);
    return;
  }

  if (value.startsWith('test_') && !allowTestStoreKeys) {
    report.fail(
      `${label} uses a RevenueCat Test Store key; production EAS needs a store SDK key (${key})`
    );
    return;
  }

  if (expectedPrefix && value.startsWith(expectedPrefix)) {
    report.pass(`${label} is set (${maskSecret(value)})`);
    return;
  }

  report.warn(
    `${label} is set but does not use the expected ${expectedPrefix} prefix (${maskSecret(value)})`
  );
}

function parseStripePriceIds(value) {
  return String(value || '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(':');
      if (separator < 1) return { raw: pair, valid: false };
      return {
        raw: pair,
        valid: true,
        planSlug: pair.slice(0, separator),
        priceId: pair.slice(separator + 1),
      };
    });
}

function checkStripeWebEnv(report) {
  if (process.env.ENABLE_REAL_PAYMENTS === 'true') {
    report.pass('ENABLE_REAL_PAYMENTS=true for paid checkout/webhooks');
  } else {
    report.fail('ENABLE_REAL_PAYMENTS is not true; paid web/native checkout will stay disabled');
  }

  if (hasValue(process.env.STRIPE_SECRET_KEY)) {
    report.pass(
      `STRIPE_SECRET_KEY is set for web checkout (${maskSecret(process.env.STRIPE_SECRET_KEY)})`
    );
  } else {
    report.fail('STRIPE_SECRET_KEY is missing for web checkout');
  }

  if (hasValue(process.env.STRIPE_WEBHOOK_SECRET)) {
    report.pass('STRIPE_WEBHOOK_SECRET is set for web Stripe webhook');
  } else {
    report.fail('STRIPE_WEBHOOK_SECRET is missing for web Stripe webhook');
  }

  const entries = parseStripePriceIds(process.env.STRIPE_PRICE_IDS);
  const invalidEntries = entries.filter((entry) => !entry.valid);
  const byPlan = new Map(
    entries.filter((entry) => entry.valid).map((entry) => [entry.planSlug, entry.priceId])
  );
  for (const entry of invalidEntries) {
    report.fail(`STRIPE_PRICE_IDS has invalid entry: ${entry.raw}`);
  }
  for (const planSlug of EXPECTED_PLAN_SLUGS) {
    const priceId = byPlan.get(planSlug);
    if (!priceId) {
      report.fail(`STRIPE_PRICE_IDS is missing ${planSlug}`);
    } else if (!priceId.startsWith('price_')) {
      report.warn(`STRIPE_PRICE_IDS ${planSlug} value does not look like a Stripe Price ID`);
    } else {
      report.pass(`STRIPE_PRICE_IDS contains ${planSlug}:price_...`);
    }
  }
}

function checkRevenueCatEnv(report, allowTestStoreKeys) {
  checkRevenueCatSdkKey(
    report,
    'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
    'RevenueCat iOS public SDK key',
    'appl_',
    allowTestStoreKeys
  );
  checkRevenueCatSdkKey(
    report,
    'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY',
    'RevenueCat Android public SDK key',
    'goog_',
    allowTestStoreKeys
  );

  if (hasValue(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID)) {
    report.pass(
      `RevenueCat entitlement id is set (${process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID})`
    );
  } else {
    report.fail('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID is missing');
  }

  if (hasValue(process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID)) {
    report.pass(
      `RevenueCat offering id is set (${process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID})`
    );
  } else {
    report.fail('EXPO_PUBLIC_REVENUECAT_OFFERING_ID is missing');
  }

  if (String(process.env.REVENUECAT_WEBHOOK_AUTHORIZATION || '').startsWith('Bearer ')) {
    report.pass('REVENUECAT_WEBHOOK_AUTHORIZATION is set with Bearer prefix');
  } else {
    report.fail('REVENUECAT_WEBHOOK_AUTHORIZATION is missing or does not start with Bearer');
  }

  const desiredProducts = buildDesiredProducts(PRODUCTION_NATIVE_APPS);
  const mapValidation = validateProductPlanMap(
    process.env.REVENUECAT_PRODUCT_PLAN_MAP || '',
    desiredProducts
  );
  if (mapValidation.entries.length === 0) {
    report.fail('REVENUECAT_PRODUCT_PLAN_MAP is missing for native webhook plan resolution');
  } else {
    report.pass(
      `REVENUECAT_PRODUCT_PLAN_MAP has ${mapValidation.entries.length} production entr${mapValidation.entries.length === 1 ? 'y' : 'ies'}`
    );
  }

  for (const pair of mapValidation.invalidPairs) {
    report.fail(`REVENUECAT_PRODUCT_PLAN_MAP has invalid pair: ${pair}`);
  }
  for (const productId of mapValidation.duplicateProductIds) {
    report.fail(`REVENUECAT_PRODUCT_PLAN_MAP duplicates product id: ${productId}`);
  }
  for (const productId of mapValidation.stripeProductIds) {
    report.fail(`REVENUECAT_PRODUCT_PLAN_MAP contains Stripe-style product id: ${productId}`);
  }
  for (const entry of mapValidation.unknownPlanSlugs) {
    report.fail(
      `REVENUECAT_PRODUCT_PLAN_MAP points ${entry.productId} to unknown plan ${entry.planSlug}`
    );
  }
  for (const productId of mapValidation.unexpectedProductIds) {
    report.fail(
      `REVENUECAT_PRODUCT_PLAN_MAP contains non-production-native product id: ${productId}`
    );
  }
  for (const mismatch of mapValidation.mismatchedProductIds) {
    report.fail(
      `REVENUECAT_PRODUCT_PLAN_MAP points ${mismatch.productId} to ${mismatch.actualPlanSlug}, expected ${mismatch.expectedPlanSlug}`
    );
  }
  for (const productId of mapValidation.missingProductIds) {
    report.fail(
      `REVENUECAT_PRODUCT_PLAN_MAP is missing production native product id: ${productId}`
    );
  }
}

function checkEasConfig(report, relativePath) {
  const eas = readJson(relativePath);
  if (!eas) {
    report.warn(`${relativePath} is missing`);
    return;
  }

  const prodEnv = productionEnvFromEas(eas);
  const apiUrl = prodEnv.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '';
  if (/^https:\/\/.+/i.test(apiUrl) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(apiUrl)) {
    report.pass(`${relativePath} production API URL is HTTPS`);
  } else {
    report.fail(`${relativePath} production API URL is missing or non-production`);
  }

  for (const key of [
    'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY',
    'EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID',
    'EXPO_PUBLIC_REVENUECAT_OFFERING_ID',
  ]) {
    if (hasValue(prodEnv[key])) {
      report.pass(`${relativePath} production env includes ${key}`);
    } else if (hasValue(process.env[key])) {
      report.warn(
        `${relativePath} does not inline ${key}; confirm it is present in EAS production environment`
      );
    } else {
      report.fail(`${relativePath} production env cannot see ${key}`);
    }
  }

  const iosSubmit = eas.submit?.production?.ios || {};
  if (isPlaceholder(iosSubmit.ascAppId)) {
    report.fail(`${relativePath} submit.production.ios.ascAppId is still a placeholder`);
  } else {
    report.pass(`${relativePath} submit.production.ios.ascAppId is set`);
  }
  if (isPlaceholder(iosSubmit.appleTeamId)) {
    report.fail(`${relativePath} submit.production.ios.appleTeamId is still a placeholder`);
  } else {
    report.pass(`${relativePath} submit.production.ios.appleTeamId is set`);
  }
  if (!eas.submit?.production?.android) {
    report.warn(
      `${relativePath} has no submit.production.android block; confirm Google Play submission is manual or configured elsewhere`
    );
  }
}

function checkNativeSourceSplit(report) {
  console.log('== Native billing source split ==');
  checkContains(
    report,
    'apps/universal-app/src/screens/plans/PlansScreen.tsx',
    'const useRevenueCatFlow = enableRealPayments && !isWeb;',
    'PlansScreen routes native paid subscriptions through RevenueCat'
  );
  checkContains(
    report,
    'apps/universal-app/src/screens/plans/PlansScreen.tsx',
    'const useStripeFlow = enableRealPayments && isWeb;',
    'PlansScreen keeps Stripe checkout web-only'
  );
  checkContains(
    report,
    'apps/universal-app/src/screens/plans/PlansScreen.tsx',
    'plans.bundles.native_unavailable',
    'Native bundle purchase path is disabled until native one-time products exist'
  );
  checkContains(
    report,
    'apps/universal-app/src/services/revenueCatService.native.ts',
    'purchasePackage',
    'Native RevenueCat service purchases packages through the SDK'
  );
  checkContains(
    report,
    'apps/universal-app/src/services/revenueCatService.native.ts',
    'restorePurchases',
    'Native RevenueCat service exposes restore purchases'
  );
  checkContains(
    report,
    'apps/universal-app/src/services/revenueCatService.ts',
    'RevenueCat is only available on iOS and Android',
    'Web RevenueCat service remains a non-purchasing stub'
  );
}

function checkBackendWebhook(report) {
  console.log('');
  console.log('== Backend billing webhooks ==');
  checkContains(
    report,
    'services/api/src/routes/billingWebhook.ts',
    "router.post('/revenuecat'",
    'Backend exposes RevenueCat webhook route'
  );
  checkContains(
    report,
    'services/api/src/services/billingService.ts',
    'handleRevenueCatWebhook',
    'Backend handles RevenueCat webhook payloads'
  );
  checkContains(
    report,
    'services/api/src/services/billingService.ts',
    'authorizationHeader !== config.revenueCat.webhookAuthorization',
    'RevenueCat webhook requires the configured authorization header'
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const envFile = args.envFile || defaultEnvFile(ROOT_DIR);
  if (envFile) {
    const loaded = loadEnvFile(envFile);
    console.log(`Loaded env file: ${envFile} (${loaded.length} new key(s))`);
  } else {
    console.log('Loaded env file: <none>');
  }
  console.log('');

  const report = makeReporter();

  checkNativeSourceSplit(report);
  checkBackendWebhook(report);

  console.log('');
  console.log('== Production billing env ==');
  checkStripeWebEnv(report);
  checkRevenueCatEnv(report, args.allowTestStoreKeys);

  console.log('');
  console.log('== EAS production surface ==');
  checkEasConfig(report, 'eas.json');
  checkEasConfig(report, 'apps/universal-app/eas.json');

  const { failures } = report.summary();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
