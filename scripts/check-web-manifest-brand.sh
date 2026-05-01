#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/universal-app"

check_manifest() {
  local manifest_path="$1"

  if [[ ! -f "${manifest_path}" ]]; then
    echo "Web manifest does not exist: ${manifest_path}"
    exit 1
  fi

  MANIFEST_PATH="${manifest_path}" node <<'NODE'
const fs = require('fs');

const manifestPath = process.env.MANIFEST_PATH;
const raw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);
const serialized = JSON.stringify(manifest);

function fail(message) {
  console.error(`${manifestPath}: ${message}`);
  process.exit(1);
}

if (/Kazka\+?|KazkaPlus/i.test(serialized)) {
  fail('contains stale Kazka branding');
}

if (manifest.short_name !== 'WonderTales') {
  fail(`short_name must be WonderTales, got ${JSON.stringify(manifest.short_name)}`);
}

if (typeof manifest.name !== 'string' || !manifest.name.includes('WonderTales')) {
  fail('name must contain WonderTales');
}

if (typeof manifest.description !== 'string' || !/personalized/i.test(manifest.description)) {
  fail('description should describe the personalized story product');
}

if (manifest.start_url !== '/') {
  fail(`start_url must be "/", got ${JSON.stringify(manifest.start_url)}`);
}

if (manifest.display !== 'standalone') {
  fail(`display must be standalone, got ${JSON.stringify(manifest.display)}`);
}

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const hasIcon192 = icons.some((icon) => typeof icon.sizes === 'string' && icon.sizes.includes('192x192'));
const hasIcon512 = icons.some((icon) => typeof icon.sizes === 'string' && icon.sizes.includes('512x512'));

if (!hasIcon192 || !hasIcon512) {
  fail('must include 192x192 and 512x512 icons');
}
NODE
}

check_manifest "${APP_DIR}/public/manifest.json"

if [[ -f "${APP_DIR}/dist/manifest.json" ]]; then
  check_manifest "${APP_DIR}/dist/manifest.json"
fi

if ! rg -q '<link rel="manifest" href="/manifest.json"' "${APP_DIR}/public/index.html"; then
  echo "apps/universal-app/public/index.html does not link /manifest.json"
  exit 1
fi

if [[ -f "${APP_DIR}/dist/index.html" ]] && ! rg -q '<link rel="manifest" href="/manifest.json"' "${APP_DIR}/dist/index.html"; then
  echo "apps/universal-app/dist/index.html does not link /manifest.json"
  exit 1
fi

echo "Web manifest brand check passed."
