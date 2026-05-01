import assert from 'node:assert';
import {
  assertParentGateOAuthIdentity,
  OAuthParentGateError,
} from '../oauthService';

function assertOAuthParentGateError(fn: () => unknown, code: OAuthParentGateError['code']) {
  assert.throws(
    fn,
    (error) => error instanceof OAuthParentGateError && error.code === code
  );
}

void (async function main() {
  assert.doesNotThrow(
    () => assertParentGateOAuthIdentity({ userId: 'parent-1' }, 'parent-1'),
    'linked OAuth identity can unlock parent gate'
  );

  assertOAuthParentGateError(
    () => assertParentGateOAuthIdentity(null, 'parent-1'),
    'PARENT_GATE_OAUTH_IDENTITY_REQUIRED'
  );

  assertOAuthParentGateError(
    () => assertParentGateOAuthIdentity({ userId: 'other-parent' }, 'parent-1'),
    'PARENT_GATE_ACCOUNT_MISMATCH'
  );

  console.log('oauthParentGateService tests passed');
})();
