import assert from 'node:assert/strict';

import de from '@wondertales/shared/i18n/de.json';
import en from '@wondertales/shared/i18n/en.json';
import es from '@wondertales/shared/i18n/es.json';
import fr from '@wondertales/shared/i18n/fr.json';
import pl from '@wondertales/shared/i18n/pl.json';
import ru from '@wondertales/shared/i18n/ru.json';
import uk from '@wondertales/shared/i18n/uk.json';

const locales = { de, en, es, fr, pl, ru, uk };

const requiredApiErrorKeys = [
  'authentication_required',
  'parent_session_required',
  'oauth_only',
  'email_already_registered',
  'consent_required',
  'invalid_or_expired_token',
  'google_oauth_not_configured',
  'apple_oauth_not_configured',
  'parent_gate_password_unavailable',
  'parent_gate_failed',
  'real_payments_disabled',
  'no_subscription',
  'subscription_period_expired',
  'story_limit_exceeded',
  'audio_limit_exceeded',
  'series_access_required',
  'feature_not_available',
  'expensive_generation_rate_limited',
  'child_data_consent_required',
] as const;

const requiredAuthKeys = [
  'oauth_callback_loading',
  'oauth_callback_error',
  'native_oauth_dev_client_required',
] as const;

for (const [locale, data] of Object.entries(locales)) {
  for (const key of requiredApiErrorKeys) {
    assert.equal(
      typeof data.api_errors?.[key],
      'string',
      `${locale} should define api_errors.${key}`
    );
    assert.ok(
      data.api_errors[key].trim().length > 0,
      `${locale} api_errors.${key} should not be empty`
    );
  }

  for (const key of requiredAuthKeys) {
    assert.equal(typeof data.auth?.[key], 'string', `${locale} should define auth.${key}`);
    assert.ok(data.auth[key].trim().length > 0, `${locale} auth.${key} should not be empty`);
  }

  assert.equal(
    typeof data.plans?.bundle_checkout_error,
    'string',
    `${locale} should define plans.bundle_checkout_error`
  );
  assert.ok(
    data.plans.bundle_checkout_error.trim().length > 0,
    `${locale} plans.bundle_checkout_error should not be empty`
  );
}

console.log('appErrorI18n tests passed');
