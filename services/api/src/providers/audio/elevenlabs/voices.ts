import { VoiceCatalogEntry } from '../../base/IAudioProvider';

/**
 * ElevenLabs Voice Catalog for Ukrainian Stories (Premium Voices)
 * Voice IDs from: https://api.elevenlabs.io/v1/voices
 * 
 * Model: eleven_v3 (text-to-dialogue)
 * Supports: Emotional tags [excited], [thoughtful], [sighs], etc.
 * 
 * Naming: Constellation names (translated to Ukrainian)
 * Premium: Available only for Fairyworld plan subscribers
 */
export const ELEVENLABS_VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    providerVoiceId: 'Ntd0iVwICtUtA6Fvx27M',
    name: 'perseus',
    displayName: 'Персей',
    language: 'uk',
    gender: 'male',
    ageCategory: 'adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'energetic', 'premium'],
    description: 'Преміум енергійний чоловічий голос для оповідання казок (ElevenLabs v3)',
    providerPreviewUrl: '',
    isPremium: true,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'eLDtXX7z65CuLasDRxrP',
    name: 'orion',
    displayName: 'Оріон',
    language: 'uk',
    gender: 'male',
    ageCategory: 'adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'warm', 'premium'],
    description: 'Преміум чоловічий голос для оповідання казок (ElevenLabs v3)',
    providerPreviewUrl: '',
    isPremium: true,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'ARxhnQPZCfSLpMBASSii',
    name: 'andromeda',
    displayName: 'Андромеда',
    language: 'uk',
    gender: 'female',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'gentle', 'premium'],
    description: 'Преміум жіночий голос для оповідання казок (ElevenLabs v3)',
    providerPreviewUrl: '',
    isPremium: true,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: '21m00Tcm4TlvDq8ikWAM',
    name: 'cassiopeia',
    displayName: 'Кассіопея',
    language: 'uk',
    gender: 'female',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['calm', 'storyteller', 'warm', 'premium'],
    description: 'Преміум тепла жіноча розповідачка для казок (ElevenLabs v3)',
    providerPreviewUrl: '',
    isPremium: true,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
];
