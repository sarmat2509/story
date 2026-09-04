import { VoiceCatalogEntry } from '../../base/IAudioProvider';

const MULTILINGUAL_STORY_LANGUAGES = ['uk', 'ru', 'en', 'es', 'de', 'fr', 'pl'];

/**
 * Google Cloud TTS Voice Catalog (Gemini 2.5 Flash TTS)
 * Voices from: https://cloud.google.com/text-to-speech/docs/gemini-tts
 * 
 * Model: gemini-3.1-flash-tts-preview
 * Supports: Natural language prompts for emotion control
 * Ukrainian voices: Preset voices with uk-UA language code
 * 
 * Naming: Constellation names (translated to Ukrainian)
 */
export const GOOGLE_TTS_VOICE_CATALOG: VoiceCatalogEntry[] = [
  // Female voices for Ukrainian (Constellation names)
  {
    providerVoiceId: 'Aoede',  // Google voice name
    name: 'lyra',
    displayName: 'Ліра',
    language: 'uk',
    supportedLanguages: MULTILINGUAL_STORY_LANGUAGES,
    gender: 'female',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'gentle'],
    description: 'Жіночий голос для оповідання казок (Gemini TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'Laomedeia',
    name: 'hydra',
    displayName: 'Гідра',
    language: 'uk',
    supportedLanguages: MULTILINGUAL_STORY_LANGUAGES,
    gender: 'female',
    ageCategory: 'adult',
    roleType: 'narrator',
    voiceTags: ['narrator', 'storyteller', 'calm'],
    description: 'Спокійний жіночий голос для казок (Gemini TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['4-5', '6-8', '9-12'],
  },
  
  // Male voices for Ukrainian (Constellation names)
  {
    providerVoiceId: 'Charon',
    name: 'phoenix',
    displayName: 'Феникс',
    language: 'uk',
    supportedLanguages: MULTILINGUAL_STORY_LANGUAGES,
    gender: 'male',
    ageCategory: 'adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'strong', 'default'],
    description: 'Чоловічий голос для оповідання казок (Gemini TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'Puck',
    name: 'centaurus',
    displayName: 'Кентавр',
    language: 'uk',
    supportedLanguages: MULTILINGUAL_STORY_LANGUAGES,
    gender: 'male',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'character', 'playful'],
    description: 'Грайливий чоловічий голос (Gemini TTS)',
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8'],
  },
];
