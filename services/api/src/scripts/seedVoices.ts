/**
 * Voice Catalog Seeding Script
 * 
 * Seeds initial voice catalog with:
 * - Voice metadata (provider, name, language, gender, etc.)
 * - Voice-age group associations
 * - Provider preview URLs
 * 
 * Usage:
 *   npm run seed:voices
 */

import { db } from '../db';
import { ttsVoices, ageGroups, voiceAgeGroups } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

/**
 * Initial voice catalog
 * Configure based on actual ElevenLabs voices available
 * Get voice IDs and preview URLs from ElevenLabs dashboard or API:
 * https://api.elevenlabs.io/v1/voices
 */
const INITIAL_VOICES = [
  {
    providerVoiceId: '21m00Tcm4TlvDq8ikWAM', // Replace with actual ElevenLabs voice ID
    name: 'Оленка', // Ukrainian female narrator
    language: 'uk',
    gender: 'female' as const,
    ageCategory: 'young_adult' as const,
    roleType: 'both' as const,
    voiceTags: ['calm', 'storyteller', 'warm'],
    description: 'Тепла жіноча розповідачка для казок',
    providerPreviewUrl: 'https://storage.googleapis.com/eleven-public-prod/...', // From ElevenLabs API
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'], // Will be converted to UUIDs
  },
  {
    providerVoiceId: 'another-voice-id', // Replace with actual voice ID
    name: 'Богдан', // Ukrainian male character
    language: 'uk',
    gender: 'male' as const,
    ageCategory: 'adult' as const,
    roleType: 'character' as const,
    voiceTags: ['strong', 'confident', 'hero'],
    description: 'Чоловічий голос для персонажів-героїв',
    providerPreviewUrl: 'https://storage.googleapis.com/eleven-public-prod/...',
    isPremium: false,
    suitableForAgeSlugs: ['4-5', '6-8', '9-12'],
  },
  // TODO: Add more voices for other languages (en, ru, es)
  // Each language should have at least 1 narrator voice
  // Example:
  // {
  //   providerVoiceId: 'english-voice-id',
  //   name: 'Emma',
  //   language: 'en',
  //   gender: 'female',
  //   ageCategory: 'young_adult',
  //   roleType: 'narrator',
  //   voiceTags: ['gentle', 'storyteller'],
  //   description: 'Gentle English storyteller',
  //   providerPreviewUrl: 'https://storage.googleapis.com/...',
  //   isPremium: false,
  //   suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  // },
];

/**
 * Seed voice catalog with age group associations
 */
async function seedVoices() {
  logger.info({ count: INITIAL_VOICES.length }, 'Starting voice catalog seeding');
  
  for (const voiceData of INITIAL_VOICES) {
    try {
      const { suitableForAgeSlugs, ...voiceFields } = voiceData;
      
      // Check if voice already exists
      const existing = await db.query.ttsVoices.findFirst({
        where: (voices, { eq }) => eq(voices.providerVoiceId, voiceData.providerVoiceId)
      });
      
      if (existing) {
        logger.info({ voiceId: existing.id, name: voiceData.name }, 'Voice already exists, skipping');
        continue;
      }
      
      // Insert voice
      const [voice] = await db
        .insert(ttsVoices)
        .values({
          provider: 'elevenlabs',
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
      language: ttsVoices.language,
      gender: ttsVoices.gender,
      roleType: ttsVoices.roleType,
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
      language: voice.language,
      gender: voice.gender,
      role: voice.roleType,
      ageGroups: ageGroupLinks.map(ag => ag.slug).join(', '),
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
