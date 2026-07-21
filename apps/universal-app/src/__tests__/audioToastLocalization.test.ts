import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const storyViewerSource = readFileSync(
  resolve(process.cwd(), 'src/screens/story/StoryViewerScreen.tsx'),
  'utf8'
);

assert.match(
  storyViewerSource,
  /toastService\.info\(\s*t\('toast\.audio_generating_title'\),\s*t\('toast\.audio_generating_message'\)\s*\)/,
  'audio-generation toast must resolve both strings through the interface i18n instance'
);
assert.doesNotMatch(
  storyViewerSource,
  /Готуємо аудіосказку|Це може зайняти кілька хвилин/,
  'audio-generation toast must not contain a hard-coded story-language string'
);

const locales = ['uk', 'ru', 'en', 'es', 'de', 'fr', 'pl'] as const;
const translations = new Map(
  locales.map((locale) => {
    const dictionary = JSON.parse(
      readFileSync(resolve(process.cwd(), `../../packages/shared/src/i18n/${locale}.json`), 'utf8')
    );
    return [locale, dictionary.toast] as const;
  })
);
const english = translations.get('en');
assert.ok(english);

for (const locale of locales) {
  const toast = translations.get(locale);
  assert.equal(typeof toast?.audio_generating_title, 'string', `${locale} needs a toast title`);
  assert.equal(typeof toast?.audio_generating_message, 'string', `${locale} needs a toast message`);
  assert.ok(toast.audio_generating_title.trim(), `${locale} toast title must not be empty`);
  assert.ok(toast.audio_generating_message.trim(), `${locale} toast message must not be empty`);
  if (locale !== 'en') {
    assert.notEqual(
      toast.audio_generating_title,
      english.audio_generating_title,
      `${locale} must not fall back to the English audio-generation title`
    );
    assert.notEqual(
      toast.audio_generating_message,
      english.audio_generating_message,
      `${locale} must not fall back to the English audio-generation message`
    );
  }
}

console.log('audio toast localization regression guards passed');
