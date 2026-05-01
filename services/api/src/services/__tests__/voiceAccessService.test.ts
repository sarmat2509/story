import assert from 'node:assert/strict';
import type { TtsVoice } from '../../db/schema';
import { evaluateVoiceAccess } from '../voiceAccessService';

const baseVoice = {
  id: 'voice-id',
  provider: 'google',
  providerVoiceId: 'Aoede',
  name: 'Aoede',
  displayName: 'Aoede',
  language: 'uk',
  gender: 'female',
  ageCategory: 'adult',
  voiceTags: ['narrator'],
  description: null,
  sampleAudioUrl: null,
  providerPreviewUrl: null,
  isPremium: false,
  isActive: true,
  roleType: 'narrator',
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
} as TtsVoice;

assert.deepStrictEqual(
  evaluateVoiceAccess({ voice: null, hasPremiumVoices: false }),
  {
    allowed: false,
    statusCode: 404,
    code: 'VOICE_NOT_FOUND',
    message: 'Voice not found',
  },
  'missing voices are not silently replaced when explicit voiceId is requested'
);

assert.deepStrictEqual(
  evaluateVoiceAccess({ voice: { ...baseVoice, isActive: false }, hasPremiumVoices: true }),
  {
    allowed: false,
    statusCode: 404,
    code: 'VOICE_INACTIVE',
    message: 'Voice is not available',
  },
  'inactive voices are blocked'
);

assert.deepStrictEqual(
  evaluateVoiceAccess({ voice: { ...baseVoice, isPremium: true }, hasPremiumVoices: false }),
  {
    allowed: false,
    statusCode: 403,
    code: 'PREMIUM_VOICE_REQUIRED',
    message: 'Premium voice access is not available in your plan',
  },
  'premium voices require the premium feature'
);

assert.deepStrictEqual(
  evaluateVoiceAccess({ voice: baseVoice, hasPremiumVoices: false }),
  { allowed: true, voice: baseVoice },
  'free active voices are allowed'
);

const premiumVoice = { ...baseVoice, isPremium: true };
assert.deepStrictEqual(
  evaluateVoiceAccess({ voice: premiumVoice, hasPremiumVoices: true }),
  { allowed: true, voice: premiumVoice },
  'premium active voices are allowed when the user has the feature'
);

console.log('voiceAccessService tests passed');
