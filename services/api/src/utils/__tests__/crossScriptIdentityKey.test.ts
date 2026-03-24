/**
 * Run: pnpm run test:cross-script-identity (from services/api)
 */
import assert from 'node:assert/strict';
import { crossScriptIdentityKey, toPhoneticKey } from '../characterNormalization';

function run() {
  assert.equal(crossScriptIdentityKey('Емілія'), 'emilia');
  assert.equal(crossScriptIdentityKey('Emilia'), 'emilia');
  assert.equal(crossScriptIdentityKey('емілія'), 'emilia');
  assert.notEqual(toPhoneticKey('Емілія'), toPhoneticKey('Emilia'), 'sanity: raw phonetic keys differ');

  assert.equal(crossScriptIdentityKey('Марія'), crossScriptIdentityKey('Maria'));
  assert.equal(crossScriptIdentityKey('Софія'), crossScriptIdentityKey('Sofia'));
}

run();
// eslint-disable-next-line no-console
console.log('crossScriptIdentityKey tests passed');
