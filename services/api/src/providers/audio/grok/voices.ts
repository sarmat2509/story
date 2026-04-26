import { VoiceCatalogEntry } from '../../base/IAudioProvider';

/**
 * xAI Grok TTS voice catalog
 * API: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
 *
 * `language` is the voice row **primary** locale (used for sample metadata / seeding).
 * Grok catalog rows are not offered in the app (`is_active = false` in DB / seed). Ukrainian
 * stories still block Grok at synthesis if a stale voice id pointed at Grok — see `supportedLocales.ts`.
 *
 * providerVoiceId matches xAI `voice_id` (case-insensitive).
 */
export const GROK_TTS_VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    providerVoiceId: 'eve',
    name: 'sirius',
    displayName: 'Sirius',
    language: 'en',
    gender: 'female',
    ageCategory: 'young_adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'energetic', 'default'],
    description: 'Energetic voice for stories (Grok TTS, xAI)',
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'ara',
    name: 'capella',
    displayName: 'Capella',
    language: 'en',
    gender: 'female',
    ageCategory: 'adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'warm'],
    description: 'Warm voice for stories (Grok TTS, xAI)',
    isPremium: false,
    suitableForAgeSlugs: ['2-3', '4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'rex',
    name: 'rigel',
    displayName: 'Rigel',
    language: 'en',
    gender: 'male',
    ageCategory: 'adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'strong'],
    description: 'Confident voice for stories (Grok TTS, xAI)',
    isPremium: false,
    suitableForAgeSlugs: ['4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'sal',
    name: 'atlas',
    displayName: 'Atlas',
    language: 'en',
    gender: 'male',
    ageCategory: 'adult',
    roleType: 'both',
    voiceTags: ['narrator', 'storyteller', 'calm'],
    description: 'Balanced male voice for stories (Grok TTS, xAI; Greek titan of the heavens)',
    isPremium: false,
    suitableForAgeSlugs: ['4-5', '6-8', '9-12'],
  },
  {
    providerVoiceId: 'leo',
    name: 'antares',
    displayName: 'Antares',
    language: 'en',
    gender: 'male',
    ageCategory: 'adult',
    roleType: 'narrator',
    voiceTags: ['narrator', 'storyteller', 'strong', 'instructional'],
    description: 'Authoritative voice for stories (Grok TTS, xAI)',
    isPremium: false,
    suitableForAgeSlugs: ['6-8', '9-12'],
  },
];
