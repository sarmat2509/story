import assert from 'node:assert/strict';
import {
  PRESENTATION_AUDIO_MANIFEST,
  type PresentationAudioFormat,
  type PresentationAudioLanguage,
} from '../presentationAudioManifest';

const languages: PresentationAudioLanguage[] = ['uk', 'ru', 'en', 'es', 'de', 'fr', 'pl'];
const formats: PresentationAudioFormat[] = ['story', 'graphic_novel', 'mixed_story'];

assert.equal(PRESENTATION_AUDIO_MANIFEST.length, 21);
assert.equal(new Set(PRESENTATION_AUDIO_MANIFEST.map((entry) => entry.storyId)).size, 21);

for (const language of languages) {
  const entries = PRESENTATION_AUDIO_MANIFEST.filter((entry) => entry.language === language);
  assert.equal(entries.length, 3, `${language} must have three narrated stories`);
  assert.deepEqual(new Set(entries.map((entry) => entry.format)), new Set(formats));
  assert.equal(
    new Set(entries.map((entry) => entry.preferredVoiceName)).size,
    3,
    `${language} must use three different voices`
  );
}

assert.deepEqual(
  new Set(PRESENTATION_AUDIO_MANIFEST.map((entry) => entry.preferredVoiceName)),
  new Set(['hydra', 'centaurus', 'lyra'])
);

console.log('presentation audio manifest tests passed');
