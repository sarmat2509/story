#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT_DIR, 'apps/universal-app');
const EXPECTED_APP_ID = 'com.wondertales.app';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function isPlaceholder(value) {
  return !hasValue(value) || /^YOUR_|^TODO$|^TBD$|PLACEHOLDER/i.test(String(value).trim());
}

function loadAppConfig(report, args) {
  if (args.skipExpoConfig) {
    report.warn('expo config checks skipped by --skip-expo-config');
    return null;
  }

  const result = spawnSync('pnpm', ['exec', 'expo', 'config', '--json'], {
    cwd: APP_DIR,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    report.fail(`expo config --json failed: ${(result.stderr || result.stdout).trim()}`);
    return null;
  }

  try {
    report.pass('expo config --json succeeds from apps/universal-app');
    return JSON.parse(result.stdout);
  } catch (error) {
    report.fail(`expo config --json returned invalid JSON: ${error.message}`);
    return null;
  }
}

function loadAndroidPermissions(report, args) {
  if (args.skipExpoConfig) {
    return null;
  }

  const result = spawnSync('pnpm', ['exec', 'expo', 'config', '--type', 'introspect', '--json'], {
    cwd: APP_DIR,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    report.fail(`expo config --type introspect --json failed: ${(result.stderr || result.stdout).trim()}`);
    return null;
  }

  try {
    const config = JSON.parse(result.stdout);
    report.pass('expo introspect config succeeds from apps/universal-app');
    return config?.modResults?.android?.manifest?.['uses-permission'] ?? [];
  } catch (error) {
    report.fail(`expo introspect returned invalid JSON: ${error.message}`);
    return null;
  }
}

function checkAppJson(report) {
  const appJson = readJson(path.join(APP_DIR, 'app.json'));
  const expo = appJson.expo ?? {};

  if (expo.name === 'WonderTales') report.pass('app name is WonderTales');
  else report.fail('app name is not WonderTales');

  if (expo.slug === 'wondertales') report.pass('app slug is wondertales');
  else report.fail('app slug is not wondertales');

  if (expo.ios?.bundleIdentifier === EXPECTED_APP_ID) report.pass(`iOS bundle id is ${EXPECTED_APP_ID}`);
  else report.fail(`iOS bundle id must be ${EXPECTED_APP_ID}`);

  if (expo.android?.package === EXPECTED_APP_ID) report.pass(`Android package is ${EXPECTED_APP_ID}`);
  else report.fail(`Android package must be ${EXPECTED_APP_ID}`);

  if (hasValue(expo.ios?.buildNumber)) report.pass(`iOS build number is ${expo.ios.buildNumber}`);
  else report.fail('iOS buildNumber is missing');

  if (Number.isInteger(expo.android?.versionCode)) report.pass(`Android versionCode is ${expo.android.versionCode}`);
  else report.fail('Android versionCode is missing');

  if (expo.android?.allowBackup === false) report.pass('Android allowBackup=false');
  else report.fail('Android allowBackup must be false');

  const blocked = new Set(expo.android?.blockedPermissions ?? []);
  for (const permission of [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ]) {
    if (blocked.has(permission)) report.pass(`blocked permission: ${permission}`);
    else report.fail(`missing blocked permission: ${permission}`);
  }

  const imagePickerPlugin = (expo.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker'
  );
  if (imagePickerPlugin?.[1]?.cameraPermission === false) report.pass('expo-image-picker camera permission is disabled');
  else report.fail('expo-image-picker camera permission must be disabled');

  if (imagePickerPlugin?.[1]?.microphonePermission === false) {
    report.pass('expo-image-picker microphone permission is disabled');
  } else {
    report.fail('expo-image-picker microphone permission must be disabled');
  }

  if (expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false) {
    report.pass('iOS non-exempt encryption flag is false');
  } else {
    report.fail('iOS ITSAppUsesNonExemptEncryption must be false for current standard TLS-only release');
  }
}

function checkEasJson(report) {
  const eas = readJson(path.join(APP_DIR, 'eas.json'));
  const apiUrl = eas.build?.production?.env?.EXPO_PUBLIC_API_BASE_URL;
  if (/^https:\/\/.+/i.test(apiUrl || '')) report.pass('EAS production API URL is HTTPS');
  else report.fail('EAS production API URL must be HTTPS');

  const iosSubmit = eas.submit?.production?.ios ?? {};
  if (isPlaceholder(iosSubmit.ascAppId)) report.warn('App Store Connect ascAppId is still owner-provided');
  else report.pass('App Store Connect ascAppId is set');

  if (isPlaceholder(iosSubmit.appleTeamId)) report.warn('Apple team id is still owner-provided');
  else report.pass('Apple team id is set');

  if (eas.submit?.production?.android) report.pass('Android submit block is configured');
  else report.warn('Android submit block is not configured; manual submit is acceptable if intentional');
}

function checkRootGuard(report) {
  const rootGuard = path.join(ROOT_DIR, 'app.config.js');
  const text = fs.existsSync(rootGuard) ? fs.readFileSync(rootGuard, 'utf8') : '';
  if (text.includes('apps/universal-app') && text.includes('native store builds must be run')) {
    report.pass('root app.config.js blocks accidental root Expo/EAS builds');
  } else {
    report.fail('root app.config.js guard is missing or unclear');
  }

  const packageJson = readJson(path.join(ROOT_DIR, 'package.json'));
  if (packageJson.scripts?.android?.includes('wondertales-universal-app')) {
    report.pass('root android script delegates to wondertales-universal-app');
  } else {
    report.fail('root android script must delegate to wondertales-universal-app');
  }

  if (packageJson.scripts?.ios?.includes('wondertales-universal-app')) {
    report.pass('root ios script delegates to wondertales-universal-app');
  } else {
    report.fail('root ios script must delegate to wondertales-universal-app');
  }
}

function checkResolvedConfig(report, config) {
  if (!config) return;
  if (config.ios?.bundleIdentifier === EXPECTED_APP_ID) report.pass('resolved Expo iOS bundle id matches');
  else report.fail('resolved Expo iOS bundle id mismatch');

  if (config.android?.package === EXPECTED_APP_ID) report.pass('resolved Expo Android package matches');
  else report.fail('resolved Expo Android package mismatch');

  if (config.extra?.eas?.projectId) report.pass('resolved Expo EAS project id is present');
  else report.fail('resolved Expo EAS project id is missing');
}

function checkPermissionSurface(report, permissions) {
  if (!permissions) return;
  const names = permissions
    .map((permission) => permission?.$?.['android:name'])
    .filter(Boolean)
    .sort();

  for (const forbidden of [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'com.google.android.gms.permission.AD_ID',
  ]) {
    if (names.includes(forbidden)) report.fail(`forbidden Android permission present: ${forbidden}`);
    else report.pass(`forbidden Android permission absent: ${forbidden}`);
  }
}

function parseArgs(argv) {
  return {
    skipExpoConfig: argv.includes('--skip-expo-config'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = makeReporter();

  console.log('== Store build source ==');
  checkRootGuard(report);

  console.log('');
  console.log('== App config files ==');
  checkAppJson(report);
  checkEasJson(report);

  console.log('');
  console.log('== Resolved Expo config ==');
  const resolvedConfig = loadAppConfig(report, args);
  checkResolvedConfig(report, resolvedConfig);

  console.log('');
  console.log('== Android permission surface ==');
  const permissions = loadAndroidPermissions(report, args);
  checkPermissionSurface(report, permissions);

  const { failures } = report.summary();
  process.exit(failures > 0 ? 1 : 0);
}

main();
