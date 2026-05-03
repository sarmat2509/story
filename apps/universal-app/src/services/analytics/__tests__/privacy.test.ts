import assert from 'node:assert/strict';
import { scrubAnalyticsProperties } from '../privacy';

const scrubbed = scrubAnalyticsProperties({
  story_id: 'story_123',
  preferred_locale: 'en',
  session_id: 'cs_test_secret',
  checkout_session_id: 'cs_test_checkout',
  checkout_url: 'https://checkout.stripe.com/c/session-secret',
  portal_url: 'https://billing.stripe.com/session-secret',
  share_token: 'share_secret',
  token: 'auth_secret',
});

assert.deepEqual(scrubbed, {
  story_id: 'story_123',
  preferred_locale: 'en',
});

console.log('analytics privacy tests passed');
