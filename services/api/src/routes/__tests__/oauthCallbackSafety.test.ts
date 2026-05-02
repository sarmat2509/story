import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const authRouteSource = readFileSync(resolve(__dirname, '../auth.ts'), 'utf8');
const webCallbackSource = readFileSync(
  resolve(__dirname, '../../../../../apps/universal-app/src/screens/auth/OAuthCallbackScreen.tsx'),
  'utf8'
);

assert.strictEqual(
  authRouteSource.includes('redirectTo: callbackUrl.toString()'),
  false,
  'OAuth callback logs must not include token-bearing redirect URLs'
);
assert.strictEqual(
  authRouteSource.includes('redirecting with token'),
  false,
  'OAuth callback log messages must not describe token-bearing redirects'
);
assert.match(
  authRouteSource,
  /function buildSafeOAuthCallbackLogContext/,
  'OAuth callback logs should use a safe structured context'
);

assert.strictEqual(
  /console\.log\(/.test(webCallbackSource),
  false,
  'OAuth callback screen should not emit production debug logs'
);
assert.match(
  webCallbackSource,
  /resetToMainRoute/,
  'OAuth callback screen should use the shared authenticated route reset helper'
);

console.log('oauthCallbackSafety tests passed');
