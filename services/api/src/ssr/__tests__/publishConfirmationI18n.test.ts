import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const locales = ['en', 'uk', 'es', 'de', 'fr', 'pl', 'ru'] as const;
const i18nDir = resolve(process.cwd(), '../../packages/shared/src/i18n');

for (const locale of locales) {
  const filePath = resolve(i18nDir, `${locale}.json`);
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as {
    story_viewer?: Record<string, string>;
  };
  const notice = data.story_viewer?.visibility_public_notice;

  assert.equal(typeof notice, 'string', `${locale} should define visibility_public_notice`);
  assert.ok(notice.length >= 40, `${locale} visibility_public_notice should be descriptive`);
  assert.notEqual(
    notice,
    'story_viewer.visibility_public_notice',
    `${locale} should not expose the raw i18n key`
  );
}

console.log('publishConfirmationI18n tests passed');
