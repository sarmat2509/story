import { VoiceCatalogEntry } from '../../base/IAudioProvider';

/**
 * OpenAI TTS Voice Catalog
 * Documentation: https://platform.openai.com/docs/guides/text-to-speech
 * 
 * Model: gpt-4o-mini-tts (supports instructions parameter)
 * Supports: Emotional control via instructions, 13 built-in voices
 * Best quality: marin, cedar
 * Ukrainian: Supported (voices optimized for English but multilingual)
 * 
 * Naming: Constellation names (translated to Ukrainian)
 */
export const OPENAI_TTS_VOICE_CATALOG: VoiceCatalogEntry[] = [
  // Best quality voices (recommended)
  {
    providerVoiceId: 'marin',
    name: 'marin',
    displayName: 'Марін',
    language: 'uk',
    gender: 'female',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'warm', 'default', 'high-quality'],
    description: 'Преміум жіночий голос (OpenAI TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'cedar',
    name: 'cedar',
    displayName: 'Седар',
    language: 'uk',
    gender: 'male',
    ageCategory: 'adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'strong', 'default', 'high-quality'],
    description: 'Преміум чоловічий голос (OpenAI TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['4-5', '6-8', '9-12'],
  },
  
  // Other voices
  {
    providerVoiceId: 'coral',
    name: 'coral',
    displayName: 'Корал',
    language: 'uk',
    gender: 'female',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'gentle'],
    description: 'Ніжний жіночий голос (OpenAI TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8'],
  },
  {
    providerVoiceId: 'ballad',
    name: 'ballad',
    displayName: 'Балада',
    language: 'uk',
    gender: 'female',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'calm'],
    description: 'Спокійний жіночий голос (OpenAI TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'alloy',
    name: 'alloy',
    displayName: 'Алой',
    language: 'uk',
    gender: 'neutral',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'versatile'],
    description: 'Універсальний голос (OpenAI TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['4-5', '6-8', '9-12'],
  },
];
