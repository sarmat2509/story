/**
 * Audio Domain Types (M5)
 * Domain-specific types for audio generation
 */

// Re-export provider interfaces for domain layer convenience
export type {
  Voice,
  SynthesizeRequest,
  SynthesizeResult,
  ProsodySettings,
} from '../../providers/base/IAudioProvider';

export type { VoiceParams, AudioResult } from './AudioDomainService';

