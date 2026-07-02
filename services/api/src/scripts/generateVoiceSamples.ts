/**
 * Generate Voice Samples Script
 * 
 * Generates audio samples for all voices in the catalog across supported UI languages.
 * - Loads demo text from i18n files
 * - Synthesizes audio using appropriate provider
 * - Uploads to asset storage
 * - Keeps `tts_voices.sample_audio_url` as the primary-language sample
 * 
 * Usage:
 *   npx tsx src/scripts/generateVoiceSamples.ts
 *   npx tsx src/scripts/generateVoiceSamples.ts --languages=ru,en,es,fr,de,pl
 *   (Grok: Ukrainian is skipped — no samples for `uk`; use en/ru/es/de/fr/pl.)
 *   npx tsx src/scripts/generateVoiceSamples.ts --force
 *   npx tsx src/scripts/generateVoiceSamples.ts --provider=grok --languages=en,ru,es,fr,de,pl --force
 */

import './loadEnvForScripts';

import { LOCALE_IDS, Locale } from '@wondertales/shared';
import { db } from '../db';
import { ttsVoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getVoiceSampleText } from '../utils/i18nLoader';
import { getAssetStorageService } from '../services/assetStorageService';
import { getAudioProviderByName } from '../services/aiService';

const SUPPORTED_SAMPLE_LANGUAGES = LOCALE_IDS;
type SupportedSampleLanguage = Locale;

function parseLanguagesArg(): SupportedSampleLanguage[] {
  const arg = process.argv.find((entry) => entry.startsWith('--languages='));
  if (!arg) {
    return [...SUPPORTED_SAMPLE_LANGUAGES];
  }

  const rawLanguages = arg
    .split('=')[1]
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  const invalid = rawLanguages.filter(
    (language) => !SUPPORTED_SAMPLE_LANGUAGES.includes(language as SupportedSampleLanguage)
  );
  if (invalid.length > 0) {
    throw new Error(`Unsupported languages: ${invalid.join(', ')}`);
  }

  return rawLanguages as SupportedSampleLanguage[];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

/** Optional: e.g. `--provider=grok` to regenerate only that TTS vendor. */
function parseProviderArg(): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith('--provider='));
  const value = arg?.split('=')[1]?.trim();
  return value || undefined;
}

async function sampleExistsInStorage(
  assetStorage: ReturnType<typeof getAssetStorageService>,
  language: string,
  providerVoiceId: string
): Promise<boolean> {
  const storagePath = `voice-samples/${language}/${providerVoiceId}.mp3`;

  try {
    await assetStorage.getAssetByPath(storagePath);
    return true;
  } catch {
    return false;
  }
}

interface VoiceRecord {
  id: string;
  providerVoiceId: string;
  name: string;
  displayName: string;
  language: string;
  supportedLanguages: string[] | null;
  provider: string;
  sampleAudioUrl: string | null;
}

function getVoiceSupportedLanguages(voice: VoiceRecord): string[] {
  return voice.supportedLanguages?.length ? voice.supportedLanguages : [voice.language];
}

async function generateVoiceSamples() {
  const targetLanguages = parseLanguagesArg();
  const force = hasFlag('--force');
  const providerFilter = parseProviderArg();

  logger.info({ targetLanguages, force, providerFilter }, 'Starting voice sample generation');
  
  // Fetch all active voices
  const rows = await db
    .select({
      id: ttsVoices.id,
      providerVoiceId: ttsVoices.providerVoiceId,
      name: ttsVoices.name,
      displayName: ttsVoices.displayName,
      language: ttsVoices.language,
      supportedLanguages: ttsVoices.supportedLanguages,
      provider: ttsVoices.provider,
      sampleAudioUrl: ttsVoices.sampleAudioUrl,
    })
    .from(ttsVoices)
    .where(eq(ttsVoices.isActive, true));

  const voices = providerFilter
    ? rows.filter((v) => v.provider === providerFilter)
    : rows;

  logger.info({ total: rows.length, afterFilter: voices.length, providerFilter }, 'Found voices to process');
  
  const assetStorage = getAssetStorageService();
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (const voice of voices) {
    const audioProvider = getAudioProviderByName(voice.provider);
    const supportedLanguages = getVoiceSupportedLanguages(voice);

    for (const language of targetLanguages) {
      if (!supportedLanguages.includes(language)) {
        logger.info(
          { voiceId: voice.id, name: voice.name, language, supportedLanguages },
          'Skipping sample for unsupported voice language'
        );
        skipCount++;
        continue;
      }

      if (voice.provider === 'grok' && language === 'uk') {
        logger.info(
          { voiceId: voice.id, name: voice.name, provider: voice.provider },
          'Skipping Grok sample for Ukrainian (xAI TTS not offered for uk stories)'
        );
        skipCount++;
        continue;
      }

      const isPrimaryLanguage = language === voice.language;

      // Never skip based only on `sample_audio_url` in DB: after `tts_voices.language` changes
      // (e.g. uk→en for Grok) the URL can still point at another locale while `voice-samples/{lang}/{id}.mp3`
      // for the new primary is missing (Atlas/sal had no `en/sal.mp3`).
      if (!force && (await sampleExistsInStorage(assetStorage, language, voice.providerVoiceId))) {
        logger.info(
          {
            voiceId: voice.id,
            name: voice.name,
            language,
            isPrimaryLanguage,
          },
          'Sample file already exists in storage, skipping'
        );
        skipCount++;
        continue;
      }

      try {
        logger.info({
          voiceId: voice.id,
          name: voice.name,
          targetLanguage: language,
          primaryLanguage: voice.language,
          provider: voice.provider,
        }, 'Generating sample');

        const sampleText = getVoiceSampleText(language);
        const result = await audioProvider.synthesize({
          text: sampleText,
          voiceId: voice.providerVoiceId,
          language,
          prosody: {
            speed: 1.0,
          },
        });

        const uploadResult = await assetStorage.uploadVoiceSample({
          audioBuffer: result.audioData,
          language,
          voiceId: voice.providerVoiceId,
        });

        if (isPrimaryLanguage) {
          await db
            .update(ttsVoices)
            .set({ sampleAudioUrl: uploadResult.storagePath })
            .where(eq(ttsVoices.id, voice.id));
        }

        logger.info({
          voiceId: voice.id,
          name: voice.name,
          language,
          storagePath: uploadResult.storagePath,
        }, '✅ Sample generated successfully');

        successCount++;
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          voiceId: voice.id,
          name: voice.name,
          provider: voice.provider,
          language,
        }, '❌ Failed to generate sample');
        errorCount++;
      }
    }
  }
  
  logger.info({
    total: voices.length,
    success: successCount,
    skipped: skipCount,
    errors: errorCount,
  }, 'Voice sample generation completed');
}

// Run if called directly
if (require.main === module) {
  generateVoiceSamples()
    .then(() => {
      logger.info('Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error({ error }, 'Script failed');
      process.exit(1);
    });
}

export { generateVoiceSamples };
