import assert from 'node:assert/strict';
import { toUserResponse } from '../userResponse';

const response = toUserResponse({
  id: 'user-1',
  email: 'parent@example.test',
  passwordHash: 'hash-should-not-leak',
  stripeCustomerId: 'cus_should_not_leak',
  displayName: 'Parent',
  role: 'user',
  oauthProviders: [{ provider: 'google', providerEmail: 'parent@example.test' }],
});

assert.equal(response.id, 'user-1');
assert.equal(response.email, 'parent@example.test');
assert.equal(response.displayName, 'Parent');
assert.equal(response.role, 'user');
assert.deepEqual(response.oauthProviders, [
  { provider: 'google', providerEmail: 'parent@example.test' },
]);
assert.equal('passwordHash' in response, false);
assert.equal('stripeCustomerId' in response, false);
