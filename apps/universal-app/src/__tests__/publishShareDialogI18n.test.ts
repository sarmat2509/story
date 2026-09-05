import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const localeIds = ['en', 'uk', 'ru', 'es', 'fr', 'de', 'pl'] as const;
const publishDialogKeys = [
  'story_viewer.url_copied',
  'story_viewer.publish_share_dialog_published',
  'story_viewer.unpublish',
  'story_viewer.publish_share_dialog_title',
  'story_viewer.publish_share_dialog_message',
  'story_viewer.publishing_under_pseudonym',
  'story_viewer.share_card_cover',
  'story_viewer.visibility_public',
  'story_viewer.visibility_public_hint',
  'story_viewer.visibility_unlisted',
  'story_viewer.visibility_unlisted_hint',
  'story_viewer.visibility_public_notice',
  'story_viewer.publish_with_characters',
  'story_viewer.publish_with_characters_hint',
  'story_viewer.publish_and_share',
  'story_viewer.publish',
  'profile.pseudonym',
  'profile.about_me',
] as const;

function readKey(dictionary: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, dictionary);
}

const dictionaries = Object.fromEntries(
  localeIds.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(resolve(process.cwd(), `../../packages/shared/src/i18n/${locale}.json`), 'utf8')
    ) as Record<string, unknown>,
  ])
) as Record<(typeof localeIds)[number], Record<string, unknown>>;

for (const locale of localeIds) {
  for (const key of publishDialogKeys) {
    const value = readKey(dictionaries[locale], key);
    assert.equal(
      typeof value,
      'string',
      `${locale} must provide ${key} for PublishShareDialog`
    );
    if (typeof value === 'string') {
      assert.notEqual(value.trim(), '', `${locale}.${key} must not be empty`);
    }
  }
}

for (const locale of localeIds.filter((locale) => locale !== 'en')) {
  for (const key of publishDialogKeys) {
    assert.notEqual(
      readKey(dictionaries[locale], key),
      readKey(dictionaries.en, key),
      `${locale}.${key} must not fall back to the English text`
    );
  }
}

console.log('PublishShareDialog translations are complete for every supported locale');
