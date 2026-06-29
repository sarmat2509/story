import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_SEO_LOCALES } from '@wondertales/shared';
import { ELEVENLABS_VOICE_CATALOG } from '../../providers/audio/elevenlabs/voices';
import { GOOGLE_TTS_VOICE_CATALOG } from '../../providers/audio/google/voices';
import { getLocalizedVoiceDisplayName, getVoiceSamplePath } from '../voicePresentation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '../../..');
const uploadsRoot = resolve(apiRoot, 'uploads');

const landingVoices = [
  ...GOOGLE_TTS_VOICE_CATALOG,
  ...ELEVENLABS_VOICE_CATALOG,
];

const expectedSpanishSamples = new Map([
  ['lyra', { displayName: 'Lira', samplePath: 'voice-samples/es/Aoede.mp3' }],
  ['phoenix', { displayName: 'Fenix', samplePath: 'voice-samples/es/Charon.mp3' }],
  ['perseus', { displayName: 'Perseo', samplePath: 'voice-samples/es/Ntd0iVwICtUtA6Fvx27M.mp3' }],
]);

assert.equal(landingVoices.length, 8, 'landing voice sample coverage should include 4 standard and 4 premium voices');

for (const voice of landingVoices) {
  const expectedSpanish = expectedSpanishSamples.get(voice.name);
  if (expectedSpanish) {
    assert.equal(getLocalizedVoiceDisplayName(voice.name, 'es', voice.displayName), expectedSpanish.displayName);
    assert.equal(getVoiceSamplePath(voice.providerVoiceId, 'es'), expectedSpanish.samplePath);
  }

  for (const locale of PUBLIC_SEO_LOCALES) {
    const displayName = getLocalizedVoiceDisplayName(voice.name, locale, voice.displayName);
    assert.ok(displayName.trim(), `missing localized display name for ${voice.name} in ${locale}`);

    const samplePath = getVoiceSamplePath(voice.providerVoiceId, locale);
    assert.equal(
      samplePath,
      `voice-samples/${locale}/${voice.providerVoiceId}.mp3`,
      `unexpected sample path for ${displayName} in ${locale}`
    );

    const fullPath = resolve(uploadsRoot, samplePath);
    assert.ok(existsSync(fullPath), `missing voice sample file for ${displayName} in ${locale}: ${samplePath}`);
    assert.ok(statSync(fullPath).size > 1024, `voice sample file looks empty for ${displayName} in ${locale}: ${samplePath}`);
  }
}

console.log('voicePresentation tests passed');
