/**
 * Voice Catalog Seeding Script
 * 
 * Seeds initial voice catalog with:
 * - Voice metadata (provider, name, language, gender, etc.)
 * - Voice-age group associations
 * - Provider preview URLs
 * 
 * Supports multiple TTS providers (ElevenLabs, Google TTS, OpenAI TTS)
 * 
 * Usage:
 *   npm run seed:voices
 *   AUDIO_PROVIDER=google npm run seed:voices
 *   AUDIO_PROVIDER=openai npm run seed:voices
 */

import { db } from '../db';
import { ttsVoices, ageGroups, voiceAgeGroups } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getAudioProvider, getAudioProviderByName } from '../services/aiService';
import { getAssetStorageService } from '../services/assetStorageService';
import { getVoiceSampleText } from '../utils/i18nLoader';
import { config } from '../config';

/**
 * Seed voice catalog with age group associations
 */
async function seedVoices() {
  const provider = config.audio?.provider || 'elevenlabs';
  
  logger.info({ provider }, 'Starting voice catalog seeding for provider');
  
  // Get voice catalog from the active provider
  const audioProvider = getAudioProvider();
  const voiceCatalog = audioProvider.getDefaultVoices();
  
  logger.info({ count: voiceCatalog.length }, 'Retrieved voice catalog from provider');
  
  for (const voiceData of voiceCatalog) {
    try {
      const { suitableForAgeSlugs, ...voiceFields } = voiceData;
      
      // Check if voice already exists
      const existing = await db.query.ttsVoices.findFirst({
        where: (voices: any, { eq }: any) => eq(voices.providerVoiceId, voiceData.providerVoiceId)
      });
      
      if (existing) {
        logger.info({ voiceId: existing.id, name: voiceData.name }, 'Voice already exists, skipping');
        continue;
      }
      
      // Insert voice
      const [voice] = await db
        .insert(ttsVoices)
        .values({
          provider,
          ...voiceFields,
          isActive: true,
        })
        .returning({ id: ttsVoices.id, name: ttsVoices.name });
      
      logger.info({ voiceId: voice.id, name: voice.name }, 'Voice added to catalog');
      
      // Link to age groups
      for (const ageSlug of suitableForAgeSlugs) {
        const [ageGroup] = await db
          .select({ id: ageGroups.id })
          .from(ageGroups)
          .where(eq(ageGroups.slug, ageSlug))
          .limit(1);
        
        if (ageGroup) {
          await db.insert(voiceAgeGroups).values({
            voiceId: voice.id,
            ageGroupId: ageGroup.id,
          });
          
          logger.debug({ voiceId: voice.id, ageSlug }, 'Age group association created');
        } else {
          logger.warn({ ageSlug }, 'Age group not found, skipping association');
        }
      }
      
      logger.info({ voiceId: voice.id, ageGroups: suitableForAgeSlugs.length }, 'Voice fully configured');
      
      // Generate voice sample
      try {
        logger.info({ voiceId: voice.id, language: voiceFields.language }, 'Generating voice sample');
        
        const sampleText = getVoiceSampleText(voiceFields.language);
        const assetStorage = getAssetStorageService();
        
        // Synthesize audio sample
        const result = await audioProvider.synthesize({
          text: sampleText,
          voiceId: voiceFields.providerVoiceId,
          language: voiceFields.language,
          prosody: {
            speed: 1.0,
          },
        });
        
        logger.info({ voiceId: voice.id, audioSize: result.audioData.length }, 'Sample audio synthesized');
        
        // Upload to storage
        const uploadResult = await assetStorage.uploadVoiceSample({
          audioBuffer: result.audioData,
          language: voiceFields.language,
          voiceId: voiceFields.providerVoiceId,
        });
        
        logger.info({ voiceId: voice.id, storagePath: uploadResult.storagePath }, 'Sample uploaded');
        
        // Update database with sample URL
        await db
          .update(ttsVoices)
          .set({ sampleAudioUrl: uploadResult.storagePath })
          .where(eq(ttsVoices.id, voice.id));
        
        logger.info({ voiceId: voice.id }, '✅ Voice sample generated successfully');
        
      } catch (sampleError) {
        logger.error({ 
          error: sampleError instanceof Error ? sampleError.message : String(sampleError),
          errorStack: sampleError instanceof Error ? sampleError.stack : undefined,
          voiceId: voice.id 
        }, '⚠️ Failed to generate voice sample (voice seeded without sample)');
        // Don't fail the entire seeding if sample generation fails
      }
      
    } catch (error) {
      logger.error({ error, voice: voiceData.name }, 'Failed to seed voice');
    }
  }
  
  logger.info('Voice catalog seeding completed');
}

/**
 * Display voice catalog summary
 */
async function displayCatalog() {
  const voices = await db
    .select({
      id: ttsVoices.id,
      name: ttsVoices.name,
      displayName: ttsVoices.displayName,
      language: ttsVoices.language,
      gender: ttsVoices.gender,
      roleType: ttsVoices.roleType,
      isPremium: ttsVoices.isPremium,
      provider: ttsVoices.provider,
    })
    .from(ttsVoices)
    .where(eq(ttsVoices.isActive, true));
  
  logger.info({ total: voices.length }, 'Voice Catalog Summary:');
  
  for (const voice of voices) {
    const ageGroupLinks = await db
      .select({ slug: ageGroups.slug })
      .from(voiceAgeGroups)
      .innerJoin(ageGroups, eq(voiceAgeGroups.ageGroupId, ageGroups.id))
      .where(eq(voiceAgeGroups.voiceId, voice.id));
    
    logger.info({
      name: voice.name,
      displayName: voice.displayName,
      provider: voice.provider,
      language: voice.language,
      gender: voice.gender,
      role: voice.roleType,
      isPremium: voice.isPremium ? '⭐ Premium' : 'Free',
      ageGroups: ageGroupLinks.map((ag: any) => ag.slug).join(', '),
    });
  }
}

// Run if called directly
if (require.main === module) {
  seedVoices()
    .then(() => displayCatalog())
    .then(() => {
      logger.info('Seeding successful');
      process.exit(0);
    })
    .catch(error => {
      logger.error({ error }, 'Seeding failed');
      process.exit(1);
    });
}

export { seedVoices };
