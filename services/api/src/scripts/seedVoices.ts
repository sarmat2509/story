import './loadEnvForScripts';

/**
 * Voice Catalog Seeding Script
 * 
 * Seeds initial voice catalog with:
 * - Voice metadata (provider, name, language, gender, etc.)
 * - Voice-age group associations
 * - Provider preview URLs
 * 
 * Supports multiple TTS providers (ElevenLabs, Google TTS, OpenAI TTS, Grok/xAI TTS)
 *
 * Usage:
 *   npm run seed:voices
 *   AUDIO_PROVIDER=google npm run seed:voices
 *   AUDIO_PROVIDER=openai npm run seed:voices
 *   AUDIO_PROVIDER=grok npm run seed:voices
 *   SEED_VOICE_PROVIDERS=grok,google npm run seed:voices
 *
 * Uses `loadEnvForScripts` (repo `.env` / `.env.local`, then `services/api/.env`).
 */

import { db } from '../db';
import { ttsVoices, ageGroups, voiceAgeGroups } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getAudioProviderByName } from '../services/aiService';
import { getAssetStorageService } from '../services/assetStorageService';
import { getVoiceSampleText } from '../utils/i18nLoader';
import { config } from '../config';

function resolveSeedProviderNames(): string[] {
  const raw = process.env.SEED_VOICE_PROVIDERS?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [config.audio?.provider || 'elevenlabs'];
}

/**
 * Seed voice catalog with age group associations for one TTS provider
 */
async function seedVoicesForProvider(providerName: string) {
  logger.info({ provider: providerName }, 'Starting voice catalog seeding for provider');

  const audioProvider = getAudioProviderByName(providerName);
  const voiceCatalog = audioProvider.getDefaultVoices();

  logger.info({ provider: providerName, count: voiceCatalog.length }, 'Retrieved voice catalog from provider');

  for (const voiceData of voiceCatalog) {
    try {
      const { suitableForAgeSlugs, ...voiceFields } = voiceData;

      const existing = await db.query.ttsVoices.findFirst({
        where: (voices, { eq: eqCol }) =>
          and(eqCol(voices.provider, providerName), eqCol(voices.providerVoiceId, voiceData.providerVoiceId)),
      });

      if (existing) {
        logger.info(
          { voiceId: existing.id, name: voiceData.name, provider: providerName },
          'Voice already exists, skipping'
        );
        continue;
      }

      const [voice] = await db
        .insert(ttsVoices)
        .values({
          provider: providerName,
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
      logger.error({ error, voice: voiceData.name, provider: providerName }, 'Failed to seed voice');
    }
  }

  logger.info({ provider: providerName }, 'Voice catalog seeding completed for provider');
}

/**
 * Seed catalogs for one or more providers (see SEED_VOICE_PROVIDERS).
 */
async function seedVoices() {
  const providers = resolveSeedProviderNames();
  logger.info({ providers }, 'Voice seeding provider list');

  for (const providerName of providers) {
    await seedVoicesForProvider(providerName);
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

async function runCli() {
  try {
    await seedVoices();
    await displayCatalog();
    logger.info('Seeding successful');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Seeding failed');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  void runCli();
}

export { seedVoices };
