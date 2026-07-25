import assert from 'node:assert/strict';
import { toUserResponse } from '../userResponse';

const response = toUserResponse({
  id: 'user-1',
  email: 'parent@example.test',
  passwordHash: 'hash-should-not-leak',
  stripeCustomerId: 'cus_should_not_leak',
  childModeExitPasscodeHash: 'exit-passcode-hash-should-not-leak',
  childModeExitPasscodeSetAt: new Date('2026-05-04T12:00:00Z'),
  displayName: 'Parent',
  onboardingCompleted: true,
  productTourCompleted: true,
  role: 'user',
  oauthProviders: [{ provider: 'google', providerEmail: 'parent@example.test' }],
});

assert.equal(response.id, 'user-1');
assert.equal(response.email, 'parent@example.test');
assert.equal(response.displayName, 'Parent');
assert.equal(response.onboardingCompleted, true);
assert.equal(response.productTourCompleted, true);
assert.equal(response.role, 'user');
assert.equal(response.childModeExitPasscodeConfigured, true);
assert.deepEqual(response.oauthProviders, [
  { provider: 'google', providerEmail: 'parent@example.test' },
]);
assert.equal('passwordHash' in response, false);
assert.equal('stripeCustomerId' in response, false);
assert.equal('childModeExitPasscodeHash' in response, false);
