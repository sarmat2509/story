/**
 * Generate Voice Samples Script
 * 
 * Generates audio samples for all voices in the catalog
 * - Loads demo text from i18n files
 * - Synthesizes audio using appropriate provider
 * - Uploads to asset storage
 * - Updates database with sample URL
 * 
 * Usage:
 *   npx tsx src/scripts/generateVoiceSamples.ts
 */

import { db } from '../db';
import { ttsVoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getVoiceSampleText } from '../utils/i18nLoader';
import { getAssetStorageService } from '../services/assetStorageService';
import { getAudioProviderByName } from '../services/aiService';

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
  logger.info('Starting voice sample generation');
  
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
    try {
      // Skip if sample already exists
      if (voice.sampleAudioUrl) {
        logger.info({ voiceId: voice.id, name: voice.name }, 'Sample already exists, skipping');
        skipCount++;
        continue;
      }
      
      logger.info({ 
        voiceId: voice.id, 
        name: voice.name,
        language: voice.language,
        provider: voice.provider 
      }, 'Generating sample');
      
      // Get demo text for this language
      const sampleText = getVoiceSampleText(voice.language);
      
      logger.debug({ sampleText }, 'Sample text loaded');
      
      // Get provider for this voice
      const audioProvider = getAudioProviderByName(voice.provider);
      
      // Synthesize audio
      const result = await audioProvider.synthesize({
        text: sampleText,
        voiceId: voice.providerVoiceId,
        language: voice.language,
        prosody: {
          speed: 1.0,
        },
      });
      
      logger.info({ 
        voiceId: voice.id,
        audioSize: result.audioData.length 
      }, 'Audio synthesized');
      
      // Upload to storage
      const uploadResult = await assetStorage.uploadVoiceSample({
        audioBuffer: result.audioData,
        language: voice.language,
        voiceId: voice.providerVoiceId,
      });
      
      logger.info({ 
        voiceId: voice.id,
        storagePath: uploadResult.storagePath 
      }, 'Sample uploaded');
      
      // Update database
      await db
        .update(ttsVoices)
        .set({ sampleAudioUrl: uploadResult.storagePath })
        .where(eq(ttsVoices.id, voice.id));
      
      logger.info({ 
        voiceId: voice.id,
        name: voice.name 
      }, '✅ Sample generated successfully');
      
      successCount++;
      
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        voiceId: voice.id,
        name: voice.name,
        provider: voice.provider 
      }, '❌ Failed to generate sample');
      errorCount++;
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
