import assert from 'node:assert/strict';
import de from '@wondertales/shared/i18n/de.json';
import en from '@wondertales/shared/i18n/en.json';
import es from '@wondertales/shared/i18n/es.json';
import fr from '@wondertales/shared/i18n/fr.json';
import pl from '@wondertales/shared/i18n/pl.json';
import ru from '@wondertales/shared/i18n/ru.json';
import uk from '@wondertales/shared/i18n/uk.json';

const locales = { de, en, es, fr, pl, ru, uk };
const profileKeys = [
  'story_mix_title',
  'story_mix_hint',
  'story_mix_comics',
  'story_mix_mixed',
  'story_mix_save',
] as const;
const usageSummaryKeys = ['graphic_novels_in_story_limit', 'mixed_stories_in_story_limit'] as const;
const pricingFeatureKeys = ['monthly_usage_with_comics_and_mixed'] as const;
const bundleKeys = ['story_limits', 'story_mix_limits', 'audio_limit'] as const;

for (const [locale, dictionary] of Object.entries(locales)) {
  for (const key of profileKeys) {
    const value = dictionary.profile?.[key];
    assert.equal(typeof value, 'string', `${locale} should define profile.${key}`);
    assert.ok(value.trim().length > 0, `${locale} profile.${key} should not be empty`);
  }

  for (const key of usageSummaryKeys) {
    const value = dictionary.usage_summary?.[key];
    assert.equal(typeof value, 'string', `${locale} should define usage_summary.${key}`);
    assert.ok(value.trim().length > 0, `${locale} usage_summary.${key} should not be empty`);
  }

  for (const key of pricingFeatureKeys) {
    const value = dictionary.plans?.features?.[key];
    assert.equal(typeof value, 'string', `${locale} should define plans.features.${key}`);
    assert.ok(value.trim().length > 0, `${locale} plans.features.${key} should not be empty`);
  }

  for (const key of bundleKeys) {
    const value = dictionary.plans?.bundles?.[key];
    assert.equal(typeof value, 'string', `${locale} should define plans.bundles.${key}`);
    assert.ok(value.trim().length > 0, `${locale} plans.bundles.${key} should not be empty`);
  }
}

console.log('story mix i18n tests passed');
