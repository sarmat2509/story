import assert from 'node:assert';
import {
  createParentGateOAuthState,
  parseParentGateOAuthState,
  ParentGateOAuthStateError,
} from '../oauthParentGateStateService';

void (async function main() {
  const issuedAt = Date.now();
  const state = createParentGateOAuthState({
    provider: 'google',
    parentUserId: 'parent-1',
    childSessionId: 'child-session-1',
    issuedAt,
  });

  const parsed = parseParentGateOAuthState(state, 'google', issuedAt + 1000);
  assert.deepStrictEqual(
    parsed,
    {
      type: 'parent_gate',
      provider: 'google',
      parentUserId: 'parent-1',
      childSessionId: 'child-session-1',
      issuedAt,
    },
    'valid state round-trips'
  );

  assert.strictEqual(
    parseParentGateOAuthState(JSON.stringify({ redirect_uri: 'wondertales://auth/apple/callback' }), 'apple'),
    null,
    'normal OAuth state is ignored'
  );

  assert.throws(
    () => parseParentGateOAuthState(`${state}tampered`, 'google', issuedAt + 1000),
    (error) =>
      error instanceof ParentGateOAuthStateError &&
      error.code === 'INVALID_PARENT_GATE_STATE',
    'tampered state is rejected'
  );

  assert.throws(
    () => parseParentGateOAuthState(state, 'apple', issuedAt + 1000),
    (error) =>
      error instanceof ParentGateOAuthStateError &&
      error.code === 'INVALID_PARENT_GATE_STATE',
    'wrong provider is rejected'
  );

  assert.throws(
    () => parseParentGateOAuthState(state, 'google', issuedAt + 11 * 60 * 1000),
    (error) =>
      error instanceof ParentGateOAuthStateError &&
      error.code === 'EXPIRED_PARENT_GATE_STATE',
    'expired state is rejected'
  );

  console.log('oauthParentGateStateService tests passed');
})();
