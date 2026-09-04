import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = process.cwd();
const onboardingSource = readFileSync(
  resolve(appRoot, 'src/screens/onboarding/ModeSelectionScreen.tsx'),
  'utf8'
);
const rootNavigatorSource = readFileSync(
  resolve(appRoot, 'src/navigation/RootNavigator.tsx'),
  'utf8'
);
const localeRoot = resolve(appRoot, '../../packages/shared/src/i18n');
const locales = ['uk', 'ru', 'en', 'es', 'de', 'fr', 'pl'] as const;
const onboardingKeys = [
  'parent_title',
  'story_setup_title',
  'ready_title',
  'parent_managed_kicker',
  'parent_managed_body',
  'default_language',
  'setup_for_child',
  'setup_body',
  'finish_setup',
  'ready_body',
  'create_story',
  'start_child_mode',
  'set_passcode_for_child_mode',
  'add_another_child',
  'child_mode_passcode_description',
  'create_child_error',
  'complete_error',
  'child_mode_error',
] as const;

const dictionaries = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(readFileSync(resolve(localeRoot, `${locale}.json`), 'utf8')),
  ])
) as Record<(typeof locales)[number], Record<string, any>>;

for (const locale of locales) {
  const dictionary = dictionaries[locale];
  for (const key of onboardingKeys) {
    assert.equal(
      typeof dictionary.onboarding?.[key],
      'string',
      `${locale} must define onboarding.${key}`
    );
    assert.ok(dictionary.onboarding[key].trim(), `${locale} onboarding.${key} must not be empty`);
  }

  for (const path of [
    ['common', 'continue'],
    ['common', 'saving'],
    ['child_form', 'birth_date_invalid'],
    ['child_form', 'photos_title'],
    ['child_form', 'description_label'],
    ['child_form', 'photo_or_description_separator'],
    ['child_form', 'photo_or_description_required'],
    ['wizard', 'child_turnaround_required_title'],
    ['wizard', 'child_turnaround_required_body'],
    ['wizard', 'edit_child_profile'],
    ['photo_upload', 'add_photo'],
    ['photo_upload', 'counter'],
    ['mode_selection', 'instant_mode'],
    ['mode_selection', 'artisan_mode'],
    ['mode_selection', 'instant_description'],
    ['mode_selection', 'artisan_description'],
  ]) {
    assert.ok(dictionary[path[0]]?.[path[1]]?.trim(), `${locale} must define ${path.join('.')}`);
  }
}

for (const locale of locales.filter((locale) => locale !== 'en')) {
  for (const key of ['parent_title', 'story_setup_title', 'ready_body', 'create_story'] as const) {
    assert.notEqual(
      dictionaries[locale].onboarding[key],
      dictionaries.en.onboarding[key],
      `${locale} onboarding.${key} must not fall back to English`
    );
  }
}

assert.match(onboardingSource, /<PhotoUploadGrid[\s\S]*photoType="child"/);
assert.match(
  onboardingSource,
  /<View style=\{styles\.languageField\}>[\s\S]*onboarding\.default_language/
);
assert.match(onboardingSource, /languageField:\s*\{\s*marginBottom:/);
assert.match(onboardingSource, /childDataConsentAccepted=\{consentAccepted\}/);
assert.match(onboardingSource, /testID="mode-selection-child-description"/);
assert.match(onboardingSource, /setAppearanceError\(/);
assert.match(onboardingSource, /appearanceError && styles\.appearanceSourceError/);
assert.match(onboardingSource, /appearanceError && styles\.appearanceDescriptionError/);
assert.match(onboardingSource, /if \(!hasUploadedPhoto && description\.trim\(\)\.length === 0\)/);
assert.doesNotMatch(
  onboardingSource,
  /disabled=\{[\s\S]{0,300}description\.trim\(\)\.length === 0/
);
assert.match(onboardingSource, /aiGeneratedDescription:\s*description\.trim\(\) \|\| undefined/);
assert.match(
  onboardingSource,
  /referencePhotos\.length === 0 && description\.trim\(\)\.length === 0/
);
assert.match(onboardingSource, /photos\.some\(\(photo\) => photo\.isUploading\)/);
assert.match(
  onboardingSource,
  /referencePhotos:\s*referencePhotos\.length > 0 \? referencePhotos : undefined/
);
assert.match(
  onboardingSource,
  /screen:\s*'Wizard',[\s\S]*childId:\s*createdChild\.id,[\s\S]*storyCreationMode:/
);
assert.match(rootNavigatorSource, /isAuthenticated\s*\?\s*'parent-main'/);
assert.doesNotMatch(rootNavigatorSource, /needsModeSelection\s*\?\s*'mode-selection'/);

console.log('onboarding regression tests passed');
