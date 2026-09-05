import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const authSource = readFileSync(resolve(process.cwd(), 'src/api/auth.ts'), 'utf8');
const storeSource = readFileSync(resolve(process.cwd(), 'src/store/authStore.ts'), 'utf8');
const switcherSource = readFileSync(
  resolve(process.cwd(), 'src/navigation/ChildProfileSwitcher.tsx'),
  'utf8'
);

const parentGateResponse = authSource.slice(
  authSource.indexOf('async function applyParentGateResponse'),
  authSource.indexOf('// Email/password mutations')
);

assert.doesNotMatch(
  parentGateResponse,
  /applyUserPreferredLocale/,
  'unlocking the parent area must preserve the currently selected UI locale'
);
assert.match(
  storeSource,
  /returnToParentSession:[\s\S]*routes: \[\{ name: 'Main', state: \{ routes: \[\{ name: 'Dashboard' \}]/,
  'leaving Child Mode must return to the dashboard'
);
assert.doesNotMatch(
  switcherSource.slice(
    switcherSource.indexOf('const submitParentGate'),
    switcherSource.indexOf('const requestRecoveryEmail')
  ),
  /resetToMainRoute\(\{ name: 'Profile' \}\)/,
  'the profile switcher must not override the dashboard return with Profile'
);

console.log('child-mode parent return contract passed');
