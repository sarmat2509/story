import assert from 'node:assert';
import { isConsentAccepted, validateRegistrationConsents } from '../consentService';

void (async function main() {
  assert.strictEqual(isConsentAccepted(true), true);
  assert.strictEqual(isConsentAccepted('true'), true);
  assert.strictEqual(isConsentAccepted('1'), true);
  assert.strictEqual(isConsentAccepted(false), false);
  assert.strictEqual(isConsentAccepted(undefined), false);

  assert.deepStrictEqual(
    validateRegistrationConsents({
      termsAccepted: true,
      privacyAccepted: true,
      isAdultGuardian: true,
    }),
    []
  );

  assert.deepStrictEqual(
    validateRegistrationConsents({
      termsAccepted: true,
      privacyAccepted: false,
      isAdultGuardian: undefined,
    }),
    ['privacy_policy', 'adult_guardian']
  );

  console.log('consentService tests passed');
})();

