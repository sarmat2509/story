#!/usr/bin/env node

const {
  createRevenueCatClient,
  defaultEnvFile,
  ensureRevenueCatCatalog,
  loadEnvFile,
  maskSecret,
  parseArgs,
  resolveConfig,
} = require('./lib/revenuecat-catalog');

function printHelp() {
  console.log(`RevenueCat catalog sync

Usage:
  node scripts/sync-revenuecat-catalog.js [--env-file=.env.production] [--apply]

Default mode is a dry-run. It reads RevenueCat env, discovers target apps,
prints the generated REVENUECAT_PRODUCT_PLAN_MAP, and lists catalog changes.

Use --apply to create missing products, entitlement, offering, packages, and
attachments in RevenueCat.
`);
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

  const config = resolveConfig();
  console.log(`RevenueCat key: ${maskSecret(config.apiKey)}`);
  console.log(`RevenueCat project: ${config.projectId || '<missing>'}`);
  console.log(`Entitlement lookup key: ${config.entitlementLookupKey}`);
  console.log(`Offering lookup key: ${config.offeringLookupKey}`);
  console.log('');

  const client = createRevenueCatClient({
    apiKey: config.apiKey,
    projectId: config.projectId,
  });

  await ensureRevenueCatCatalog({
    client,
    config,
    apply: args.apply,
  });
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  if (error.data) {
    console.error(JSON.stringify(error.data, null, 2));
  }
  process.exit(1);
});
