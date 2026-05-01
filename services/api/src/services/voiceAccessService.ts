import type { TtsVoice } from '../db/schema';
import { getVoiceRepository } from '../repositories';
import { hasFeature } from './planService';

export type VoiceAccessCode =
  | 'VOICE_NOT_FOUND'
  | 'VOICE_INACTIVE'
  | 'PREMIUM_VOICE_REQUIRED';

export type VoiceAccessDecision =
  | { allowed: true; voice: TtsVoice }
  | {
      allowed: false;
      statusCode: 403 | 404;
      code: VoiceAccessCode;
      message: string;
    };

export class VoiceAccessError extends Error {
  readonly statusCode: 403 | 404;
  readonly code: VoiceAccessCode;

  constructor(decision: Exclude<VoiceAccessDecision, { allowed: true }>) {
    super(decision.message);
    this.name = 'VoiceAccessError';
    this.statusCode = decision.statusCode;
    this.code = decision.code;
  }
}

export function isVoiceAccessError(error: unknown): error is VoiceAccessError {
  return error instanceof VoiceAccessError;
}

export function evaluateVoiceAccess(input: {
  voice: TtsVoice | null;
  hasPremiumVoices: boolean;
}): VoiceAccessDecision {
  if (!input.voice) {
    return {
      allowed: false,
      statusCode: 404,
      code: 'VOICE_NOT_FOUND',
      message: 'Voice not found',
    };
  }

  if (!input.voice.isActive) {
    return {
      allowed: false,
      statusCode: 404,
      code: 'VOICE_INACTIVE',
      message: 'Voice is not available',
    };
  }

  if (input.voice.isPremium && !input.hasPremiumVoices) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'PREMIUM_VOICE_REQUIRED',
      message: 'Premium voice access is not available in your plan',
    };
  }

  return { allowed: true, voice: input.voice };
}

export async function assertVoiceAccessForUser(userId: string, voiceId: string | null | undefined): Promise<void> {
  if (!voiceId) {
    return;
  }

  const [voice, hasPremiumVoices] = await Promise.all([
    getVoiceRepository().findById(voiceId),
    hasFeature(userId, 'premium_voices'),
  ]);

  const decision = evaluateVoiceAccess({ voice, hasPremiumVoices });
  if (decision.allowed === false) {
    throw new VoiceAccessError(decision);
  }
}
