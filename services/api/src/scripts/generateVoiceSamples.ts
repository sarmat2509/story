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
 *   npx tsx src/scripts/generateVoiceSamples.ts --languages=ru,en,es,fr,de
 *   npx tsx src/scripts/generateVoiceSamples.ts --force
 */

import './loadEnvForScripts';

import { db } from '../db';
import { ttsVoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getVoiceSampleText } from '../utils/i18nLoader';
import { getAssetStorageService } from '../services/assetStorageService';
import { getAudioProviderByName } from '../services/aiService';

const SUPPORTED_SAMPLE_LANGUAGES = ['uk', 'ru', 'en', 'es', 'fr', 'de'] as const;
type SupportedSampleLanguage = typeof SUPPORTED_SAMPLE_LANGUAGES[number];

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
  provider: string;
  sampleAudioUrl: string | null;
}

async function generateVoiceSamples() {
  const targetLanguages = parseLanguagesArg();
  const force = hasFlag('--force');

  logger.info({ targetLanguages, force }, 'Starting voice sample generation');
  
  // Fetch all active voices
  const voices = await db
    .select({
      id: ttsVoices.id,
      providerVoiceId: ttsVoices.providerVoiceId,
      name: ttsVoices.name,
      displayName: ttsVoices.displayName,
      language: ttsVoices.language,
      provider: ttsVoices.provider,
      sampleAudioUrl: ttsVoices.sampleAudioUrl,
    })
    .from(ttsVoices)
    .where(eq(ttsVoices.isActive, true));
  
  logger.info({ total: voices.length }, 'Found voices to process');
  
  const assetStorage = getAssetStorageService();
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (const voice of voices) {
    const audioProvider = getAudioProviderByName(voice.provider);

    for (const language of targetLanguages) {
      const isPrimaryLanguage = language === voice.language;

      if (isPrimaryLanguage && voice.sampleAudioUrl && !force) {
        logger.info(
          { voiceId: voice.id, name: voice.name, language },
          'Primary sample already exists, skipping'
        );
        skipCount++;
        continue;
      }

      if (!force && await sampleExistsInStorage(assetStorage, language, voice.providerVoiceId)) {
        logger.info(
          { voiceId: voice.id, name: voice.name, language },
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
